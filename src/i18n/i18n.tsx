/**
 * Lightweight, typed i18n. English is the source dictionary; the Turkish
 * dictionary must provide every key (enforced by the type checker).
 * Catalogue designations stay canonical; only descriptive UI is translated.
 */
import { createContext, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { en } from './locales/en';
import { tr } from './locales/tr';

export type Language = 'en' | 'tr';
export const LANGUAGES: Language[] = ['en', 'tr'];

type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
type StripPlural<K extends string> = K extends `${infer B}_${PluralSuffix}` ? B : K;
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${StripPlural<K>}`
    : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TKey = Leaves<typeof en>;
export type Params = Record<string, string | number | null | undefined>;

const DICTS: Record<Language, unknown> = { en, tr };

/**
 * Resolve a dotted key. Dictionary keys may themselves contain dots (e.g.
 * reasons['altitude.high']), so at each level the longest matching segment
 * run is tried first.
 */
function lookup(dict: unknown, key: string): string | undefined {
  const parts = key.split('.');
  const walk = (cur: unknown, i: number): string | undefined => {
    if (i === parts.length) return typeof cur === 'string' ? cur : undefined;
    if (!cur || typeof cur !== 'object') return undefined;
    const obj = cur as Record<string, unknown>;
    for (let j = parts.length; j > i; j--) {
      const k = parts.slice(i, j).join('.');
      if (k in obj) {
        const r = walk(obj[k], j);
        if (r !== undefined) return r;
      }
    }
    return undefined;
  };
  return walk(dict, 0);
}

export function interpolate(s: string, params?: Params): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = params[k];
    return v === null || v === undefined ? '' : String(v);
  });
}

export function translate(lang: Language, key: TKey | string, params?: Params): string {
  const count = params?.count;
  if (typeof count === 'number') {
    const rule = new Intl.PluralRules(lang).select(count);
    const plural = lookup(DICTS[lang], `${key}_${rule}`) ?? lookup(DICTS[lang], `${key}_other`);
    if (plural) return interpolate(plural, params);
  }
  const s = lookup(DICTS[lang], key) ?? lookup(DICTS.en, key);
  if (s === undefined) {
    if (import.meta.env?.DEV) console.warn(`[i18n] missing key ${key}`);
    return key;
  }
  return interpolate(s, params);
}

export interface I18n {
  lang: Language;
  t: (key: TKey, params?: Params) => string;
  /** Translate a dynamic key (e.g. built from an enum); falls back to the key. */
  td: (key: string, params?: Params) => string;
  fmtNumber: (n: number, digits?: number) => string;
  fmtTime: (ms: number) => string;
  fmtDate: (ms: number, opts?: Intl.DateTimeFormatOptions) => string;
  fmtDateTime: (ms: number) => string;
  fmtDuration: (hours: number) => string;
  timeZone?: string;
}

const I18nContext = createContext<I18n | null>(null);

export function makeI18n(lang: Language, timeZone?: string): I18n {
  const locale = lang === 'tr' ? 'tr-TR' : 'en-GB';
  const tf = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone });
  const dtf = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
  return {
    lang,
    timeZone,
    t: (key, params) => translate(lang, key, params),
    td: (key, params) => translate(lang, key, params),
    fmtNumber: (n, digits = 0) =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }).format(n),
    fmtTime: (ms) => tf.format(new Date(ms)),
    fmtDate: (ms, opts) =>
      new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone,
        ...opts,
      }).format(new Date(ms)),
    fmtDateTime: (ms) => dtf.format(new Date(ms)),
    fmtDuration: (hours) => {
      const totalMin = Math.round(hours * 60);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      const hs = translate(lang, 'units.hoursShort');
      const ms = translate(lang, 'units.minutesShort');
      if (h === 0) return `${m} ${ms}`;
      if (m === 0) return `${h} ${hs}`;
      return `${h} ${hs} ${m} ${ms}`;
    },
  };
}

export function I18nProvider({
  lang,
  timeZone,
  children,
}: {
  lang: Language;
  timeZone?: string;
  children: ReactNode;
}) {
  const value = useMemo(() => makeI18n(lang, timeZone), [lang, timeZone]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside provider');
  return ctx;
}

export function useT() {
  const { t } = useI18n();
  return useCallback(t, [t]);
}

export function detectLanguage(): Language {
  const langs =
    typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : [];
  return langs.some((l) => l?.toLowerCase().startsWith('tr')) ? 'tr' : 'en';
}
