#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import {
  createHash,
} from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { defaultEnabled, isDangerous, validateManifest } from '../src/permissions.mjs';

const rawArgs = process.argv.slice(2);
const rootIndex = rawArgs.indexOf('--root');
const rootValue = rootIndex >= 0 ? rawArgs[rootIndex + 1] : '';
const args = rawArgs.filter((value, index) => {
  if (index === rootIndex || index === rootIndex + 1) return false;
  return true;
});

const root = resolve(rootValue || join(import.meta.dirname, '..', 'data', 'plugins'));
const registryPath = join(root, 'registry.json');
mkdirSync(root, { recursive: true });
if (!existsSync(registryPath)) writeFileSync(registryPath, '{"plugins":{}}\n', 'utf8');

function readRegistry() {
  return JSON.parse(readFileSync(registryPath, 'utf8'));
}
function writeRegistry(registry) {
  writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');
}
function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function archiveEntries(path) {
  const output = execFileSync('tar', ['-tf', path], { encoding: 'utf8' });
  return output.split(/\r?\n/).filter(Boolean);
}
function assertSafeArchive(path) {
  for (const entry of archiveEntries(path)) {
    const normalized = entry.replace(/\\/g, '/');
    if (normalized.startsWith('/') || normalized.includes('../') || normalized.includes('..\\')) {
      throw new Error(`Unsafe archive entry: ${entry}`);
    }
  }
}

function pack(sourceDir, outputPath) {
  const source = resolve(sourceDir);
  const manifestPath = join(source, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`manifest.json not found in ${source}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const errors = validateManifest(manifest);
  if (errors.length) throw new Error(errors.join(' '));
  const destination = resolve(outputPath);
  mkdirSync(join(destination, '..'), { recursive: true });
  const tempZip = destination.replace(/\.getmeair-plugin$/i, '') + '.zip';
  rmSync(tempZip, { force: true });
  execFileSync('tar', ['-a', '-cf', tempZip, '-C', source, '.'], { stdio: 'inherit' });
  renameSync(tempZip, destination);
  console.log(`Packed ${manifest.id} -> ${destination}`);
  console.log(`SHA-256: ${sha256(destination)}`);
}

function install(archivePath) {
  const archive = resolve(archivePath);
  if (!existsSync(archive)) throw new Error(`Archive not found: ${archive}`);
  assertSafeArchive(archive);
  const temp = mkdtempSync(join(tmpdir(), 'getmeair-plugin-install-'));
  try {
    execFileSync('tar', ['-xf', archive, '-C', temp], { stdio: 'inherit' });
    const manifestPath = join(temp, 'manifest.json');
    if (!existsSync(manifestPath)) throw new Error('Plugin has no manifest.json at archive root.');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const errors = validateManifest(manifest);
    if (errors.length) throw new Error(errors.join(' '));
    const entry = resolve(temp, manifest.entry);
    if (!entry.startsWith(temp + sep) || !existsSync(entry)) {
      throw new Error('Plugin entry is missing or escapes the plugin directory.');
    }
    const target = join(root, manifest.id);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    cpSync(temp, target, { recursive: true });
    const registry = readRegistry();
    registry.plugins[manifest.id] = {
      id: manifest.id,
      manifest,
      enabled: defaultEnabled(manifest),
      dangerous: isDangerous(manifest),
      checksum: sha256(archive),
      installedAt: new Date().toISOString(),
      source: basename(archive),
    };
    writeRegistry(registry);
    console.log(`Installed ${manifest.id}. Enabled: ${registry.plugins[manifest.id].enabled}`);
    if (isDangerous(manifest)) {
      console.log('This plugin requests dangerous permissions and is disabled by default.');
      console.log(`Review permissions, then run: node tools/plugin-cli.mjs --root "${root}" enable ${manifest.id} --allow-dangerous`);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function list() {
  const registry = readRegistry();
  const plugins = Object.values(registry.plugins);
  if (!plugins.length) {
    console.log('No plugins installed.');
    return;
  }
  for (const plugin of plugins) {
    console.log(`${plugin.id}  ${plugin.manifest.version}  ${plugin.enabled ? 'enabled' : 'disabled'}  ${plugin.dangerous ? 'DANGEROUS' : 'safe'}`);
  }
}

function setEnabled(id, enabled) {
  const registry = readRegistry();
  const plugin = registry.plugins[id];
  if (!plugin) throw new Error(`Plugin not installed: ${id}`);
  if (enabled && plugin.dangerous && !process.argv.includes('--allow-dangerous')) {
    throw new Error('Refusing to enable dangerous permissions without --allow-dangerous.');
  }
  plugin.enabled = enabled;
  writeRegistry(registry);
  console.log(`${id}: ${enabled ? 'enabled' : 'disabled'}`);
}

function remove(id) {
  const registry = readRegistry();
  if (!registry.plugins[id]) throw new Error(`Plugin not installed: ${id}`);
  delete registry.plugins[id];
  writeRegistry(registry);
  rmSync(join(root, id), { recursive: true, force: true });
  console.log(`Removed ${id}`);
}

const command = args[0] || 'list';
const positional = args.slice(1).filter((value) => !value.startsWith('--'));
if (command === 'pack') {
  pack(positional[0], positional[1]);
} else if (command === 'install') {
  install(positional[0]);
} else if (command === 'list') {
  list();
} else if (command === 'enable') {
  setEnabled(positional[0], true);
} else if (command === 'disable') {
  setEnabled(positional[0], false);
} else if (command === 'remove') {
  remove(positional[0]);
} else {
  console.log(`Usage:
  node tools/plugin-cli.mjs [--root <dir>] list
  node tools/plugin-cli.mjs [--root <dir>] pack <source-dir> <out.getmeair-plugin>
  node tools/plugin-cli.mjs [--root <dir>] install <plugin.getmeair-plugin>
  node tools/plugin-cli.mjs [--root <dir>] enable <id> [--allow-dangerous]
  node tools/plugin-cli.mjs [--root <dir>] disable <id>
  node tools/plugin-cli.mjs [--root <dir>] remove <id>`);
  process.exitCode = 1;
}
