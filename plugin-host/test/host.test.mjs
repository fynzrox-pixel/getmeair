import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const hostDir = resolve(import.meta.dirname, '..');
const example = join(hostDir, 'examples', 'hello');

function startHost(pluginDir, dataDir) {
  const child = spawn(process.execPath, [join(hostDir, 'src', 'host.mjs'), '--plugin', pluginDir], {
    cwd: hostDir,
    env: { ...process.env, GETMEAIR_PLUGIN_DATA: dataDir },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const waiting = new Map();
  let nextId = 1;
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      if (message.id !== undefined && waiting.has(message.id)) {
        const waiter = waiting.get(message.id);
        waiting.delete(message.id);
        if (message.error) waiter.reject(new Error(message.error.message));
        else waiter.resolve(message.result);
      }
    }
  });
  return {
    child,
    async request(method, params = {}) {
      const id = nextId++;
      return new Promise((resolvePromise, reject) => {
        waiting.set(id, { resolve: resolvePromise, reject });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    },
    async stop() {
      child.kill();
      await new Promise((resolvePromise) => child.on('exit', resolvePromise));
    },
  };
}

test('plugin host starts a Node plugin in a separate process and enforces permissions', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'getmeair-plugin-data-'));
  const host = startHost(example, dataDir);
  try {
    const info = await host.request('plugin.info');
    assert.equal(info.manifest.id, 'com.getmeair.example.hello');
    assert.ok(info.dataDir.startsWith(dataDir));

    const event = await host.request('event', { name: 'message.created', payload: { text: 'hi' } });
    assert.equal(event.ok, true);

    const storage = await host.request('storage.get', { key: 'messageCount' });
    assert.equal(storage.value, 1);

    const menu = await host.request('menu.list');
    assert.equal(menu.items[0].command, 'hello.say');

    await assert.rejects(
      host.request('event', { name: 'presence.online' }),
      /Permission denied/,
    );
  } finally {
    await host.stop();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('plugin package CLI packs, installs, disables dangerous plugins and removes them', () => {
  const root = mkdtempSync(join(tmpdir(), 'getmeair-plugin-root-'));
  const archive = join(root, 'hello.getmeair-plugin');
  try {
    const pack = spawnSync(process.execPath, [
      join(hostDir, 'tools', 'plugin-cli.mjs'),
      '--root', root,
      'pack', example, archive,
    ], { encoding: 'utf8' });
    assert.equal(pack.status, 0, pack.stderr || pack.stdout);

    const install = spawnSync(process.execPath, [
      join(hostDir, 'tools', 'plugin-cli.mjs'),
      '--root', root,
      'install', archive,
    ], { encoding: 'utf8' });
    assert.equal(install.status, 0, install.stderr || install.stdout);
    assert.match(install.stdout, /disabled by default/);

    const list = spawnSync(process.execPath, [
      join(hostDir, 'tools', 'plugin-cli.mjs'),
      '--root', root,
      'list',
    ], { encoding: 'utf8' });
    assert.equal(list.status, 0);
    assert.match(list.stdout, /disabled/);
    assert.match(list.stdout, /DANGEROUS/);

    const enableWithoutFlag = spawnSync(process.execPath, [
      join(hostDir, 'tools', 'plugin-cli.mjs'),
      '--root', root,
      'enable', 'com.getmeair.example.hello',
    ], { encoding: 'utf8' });
    assert.notEqual(enableWithoutFlag.status, 0);

    const enable = spawnSync(process.execPath, [
      join(hostDir, 'tools', 'plugin-cli.mjs'),
      '--root', root,
      'enable', 'com.getmeair.example.hello', '--allow-dangerous',
    ], { encoding: 'utf8' });
    assert.equal(enable.status, 0, enable.stderr || enable.stdout);

    const remove = spawnSync(process.execPath, [
      join(hostDir, 'tools', 'plugin-cli.mjs'),
      '--root', root,
      'remove', 'com.getmeair.example.hello',
    ], { encoding: 'utf8' });
    assert.equal(remove.status, 0, remove.stderr || remove.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
