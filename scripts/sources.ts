/**
 * Upstream data sources used at build time. Licences were verified before
 * inclusion (see docs/data-sources.md). Only sources with verified
 * redistribution rights are bundled.
 */
export const OPENNGC_REF = process.env.OPENNGC_REF ?? 'master';

export const SOURCES = {
  openngc: {
    name: 'OpenNGC',
    license: 'CC-BY-SA-4.0',
    homepage: 'https://github.com/mattiaverga/OpenNGC',
    files: {
      ngc: `https://raw.githubusercontent.com/mattiaverga/OpenNGC/${OPENNGC_REF}/database_files/NGC.csv`,
      addendum: `https://raw.githubusercontent.com/mattiaverga/OpenNGC/${OPENNGC_REF}/database_files/addendum.csv`,
    },
    attribution: 'OpenNGC by Mattia Verga, CC BY-SA 4.0 — https://github.com/mattiaverga/OpenNGC',
  },
  hyg: {
    name: 'HYG Database v4.1',
    license: 'CC-BY-SA-4.0',
    homepage: 'https://codeberg.org/astronexus/hyg',
    files: {
      hyg: 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv',
    },
    attribution:
      'HYG Database by David Nash (astronexus), CC BY-SA 4.0 — https://codeberg.org/astronexus/hyg',
  },
} as const;
