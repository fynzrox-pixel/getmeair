# Getmeair Plugin System & Store

Getmeair introduces an extensible plugin architecture with strict process isolation and permission management.

## 1. Plugin Format (`.getmeair-plugin`)

Each plugin is packaged as a `.getmeair-plugin` archive (ZIP structure containing a `manifest.json` and entry module).

### `manifest.json` Structure
```json
{
  "id": "com.example.plugin",
  "name": "Example Plugin",
  "description": "Demonstrates Getmeair plugin architecture.",
  "version": "1.0.0",
  "author": "Getmeair Developer",
  "apiVersion": "1.0",
  "entry": "main.mjs",
  "runtime": "node",
  "permissions": ["commands", "menu", "storage"]
}
```

## 2. Security & Process Isolation

- **Separate Processes:** Third-party plugins run in isolated child processes using JSON-RPC over stdio. They have no direct access to the client memory space.
- **Permission Gating:** Available permissions include `ui`, `menu`, `events.messages`, `events.presence`, `files.local`, `notifications`, `commands`, `storage`.
- **Dangerous Permissions:** Permissions like `events.messages` and `files.local` are flagged as dangerous and are disabled by default. Unverified plugins will not auto-install or auto-enable dangerous capabilities without explicit user consent.

## 3. Plugin Store

- The **Getmeair Plugin Store** provides a catalog of verified extensions with SHA-256 checksum verification, categories, ratings, and one-click updates.
- No fake ratings or mock plugins are seeded; all entries require valid checksums and download URLs.
