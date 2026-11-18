# Getmeair backend

Server-side authority for Getmeair roles, verification, Firecoins (Огоньки), wallet ledger, admin audit and the plugin catalog.

This is a real HTTP API backed by SQLite. It is **not** a local balance counter and it does not embed admin rights in the client executable.

## Requirements

- Node.js 22.5+ (tested on Node 26.13.0)
- Built-in `node:sqlite`, `node:crypto`, `node:http` — no npm dependencies

## Run

```bat
cd D:\Getmeair-dev\server
copy .env.example .env
node src/server.mjs
```

Do not commit `.env`.

## Security model

- Sessions are random 256-bit bearer tokens; only SHA-256 hashes are stored.
- Telegram WebApp `initData` is verified with HMAC-SHA256 using `TELEGRAM_BOT_TOKEN`.
- The owner phone is only an initial identifier. Final authorization is bound to the verified, stable Telegram user ID stored in `users.telegram_user_id`.
- `OWNER_BOOTSTRAP_SECRET` is used once for the initial claim. Remove it afterwards.
- No route allows a user to assign themselves a higher role.
- Only `owner` can assign `owner` or `super_admin`.
- All admin actions are written to `audit_log`.
- Firecoins are a ledger, not a mutable balance column. The balance is computed from completed transactions.
- The one-time 100,000 Firecoin owner grant uses a unique idempotency key, so reinstall, relogin and retries cannot duplicate it.
- Firecoin transfers are disabled by default and can be enabled by the owner.

## First owner activation

1. Set `OWNER_BOOTSTRAP_SECRET` to a long random value.
2. Start the server with `GETMEAIR_ALLOW_DEV_LOGIN=1` for local setup, or sign in through Telegram `initData`.
3. Call `POST /api/v1/owner/claim` with the bootstrap secret and the signed-in owner account.
4. The server binds the owner role and grants 100,000 Firecoins exactly once.
5. Remove `OWNER_BOOTSTRAP_SECRET` and disable `GETMEAIR_ALLOW_DEV_LOGIN`.

For production, the preferred flow is:

- user signs in with Telegram `initData`;
- a bot asks the user to share their phone contact;
- the server verifies the contact belongs to the Telegram user;
- the stable Telegram user ID is compared with `OWNER_TELEGRAM_USER_ID`.

## Main endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Health check |
| POST | `/api/v1/auth/telegram` | Verify Telegram initData and create session |
| GET | `/api/v1/me` | Current user, role, verification, Firecoins |
| GET | `/api/v1/wallet` | Balance and transactions |
| POST | `/api/v1/wallet/transfer` | Transfer Firecoins (if enabled) |
| POST | `/api/v1/owner/claim` | One-time owner claim |
| GET | `/api/v1/admin/users` | Search users (moderator+) |
| POST | `/api/v1/admin/users/:id/role` | Assign role |
| POST | `/api/v1/admin/users/:id/verification` | Grant/remove Getmeair verification |
| POST | `/api/v1/admin/users/:id/block` | Block/unblock |
| POST | `/api/v1/admin/wallet/grant` | Grant Firecoins |
| GET | `/api/v1/admin/audit` | Admin action log |
| GET | `/api/v1/admin/stats` | Real counts from the database |
| GET/PUT | `/api/v1/admin/settings` | System settings |
| GET/POST | `/api/v1/admin/plugins` | Plugin catalog management |
| PUT | `/api/v1/admin/plugins/:id` | Update/publish plugin |
| GET | `/api/v1/store/plugins` | Public published catalog |

## Test

```bat
cd D:\Getmeair-dev\server
node --test test/*.test.mjs
```

## Production deployment notes

- Put the API behind HTTPS (reverse proxy such as Caddy/nginx).
- Use PostgreSQL instead of SQLite if you need multiple server instances; keep the same ledger rules and unique idempotency constraints.
- Store Telegram bot tokens and bootstrap secrets in a secret manager, never in the client EXE.
- Back up the database and audit log.
- Rate-limit authentication and transfer endpoints at the proxy.
- The local catalog is intentionally empty until real, checksum-verified plugins are published. No fake ratings or fake plugins are seeded.
