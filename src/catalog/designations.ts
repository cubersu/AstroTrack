/**
 * Catalogue designation formatting and normalisation (shared by the build
 * pipeline and the in-app search).
 */

/** Human display form of an OpenNGC object name, e.g. "NGC0224" → "NGC 224". */
export function formatOngcName(raw: string): string {
  const s = raw.trim();
  // NGC/IC with optional letter suffix and optional NED component suffix.
  let m = /^(NGC|IC)0*(\d+)([A-Z]{0,2})(?:\s+(NED\d+))?$/.exec(s);
  if (m) return `${m[1]} ${m[2]}${m[3]}${m[4] ? ' ' + m[4] : ''}`;
  m = /^ESO0*(\d+)-0*(\d+)$/.exec(s);
  if (m) return `ESO ${m[1]}-${m[2]}`;
  m = /^(B|C|H|HCG|Mel|MWSC|PGC|UGC|M)0*(\d+)$/.exec(s);
  if (m) return `${m[1]} ${m[2]}`;
  m = /^Cl0*(\d+)$/.exec(s);
  if (m) return `Cr ${m[1]}`;
  return s;
}

/**
 * Format a cross-identifier from the OpenNGC "Identifiers" column. Returns
 * null for identifiers that are not useful as search aliases (survey point
 * sources, star catalogues, duplicates of PGC such as LEDA, ESO-LV).
 */
export function formatIdentifier(raw: string): string | null {
  const s = raw.trim().replace(/\s+(NED|NOTES)\d+$/, '');
  if (!s) return null;
  if (
    /^(2MASX|2MASS|SDSS|IRAS|TYC|HD|HIP|BD|UCAC\d|SAO|WDS|IDS|6dFGS|LEDA|ESO-LV|ESOLV|MASX|GSC)/i.test(
      s,
    )
  )
    return null;
  let m = /^PGC\s*0*(\d+)$/.exec(s);
  if (m) return `PGC ${m[1]}`;
  m = /^UGC\s*0*(\d+)$/.exec(s);
  if (m) return `UGC ${m[1]}`;
  m = /^UGCA\s*0*(\d+)$/.exec(s);
  if (m) return `UGCA ${m[1]}`;
  m = /^C\s+0*(\d+)$/.exec(s);
  if (m) return `C ${m[1]}`;
  m = /^LBN\s+0*(\d+)$/.exec(s);
  if (m) return `LBN ${m[1]}`;
  m = /^MWSC\s+0*(\d+)$/.exec(s);
  if (m) return `MWSC ${m[1]}`;
  m = /^SH\s*2-0*(\d+)$/i.exec(s);
  if (m) return `Sh2-${m[1]}`;
  m = /^Cl\s+0*(\d+)$/.exec(s);
  if (m) return `Cr ${m[1]}`;
  m = /^Mel\s+0*(\d+)$/.exec(s);
  if (m) return `Mel ${m[1]}`;
  m = /^ESO\s+0*(\d+)-0*(\d+)$/.exec(s);
  if (m) return `ESO ${m[1]}-${m[2]}`;
  if (/^MCG\s*[+-]/.test(s)) return s.replace(/^MCG\s*/, 'MCG ');
  if (/^(PN G|PK )/.test(s)) return s;
  return null;
}

/** Remove diacritics (Turkish characters included) and lowercase. */
export function foldText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/İ/g, 'i').toLowerCase();
}

/**
 * Normalised search key: folded, alphanumerics only, leading zeros removed
 * from every digit run. "NGC 0224" → "ngc224", "M 31" → "m31",
 * "Sh2-155" → "sh2155".
 */
export function searchKey(s: string): string {
  return foldText(s)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\b0+(\d)/g, '$1')
    .replace(/(\D)0+(\d)/g, '$1$2')
    .replace(/\s+/g, '');
}

/** Folded text with collapsed whitespace, for substring search on common names. */
export function textKey(s: string): string {
  return foldText(s)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Extra user-friendly alias keys: "messier31" for "M 31", "caldwell20" for "C 20". */
export function extraKeys(alias: string): string[] {
  const out: string[] = [];
  let m = /^M (\d+)$/.exec(alias);
  if (m) out.push(`messier${m[1]}`);
  m = /^C (\d+)$/.exec(alias);
  if (m) out.push(`caldwell${m[1]}`);
  return out;
}
