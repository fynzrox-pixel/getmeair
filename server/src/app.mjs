import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { now, openDatabase, parseJson } from './db.mjs';
import {
  createSession,
  destroySession,
  findOrCreateUser,
  resolveSession,
  validateTelegramInitData,
} from './auth.mjs';
import {
  ApiError,
  ROLE_LABELS,
  ROLE_RANK,
  assertAdmin,
  assertCanManageUser,
  assertRole,
  canAssignRole,
  canGrantFirecoins,
  publicUser,
  selfUser,
} from './security.mjs';
import {
  ensureOwnerInitialGrant,
  getBalance,
  grant,
  listTransactions,
  transfer,
} from './ledger.mjs';

const BODY_LIMIT = 1024 * 1024;

const DEFAULT_SETTINGS = {
  'wallet.transfers_enabled': 'false',
  'store.require_signature': 'true',
  'verification.require_owner_for_owner_badge': 'true',
  'security.max_admin_grant': '100000',
};

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-getmeair-api': '1',
  });
  res.end(body);
}

function noContent(res, status = 204) {
  res.writeHead(status);
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new ApiError(413, 'body_too_large', 'Request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new ApiError(400, 'invalid_json', 'Request body must be valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function bearer(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : '';
}

function requireAuth(req, db) {
  const user = resolveSession(db, bearer(req));
  if (!user) throw new ApiError(401, 'auth_required', 'A valid Getmeair session is required.');
  return user;
}

function optionalAuth(req, db) {
  return resolveSession(db, bearer(req));
}

function audit(db, actorUserId, action, targetUserId = null, details = {}) {
  db.prepare(`
    INSERT INTO audit_log (id, actor_user_id, action, target_user_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), actorUserId, action, targetUserId, JSON.stringify(details), now());
}

function getUser(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function requireUser(db, id) {
  const user = getUser(db, id);
  if (!user) throw new ApiError(404, 'user_not_found', 'User not found.');
  return user;
}

function safeSecretEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
  return row ? row.value : DEFAULT_SETTINGS[key];
}

function setSetting(db, key, value, actorId) {
  db.prepare(`
    INSERT INTO system_settings (key, value, updated_at, updated_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).run(key, String(value), now(), actorId);
}

function normalizeLimit(value, fallback = 50, max = 200) {
  return Math.min(Math.max(Number(value) || fallback, 1), max);
}

function getAllSettings(db) {
  const rows = db.prepare('SELECT key, value, updated_at FROM system_settings').all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

function serializePlugin(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    author: row.author,
    category: row.category,
    icon: row.icon,
    apiVersion: row.api_version,
    permissions: parseJson(row.permissions, []),
    downloadUrl: row.download_url,
    checksum: row.checksum,
    screenshots: parseJson(row.screenshots, []),
    rating: row.rating,
    ratingCount: row.rating_count,
    published: !!row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validatePluginInput(body, partial = false) {
  const required = ['name', 'description', 'version', 'author', 'category', 'apiVersion'];
  for (const key of required) {
    if (!partial && (typeof body[key] !== 'string' || !body[key].trim())) {
      throw new ApiError(400, 'invalid_plugin', `Plugin field '${key}' is required.`);
    }
  }
  const allowedCategories = [
    'Privacy', 'Appearance', 'Chat Tools', 'AI', 'Media',
    'Automation', 'Utilities', 'Security', 'Developer Tools',
  ];
  if (body.category && !allowedCategories.includes(body.category)) {
    throw new ApiError(400, 'invalid_category', 'Unknown plugin category.');
  }
  if (body.permissions && !Array.isArray(body.permissions)) {
    throw new ApiError(400, 'invalid_permissions', 'permissions must be an array.');
  }
}

function createApp(options = {}) {
  const config = options.config;
  const db = options.db || openDatabase(config.dbPath);

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at, updated_by)
      VALUES (?, ?, ?, NULL)
      ON CONFLICT(key) DO NOTHING
    `).run(key, value, now());
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname.replace(/\/+$/, '') || '/';
      const method = req.method || 'GET';

      if (method === 'GET' && path === '/api/v1/health') {
        return json(res, 200, {
          ok: true,
          service: 'getmeair-server',
          version: '0.1.0',
          time: now(),
        });
      }

      if (method === 'POST' && path === '/api/v1/auth/dev-login') {
        if (!config.allowDevLogin) {
          throw new ApiError(404, 'not_found', 'Not found.');
        }
        const body = await readBody(req);
        if (!body.phone && !body.telegramUserId) {
          throw new ApiError(400, 'identity_required', 'phone or telegramUserId is required.');
        }
        const user = findOrCreateUser(db, {
          phone: body.phone || null,
          telegramUserId: body.telegramUserId || null,
          username: body.username || null,
          displayName: body.displayName || 'Getmeair User',
        });
        if (user.blocked) {
          throw new ApiError(403, 'account_blocked', 'This Getmeair account is blocked.');
        }
        const session = createSession(db, user.id, config.sessionTtlSeconds);
        return json(res, 200, {
          token: session.token,
          expiresAt: session.expiresAt,
          user: selfUser(user, getBalance(db, user.id)),
        });
      }

      if (method === 'POST' && path === '/api/v1/auth/telegram') {
        const body = await readBody(req);
        const identity = validateTelegramInitData(body.initData, config.telegramBotToken);
        const user = findOrCreateUser(db, identity);
        if (user.blocked) {
          throw new ApiError(403, 'account_blocked', 'This Getmeair account is blocked.');
        }
        const session = createSession(db, user.id, config.sessionTtlSeconds);
        return json(res, 200, {
          token: session.token,
          expiresAt: session.expiresAt,
          user: selfUser(user, getBalance(db, user.id)),
        });
      }

      if (method === 'POST' && path === '/api/v1/auth/logout') {
        const session = requireAuth(req, db);
        destroySession(db, session.session_id);
        return noContent(res);
      }

      if (method === 'GET' && path === '/api/v1/me') {
        const user = requireAuth(req, db);
        return json(res, 200, { user: selfUser(user, getBalance(db, user.id)) });
      }

      if (method === 'GET' && path === '/api/v1/store/categories') {
        return json(res, 200, {
          categories: [
            'Privacy', 'Appearance', 'Chat Tools', 'AI', 'Media',
            'Automation', 'Utilities', 'Security', 'Developer Tools',
          ],
        });
      }

      if (method === 'GET' && path === '/api/v1/store/plugins') {
        const query = (url.searchParams.get('query') || '').trim();
        const category = (url.searchParams.get('category') || '').trim();
        const limit = normalizeLimit(url.searchParams.get('limit'), 50, 100);
        const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
        const rows = db.prepare(`
          SELECT * FROM plugin_catalog
          WHERE published = 1
            AND (? = '' OR name LIKE ? OR description LIKE ? OR author LIKE ?)
            AND (? = '' OR category = ?)
          ORDER BY rating DESC, updated_at DESC
          LIMIT ? OFFSET ?
        `).all(
          query, `%${query}%`, `%${query}%`, `%${query}%`,
          category, category, limit, offset,
        );
        return json(res, 200, { plugins: rows.map(serializePlugin) });
      }

      if (method === 'GET' && path.startsWith('/api/v1/store/plugins/')) {
        const id = decodeURIComponent(path.slice('/api/v1/store/plugins/'.length));
        const row = db.prepare('SELECT * FROM plugin_catalog WHERE id = ? AND published = 1').get(id);
        if (!row) throw new ApiError(404, 'plugin_not_found', 'Plugin not found.');
        return json(res, 200, { plugin: serializePlugin(row) });
      }

      if (method === 'POST' && path === '/api/v1/owner/claim') {
        const body = await readBody(req);
        if (!config.ownerBootstrapSecret) {
          throw new ApiError(503, 'owner_bootstrap_unconfigured', 'OWNER_BOOTSTRAP_SECRET is not configured.');
        }
        if (!safeSecretEqual(body.bootstrapSecret, config.ownerBootstrapSecret)) {
          throw new ApiError(403, 'invalid_bootstrap_secret', 'Invalid owner bootstrap secret.');
        }
        const existingOwner = db.prepare("SELECT * FROM users WHERE role = 'owner' LIMIT 1").get();
        if (existingOwner) {
          throw new ApiError(409, 'owner_already_claimed', 'Getmeair owner is already claimed.');
        }
        const current = optionalAuth(req, db);
        let user = current;
        if (!user) {
          if (!config.allowDevLogin) {
            throw new ApiError(401, 'owner_auth_required', 'Sign in before claiming owner.');
          }
          if (body.phone && body.phone !== config.ownerPhone) {
            throw new ApiError(403, 'owner_identity_mismatch', 'Phone does not match OWNER_PHONE.');
          }
          user = findOrCreateUser(db, {
            phone: config.ownerPhone,
            telegramUserId: body.telegramUserId || null,
            displayName: body.displayName || 'Getmeair Owner',
          });
        }
        const identityMatches = (config.ownerTelegramUserId
          && user.telegram_user_id === config.ownerTelegramUserId)
          || (user.phone === config.ownerPhone);
        if (!identityMatches) {
          throw new ApiError(403, 'owner_identity_mismatch',
            'The signed-in identity does not match the configured Getmeair owner.');
        }
        const grantResult = ensureOwnerInitialGrant(db, user.id, config.ownerInitialFirecoins);
        db.prepare(`
          UPDATE users SET role = 'owner', verified = 1, verification_kind = 'owner',
            owner_claimed_at = ?, updated_at = ?, phone = COALESCE(phone, ?)
          WHERE id = ?
        `).run(now(), now(), config.ownerPhone, user.id);
        const owner = getUser(db, user.id);
        audit(db, owner.id, 'owner.claimed', owner.id, {
          phone: owner.phone,
          initialGrant: grantResult.transaction.amount,
        });
        const session = current
          ? { token: null, expiresAt: null }
          : createSession(db, owner.id, config.sessionTtlSeconds);
        return json(res, 200, {
          owner: selfUser(owner, getBalance(db, owner.id)),
          token: session.token,
          expiresAt: session.expiresAt,
          initialGrant: {
            amount: grantResult.transaction.amount,
            currency: 'Firecoins',
            symbol: '🔥',
            duplicate: grantResult.duplicate,
          },
        });
      }

      if (method === 'GET' && path === '/api/v1/wallet') {
        const user = requireAuth(req, db);
        return json(res, 200, {
          balance: getBalance(db, user.id),
          currency: 'Firecoins',
          symbol: '🔥',
          transactions: listTransactions(db, user.id, {
            limit: normalizeLimit(url.searchParams.get('limit'), 20, 100),
            offset: url.searchParams.get('offset') || 0,
            type: url.searchParams.get('type') || null,
          }),
        });
      }

      if (method === 'GET' && path === '/api/v1/wallet/transactions') {
        const user = requireAuth(req, db);
        return json(res, 200, {
          transactions: listTransactions(db, user.id, {
            limit: normalizeLimit(url.searchParams.get('limit'), 50, 200),
            offset: url.searchParams.get('offset') || 0,
            type: url.searchParams.get('type') || null,
          }),
        });
      }

      if (method === 'POST' && path === '/api/v1/wallet/transfer') {
        const user = requireAuth(req, db);
        if (getSetting(db, 'wallet.transfers_enabled') !== 'true') {
          throw new ApiError(403, 'transfers_disabled', 'Firecoin transfers are disabled by the owner.');
        }
        const body = await readBody(req);
        const target = requireUser(db, body.toUserId);
        if (target.blocked) throw new ApiError(409, 'target_blocked', 'Recipient is blocked.');
        const amount = Number(body.amount);
        if (amount > config.maxTransfer) {
          throw new ApiError(400, 'amount_too_large', `Transfer cannot exceed ${config.maxTransfer}.`);
        }
        const result = transfer(db, {
          fromUserId: user.id,
          toUserId: target.id,
          amount,
          idempotencyKey: body.idempotencyKey || null,
          metadata: { note: String(body.note || '').slice(0, 200) },
        });
        audit(db, user.id, 'wallet.transfer', target.id, {
          amount: result.transaction.amount,
          transactionId: result.transaction.id,
          duplicate: result.duplicate,
        });
        return json(res, 200, {
          transaction: result.transaction,
          duplicate: result.duplicate,
          balance: getBalance(db, user.id),
        });
      }

      if (method === 'GET' && path === '/api/v1/admin/users') {
        const actor = requireAuth(req, db);
        assertAdmin(actor);
        const query = (url.searchParams.get('query') || '').trim();
        const limit = normalizeLimit(url.searchParams.get('limit'), 50, 200);
        const rows = db.prepare(`
          SELECT * FROM users
          WHERE ? = '' OR display_name LIKE ? OR username LIKE ? OR phone LIKE ?
          ORDER BY
            CASE role
              WHEN 'owner' THEN 0 WHEN 'super_admin' THEN 1 WHEN 'administrator' THEN 2
              WHEN 'moderator' THEN 3 WHEN 'verified' THEN 4 WHEN 'premium' THEN 5 ELSE 6
            END,
            created_at DESC
          LIMIT ?
        `).all(query, `%${query}%`, `%${query}%`, `%${query}%`, limit);
        return json(res, 200, {
          users: rows.map((row) => ({
            ...publicUser(row),
            phone: canGrantFirecoins(actor) ? row.phone : null,
            firecoins: getBalance(db, row.id),
          })),
        });
      }

      const userRoute = /^\/api\/v1\/admin\/users\/([^/]+)$/.exec(path);
      if (method === 'GET' && userRoute) {
        const actor = requireAuth(req, db);
        assertAdmin(actor);
        const target = requireUser(db, decodeURIComponent(userRoute[1]));
        return json(res, 200, {
          user: {
            ...publicUser(target),
            phone: canGrantFirecoins(actor) ? target.phone : null,
            firecoins: getBalance(db, target.id),
          },
          transactions: canGrantFirecoins(actor)
            ? listTransactions(db, target.id, { limit: 50, offset: 0 })
            : [],
        });
      }

      const roleRoute = /^\/api\/v1\/admin\/users\/([^/]+)\/role$/.exec(path);
      if (method === 'POST' && roleRoute) {
        const actor = requireAuth(req, db);
        assertAdmin(actor);
        const body = await readBody(req);
        assertRole(body.role);
        const target = requireUser(db, decodeURIComponent(roleRoute[1]));
        assertCanManageUser(actor, target);
        if (!canAssignRole(actor, body.role)) {
          throw new ApiError(403, 'role_not_allowed', 'You cannot assign this role.');
        }
        if (body.role === 'owner' && actor.role !== 'owner') {
          throw new ApiError(403, 'owner_only', 'Only the owner can transfer ownership.');
        }
        db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?')
          .run(body.role, now(), target.id);
        audit(db, actor.id, 'user.role_changed', target.id, {
          from: target.role,
          to: body.role,
        });
        return json(res, 200, { user: publicUser(requireUser(db, target.id)) });
      }

      const verificationRoute = /^\/api\/v1\/admin\/users\/([^/]+)\/verification$/.exec(path);
      if (method === 'POST' && verificationRoute) {
        const actor = requireAuth(req, db);
        if (!canGrantFirecoins(actor)) {
          throw new ApiError(403, 'admin_required', 'Administrator access required.');
        }
        const body = await readBody(req);
        const target = requireUser(db, decodeURIComponent(verificationRoute[1]));
        assertCanManageUser(actor, target);
        const verified = !!body.verified;
        const kind = verified ? (body.kind || 'getmeair') : 'none';
        if (!['getmeair', 'owner'].includes(kind) && verified) {
          throw new ApiError(400, 'invalid_verification_kind', 'Unknown verification kind.');
        }
        if (kind === 'owner' && actor.role !== 'owner') {
          throw new ApiError(403, 'owner_only', 'Only the owner can grant owner verification.');
        }
        db.prepare(`
          UPDATE users SET verified = ?, verification_kind = ?, updated_at = ? WHERE id = ?
        `).run(verified ? 1 : 0, kind, now(), target.id);
        audit(db, actor.id, 'user.verification_changed', target.id, { verified, kind });
        return json(res, 200, { user: publicUser(requireUser(db, target.id)) });
      }

      const blockRoute = /^\/api\/v1\/admin\/users\/([^/]+)\/block$/.exec(path);
      if (method === 'POST' && blockRoute) {
        const actor = requireAuth(req, db);
        assertAdmin(actor);
        const body = await readBody(req);
        const target = requireUser(db, decodeURIComponent(blockRoute[1]));
        assertCanManageUser(actor, target);
        const blocked = !!body.blocked;
        db.prepare('UPDATE users SET blocked = ?, updated_at = ? WHERE id = ?')
          .run(blocked ? 1 : 0, now(), target.id);
        audit(db, actor.id, blocked ? 'user.blocked' : 'user.unblocked', target.id, {});
        return json(res, 200, { user: publicUser(requireUser(db, target.id)) });
      }

      if (method === 'POST' && path === '/api/v1/admin/wallet/grant') {
        const actor = requireAuth(req, db);
        if (!canGrantFirecoins(actor)) {
          throw new ApiError(403, 'admin_required', 'Administrator access required.');
        }
        const body = await readBody(req);
        const target = requireUser(db, body.userId);
        const amount = Number(body.amount);
        if (amount > Number(getSetting(db, 'security.max_admin_grant') || 100000)
          && actor.role !== 'owner') {
          throw new ApiError(403, 'grant_limit', 'Grant exceeds the configured administrator limit.');
        }
        const result = grant(db, {
          toUserId: target.id,
          amount,
          type: 'admin_grant',
          idempotencyKey: body.idempotencyKey
            ? `admin:${actor.id}:${body.idempotencyKey}`
            : null,
          metadata: { reason: String(body.reason || '').slice(0, 300), actor: actor.id },
        });
        audit(db, actor.id, 'wallet.grant', target.id, {
          amount,
          reason: body.reason || '',
          transactionId: result.transaction.id,
          duplicate: result.duplicate,
        });
        return json(res, 200, {
          transaction: result.transaction,
          duplicate: result.duplicate,
          balance: getBalance(db, target.id),
        });
      }

      if (method === 'GET' && path === '/api/v1/admin/audit') {
        const actor = requireAuth(req, db);
        assertAdmin(actor);
        const limit = normalizeLimit(url.searchParams.get('limit'), 100, 500);
        const rows = db.prepare(`
          SELECT a.*, u.display_name AS actor_name, t.display_name AS target_name
          FROM audit_log a
          LEFT JOIN users u ON u.id = a.actor_user_id
          LEFT JOIN users t ON t.id = a.target_user_id
          ORDER BY a.created_at DESC LIMIT ?
        `).all(limit);
        return json(res, 200, {
          entries: rows.map((row) => ({
            id: row.id,
            actorUserId: row.actor_user_id,
            actorName: row.actor_name,
            action: row.action,
            targetUserId: row.target_user_id,
            targetName: row.target_name,
            details: parseJson(row.details, {}),
            createdAt: row.created_at,
          })),
        });
      }

      if (method === 'GET' && path === '/api/v1/admin/stats') {
        const actor = requireAuth(req, db);
        assertAdmin(actor);
        const users = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
        const verified = db.prepare('SELECT COUNT(*) AS count FROM users WHERE verified = 1').get().count;
        const blocked = db.prepare('SELECT COUNT(*) AS count FROM users WHERE blocked = 1').get().count;
        const transactions = db.prepare('SELECT COUNT(*) AS count FROM wallet_transactions').get().count;
        const volume = db.prepare(`
          SELECT COALESCE(SUM(amount), 0) AS total FROM wallet_transactions WHERE status = 'completed'
        `).get().total;
        return json(res, 200, {
          users,
          verified,
          blocked,
          transactions,
          firecoinsVolume: Number(volume),
        });
      }

      if (method === 'GET' && path === '/api/v1/admin/settings') {
        const actor = requireAuth(req, db);
        if (actor.role !== 'owner' && actor.role !== 'super_admin') {
          throw new ApiError(403, 'owner_or_super_admin', 'Owner or Super Admin access required.');
        }
        return json(res, 200, { settings: getAllSettings(db) });
      }

      if (method === 'PUT' && path === '/api/v1/admin/settings') {
        const actor = requireAuth(req, db);
        if (actor.role !== 'owner' && actor.role !== 'super_admin') {
          throw new ApiError(403, 'owner_or_super_admin', 'Owner or Super Admin access required.');
        }
        const body = await readBody(req);
        if (!body.settings || typeof body.settings !== 'object') {
          throw new ApiError(400, 'invalid_settings', 'settings object is required.');
        }
        for (const [key, value] of Object.entries(body.settings)) {
          if (!/^[a-z0-9_.-]{1,80}$/i.test(key)) {
            throw new ApiError(400, 'invalid_setting_key', `Invalid setting key: ${key}`);
          }
          setSetting(db, key, value, actor.id);
        }
        audit(db, actor.id, 'settings.updated', null, { keys: Object.keys(body.settings) });
        return json(res, 200, { settings: getAllSettings(db) });
      }

      if (method === 'GET' && path === '/api/v1/admin/plugins') {
        const actor = requireAuth(req, db);
        if (actor.role !== 'owner' && actor.role !== 'super_admin') {
          throw new ApiError(403, 'owner_or_super_admin', 'Owner or Super Admin access required.');
        }
        const rows = db.prepare('SELECT * FROM plugin_catalog ORDER BY updated_at DESC').all();
        return json(res, 200, { plugins: rows.map(serializePlugin) });
      }

      if (method === 'POST' && path === '/api/v1/admin/plugins') {
        const actor = requireAuth(req, db);
        if (actor.role !== 'owner' && actor.role !== 'super_admin') {
          throw new ApiError(403, 'owner_or_super_admin', 'Owner or Super Admin access required.');
        }
        const body = await readBody(req);
        validatePluginInput(body);
        const id = body.id || randomUUID();
        const timestamp = now();
        db.prepare(`
          INSERT INTO plugin_catalog (
            id, name, description, version, author, category, icon, api_version,
            permissions, download_url, checksum, screenshots, rating, rating_count,
            published, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)
        `).run(
          id, body.name, body.description, body.version, body.author, body.category,
          body.icon || null, body.apiVersion, JSON.stringify(body.permissions || []),
          body.downloadUrl || null, body.checksum || null,
          JSON.stringify(body.screenshots || []), timestamp, timestamp,
        );
        audit(db, actor.id, 'plugin.created', null, { pluginId: id, name: body.name });
        const row = db.prepare('SELECT * FROM plugin_catalog WHERE id = ?').get(id);
        return json(res, 201, { plugin: serializePlugin(row) });
      }

      const pluginRoute = /^\/api\/v1\/admin\/plugins\/([^/]+)$/.exec(path);
      if (method === 'PUT' && pluginRoute) {
        const actor = requireAuth(req, db);
        if (actor.role !== 'owner' && actor.role !== 'super_admin') {
          throw new ApiError(403, 'owner_or_super_admin', 'Owner or Super Admin access required.');
        }
        const id = decodeURIComponent(pluginRoute[1]);
        const row = db.prepare('SELECT * FROM plugin_catalog WHERE id = ?').get(id);
        if (!row) throw new ApiError(404, 'plugin_not_found', 'Plugin not found.');
        const body = await readBody(req);
        validatePluginInput(body, true);
        const next = {
          name: body.name ?? row.name,
          description: body.description ?? row.description,
          version: body.version ?? row.version,
          author: body.author ?? row.author,
          category: body.category ?? row.category,
          icon: body.icon ?? row.icon,
          api_version: body.apiVersion ?? row.api_version,
          permissions: JSON.stringify(body.permissions ?? parseJson(row.permissions, [])),
          download_url: body.downloadUrl ?? row.download_url,
          checksum: body.checksum ?? row.checksum,
          screenshots: JSON.stringify(body.screenshots ?? parseJson(row.screenshots, [])),
          published: body.published === undefined ? row.published : (body.published ? 1 : 0),
        };
        if (next.published && !next.download_url) {
          throw new ApiError(400, 'download_required', 'Published plugins require a download URL.');
        }
        if (next.published && !next.checksum) {
          throw new ApiError(400, 'checksum_required', 'Published plugins require a SHA-256 checksum.');
        }
        db.prepare(`
          UPDATE plugin_catalog SET name = ?, description = ?, version = ?, author = ?,
            category = ?, icon = ?, api_version = ?, permissions = ?, download_url = ?,
            checksum = ?, screenshots = ?, published = ?, updated_at = ?
          WHERE id = ?
        `).run(
          next.name, next.description, next.version, next.author, next.category,
          next.icon, next.api_version, next.permissions, next.download_url,
          next.checksum, next.screenshots, next.published, now(), id,
        );
        audit(db, actor.id, 'plugin.updated', null, { pluginId: id, published: !!next.published });
        return json(res, 200, {
          plugin: serializePlugin(db.prepare('SELECT * FROM plugin_catalog WHERE id = ?').get(id)),
        });
      }

      throw new ApiError(404, 'not_found', 'Not found.');
    } catch (error) {
      if (error instanceof ApiError) {
        return json(res, error.status, { error: error.code, message: error.message });
      }
      console.error('[getmeair-server]', error);
      return json(res, 500, { error: 'internal_error', message: 'Internal server error.' });
    }
  });

  server.on('close', () => {
    if (!options.db) {
      try { db.close(); } catch { }
    }
  });

  return { server, db };
}

export { createApp };
