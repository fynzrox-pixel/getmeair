import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const schema = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  telegram_user_id TEXT UNIQUE,
  phone TEXT UNIQUE,
  username TEXT,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner','super_admin','administrator','moderator','verified','premium','member')),
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  verification_kind TEXT NOT NULL DEFAULT 'none'
    CHECK (verification_kind IN ('none','getmeair','owner')),
  premium_until TEXT,
  blocked INTEGER NOT NULL DEFAULT 0 CHECK (blocked IN (0,1)),
  owner_claimed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE,
  from_user_id TEXT REFERENCES users(id),
  to_user_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','reversed')),
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS wallet_from_idx ON wallet_transactions(from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_to_idx ON wallet_transactions(to_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  target_user_id TEXT REFERENCES users(id),
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS plugin_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  version TEXT NOT NULL,
  author TEXT NOT NULL,
  category TEXT NOT NULL,
  icon TEXT,
  api_version TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '[]',
  download_url TEXT,
  checksum TEXT,
  screenshots TEXT NOT NULL DEFAULT '[]',
  rating REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export function openDatabase(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(schema);
  return db;
}

export function now() {
  return new Date().toISOString();
}

export function withTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { }
    throw error;
  }
}

export function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}
