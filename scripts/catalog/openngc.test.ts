import { describe, expect, it } from 'vitest';
import { normalizeOpenNgc } from './openngc';
import { DSO_FLAG } from '../../src/catalog/types';

const H =
  'Name;Type;RA;Dec;Const;MajAx;MinAx;PosAng;B-Mag;V-Mag;J-Mag;H-Mag;K-Mag;SurfBr;Hubble;Pax;Pm-RA;Pm-Dec;RadVel;Redshift;Cstar U-Mag;Cstar B-Mag;Cstar V-Mag;M;NGC;IC;Cstar Names;Identifiers;Common names;NED notes;OpenNGC notes;Sources'.split(
    ';',
  );
function row(values: Record<string, string>): Record<string, string> {
  const r: Record<string, string> = {};
  for (const h of H) r[h] = values[h] ?? '';
  return r;
}

describe('OpenNGC normalisation', () => {
  const ngc = [
    row({
      Name: 'NGC0224',
      Type: 'G',
      RA: '00:42:44.35',
      Dec: '+41:16:08.6',
      Const: 'And',
      MajAx: '177.83',
      MinAx: '69.66',
      PosAng: '35',
      'B-Mag': '4.29',
      'V-Mag': '3.44',
      SurfBr: '23.63',
      M: '031',
      Identifiers: '2MASX J00424433+4116074,IRAS 00400+4059,MCG +07-02-016,PGC 002557,UGC 00454',
      'Common names': 'Andromeda Galaxy',
    }),
    row({
      Name: 'NGC6882',
      Type: 'OCl',
      RA: '20:11:55.86',
      Dec: '+26:29:19.7',
      Const: 'Vul',
      NGC: '6885',
      Identifiers: 'C 037,MWSC 3278',
    }),
    row({ Name: 'NGC6885', Type: 'Dup', RA: '20:11:55.86', Dec: '+26:29:19.7', NGC: '6882' }),
    row({ Name: 'IC0011', Type: 'Dup', RA: '00:52:59.35', Dec: '+56:37:18.8', NGC: '0281' }),
    row({
      Name: 'NGC0281',
      Type: 'Cl+N',
      RA: '00:52:59.35',
      Dec: '+56:37:18.8',
      Const: 'Cas',
      IC: '0011',
      'Common names': 'Pacman Nebula',
    }),
    row({
      Name: 'NGC5457',
      Type: 'G',
      RA: '14:03:12.54',
      Dec: '+54:20:56.2',
      Const: 'UMa',
      M: '101',
      'Common names': 'Pinwheel Galaxy',
    }),
    row({ Name: 'NGC4000', Type: 'Dup', RA: '11:00:00', Dec: '+10:00:00', NGC: '9999' }),
    row({
      Name: 'NGC7000',
      Type: 'HII',
      RA: '20:59:17.14',
      Dec: '+44:31:43.6',
      Const: 'Cyg',
      MajAx: '120',
      MinAx: '30',
      'B-Mag': '4.00',
      Identifiers: 'C 020,LBN 373',
      'Common names': 'North America Nebula',
    }),
  ];
  const add = [
    row({ Name: 'M102', Type: 'Dup', RA: '14:03:12.54', Dec: '+54:20:56.2', M: '101' }),
    row({
      Name: 'Mel022',
      Type: 'OCl',
      RA: '03:47:28.6',
      Dec: '+24:06:19',
      Const: 'Tau',
      MajAx: '150',
      MinAx: '150',
      'V-Mag': '1.20',
      M: '045',
      Identifiers: 'MWSC 0305',
      'Common names': 'Pleiades',
    }),
  ];
  const { records, stats } = normalizeOpenNgc(ngc, add);
  const by = (id: string) => records.find((r) => r.id === id)!;

  it('resolves M31 / NGC 224 / Andromeda Galaxy to one object', () => {
    const m31 = by('ongc:NGC0224');
    expect(m31.name).toBe('M 31');
    expect(m31.aliases).toContain('NGC 224');
    expect(m31.aliases).toContain('PGC 2557');
    expect(m31.aliases).toContain('UGC 454');
    expect(m31.aliases).not.toContain('IRAS 00400+4059');
    expect(m31.commonNames).toEqual(['Andromeda Galaxy']);
    expect(m31.flags & DSO_FLAG.MESSIER).toBeTruthy();
    expect(m31.sbBand).toBe('B');
    expect(m31.raDeg).toBeCloseTo(10.6848, 3);
  });
  it('merges duplicate rows into their master', () => {
    expect(records.find((r) => r.id === 'ongc:NGC6885')).toBeUndefined();
    const c37 = by('ongc:NGC6882');
    expect(c37.aliases).toContain('NGC 6885');
    expect(c37.aliases).toContain('C 37');
    expect(c37.flags & DSO_FLAG.CALDWELL).toBeTruthy();
    const pac = by('ongc:NGC0281');
    expect(pac.aliases).toContain('IC 11');
    expect(stats.duplicatesMerged).toBe(3);
    expect(stats.unresolvedDuplicates).toEqual(['NGC4000']);
  });
  it('attaches alternative Messier numbers (M102 → M101)', () => {
    const m101 = by('ongc:NGC5457');
    expect(m101.name).toBe('M 101');
    expect(m101.aliases).toContain('M 102');
  });
  it('handles addendum objects without NGC designation', () => {
    const m45 = by('ongc:Mel022');
    expect(m45.name).toBe('M 45');
    expect(m45.aliases).toContain('Mel 22');
    expect(m45.flags & DSO_FLAG.ADDENDUM).toBeTruthy();
  });
  it('maps types and Caldwell flags', () => {
    expect(by('ongc:NGC7000').type).toBe('hii-region');
    expect(by('ongc:NGC7000').aliases).toContain('C 20');
    expect(by('ongc:NGC0281').type).toBe('cluster-nebula');
  });
});
