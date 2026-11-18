import { randomUUID } from 'node:crypto';
import { now, withTransaction } from './db.mjs';
import { ApiError } from './security.mjs';

const MAX_AMOUNT = 1_000_000_000;

function normalizeAmount(amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new ApiError(400, 'invalid_amount', 'Amount must be a positive integer.');
  }
  if (amount > MAX_AMOUNT) {
    throw new ApiError(400, 'amount_too_large', `Amount cannot exceed ${MAX_AMOUNT}.`);
  }
  return amount;
}

export function getBalance(db, userId) {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN to_user_id = ? THEN amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN from_user_id = ? THEN amount ELSE 0 END), 0) AS balance
    FROM wallet_transactions
    WHERE status = 'completed'
  `).get(userId, userId);
  return Number(row?.balance || 0);
}

export function listTransactions(db, userId, { limit = 50, offset = 0, type = null } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const rows = type
    ? db.prepare(`
        SELECT * FROM wallet_transactions
        WHERE (from_user_id = ? OR to_user_id = ?) AND type = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(userId, userId, type, safeLimit, safeOffset)
    : db.prepare(`
        SELECT * FROM wallet_transactions
        WHERE from_user_id = ? OR to_user_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(userId, userId, safeLimit, safeOffset);
  return rows.map((row) => ({
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    amount: row.amount,
    type: row.type,
    status: row.status,
    metadata: JSON.parse(row.metadata || '{}'),
    direction: row.to_user_id === userId ? 'in' : 'out',
    createdAt: row.created_at,
  }));
}

function insertTransaction(db, {
  idempotencyKey = null,
  fromUserId = null,
  toUserId,
  amount,
  type,
  metadata = {},
  status = 'completed',
}) {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO wallet_transactions (
      id, idempotency_key, from_user_id, to_user_id, amount, type, status, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    idempotencyKey,
    fromUserId,
    toUserId,
    amount,
    type,
    status,
    JSON.stringify(metadata),
    now(),
  );
  return db.prepare('SELECT * FROM wallet_transactions WHERE id = ?').get(id);
}

export function grant(db, { toUserId, amount, type, idempotencyKey, metadata = {} }) {
  normalizeAmount(amount);
  return withTransaction(db, () => {
    if (idempotencyKey) {
      const existing = db.prepare('SELECT * FROM wallet_transactions WHERE idempotency_key = ?')
        .get(idempotencyKey);
      if (existing) return { transaction: existing, duplicate: true };
    }
    const tx = insertTransaction(db, {
      idempotencyKey,
      toUserId,
      amount,
      type,
      metadata,
    });
    return { transaction: tx, duplicate: false };
  });
}

export function transfer(db, {
  fromUserId,
  toUserId,
  amount,
  type = 'transfer',
  idempotencyKey = null,
  metadata = {},
}) {
  normalizeAmount(amount);
  if (fromUserId === toUserId) {
    throw new ApiError(400, 'self_transfer', 'Cannot transfer Firecoins to yourself.');
  }
  return withTransaction(db, () => {
    if (idempotencyKey) {
      const existing = db.prepare('SELECT * FROM wallet_transactions WHERE idempotency_key = ?')
        .get(idempotencyKey);
      if (existing) return { transaction: existing, duplicate: true };
    }
    const balance = getBalance(db, fromUserId);
    if (balance < amount) {
      throw new ApiError(409, 'insufficient_funds', 'Not enough Firecoins.');
    }
    const tx = insertTransaction(db, {
      idempotencyKey,
      fromUserId,
      toUserId,
      amount,
      type,
      metadata,
    });
    return { transaction: tx, duplicate: false };
  });
}

export function ensureOwnerInitialGrant(db, userId, amount = 100000) {
  const key = `owner-initial-grant:${userId}`;
  return grant(db, {
    toUserId: userId,
    amount,
    type: 'owner_initial_grant',
    idempotencyKey: key,
    metadata: {
      reason: 'One-time activation grant for the Getmeair owner.',
      currency: 'Firecoins',
      symbol: '🔥',
    },
  });
}
