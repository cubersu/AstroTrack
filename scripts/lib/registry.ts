/** Helpers to write a pack directory's manifest and register it in public/data/packs.json. */
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { PackManifest, PackRegistry } from '../../src/data/packTypes';
import { fileEntry, repoPath, sha256, writeFile } from './io';

export const DATA_ROOT = repoPath('public', 'data');

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out.sort();
}

export function readRegistry(root = DATA_ROOT): PackRegistry {
  const p = join(root, 'packs.json');
  return existsSync(p)
    ? (JSON.parse(readFileSync(p, 'utf8')) as PackRegistry)
    : { schema: 1, generated: '', packs: [] };
}

export function finalizePack(
  dir: string,
  base: Omit<PackManifest, 'files' | 'totalSize' | 'version' | 'released' | 'contentHash'>,
  prev: PackRegistry,
  today = new Date().toISOString().slice(0, 10),
): PackManifest {
  const manifestPath = join(dir, 'manifest.json');
  if (existsSync(manifestPath)) rmSync(manifestPath);
  const files = listFiles(dir).map((f) => fileEntry(dir, f));
  const contentHash = sha256(files.map((f) => `${f.path}:${f.sha256}`).join('\n')).slice(0, 12);
  const old = prev.packs.find((p) => p.id === base.id);
  const released = old && old.contentHash === contentHash ? old.released : today;
  const manifest: PackManifest = {
    ...base,
    version: `${released.replaceAll('-', '.')}-${contentHash.slice(0, 8)}`,
    released,
    contentHash,
    files,
    totalSize: files.reduce((s, f) => s + f.size, 0),
  };
  writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

export function upsertRegistry(manifest: PackManifest, root = DATA_ROOT) {
  const reg = readRegistry(root);
  reg.packs = [...reg.packs.filter((p) => p.id !== manifest.id), manifest];
  reg.generated = new Date().toISOString().slice(0, 10);
  writeFile(join(root, 'packs.json'), JSON.stringify(reg, null, 2) + '\n');
}
