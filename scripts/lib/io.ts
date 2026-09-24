import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export function sha256(data: Uint8Array | ArrayBuffer | string): string {
  const h = createHash('sha256');
  if (typeof data === 'string') h.update(data, 'utf8');
  else h.update(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
  return h.digest('hex');
}

export function writeFile(path: string, data: Uint8Array | ArrayBuffer | string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    typeof data === 'string' ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : data,
  );
}

export interface FileEntry {
  path: string;
  size: number;
  sha256: string;
}

export function fileEntry(baseDir: string, absPath: string): FileEntry {
  const buf = readFileSync(absPath);
  return {
    path: relative(baseDir, absPath).split('\\').join('/'),
    size: statSync(absPath).size,
    sha256: sha256(buf),
  };
}

export function repoPath(...parts: string[]): string {
  return join(import.meta.dirname, '..', '..', ...parts);
}
