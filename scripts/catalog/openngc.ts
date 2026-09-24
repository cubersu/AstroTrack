/**
 * OpenNGC → application-native DSO records.
 *
 * Normalisation and deduplication rules:
 *  1. Rows of type "Dup" are not separate objects. Their master is given by
 *     the NGC or IC cross-reference column (or, in the addendum, the Messier
 *     column, e.g. M102 → M101). The duplicate's designation, identifiers,
 *     common names and Messier number become aliases of the master.
 *  2. Non-duplicate rows carrying NGC/IC cross-references get those
 *     designations as aliases (e.g. an NGC object also listed as IC xxx).
 *  3. The Messier column adds "M n"; Caldwell numbers come from the
 *     "C nnn" identifiers that OpenNGC provides (all 109 are present).
 *  4. The primary display name is the Messier designation when present,
 *     otherwise the OpenNGC designation (e.g. "NGC 224" → "M 31").
 *  5. The stable ID is "ongc:<OpenNGC name>", which never changes between
 *     catalogue versions, so favourites/plans/journal references survive updates.
 */
import type { DsoType } from '../../src/astro/objectTypes';
import { parseDecDms, parseRaHms } from '../../src/astro/units';
import { constellationIndex } from '../../src/catalog/constellations';
import { formatIdentifier, formatOngcName } from '../../src/catalog/designations';
import { DSO_FLAG } from '../../src/catalog/types';
import type { DsoDetail } from '../../src/catalog/types';

export const ONGC_TYPE_MAP: Record<string, DsoType | 'dup'> = {
  G: 'galaxy',
  GPair: 'galaxy-group',
  GTrpl: 'galaxy-group',
  GGroup: 'galaxy-group',
  OCl: 'open-cluster',
  GCl: 'globular-cluster',
  'Cl+N': 'cluster-nebula',
  '*Ass': 'star-cloud',
  PN: 'planetary-nebula',
  HII: 'hii-region',
  DrkN: 'dark-nebula',
  EmN: 'emission-nebula',
  Neb: 'nebula',
  RfN: 'reflection-nebula',
  SNR: 'supernova-remnant',
  '*': 'star',
  '**': 'star',
  Nova: 'star',
  NonEx: 'nonexistent',
  Other: 'other',
  Dup: 'dup',
};

export interface NormalizedDso {
  id: string;
  ongcName: string;
  name: string;
  aliases: string[];
  commonNames: string[];
  type: DsoType;
  raDeg: number;
  decDeg: number;
  majorArcmin: number | null;
  minorArcmin: number | null;
  positionAngleDeg: number | null;
  magV: number | null;
  magB: number | null;
  sb: number | null;
  sbBand: 'B' | 'V' | null;
  constellation: number;
  flags: number;
  detail: DsoDetail;
}

