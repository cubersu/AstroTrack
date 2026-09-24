# Testing

```bash
npm test              # Vitest: unit, integration and component tests
npm run test:watch
npm run build && npm run test:e2e   # Playwright against the production build
npm run typecheck && npm run lint && npm run format:check
```

## Unit and integration tests (Vitest)

Located next to the code (`*.test.ts[x]`). Node environment by default;
component tests opt into jsdom with `/** @vitest-environment jsdom */`.
IndexedDB is provided by `fake-indexeddb`.

| Area                 | Files                                                                    | What is verified                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coordinates          | `astro/coordinates.test.ts`                                              | RA/Dec → Alt/Az vs Astronomy Engine `Horizon` (two hemispheres), precession matrix vs `RotateVector`, separations vs `AngleBetween`, position angles, Kasten–Young airmass table values                                                                                                                                                                                                                                                |
| Twilight, visibility | `astro/visibility.test.ts`                                               | dusk/dawn ordering and equality with `SearchAltitude`, missing astronomical night at 60°N in June, southern hemisphere, analytic rise/transit/set within 1–2 min of `SearchRiseSet`/`SearchHourAngle`, circumpolar/never-rising, curves vs Astronomy Engine                                                                                                                                                                            |
| Optics               | `astro/optics.test.ts`                                                   | FOV (APS-C, full frame, telescopes), pixel pitch derivation, pixel scale, Airy FWHM, detailed and simple NPF, 500-rule comparison, trail lengths, frame-edge declination, field rotation                                                                                                                                                                                                                                               |
| Models               | `astro/models.test.ts`                                                   | framing (sensor sizes, styles, rotations, mosaic/too-small), Bortle↔SQM, source priority, filter models, K&S Moon model reference values, SB derivation, integration scaling, mount-calibration interpolation/extrapolation, sub-exposure, ISO ranges, test-frame calibration rules, aperture logic                                                                                                                                    |
| Scoring              | `astro/scoring.test.ts`                                                  | acceptance scenario (APS-C + 50 mm, 18–55, 18–200, EQ mount, Istanbul); bright Moon vs low-SB galaxy vs open cluster; Bortle 8 vs reflection nebula vs cluster; dual-band filter on an emission nebula; stock vs modified camera; target below horizon / never rising; too-small targets; mosaic; fixed tripod vs tracking; mount calibration; insufficient time window; weather multiplier and hard stop; beyond-forecast; "Now" mode |
| Weather              | `astro/weatherScore.test.ts`, `weather/weather.test.ts`                  | every threshold boundary, weights, cloud cap, renormalisation, hard stops, session weather, best window; Open-Meteo URL (coordinate rounding) and parsing; offline fallback to cache                                                                                                                                                                                                                                                   |
| Events, comets       | `astro/events.test.ts`, `astro/comets.test.ts`                           | Moon quarters, the 2026-03-03 total lunar and 2026-08-12 total solar eclipses, meteor-shower peaks, oppositions, Moon conjunctions; MPC parsing; Kepler propagation reproducing Earth's heliocentric position within 0.01 AU                                                                                                                                                                                                           |
| HEALPix              | `astro/healpix.test.ts`                                                  | base-pixel layout, round trips at several nsides, disc queries, degrade                                                                                                                                                                                                                                                                                                                                                                |
| Catalogue            | `catalog/catalogStore.test.ts`, `scripts/catalog/openngc.test.ts`        | dedup (Dup rows, NGC/IC cross-references, M102), M31 = NGC 224 = "Andromeda", Caldwell aliases, Turkish-insensitive search, filters, search speed                                                                                                                                                                                                                                                                                      |
| Worker service       | `workers/catalogService.test.ts`                                         | full-catalogue scan on the bundled data, elimination of too-small targets, single evaluation with curves and recipe, details, star field, opportunity scan                                                                                                                                                                                                                                                                             |
| Persistence          | `db/backup.test.ts`                                                      | equipment/locations/settings persistence, dangling references, export/restore (replace/merge, images), invalid backups rejected without changes, journal CSV                                                                                                                                                                                                                                                                           |
| Data packs           | `data/packs.test.ts`, `data/lightPollutionFormat.test.ts`                | verified install, **failed update (checksum / network / invalid content) never replaces working data**, atomic activation, removal, status/update detection; LP grid format                                                                                                                                                                                                                                                            |
| Builders             | `scripts/lightpollution/*.test.ts`, `scripts/stars/gaia.test.ts`         | skyglow decay, calibration fit, end-to-end LP pack from a synthetic GeoTIFF, Gaia source_id ranges and epoch propagation                                                                                                                                                                                                                                                                                                               |
| i18n                 | `i18n/i18n.test.ts`                                                      | Turkish has every English key, identical placeholders, plurals, dotted keys                                                                                                                                                                                                                                                                                                                                                            |
| Components           | `features/common/components.test.tsx`, `features/equipment/*.test.ts[x]` | reason rendering (EN/TR), accessible score, chart, form controls, equipment page create/validate/sample preset                                                                                                                                                                                                                                                                                                                         |

## End-to-end tests (Playwright)

`e2e/smoke.spec.ts` (desktop and mobile viewports): add a location, load sample
equipment, run the Tonight scan, open M 31 (score explanation, framing,
recipe), favourite it, start a session, count frames, save to the journal,
switch language.

`e2e/offline.spec.ts`:

1. load the application;
2. wait for the service worker and verify the core catalogue is precached;
3. disable the network (`context.setOffline(true)`);
4. reload;
5. verify catalogue search, Tonight planning and target evaluation still work
   and that the missing survey preview falls back to the offline star map.

The Playwright version is pinned (1.56.1) to match the preinstalled Chromium
of the development container; CI installs the matching browser with
`npx playwright install --with-deps chromium`.
