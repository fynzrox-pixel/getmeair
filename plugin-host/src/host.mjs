#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { validateManifest, hasPermission } from './permissions.mjs';

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function log(message) {
  process.stderr.write(`[getmeair-plugin-host] ${message}\n`);
}

const pluginDir = resolve(argValue('--plugin'));
const manifestPath = join(pluginDir, 'manifest.json');
if (!existsSync(manifestPath)) {
  log(`Manifest not found: ${manifestPath}`);
  process.exit(2);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  log(`Invalid manifest JSON: ${error.message}`);
  process.exit(2);
}
const errors = validateManifest(manifest);
if (errors.length) {
  log(`Invalid manifest: ${errors.join(' ')}`);
  process.exit(2);
}

const entry = resolve(pluginDir, manifest.entry);
if (!entry.startsWith(pluginDir + sep)) {
  log('Plugin entry must stay inside the plugin directory.');
  process.exit(2);
}
if (!existsSync(entry)) {
  log(`Plugin entry not found: ${entry}`);
  process.exit(2);
}

const dataDir = resolve(
  process.env.GETMEAIR_PLUGIN_DATA || join(process.cwd(), 'data', 'plugins', manifest.id),
);
mkdirSync(dataDir, { recursive: true });
const storageFile = join(dataDir, 'storage.json');
if (!existsSync(storageFile)) writeFileSync(storageFile, '{}', 'utf8');

function readStorage() {
  try { return JSON.parse(readFileSync(storageFile, 'utf8')); } catch { return {}; }
}
function writeStorage(value) {
  writeFileSync(storageFile, JSON.stringify(value, null, 2), 'utf8');
}

const runtime = manifest.runtime === 'python' ? 'python' : process.execPath;
const runtimeArgs = manifest.runtime === 'python' ? [entry] : [entry];
const child = spawn(runtime, runtimeArgs, {
  cwd: pluginDir,
  env: {
    ...process.env,
    GETMEAIR_PLUGIN_ID: manifest.id,
    GETMEAIR_PLUGIN_API: '1.0',
    GETMEAIR_PLUGIN_DATA: dataDir,
  },
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
});

child.stderr.on('data', (chunk) => {
  process.stderr.write(`[${manifest.id}] ${chunk}`);
});

const pending = new Map();
let nextId = 1;

