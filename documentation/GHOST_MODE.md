# Getmeair Ghost Mode

Getmeair Ghost Mode provides client-side suppression of read receipts, typing/presence updates, and media upload indicators.

## Architecture & Design

Inspired by AyuGram Desktop's choke-point suppression model, Ghost Mode intercepts outgoing network signals at key Telegram Desktop architecture points:
- **Read Receipts:** Suppresses `readHistory` and view increment requests.
- **Typing & Presence:** Gated by user configuration per account and per chat.
- **Profiles:**
  1. **Stealth:** Maximum privacy (all suppression active).
  2. **Balanced:** Selective privacy (custom per-chat/per-feature rules).
  3. **Normal:** Standard Telegram behaviour.

## Important Technical Limitations

1. **Not Absolute Anonymity:** Ghost Mode is a client-side suppression mechanism. Server-side processing, peer reactions, calls, or explicit user interactions (such as replying or reacting) will still send activity to Telegram servers and peers.
2. **Read Receipts Are Irreversible:** Once a read packet is sent to the Telegram server for a message, it cannot be undone.
3. **Server Limits:** Features like self-destructing media limits and private chat server-side rules are strictly respected; Getmeair does not bypass server-enforced security limits.
