#!/usr/bin/env node
import { createInterface } from 'node:readline';

let nextId = 1;
const pending = new Map();
let handlers = {};

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function request(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ jsonrpc: '2.0', id, method, params });
  });
}

function notify(method, params = {}) {
  send({ jsonrpc: '2.0', method, params });
}

export const sdk = {
  log(message) {
    notify('log', { message: String(message).slice(0, 4000) });
  },
  async notify(title, text) {
    return request('notify', { title: String(title), text: String(text) });
  },
  async storageGet(key) {
    const result = await request('storage.get', { key });
    return result?.value ?? null;
  },
  async storageSet(key, value) {
    return request('storage.set', { key, value });
  },
  async storageDelete(key) {
    return request('storage.delete', { key });
  },
  registerCommand(command) {
    notify('command.registered', command);
  },
  registerMenu(items) {
    notify('menu.items', { items });
  },
};

export function createPlugin(pluginHandlers = {}) {
  handlers = pluginHandlers;
  return sdk;
}

const input = createInterface({ input: process.stdin });
input.on('line', async (line) => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); } catch { return; }

  if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message || 'Host error'));
    else waiter.resolve(message.result);
    return;
  }

  if (message.method) {
    try {
      let result;
      if (message.method === 'initialize') {
        result = handlers.onInitialize
          ? await handlers.onInitialize(message.params || {})
          : { ok: true };
      } else if (message.method === 'event') {
        result = handlers.onEvent
          ? await handlers.onEvent(message.params || {})
          : { ok: true };
      } else if (message.method === 'command') {
        result = handlers.onCommand
          ? await handlers.onCommand(message.params || {})
          : { ok: true };
      } else if (message.method === 'menu.list') {
        result = handlers.onMenu
          ? await handlers.onMenu(message.params || {})
          : { items: [] };
      } else if (message.method === 'notification') {
        result = handlers.onNotification
          ? await handlers.onNotification(message.params || {})
          : { ok: true };
      } else if (message.method === 'shutdown') {
        send({ jsonrpc: '2.0', id: message.id ?? null, result: { ok: true } });
        process.exit(0);
      } else {
        throw new Error(`Unknown method: ${message.method}`);
      }
      send({ jsonrpc: '2.0', id: message.id ?? null, result: result ?? { ok: true } });
    } catch (error) {
      send({
        jsonrpc: '2.0',
        id: message.id ?? null,
        error: { code: -32000, message: error.message || String(error) },
      });
    }
  }
});
