Getmeair Desktop 0.1.1
=======================

Getmeair is a modified build of Telegram Desktop with additional privacy,
streaming and local-history features. It is NOT an official Telegram product.

Installation
------------
1. Run "Getmeair-Setup-0.1.1.exe" and follow the installer.
2. The installer creates a desktop shortcut and registers the
   getmeair:// protocol.
3. User data is stored under %APPDATA%/Getmeair (or next to the EXE in
   portable mode). Uninstalling does not delete user data unless you
   confirm it.

Portable version
----------------
Extract Getmeair-Portable.zip to any folder and run Getmeair.exe.
No installation or registry changes are required.

Features in 0.1.1
-----------------
- Getmeair Ghost Mode (Ctrl+Shift+G): hide read receipts, typing,
  recording, uploads and online status; Stealth / Balanced / Normal
  profiles; per-chat overrides; temporary mode.
- Getmeair Message History: local archive of deleted and edited messages
  with search, filters, retention and size limits.
- Getmeair Streamer Mode (Ctrl+Shift+M): redact names, notification text,
  phone numbers; window title redaction; screen-capture exclusion.
- Getmeair Control Center in Settings.
- Plugin host and server infrastructure (see documentation/).

Notes
-----
- Ghost Mode is client-side suppression, not anonymity.
- Message History never archives self-destruct / one-time / ephemeral
  content.
- Screen-capture exclusion depends on OS support.
- This release is built from the modified source in D:\Getmeair-dev.

License
-------
Telegram Desktop is licensed under GPLv3 with additional terms. Getmeair
retains the original copyright notices and license. See LEGAL in the
source tree.
