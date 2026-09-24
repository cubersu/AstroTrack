/**
 * Download upstream source datasets into data-src/raw/ (git-ignored).
 * Usage: npm run data:fetch
 */
import { existsSync } from 'node:fs';
import { SOURCES } from './sources';
import { repoPath, sha256, writeFile } from './lib/io';

async function download(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  writeFile(dest, buf);
  console.log(`✓ ${url}\n  → ${dest} (${buf.length} bytes, sha256 ${sha256(buf)})`);
}

const force = process.argv.includes('--force');
const jobs: Array<[string, string]> = [
  [SOURCES.openngc.files.ngc, repoPath('data-src', 'raw', 'openngc', 'NGC.csv')],
  [SOURCES.openngc.files.addendum, repoPath('data-src', 'raw', 'openngc', 'addendum.csv')],
  [SOURCES.hyg.files.hyg, repoPath('data-src', 'raw', 'hyg', 'hygdata_v41.csv')],
];
for (const [url, dest] of jobs) {
  if (!force && existsSync(dest)) {
    console.log(`= ${dest} exists (use --force to re-download)`);
    continue;
  }
  await download(url, dest);
}
