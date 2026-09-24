import { useI18n } from '../../i18n/i18n';

interface Row {
  name: string;
  license: string;
  use: { en: string; tr: string };
  url: string;
  attribution?: string;
  bundled: boolean;
}

const DATASETS: Row[] = [
  {
    name: 'OpenNGC (NGC/IC + addendum)',
    license: 'CC BY-SA 4.0',
    use: {
      en: 'Deep-sky catalogue (positions, sizes, magnitudes, identifiers, common names)',
      tr: 'Derin uzay kataloğu (konum, boyut, parlaklık, tanımlar, yaygın adlar)',
    },
    url: 'https://github.com/mattiaverga/OpenNGC',
    attribution:
      'OpenNGC by Mattia Verga. Built from NED, HyperLEDA, SIMBAD, HEASARC and Harold Corwin’s NGC/IC notes.',
    bundled: true,
  },
  {
    name: 'HYG Database v4.1',
    license: 'CC BY-SA 4.0',
    use: {
      en: 'Bright stars (bundled ≤ 8 mag) and optional deeper star pack',
      tr: 'Parlak yıldızlar (≤ 8 kadir, dahil) ve isteğe bağlı derin yıldız paketi',
    },
    url: 'https://codeberg.org/astronexus/hyg',
    attribution:
      'HYG Database by David Nash (astronexus.com), compiled from Hipparcos, Yale BSC and Gliese catalogues.',
    bundled: true,
  },
  {
    name: 'IMO Meteor Shower Calendar (derived values)',
    license: 'Factual data (peak solar longitudes, ZHR, radiants)',
    use: { en: 'Meteor shower dates and radiants', tr: 'Meteor yağmuru tarihleri ve radyantları' },
    url: 'https://www.imo.net/',
    bundled: true,
  },
  {
    name: 'Gaia DR3 subset (deep star pack)',
    license: 'CC BY-SA 3.0 IGO (ESA/Gaia/DPAC)',
    use: {
      en: 'Optional deep star tiles — build script provided, not bundled',
      tr: 'İsteğe bağlı derin yıldız karoları — derleme betiği var, pakete dahil değil',
    },
    url: 'https://www.cosmos.esa.int/web/gaia/dr3',
    bundled: false,
  },
  {
    name: 'NASA Black Marble / VIIRS night lights',
    license: 'NASA open data (no restrictions; attribution requested)',
    use: {
      en: 'Light-pollution atlas estimate packs — build script provided, not bundled in this build',
      tr: 'Işık kirliliği atlas tahmin paketleri — derleme betiği var, bu derlemede dahil değil',
    },
    url: 'https://blackmarble.gsfc.nasa.gov/',
    bundled: false,
  },
  {
    name: 'Minor Planet Center comet elements',
    license: 'MPC data policy — downloaded/imported by the user, never redistributed',
    use: {
      en: 'Comet orbital elements (manual update)',
      tr: 'Kuyrukluyıldız yörünge elemanları (elle güncelleme)',
    },
    url: 'https://www.minorplanetcenter.net/iau/MPCORB/CometEls.txt',
    bundled: false,
  },
];

const SERVICES: Row[] = [
  {
    name: 'Open-Meteo forecast API',
    license: 'Data: CC BY 4.0; free non-commercial API, no key',
    use: {
      en: 'Hourly weather (only when enabled; coordinates rounded to ~1 km)',
      tr: 'Saatlik hava durumu (yalnızca açıksa; koordinatlar ~1 km’ye yuvarlanır)',
    },
    url: 'https://open-meteo.com/',
    attribution: 'Weather data by Open-Meteo.com',
    bundled: false,
  },
  {
    name: 'CDS hips2fits — DSS2 colour',
    license:
      'DSS: STScI/NASA and plate owners; use with acknowledgement. Downloaded on demand, cached only on your device.',
    use: {
      en: 'Real survey preview images (optional)',
      tr: 'Gerçek gözlem taraması önizlemeleri (isteğe bağlı)',
    },
    url: 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits',
    attribution:
      'The Digitized Sky Surveys were produced at the Space Telescope Science Institute under U.S. Government grant NAG W-2166. hips2fits service by CDS, Strasbourg.',
    bundled: false,
  },
];

const LIBRARIES: Row[] = [
  {
    name: 'Astronomy Engine',
    license: 'MIT',
    use: {
      en: 'Sun, Moon and planet ephemerides, eclipses',
      tr: 'Güneş, Ay ve gezegen efemerisleri, tutulmalar',
    },
    url: 'https://github.com/cosinekitty/astronomy',
    bundled: true,
  },
  {
    name: 'React',
    license: 'MIT',
    use: { en: 'User interface', tr: 'Kullanıcı arayüzü' },
    url: 'https://react.dev',
    bundled: true,
  },
  {
    name: 'Dexie.js',
    license: 'Apache-2.0',
    use: { en: 'Local IndexedDB storage', tr: 'Yerel IndexedDB depolama' },
    url: 'https://dexie.org',
    bundled: true,
  },
  {
    name: 'Workbox / vite-plugin-pwa',
    license: 'MIT',
    use: { en: 'Offline service worker', tr: 'Çevrimdışı service worker' },
    url: 'https://vite-pwa-org.netlify.app',
    bundled: true,
  },
];

function Table({ rows }: { rows: Row[] }) {
  const { t, lang } = useI18n();
  return (
    <ul className="list">
      {rows.map((r) => (
        <li key={r.name} className="list-item" style={{ alignItems: 'flex-start' }}>
          <div className="body">
            <div className="title">
              <a href={r.url} target="_blank" rel="noreferrer noopener">
                {r.name}
              </a>
              {!r.bundled && (
                <span className="badge neutral" style={{ marginLeft: 6 }}>
                  {t('licenses.notBundled')}
                </span>
              )}
            </div>
            <div className="sub">
              {t('licenses.license')}: {r.license}
            </div>
            <div className="tiny">
              {t('licenses.use')}: {r.use[lang]}
            </div>
            {r.attribution && <div className="tiny faint">{r.attribution}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function LicensesPage() {
  const { t } = useI18n();
  return (
    <div>
      <div className="page-header">
        <h1>{t('licenses.title')}</h1>
        <p>{t('licenses.subtitle')}</p>
      </div>
      <section className="card">
        <h2>{t('licenses.datasets')}</h2>
        <Table rows={DATASETS} />
      </section>
      <section className="card">
        <h2>{t('licenses.services')}</h2>
        <Table rows={SERVICES} />
      </section>
      <section className="card">
        <h2>{t('licenses.libraries')}</h2>
        <Table rows={LIBRARIES} />
      </section>
      <section className="card">
        <h2>{t('licenses.privacy')}</h2>
        <p className="small">{t('licenses.privacyBody')}</p>
      </section>
    </div>
  );
}
