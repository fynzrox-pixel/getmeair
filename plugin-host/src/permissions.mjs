export const PERMISSIONS = [
  'ui',
  'menu',
  'events.messages',
  'events.presence',
  'files.local',
  'notifications',
  'commands',
  'storage',
];

export const DANGEROUS_PERMISSIONS = new Set([
  'events.messages',
  'events.presence',
  'files.local',
]);

export function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') {
    return ['Manifest must be a JSON object.'];
  }
  for (const field of ['id', 'name', 'description', 'version', 'author', 'entry', 'runtime', 'apiVersion']) {
    if (typeof manifest[field] !== 'string' || !manifest[field].trim()) {
      errors.push(`Missing or invalid field: ${field}`);
    }
  }
  if (manifest.id && !/^[a-z0-9][a-z0-9._-]{2,80}$/i.test(manifest.id)) {
    errors.push('id must be 3-81 characters: letters, digits, dot, underscore, dash.');
  }
  if (manifest.runtime && !['node', 'python'].includes(manifest.runtime)) {
    errors.push('runtime must be "node" or "python".');
  }
  if (manifest.apiVersion && manifest.apiVersion !== '1.0') {
    errors.push(`Unsupported plugin API version: ${manifest.apiVersion}`);
  }
  if (manifest.permissions && !Array.isArray(manifest.permissions)) {
    errors.push('permissions must be an array.');
  }
  for (const permission of manifest.permissions || []) {
    if (!PERMISSIONS.includes(permission)) {
      errors.push(`Unknown permission: ${permission}`);
    }
  }
  return errors;
}

export function isDangerous(manifest) {
  return (manifest.permissions || []).some((permission) => DANGEROUS_PERMISSIONS.has(permission));
}

export function hasPermission(manifest, permission) {
  return (manifest.permissions || []).includes(permission);
}

export function defaultEnabled(manifest) {
  return !isDangerous(manifest);
}
