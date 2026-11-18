import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.mjs';

async function startServer() {
  const dir = mkdtempSync(join(tmpdir(), 'getmeair-test-'));
  const config = {
    dbPath: join(dir, 'test.sqlite'),
    allowDevLogin: true,
    telegramBotToken: '',
    ownerPhone: '+380991868393',
    ownerTelegramUserId: '',
    ownerBootstrapSecret: 'test-bootstrap-secret',
    ownerInitialFirecoins: 100000,
    maxTransfer: 100000,
    sessionTtlSeconds: 3600,
  };
  const { server, db } = createApp({ config });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    base: `http://127.0.0.1:${port}`,
    db,
    server,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      try { db.close(); } catch { }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function api(base, path, { method = 'GET', token, body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { status: response.status, data };
}

async function login(base, phone, displayName) {
  const response = await api(base, '/api/v1/auth/dev-login', {
    method: 'POST',
    body: { phone, displayName },
  });
  assert.equal(response.status, 200);
  return response.data;
}

test('owner claim grants Firecoins exactly once and cannot be repeated', async () => {
  const app = await startServer();
  try {
    const ownerLogin = await login(app.base, '+380991868393', 'Getmeair Owner');
    const claim = await api(app.base, '/api/v1/owner/claim', {
      method: 'POST',
      token: ownerLogin.token,
      body: { bootstrapSecret: 'test-bootstrap-secret' },
    });
    assert.equal(claim.status, 200);
    assert.equal(claim.data.owner.role, 'owner');
    assert.equal(claim.data.owner.verified, true);
    assert.equal(claim.data.owner.verificationKind, 'owner');
    assert.equal(claim.data.owner.firecoins, 100000);
    assert.equal(claim.data.initialGrant.amount, 100000);

    const again = await api(app.base, '/api/v1/owner/claim', {
      method: 'POST',
      token: ownerLogin.token,
      body: { bootstrapSecret: 'test-bootstrap-secret' },
    });
    assert.equal(again.status, 409);
    assert.equal(again.data.error, 'owner_already_claimed');

    const relogin = await login(app.base, '+380991868393', 'Getmeair Owner');
    const me = await api(app.base, '/api/v1/me', { token: relogin.token });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.firecoins, 100000);

    const wallet = await api(app.base, '/api/v1/wallet', { token: relogin.token });
    assert.equal(wallet.status, 200);
    const grants = wallet.data.transactions.filter((tx) => tx.type === 'owner_initial_grant');
    assert.equal(grants.length, 1);
  } finally {
    await app.close();
  }
});

test('role escalation, verification, Firecoin grants and transfers are server-enforced', async () => {
  const app = await startServer();
  try {
    const ownerLogin = await login(app.base, '+380991868393', 'Getmeair Owner');
    await api(app.base, '/api/v1/owner/claim', {
      method: 'POST',
      token: ownerLogin.token,
      body: { bootstrapSecret: 'test-bootstrap-secret' },
    });
    const member = await login(app.base, '+380000000001', 'Member One');

    const selfOwner = await api(app.base, `/api/v1/admin/users/${member.user.id}/role`, {
      method: 'POST',
      token: member.token,
      body: { role: 'owner' },
    });
    assert.equal(selfOwner.status, 403);

    const assignAdmin = await api(app.base, `/api/v1/admin/users/${member.user.id}/role`, {
      method: 'POST',
      token: ownerLogin.token,
      body: { role: 'administrator' },
    });
    assert.equal(assignAdmin.status, 200);
    assert.equal(assignAdmin.data.user.role, 'administrator');

    const adminAssignOwner = await api(app.base, `/api/v1/admin/users/${member.user.id}/role`, {
      method: 'POST',
      token: member.token,
      body: { role: 'owner' },
    });
    assert.equal(adminAssignOwner.status, 403);

    const verification = await api(app.base, `/api/v1/admin/users/${member.user.id}/verification`, {
      method: 'POST',
      token: ownerLogin.token,
      body: { verified: true, kind: 'getmeair' },
    });
    assert.equal(verification.status, 200);
    assert.equal(verification.data.user.verificationKind, 'getmeair');

    const grant = await api(app.base, '/api/v1/admin/wallet/grant', {
      method: 'POST',
      token: ownerLogin.token,
      body: { userId: member.user.id, amount: 500, reason: 'test grant', idempotencyKey: 'grant-1' },
    });
    assert.equal(grant.status, 200);
    assert.equal(grant.data.balance, 500);

    const duplicateGrant = await api(app.base, '/api/v1/admin/wallet/grant', {
      method: 'POST',
      token: ownerLogin.token,
      body: { userId: member.user.id, amount: 500, reason: 'test grant', idempotencyKey: 'grant-1' },
    });
    assert.equal(duplicateGrant.status, 200);
    assert.equal(duplicateGrant.data.duplicate, true);
    assert.equal(duplicateGrant.data.balance, 500);

    const disabledTransfer = await api(app.base, '/api/v1/wallet/transfer', {
      method: 'POST',
      token: member.token,
      body: { toUserId: ownerLogin.user.id, amount: 100, idempotencyKey: 'transfer-1' },
    });
    assert.equal(disabledTransfer.status, 403);
    assert.equal(disabledTransfer.data.error, 'transfers_disabled');

    const enable = await api(app.base, '/api/v1/admin/settings', {
      method: 'PUT',
      token: ownerLogin.token,
      body: { settings: { 'wallet.transfers_enabled': 'true' } },
    });
    assert.equal(enable.status, 200);

    const transfer = await api(app.base, '/api/v1/wallet/transfer', {
      method: 'POST',
      token: member.token,
      body: { toUserId: ownerLogin.user.id, amount: 100, idempotencyKey: 'transfer-1' },
    });
    assert.equal(transfer.status, 200);
    assert.equal(transfer.data.balance, 400);

    const duplicateTransfer = await api(app.base, '/api/v1/wallet/transfer', {
      method: 'POST',
      token: member.token,
      body: { toUserId: ownerLogin.user.id, amount: 100, idempotencyKey: 'transfer-1' },
    });
    assert.equal(duplicateTransfer.status, 200);
    assert.equal(duplicateTransfer.data.duplicate, true);
    assert.equal(duplicateTransfer.data.balance, 400);

    const ownerWallet = await api(app.base, '/api/v1/wallet', { token: ownerLogin.token });
    assert.equal(ownerWallet.data.balance, 100000 + 100);

    const audit = await api(app.base, '/api/v1/admin/audit', { token: ownerLogin.token });
    assert.equal(audit.status, 200);
    const actions = audit.data.entries.map((entry) => entry.action);
    assert.ok(actions.includes('owner.claimed'));
    assert.ok(actions.includes('user.role_changed'));
    assert.ok(actions.includes('user.verification_changed'));
    assert.ok(actions.includes('wallet.grant'));
    assert.ok(actions.includes('wallet.transfer'));
  } finally {
    await app.close();
  }
});

test('blocked users lose access and plugin catalog only exposes published real entries', async () => {
  const app = await startServer();
  try {
    const ownerLogin = await login(app.base, '+380991868393', 'Getmeair Owner');
    await api(app.base, '/api/v1/owner/claim', {
      method: 'POST',
      token: ownerLogin.token,
      body: { bootstrapSecret: 'test-bootstrap-secret' },
    });
    const member = await login(app.base, '+380000000002', 'Member Two');

    const block = await api(app.base, `/api/v1/admin/users/${member.user.id}/block`, {
      method: 'POST',
      token: ownerLogin.token,
      body: { blocked: true },
    });
    assert.equal(block.status, 200);
    const blockedMe = await api(app.base, '/api/v1/me', { token: member.token });
    assert.equal(blockedMe.status, 403);
    assert.equal(blockedMe.data.error, 'account_blocked');

    const emptyStore = await api(app.base, '/api/v1/store/plugins');
    assert.equal(emptyStore.status, 200);
    assert.deepEqual(emptyStore.data.plugins, []);

    const create = await api(app.base, '/api/v1/admin/plugins', {
      method: 'POST',
      token: ownerLogin.token,
      body: {
        name: 'Real Test Plugin',
        description: 'Only used to verify catalog publishing rules.',
        version: '1.0.0',
        author: 'Getmeair',
        category: 'Utilities',
        apiVersion: '1.0',
        permissions: ['commands'],
      },
    });
    assert.equal(create.status, 201);
    assert.equal(create.data.plugin.published, false);
    assert.equal(create.data.plugin.rating, 0);
    assert.equal(create.data.plugin.ratingCount, 0);

    const stillEmpty = await api(app.base, '/api/v1/store/plugins');
    assert.deepEqual(stillEmpty.data.plugins, []);

    const publishWithoutChecksum = await api(
      app.base,
      `/api/v1/admin/plugins/${create.data.plugin.id}`,
      {
        method: 'PUT',
        token: ownerLogin.token,
        body: { published: true, downloadUrl: 'https://plugins.getmeair.com/real-test.zip' },
      },
    );
    assert.equal(publishWithoutChecksum.status, 400);
    assert.equal(publishWithoutChecksum.data.error, 'checksum_required');

    const publish = await api(app.base, `/api/v1/admin/plugins/${create.data.plugin.id}`, {
      method: 'PUT',
      token: ownerLogin.token,
      body: {
        published: true,
        downloadUrl: 'https://plugins.getmeair.com/real-test.zip',
        checksum: 'a'.repeat(64),
      },
    });
    assert.equal(publish.status, 200);
    assert.equal(publish.data.plugin.published, true);

    const store = await api(app.base, '/api/v1/store/plugins');
    assert.equal(store.data.plugins.length, 1);
    assert.equal(store.data.plugins[0].name, 'Real Test Plugin');
    assert.equal(store.data.plugins[0].rating, 0);
    assert.equal(store.data.plugins[0].ratingCount, 0);
  } finally {
    await app.close();
  }
});
