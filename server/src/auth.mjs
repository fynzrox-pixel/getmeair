import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { now } from './db.mjs';
import { ApiError } from './security.mjs';

export function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createSession(db, userId, ttlSeconds) {
  const token = randomBytes(32).toString('base64url');
  const id = randomUUID();
  const created = now();
  const expires = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, hashToken(token), created, expires, created);
  return { token, sessionId: id, expiresAt: expires };
}

export function resolveSession(db, token) {
  if (!token) return null;
  const hash = hashToken(token);
  const row = db.prepare(`
    SELECT s.id AS session_id, s.expires_at, u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(hash);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
    return null;
  }
  if (row.blocked) {
    throw new ApiError(403, 'account_blocked', 'This Getmeair account is blocked.');
  }
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(now(), row.session_id);
  return row;
}

export function destroySession(db, sessionId) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function findOrCreateUser(db, identity) {
  const telegramUserId = identity.telegramUserId || null;
  const phone = identity.phone || null;
  let user = null;
  if (telegramUserId) {
    user = db.prepare('SELECT * FROM users WHERE telegram_user_id = ?').get(telegramUserId);
  }
  if (!user && phone) {
    user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  }
  if (user) {
    db.prepare(`
      UPDATE users SET
        telegram_user_id = COALESCE(?, telegram_user_id),
        phone = COALESCE(?, phone),
        username = COALESCE(?, username),
        display_name = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      telegramUserId,
      phone,
      identity.username || null,
      identity.displayName || user.display_name,
      now(),
      user.id,
    );
    return db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  }

  const id = randomUUID();
  const timestamp = now();
  db.prepare(`
    INSERT INTO users (
      id, telegram_user_id, phone, username, display_name, role, verified,
      verification_kind, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'member', 0, 'none', ?, ?)
  `).run(
    id,
    telegramUserId,
    phone,
    identity.username || null,
    identity.displayName || identity.username || 'Getmeair User',
    timestamp,
    timestamp,
  );
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function parseInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new ApiError(401, 'invalid_telegram_data', 'Telegram initData has no hash.');
  const entries = [];
  for (const [key, value] of params.entries()) {
    if (key !== 'hash') entries.push(`${key}=${value}`);
  }
  entries.sort();
  return { params, hash, dataCheckString: entries.join('\n') };
}

function safeEqualHex(a, b) {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function validateTelegramInitData(initData, botToken) {
  if (!botToken) {
    throw new ApiError(503, 'telegram_auth_unconfigured', 'TELEGRAM_BOT_TOKEN is not configured.');
  }
  const { params, hash, dataCheckString } = parseInitData(initData);
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (!safeEqualHex(calculated, hash)) {
    throw new ApiError(401, 'invalid_telegram_data', 'Telegram initData signature is invalid.');
  }
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Math.abs(Date.now() / 1000 - authDate) > 86400) {
    throw new ApiError(401, 'expired_telegram_data', 'Telegram initData is expired.');
  }
  let telegramUser;
  try {
    telegramUser = JSON.parse(params.get('user') || '');
  } catch {
    throw new ApiError(401, 'invalid_telegram_user', 'Telegram initData user payload is invalid.');
  }
  if (!telegramUser || !telegramUser.id) {
    throw new ApiError(401, 'invalid_telegram_user', 'Telegram initData has no user id.');
  }
  return {
    telegramUserId: String(telegramUser.id),
    username: telegramUser.username || null,
    displayName: [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ')
      || telegramUser.username
      || 'Getmeair User',
  };
}