function request(method, params, timeoutMs = 15000) {
  const id = nextId++;
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Plugin request timed out: ${method}`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolvePromise(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

async function handlePluginRequest(message) {
  const { id, method, params = {} } = message;
  try {
    if (method === 'storage.get' && hasPermission(manifest, 'storage') && storageKeyAllowed(params.key)) {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, result: { value: readStorage()[params.key] ?? null } }) + '\n');
      return;
    }
    if (method === 'storage.set' && hasPermission(manifest, 'storage') && storageKeyAllowed(params.key)) {
      const storage = readStorage();
      storage[params.key] = params.value;
      writeStorage(storage);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, result: { ok: true } }) + '\n');
      return;
    }
    if (method === 'storage.delete' && hasPermission(manifest, 'storage') && storageKeyAllowed(params.key)) {
      const storage = readStorage();
      delete storage[params.key];
      writeStorage(storage);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, result: { ok: true } }) + '\n');
      return;
    }
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code: -32003, message: `Permission denied or unknown method: ${method}` },
    }) + '\n');
  } catch (error) {
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code: -32000, message: error.message || String(error) },
    }) + '\n');
  }
}

function eventPermissionAllowed(eventName) {
  if (eventName.startsWith('message.')) return hasPermission(manifest, 'events.messages');
  if (eventName.startsWith('presence.')) return hasPermission(manifest, 'events.presence');
  return false;
}

function storageKeyAllowed(key) {
  return typeof key === 'string' && key.length > 0 && key.length <= 200 && !key.includes('\0');
}

async function handleParentRequest(message) {
  const { id, method, params = {} } = message;
  if (method === 'plugin.info') {
    return { manifest, dataDir };
  }
  if (method === 'event') {
    if (!eventPermissionAllowed(String(params.name || ''))) {
      throw new Error('Permission denied: this plugin cannot receive that event.');
    }
    return request('event', params);
  }
  if (method === 'command') {
    if (!hasPermission(manifest, 'commands')) {
      throw new Error('Permission denied: commands.');
    }
    return request('command', params);
  }
  if (method === 'menu.list') {
    if (!hasPermission(manifest, 'menu')) {
      throw new Error('Permission denied: menu.');
    }
    return request('menu.list', params);
  }
  if (method === 'notification') {
    if (!hasPermission(manifest, 'notifications')) {
      throw new Error('Permission denied: notifications.');
    }
    return request('notification', params);
  }
  if (method === 'storage.get') {
    if (!hasPermission(manifest, 'storage')) throw new Error('Permission denied: storage.');
    if (!storageKeyAllowed(params.key)) throw new Error('Invalid storage key.');
    return { value: readStorage()[params.key] ?? null };
  }
  if (method === 'storage.set') {
    if (!hasPermission(manifest, 'storage')) throw new Error('Permission denied: storage.');
    if (!storageKeyAllowed(params.key)) throw new Error('Invalid storage key.');
    const storage = readStorage();
    storage[params.key] = params.value;
    writeStorage(storage);
    return { ok: true };
  }
  if (method === 'storage.delete') {
    if (!hasPermission(manifest, 'storage')) throw new Error('Permission denied: storage.');
    if (!storageKeyAllowed(params.key)) throw new Error('Invalid storage key.');
    const storage = readStorage();
    delete storage[params.key];
    writeStorage(storage);
    return { ok: true };
  }
  if (method === 'shutdown') {
    notify('shutdown', {});
    setTimeout(() => {
      child.kill();
      process.exit(0);
    }, 150);
    return { ok: true };
  }
  throw new Error(`Unknown plugin host method: ${method}`);
}

const pluginLines = createInterface({ input: child.stdout });
pluginLines.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); } catch {
    log(`Plugin sent invalid JSON: ${line.slice(0, 200)}`);
    return;
  }
  if (message.id !== undefined && message.method) {
    handlePluginRequest(message);
    return;
  }
  if (message.id !== undefined && pending.has(message.id)) {
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message || 'Plugin error'));
    else waiter.resolve(message.result);
    return;
  }
  if (message.method) {
    if (message.method === 'notification' && !hasPermission(manifest, 'notifications')) {
      log('Blocked plugin notification without permission.');
      return;
    }
    if (message.method === 'command.registered' && !hasPermission(manifest, 'commands')) {
      log('Blocked command registration without permission.');
      return;
    }
    if (message.method === 'menu.items' && !hasPermission(manifest, 'menu')) {
      log('Blocked menu items without permission.');
      return;
    }
    send({ jsonrpc: '2.0', method: `plugin.${message.method}`, params: message.params });
  }
});

const parentLines = createInterface({ input: process.stdin });
parentLines.on('line', async (line) => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); } catch {
    sendError(null, -32700, 'Invalid JSON');
    return;
  }
  try {
    const result = await handleParentRequest(message);
    send({ jsonrpc: '2.0', id: message.id ?? null, result });
  } catch (error) {
    sendError(message.id ?? null, -32000, error.message || String(error));
  }
});

child.on('exit', (code, signal) => {
  send({
    jsonrpc: '2.0',
    method: 'plugin.exited',
    params: { code, signal },
  });
  process.exit(code || 0);
});

child.on('error', (error) => {
  log(`Failed to start plugin: ${error.message}`);
  process.exit(3);
});

(async () => {
  try {
    const result = await request('initialize', {
      pluginId: manifest.id,
      apiVersion: manifest.apiVersion,
      permissions: manifest.permissions || [],
      config: manifest.config || {},
      dataDir,
    }, 20000);
    send({
      jsonrpc: '2.0',
      method: 'plugin.ready',
      params: { manifest, initializeResult: result ?? null },
    });
  } catch (error) {
    log(`Plugin initialization failed: ${error.message}`);
    child.kill();
    process.exit(4);
  }
})();

process.on('SIGTERM', () => child.kill());
process.on('SIGINT', () => child.kill());
