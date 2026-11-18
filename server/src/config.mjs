import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(join(root, '.env'));

const dataDir = resolve(process.env.GETMEAIR_DATA_DIR || join(root, 'data'));
mkdirSync(dataDir, { recursive: true });

let secret = process.env.GETMEAIR_SESSION_SECRET || '';
if (!secret) {
  const secretPath = join(dataDir, 'session-secret.txt');
  if (existsSync(secretPath)) {
    secret = readFileSync(secretPath, 'utf8').trim();
  } else {
    secret = randomBytes(48).toString('base64url');
    writeFileSync(secretPath, secret, { encoding: 'utf8', mode: 0o600 });
  }
}

export const config = {
  root,
  dataDir,
  dbPath: resolve(process.env.GETMEAIR_DB || join(dataDir, 'getmeair.sqlite')),
  host: process.env.GETMEAIR_HOST || '127.0.0.1',
  port: Number(process.env.GETMEAIR_PORT || 8787),
  sessionSecret: secret,
  sessionTtlSeconds: Number(process.env.GETMEAIR_SESSION_TTL || 60 * 60 * 24 * 30),
  allowDevLogin: process.env.GETMEAIR_ALLOW_DEV_LOGIN === '1',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  ownerPhone: process.env.OWNER_PHONE || '+380991868393',
  ownerTelegramUserId: process.env.OWNER_TELEGRAM_USER_ID || '',
  ownerBootstrapSecret: process.env.OWNER_BOOTSTRAP_SECRET || '',
  ownerInitialFirecoins: Number(process.env.OWNER_INITIAL_FIRECOINS || 100000),
  maxTransfer: Number(process.env.GETMEAIR_MAX_TRANSFER || 100000),
  pluginCatalogPath: resolve(process.env.GETMEAIR_PLUGIN_CATALOG || join(root, 'catalog', 'plugins.json')),
};
