/**
 * Build a light-pollution atlas pack from a VIIRS night-light radiance GeoTIFF
 * (EPSG:4326, values in nW·cm⁻²·sr⁻¹), e.g. a NASA Black Marble VNP46A4
 * annual composite or an EOG VNL annual composite mosaic.
 *
 *   npx tsx scripts/lightpollution/build-lp-pack.ts \
 *     --input viirs.tif --region "turkey:25,35,45,43" --res 0.02 \
 *     [--calibration sqm-points.csv] [--scale 1] [--offset 0] [--id lp-turkey]
 *
 * Calibration CSV columns: lat,lon,sqm (local SQM-meter readings). Without it
 * the documented default constant is used and the pack is labelled
 * "uncalibrated". The output is always an ESTIMATE (see docs/offline-data.md).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fromFile } from 'geotiff';
import { encodeLpGrid, sqmToLpValue } from '../../src/data/lightPollutionFormat';
import { parseRecords } from '../lib/csv';
import { writeFile } from '../lib/io';
import { DATA_ROOT, finalizePack, readRegistry, upsertRegistry } from '../lib/registry';
import type { Raster, Region } from './skyglow';
import { DEFAULT_C, KERNEL, fitCalibration, indexToSqm, resample, skyglowIndex } from './skyglow';

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

export function parseRegion(s: string): Region {
  const m = /^([\w-]+):(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)$/.exec(s);
  if (!m) throw new Error(`Bad --region "${s}" (expected name:west,south,east,north)`);
  const [west, south, east, north] = m.slice(2).map(Number);
  if (!(west < east && south < north)) throw new Error('Region bounds are inverted');
  return { name: m[1], west, south, east, north };
}

export interface LpBuildOptions {
  input: string;
  region: Region;
  res: number;
  scale?: number;
  offset?: number;
  id?: string;
  calibration?: string;
  outRoot?: string;
}

export async function buildLpPack(o: LpBuildOptions) {
  const { input, region, res } = o;
  const scale = o.scale ?? 1;
  const offset = o.offset ?? 0;
  const id = o.id ?? `lp-${region.name}`;
  const root = o.outRoot ?? DATA_ROOT;
  const marginDeg = KERNEL.coarseRadiusKm / 111 + 0.5;

  const tiff = await fromFile(input);
  const image = await tiff.getImage();
  const [bw, bs, be, bn] = image.getBoundingBox();
  const W = image.getWidth();
  const H = image.getHeight();
  const pxW = (be - bw) / W;
  const pxH = (bn - bs) / H;
  const read = {
    west: Math.max(bw, region.west - marginDeg),
    east: Math.min(be, region.east + marginDeg),
    south: Math.max(bs, region.south - marginDeg),
    north: Math.min(bn, region.north + marginDeg),
  };
  const x0 = Math.floor((read.west - bw) / pxW);
  const x1 = Math.ceil((read.east - bw) / pxW);
  const y0 = Math.floor((bn - read.north) / pxH);
  const y1 = Math.ceil((bn - read.south) / pxH);
  console.log(`Reading window ${x1 - x0}×${y1 - y0} px from ${input}`);
  const [band] = (await image.readRasters({
    window: [x0, y0, x1, y1],
    samples: [0],
  })) as unknown as ArrayLike<number>[];
  const nodata = image.getGDALNoData();
  const data = new Float32Array(band.length);
  for (let i = 0; i < band.length; i++) {
    const v = band[i];
    data[i] = nodata !== null && v === nodata ? Number.NaN : v * scale + offset;
  }
  const src: Raster = {
    width: x1 - x0,
    height: y1 - y0,
    west: bw + x0 * pxW,
    east: bw + x1 * pxW,
    north: bn - y0 * pxH,
    south: bn - y1 * pxH,
    data,
  };
  // Work grid includes the margin so sources outside the region contribute.
  const work = resample(
    src,
    {
      west: region.west - marginDeg,
      south: region.south - marginDeg,
      east: region.east + marginDeg,
      north: region.north + marginDeg,
    },
    res,
  );
  const idx = skyglowIndex(work);

  let c = DEFAULT_C;
  let calibrated = false;
  const calib = o.calibration;
  if (calib) {
    const rows = parseRecords(readFileSync(calib, 'utf8'));
    const pts = rows
      .map((r) => ({ lat: Number(r.lat), lon: Number(r.lon), sqm: Number(r.sqm) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.sqm))
      .map((p) => {
        const x = Math.floor((p.lon - work.west) / res);
        const y = Math.floor((work.north - p.lat) / res);
        return { index: idx[y * work.width + x] ?? 0, sqm: p.sqm };
      });
    const fitted = fitCalibration(pts);
    if (fitted !== null) {
      c = fitted;
      calibrated = true;
      const resid = pts.map((p) => indexToSqm(p.index, c) - p.sqm);
      const rms = Math.sqrt(resid.reduce((s, r) => s + r * r, 0) / resid.length);
      console.log(
        `Calibrated C = ${c.toFixed(4)} from ${pts.length} points, RMS residual ${rms.toFixed(2)} mag`,
      );
    }
  }

  const width = Math.round((region.east - region.west) / res);
  const height = Math.round((region.north - region.south) / res);
  const offX = Math.round((region.west - work.west) / res);
  const offY = Math.round((work.north - region.north) / res);
  const values = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const k = (y + offY) * work.width + (x + offX);
      const L = work.data[k];
      values[y * width + x] = Number.isFinite(L) ? sqmToLpValue(indexToSqm(idx[k], c)) : 0;
    }
  const dir = join(root, 'packs', id);
  writeFile(join(dir, 'grid.bin'), encodeLpGrid({ width, height, ...region, values }));
  writeFile(
    join(dir, 'model.json'),
    JSON.stringify(
      {
        model: 'walker-2.5-exp',
        kernel: KERNEL,
        c,
        calibrated,
        naturalSqm: 22.0,
        source: input,
        resDeg: res,
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
      kind: 'light-pollution',
      title: `Light-pollution estimate — ${region.name}${calibrated ? '' : ' (uncalibrated)'}`,
      bundled: false,
      optional: true,
      basePath: `packs/${id}/`,
      license:
        'Derived from NASA/NOAA VIIRS night-light data (public domain / CC BY 4.0 for EOG products)',
      attribution:
        'Estimate derived from VIIRS Day/Night Band night-light composites (NASA Black Marble / NOAA EOG).',
      sourceUrl: 'https://blackmarble.gsfc.nasa.gov/',
      region,
    },
    readRegistry(root),
  );
  upsertRegistry(manifest, root);
  console.log(
    `pack ${id} ${manifest.version}: ${width}×${height} cells, ${(manifest.totalSize / 1024).toFixed(0)} KiB`,
  );
  return manifest;
}

async function main() {
  const input = arg('input');
  const regionArg = arg('region');
  if (!input || !regionArg) {
    console.error(
      'Usage: --input <geotiff> --region name:west,south,east,north [--res 0.02] [--calibration csv]',
    );
    process.exit(1);
  }
  await buildLpPack({
    input,
    region: parseRegion(regionArg),
    res: Number(arg('res', '0.02')),
    scale: Number(arg('scale', '1')),
    offset: Number(arg('offset', '0')),
    id: arg('id'),
    calibration: arg('calibration'),
    outRoot: arg('out-root'),
  });
}

if (process.argv[1]?.endsWith('build-lp-pack.ts')) void main();
