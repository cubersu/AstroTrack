/** IAU constellation abbreviations (88) with Latin names. Index order is part of the data format. */
export const CONSTELLATIONS: ReadonlyArray<readonly [string, string]> = [
  ['And', 'Andromeda'],
  ['Ant', 'Antlia'],
  ['Aps', 'Apus'],
  ['Aqr', 'Aquarius'],
  ['Aql', 'Aquila'],
  ['Ara', 'Ara'],
  ['Ari', 'Aries'],
  ['Aur', 'Auriga'],
  ['Boo', 'Boötes'],
  ['Cae', 'Caelum'],
  ['Cam', 'Camelopardalis'],
  ['Cnc', 'Cancer'],
  ['CVn', 'Canes Venatici'],
  ['CMa', 'Canis Major'],
  ['CMi', 'Canis Minor'],
  ['Cap', 'Capricornus'],
  ['Car', 'Carina'],
  ['Cas', 'Cassiopeia'],
  ['Cen', 'Centaurus'],
  ['Cep', 'Cepheus'],
  ['Cet', 'Cetus'],
  ['Cha', 'Chamaeleon'],
  ['Cir', 'Circinus'],
  ['Col', 'Columba'],
  ['Com', 'Coma Berenices'],
  ['CrA', 'Corona Australis'],
  ['CrB', 'Corona Borealis'],
  ['Crv', 'Corvus'],
  ['Crt', 'Crater'],
  ['Cru', 'Crux'],
  ['Cyg', 'Cygnus'],
  ['Del', 'Delphinus'],
  ['Dor', 'Dorado'],
  ['Dra', 'Draco'],
  ['Equ', 'Equuleus'],
  ['Eri', 'Eridanus'],
  ['For', 'Fornax'],
  ['Gem', 'Gemini'],
  ['Gru', 'Grus'],
  ['Her', 'Hercules'],
  ['Hor', 'Horologium'],
  ['Hya', 'Hydra'],
  ['Hyi', 'Hydrus'],
  ['Ind', 'Indus'],
  ['Lac', 'Lacerta'],
  ['Leo', 'Leo'],
  ['LMi', 'Leo Minor'],
  ['Lep', 'Lepus'],
  ['Lib', 'Libra'],
  ['Lup', 'Lupus'],
  ['Lyn', 'Lynx'],
  ['Lyr', 'Lyra'],
  ['Men', 'Mensa'],
  ['Mic', 'Microscopium'],
  ['Mon', 'Monoceros'],
  ['Mus', 'Musca'],
  ['Nor', 'Norma'],
  ['Oct', 'Octans'],
  ['Oph', 'Ophiuchus'],
  ['Ori', 'Orion'],
  ['Pav', 'Pavo'],
  ['Peg', 'Pegasus'],
  ['Per', 'Perseus'],
  ['Phe', 'Phoenix'],
  ['Pic', 'Pictor'],
  ['Psc', 'Pisces'],
  ['PsA', 'Piscis Austrinus'],
  ['Pup', 'Puppis'],
  ['Pyx', 'Pyxis'],
  ['Ret', 'Reticulum'],
  ['Sge', 'Sagitta'],
  ['Sgr', 'Sagittarius'],
  ['Sco', 'Scorpius'],
  ['Scl', 'Sculptor'],
  ['Sct', 'Scutum'],
  ['Ser', 'Serpens'],
  ['Sex', 'Sextans'],
  ['Tau', 'Taurus'],
  ['Tel', 'Telescopium'],
  ['Tri', 'Triangulum'],
  ['TrA', 'Triangulum Australe'],
  ['Tuc', 'Tucana'],
  ['UMa', 'Ursa Major'],
  ['UMi', 'Ursa Minor'],
  ['Vel', 'Vela'],
  ['Vir', 'Virgo'],
  ['Vol', 'Volans'],
  ['Vul', 'Vulpecula'],
];

const INDEX = new Map(CONSTELLATIONS.map(([abbr], i) => [abbr.toLowerCase(), i]));

/** Constellation index for an abbreviation (OpenNGC's Se1/Se2 map to Serpens); 255 if unknown. */
export function constellationIndex(abbr: string | null | undefined): number {
  if (!abbr) return 255;
  const a = abbr.trim();
  if (a === 'Se1' || a === 'Se2') return INDEX.get('ser')!;
  return INDEX.get(a.toLowerCase()) ?? 255;
}

export function constellationAbbr(index: number): string | null {
  return CONSTELLATIONS[index]?.[0] ?? null;
}

export function constellationName(index: number): string | null {
  return CONSTELLATIONS[index]?.[1] ?? null;
}
