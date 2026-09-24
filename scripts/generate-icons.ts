/**
 * Render the PWA PNG icons procedurally (no image libraries): a dark rounded
 * square with an orbit ellipse, a warm core and a few stars — matching
 * public/icons/icon.svg. Usage: npm run data:icons
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { repoPath } from './lib/io';

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function png(
  size: number,
  pixel: (x: number, y: number) => [number, number, number, number],
): Uint8Array {
  const raw = new Uint8Array(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // 3×3 supersampling for smooth edges.
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < 3; sy++)
        for (let sx = 0; sx < 3; sx++) {
          const p = pixel(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3);
          r += p[0];
          g += p[1];
          b += p[2];
          a += p[3];
        }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r / 9;
      raw[o + 1] = g / 9;
      raw[o + 2] = b / 9;
      raw[o + 3] = a / 9;
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, size);
  dv.setUint32(4, size);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function draw(size: number, maskable: boolean) {
  const s = size / 512;
  const inset = maskable ? 0.8 : 1; // maskable icons keep content in the safe zone
  const bg: [number, number, number, number] = [11, 16, 32, 255];
  return png(size, (px, py) => {
    const x = (px / s - 256) / inset + 256;
    const y = (py / s - 256) / inset + 256;
    const X = px / s,
      Y = py / s;
    if (!maskable) {
      const r = 96;
      const cx = Math.min(Math.max(X, r), 512 - r);
      const cy = Math.min(Math.max(Y, r), 512 - r);
      if (Math.hypot(X - cx, Y - cy) > r) return [0, 0, 0, 0];
    }
    const d = Math.hypot(x - 256, y - 256);
    if (d < 46) return [242, 185, 75, 255];
    const th = (30 * Math.PI) / 180;
    const ex = ((x - 256) * Math.cos(th) - (y - 256) * Math.sin(th)) / 170;
    const ey = ((x - 256) * Math.sin(th) + (y - 256) * Math.cos(th)) / 62;
    const e = Math.hypot(ex, ey);
    if (Math.abs(e - 1) < 8 / 62 / 1.3) return [122, 162, 255, 255];
    if (Math.abs(d - 150) < 5) return [42, 53, 88, 255];
    for (const [sx, sy, sr, c] of [
      [370, 150, 10, 231],
      [140, 360, 7, 231],
      [160, 130, 5, 154],
      [390, 370, 6, 154],
    ] as const)
      if (Math.hypot(x - sx, y - sy) < sr) return [c, c + (c === 231 ? 5 : 12), c + 16, 255];
    return bg;
  });
}

writeFileSync(repoPath('public', 'icons', 'icon-192.png'), draw(192, false));
writeFileSync(repoPath('public', 'icons', 'icon-512.png'), draw(512, false));
writeFileSync(repoPath('public', 'icons', 'icon-maskable-512.png'), draw(512, true));
console.log('icons written');
