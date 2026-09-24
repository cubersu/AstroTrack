/**
 * Build an optional deep-star pack from Gaia DR3 via the ESA Gaia archive TAP
 * service (network access required; not run in CI by default).
 *
 *   npx tsx scripts/stars/build-gaia-pack.ts --gmin 8 --gmax 11 --order 4 [--id stars-gaia-g11]
 *
 * Only fields useful to the app are kept (position, G magnitude, BP−RP colour);
 * positions are propagated from J2016.0 to J2000.0 with proper motion, so the
 * tiles share the epoch of the rest of the catalogue. Tiles use nested HEALPix
 * at the chosen order and are loaded on demand for the field of view.
 *
 * Licence: Gaia data © ESA/Gaia/DPAC, CC BY-SA 3.0 IGO — attribution required.
 */
import { join } from 'node:path';
import { encodeStars } from '../../src/catalog/format';
import { npix } from '../../src/astro/healpix';
import { parseRecords } from '../lib/csv';
import { writeFile } from '../lib/io';
import { DATA_ROOT, finalizePack, readRegistry, upsertRegistry } from '../lib/registry';
import { tileAdql, toEpoch2000 } from './gaia';

const TAP = 'https://gea.esac.esa.int/tap-server/tap/sync';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function query(adql: string): Promise<Array<Record<string, string>>> {
  const body = new URLSearchParams({
    REQUEST: 'doQuery',
    LANG: 'ADQL',
    FORMAT: 'csv',
    QUERY: adql,
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(TAP, { method: 'POST', body });
    if (res.ok) return parseRecords(await res.text());
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
  throw new Error('TAP query failed repeatedly');
}

async function main() {
  const gMin = Number(arg('gmin', '8'));
  const gMax = Number(arg('gmax', '11'));
  const order = Number(arg('order', '4'));
  const id = arg('id', `stars-gaia-g${gMax}`);
  const dir = join(DATA_ROOT, 'packs', id);
  const n = npix(1 << order);
  let total = 0;
  for (let tile = 0; tile < n; tile++) {
    const rows = await query(tileAdql(tile, order, gMin, gMax));
    const stars = rows.map((r) => {
      const [ra, dec] = toEpoch2000(
        Number(r.ra),
        Number(r.dec),
        r.pmra ? Number(r.pmra) : null,
        r.pmdec ? Number(r.pmdec) : null,
      );
      return {
        raDeg: ra,
        decDeg: dec,
        mag: Number(r.phot_g_mean_mag),
        bv: r.bp_rp ? Number(r.bp_rp) : null,
      };
    });
    if (stars.length)
      writeFile(join(dir, 'tiles', `${String(tile).padStart(4, '0')}.bin`), encodeStars(stars));
    total += stars.length;
    if (tile % 50 === 0) console.log(`tile ${tile}/${n}: ${total} stars so far`);
  }
  writeFile(
    join(dir, 'tiles.json'),
    JSON.stringify(
      {
        order,
        nside: 1 << order,
        scheme: 'nested',
        gMin,
        gMax,
        colorIndex: 'bp-rp',
        epoch: 2000.0,
      },
      null,
      2,
    ) + '\n',
  );
  const manifest = finalizePack(
    dir,
    {
      schema: 1,
      id,
      kind: 'star-tiles',
      title: `Deep stars (Gaia DR3, G ${gMin}–${gMax})`,
      bundled: false,
      optional: true,
      basePath: `packs/${id}/`,
      records: total,
      license: 'CC-BY-SA-3.0-IGO',
      attribution: 'ESA/Gaia/DPAC — Gaia Data Release 3',
      sourceUrl: 'https://www.cosmos.esa.int/web/gaia/dr3',
      tiling: { scheme: 'healpix-nested', order },
      magLimit: gMax,
    },
    readRegistry(),
  );
  upsertRegistry(manifest);
  console.log(`pack ${id}: ${total} stars, ${(manifest.totalSize / 1024 / 1024).toFixed(1)} MiB`);
}

if (process.argv[1]?.endsWith('build-gaia-pack.ts')) void main();
