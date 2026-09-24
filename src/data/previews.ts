/**
 * Real survey previews (never generated imagery). DSS2 colour cut-outs are
 * requested on demand from the CDS hips2fits service and cached locally in
 * IndexedDB with their attribution. Only sky coordinates are sent.
 */
import type { PreviewCacheRecord } from './dataDb';
import { dataDb } from './dataDb';

export const HIPS2FITS_ENDPOINT = 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits';
export const PREVIEW_SURVEY = 'CDS/P/DSS2/color';
export const PREVIEW_SOURCE = 'DSS2 colour — CDS hips2fits';
export const PREVIEW_ATTRIBUTION =
  'Digitized Sky Survey (STScI/NASA; POSS-II/UKSTU plates © their respective institutions), via CDS hips2fits (Strasbourg).';

export function previewFovDeg(majorArcmin: number | null): number {
  const size = majorArcmin && majorArcmin > 0 ? (majorArcmin / 60) * 2.2 : 0.5;
  return Math.min(Math.max(size, 0.2), 8);
}

export function hips2fitsUrl(raDeg: number, decDeg: number, fovDeg: number, sizePx = 512): string {
  const p = new URLSearchParams({
    hips: PREVIEW_SURVEY,
    width: String(sizePx),
    height: String(sizePx),
    fov: fovDeg.toFixed(4),
    projection: 'TAN',
    coordsys: 'icrs',
    ra: raDeg.toFixed(5),
    dec: decDeg.toFixed(5),
    format: 'jpg',
  });
  return `${HIPS2FITS_ENDPOINT}?${p.toString()}`;
}

export async function getCachedPreview(objectId: string): Promise<PreviewCacheRecord | undefined> {
  return dataDb().previewCache.get(objectId);
}

export async function fetchPreview(
  objectId: string,
  raDeg: number,
  decDeg: number,
  fovDeg: number,
  fetcher: typeof fetch = fetch,
): Promise<PreviewCacheRecord> {
  const res = await fetcher(hips2fitsUrl(raDeg, decDeg, fovDeg));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) throw new Error('not an image');
  const rec: PreviewCacheRecord = {
    id: objectId,
    blob,
    mime: blob.type,
    source: PREVIEW_SOURCE,
    attribution: PREVIEW_ATTRIBUTION,
    fovDeg,
    fetchedAt: Date.now(),
  };
  await dataDb().previewCache.put(rec);
  return rec;
}

export async function clearPreviewCache() {
  await dataDb().previewCache.clear();
}
