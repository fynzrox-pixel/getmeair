# Getmeair Features

This document describes the modded features shipped with Getmeair Desktop.
Getmeair is a modified build of Telegram Desktop (GPLv3). Original
Telegram Desktop code remains under its own license and attribution.

## Getmeair Control Center

Entry point: Settings -> Getmeair (or the dedicated section in Settings).
Provides a single hub for Ghost Mode, Message History and Streamer Mode,
plus a live status line and a privacy notice.

## Ghost Mode

Location: Settings -> Getmeair -> Getmeair Ghost Mode (and Ctrl+Shift+G).

Per-account and per-chat (tri-state override) suppression of outgoing
activity signals:

- Hide read receipts.
- Hide typing status.
- Hide voice recording status.
- Hide file upload status.
- Hide online status.

Three built-in profiles:

- Normal (0): everything on, behaves like official client.
- Balanced (1): hide activity, keep read receipts.
- Stealth (2): hide every signal Getmeair can suppress.

Temporary mode: enable for 15 minutes / 1 hour / disable. Stored as
`temporaryUntil` Unix time; expired modes are normalized back to off.

Per-chat exceptions: disable / always-enable / reset for the currently
open chat.

Important caveats:

- Ghost Mode is client-side suppression of outgoing packets. It is not
  anonymity: sending messages, reactions and calls still reveals activity.
- Read receipts are irreversible once sent; Getmeair only suppresses future
  ones and flushes postponed receipts when hiding is turned off.
- The account can still appear online to other clients or via other APIs.

## Message History (anti-recall)

Location: Settings -> Getmeair -> Getmeair Message History.

Local, append-only JSONL archive:

- `cWorkingDir()/getmeair/history_<accountKey>.jsonl`, text only.
- Skips ephemeral / scheduled / business-shortcut / welcome / saved-music /
  self-destruct / TTL-cover media items.
- Saves deleted messages (when `saveDeleted` enabled).
- Saves previous versions of edited messages (when `saveEdited` enabled),
  storing both `text` (original) and `newText` (updated).
- Searchable list with up to 40 newest matches.
- Retention in days (7 / 30 / 90 / 365) and storage cap (16 / 32 / 64 /
  128 MB); trimmed automatically via `QSaveFile`.
- Clear archive button with confirmation.

No self-destruct / one-time / private-chat protections are bypassed: such
items are never archived.

## Streamer Mode

Location: Settings -> Getmeair -> Getmeair Streamer Mode (and Ctrl+Shift+M).

- Hides peer names in notifications (neutral `User #1234` style).
- Hides notification text (`Message hidden (Streamer Mode)`).
- Redacts phone numbers in text.
- Replaces the window title with `Getmeair`.
- Asks the OS to exclude Getmeair windows from screen capture via
  `Core::ScreenshotProtection::addContentReason` (may not work with every
  capture method / platform).
- Capture exclusion toggle: Block screen capture.

## Shortcuts

- Ctrl+Shift+G: toggle Ghost Mode.
- Ctrl+Shift+M: toggle Streamer Mode.

## Persistence

All Getmeair settings live in `cWorkingDir()/getmeair/settings.json`,
keyed by stable Telegram user id (per account). They are intentionally
separate from the regular Telegram settings file so the official client
never sees or rewrites them. Streamer Mode is global (application-wide).
Ghost Mode and Message History are per-account.

## Settings integration

A "Getmeair" section button is added to the main Settings page right after
"Advanced", pointing at `GetmeairId()`. Ghost / History / Streamer are
reachable from the Control Center and via search.

## Backend / Plugin host (separate folders)

- `D:\Getmeair-dev\server` — Node.js 26 backend with SQLite: auth,
  roles, verification, Firecoins ledger, admin audit, plugin catalog.
- `D:\Getmeair-dev\plugin-host` — isolated plugin host (JSON-RPC over
  stdio, process isolation, permission checks, pack/install/enable/disable).

See `documentation/PLUGINS.md` for plugin details.
See `documentation/GHOST_MODE.md` for Ghost Mode details.
See `documentation/AI.md` for AI integration notes.
See `documentation/TESTING.md` for test status.
