/** Look up the atlas estimate for a location from installed light-pollution packs. */
import { listPackStates, readPackFile } from './packs';
import type { LpGrid } from './lightPollutionFormat';
import { decodeLpGrid, sampleLpGrid } from './lightPollutionFormat';

const cache = new Map<string, LpGrid>();

export interface AtlasEstimate {
  sqm: number;
  packId: string;
  packTitle: string;
}

/**
 * Regional detail packs take precedence over coarser global packs: packs are
 * tried from the smallest region to the largest.
 */
export async function estimateAtlasSqm(
  latDeg: number,
  lonDeg: number,
): Promise<AtlasEstimate | null> {
  const states = (await listPackStates()).filter((s) => s.manifest.kind === 'light-pollution');
  const area = (r?: { west: number; south: number; east: number; north: number }) =>
    r ? (r.east - r.west) * (r.north - r.south) : Infinity;
  states.sort((a, b) => area(a.manifest.region) - area(b.manifest.region));
  for (const st of states) {
    const key = `${st.id}@${st.activeVersion}`;
    let grid = cache.get(key);
    if (!grid) {
      const buf = await readPackFile(st.id, 'grid.bin');
      if (!buf) continue;
      grid = decodeLpGrid(buf);
      cache.set(key, grid);
    }
    const sqm = sampleLpGrid(grid, latDeg, lonDeg);
    if (sqm !== null) return { sqm, packId: st.id, packTitle: st.manifest.title };
  }
  return null;
}