function num(s: string | undefined): number | null {
  if (s == null || s.trim() === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

function splitList(s: string | undefined): string[] {
  return (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function uniq(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    const k = x.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(x);
    }
  }
  return out;
}

/** Canonical OpenNGC name for a cross reference in the NGC/IC columns ("0281" → "NGC0281"). */
function crossRefName(prefix: 'NGC' | 'IC', value: string): string {
  const m = /^0*(\d+)(.*)$/.exec(value.trim());
  if (!m) return prefix + value.trim();
  return `${prefix}${m[1].padStart(4, '0')}${m[2]}`;
}

export interface NormalizeStats {
  input: number;
  /** Rows without coordinates (OpenNGC lists a few nonexistent objects this way). */
  skippedNoCoordinates: string[];
  duplicatesMerged: number;
  unresolvedDuplicates: string[];
  output: number;
}

export function normalizeOpenNgc(
  ngcRows: Array<Record<string, string>>,
  addendumRows: Array<Record<string, string>>,
): { records: NormalizedDso[]; stats: NormalizeStats } {
  const all = [
    ...ngcRows.map((r) => ({ r, addendum: false })),
    ...addendumRows.map((r) => ({ r, addendum: true })),
  ];
  const byName = new Map<string, NormalizedDso>();
  const messierOwner = new Map<number, NormalizedDso>();
  const dups: Array<{ r: Record<string, string>; addendum: boolean }> = [];
  const skipped: string[] = [];

  for (const { r, addendum } of all) {
    const t = ONGC_TYPE_MAP[r['Type']] ?? 'other';
    if (t !== 'dup' && (!r['RA'] || !r['Dec'])) {
      skipped.push(r['Name']);
      continue;
    }
    if (t === 'dup') {
      dups.push({ r, addendum });
      continue;
    }
    const ongcName = r['Name'];
    const aliases: string[] = [];
    const display = formatOngcName(ongcName);
    const mNum = num(r['M']);
    if (r['NGC'])
      for (const v of splitList(r['NGC'])) aliases.push(formatOngcName(crossRefName('NGC', v)));
    if (r['IC'])
      for (const v of splitList(r['IC'])) aliases.push(formatOngcName(crossRefName('IC', v)));
    let flags = addendum ? DSO_FLAG.ADDENDUM : 0;
    for (const id of splitList(r['Identifiers'])) {
      const f = formatIdentifier(id);
      if (f) aliases.push(f);
      if (f && /^C \d+$/.test(f)) flags |= DSO_FLAG.CALDWELL;
    }
    if (/^C0*\d+$/.test(ongcName)) flags |= DSO_FLAG.CALDWELL;
    let name = display;
    if (mNum !== null) {
      flags |= DSO_FLAG.MESSIER;
      name = `M ${mNum}`;
      aliases.unshift(display);
    }
    const commonNames = splitList(r['Common names']);
    if (commonNames.length) flags |= DSO_FLAG.COMMON_NAME;
    const sb = num(r['SurfBr']);
    const rec: NormalizedDso = {
      id: `ongc:${ongcName}`,
      ongcName,
      name,
      aliases: uniq(aliases.filter((a) => a !== name)),
      commonNames,
      type: t,
      raDeg: parseRaHms(r['RA']),
      decDeg: parseDecDms(r['Dec']),
      majorArcmin: num(r['MajAx']),
      minorArcmin: num(r['MinAx']),
      positionAngleDeg: num(r['PosAng']),
      magV: num(r['V-Mag']),
      magB: num(r['B-Mag']),
      sb,
      // OpenNGC "SurfBr" is the mean B-band surface brightness within the 25 mag/arcsec² isophote.
      sbBand: sb !== null ? 'B' : null,
      constellation: constellationIndex(r['Const']),
      flags,
      detail: {
        aliases: [],
        commonNames,
        hubble: r['Hubble'] || undefined,
        redshift: num(r['Redshift']) ?? undefined,
        radialVelocityKms: num(r['RadVel']) ?? undefined,
        parallaxMas: num(r['Pax']) ?? undefined,
        nedNotes: r['NED notes'] || undefined,
        ongcNotes: r['OpenNGC notes'] || undefined,
        sources: r['Sources'] || undefined,
        catalogue: addendum ? 'OpenNGC addendum' : 'OpenNGC',
      },
    };
    byName.set(ongcName, rec);
    if (mNum !== null) messierOwner.set(mNum, rec);
  }

  const unresolved: string[] = [];
  let merged = 0;
  for (const { r } of dups) {
    let master: NormalizedDso | undefined;
    for (const v of splitList(r['NGC'])) master ??= byName.get(crossRefName('NGC', v));
    for (const v of splitList(r['IC'])) master ??= byName.get(crossRefName('IC', v));
    const mRef = num(r['M']);
    if (!master && mRef !== null) master = messierOwner.get(mRef);
    if (!master) {
      unresolved.push(r['Name']);
      continue;
    }
    merged++;
    const extra: string[] = [formatOngcName(r['Name'])];
    for (const id of splitList(r['Identifiers'])) {
      const f = formatIdentifier(id);
      if (f) extra.push(f);
      if (f && /^C \d+$/.test(f)) master.flags |= DSO_FLAG.CALDWELL;
    }
    // A duplicate row may carry a Messier number that the master lacks (or be
    // an alternative Messier number such as M102).
    if (mRef !== null && master.name !== `M ${mRef}`) {
      if (master.flags & DSO_FLAG.MESSIER) extra.push(`M ${mRef}`);
      else {
        master.aliases.unshift(master.name);
        master.name = `M ${mRef}`;
        master.flags |= DSO_FLAG.MESSIER;
      }
    }
    const cn = splitList(r['Common names']);
    if (cn.length) master.flags |= DSO_FLAG.COMMON_NAME;
    master.commonNames = uniq([...master.commonNames, ...cn]);
    master.aliases = uniq([...master.aliases, ...extra].filter((a) => a !== master!.name));
  }
  // Addendum M102 is a Dup whose "M" column points to M101 — handled above
  // via messierOwner; record its own designation as an alias.
  for (const { r, addendum } of dups) {
    if (addendum && /^M\d+$/.test(r['Name'])) {
      const target = messierOwner.get(num(r['M']) ?? -1);
      if (target) target.aliases = uniq([...target.aliases, formatOngcName(r['Name'])]);
    }
  }

  const records = [...byName.values()].sort((a, b) => a.raDeg - b.raDeg || a.decDeg - b.decDeg);
  for (const rec of records) {
    rec.detail.aliases = rec.aliases;
    rec.detail.commonNames = rec.commonNames;
  }
  return {
    records,
    stats: {
      input: all.length,
      skippedNoCoordinates: skipped,
      duplicatesMerged: merged,
      unresolvedDuplicates: unresolved,
      output: records.length,
    },
  };
}
