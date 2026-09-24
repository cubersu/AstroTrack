# AstroTrack — offline astrophotography planner

AstroTrack answers one question:

> _Given my location, date and time, equipment, sky conditions, available time
> and observing mode, which deep-sky object should I photograph tonight — and
> under what conditions?_

It is a **Progressive Web App that runs entirely in your browser**. There is no
backend, no account, no subscription and no telemetry. After the first visit
it works **offline**: catalogue search, visibility, Sun/Moon/planet
ephemerides, scoring, framing, exposure recipes, planning, sessions and the
journal are all computed locally.

Visibility is not photographability. A target can be above the horizon and
still be a poor photographic target because it is too small for your focal
length, too faint for the sky, washed out by the Moon, too low, or needs more
integration than you have. AstroTrack scores **photographability**, explains
every score and shows how confident it is.

## Features

- **Tonight** and **What can I photograph now?** — the whole catalogue
  (13,375 objects) is scanned in a Web Worker and ranked by a transparent
  **Astro Score** (object-type-aware Moon and light-pollution models, altitude
  curve, framing, duration, camera/filter and tracking) and a **Tonight Score**
  (× weather multiplier × time multiplier).
- **Target details** — explanation (positives/negatives, component scores,
  confidence), altitude chart with darkness and Moon, rise/transit/set, live
  alt-az with a sky dome, focal-length and rotation recommendation, offline
  framing simulator, exposure recipe (ISO/gain range, sub-exposure, NPF
  fixed-tripod options with trail lengths, tracking limits from your mount
  calibration, minimum/recommended/ideal integration, calibration frames),
  test-frame calibration workflow, real DSS2 survey preview (optional).
- **Explore** — indexed search across M, NGC, IC, Caldwell, Sharpless and other
  identifiers and common names (Turkish-insensitive), filters, virtualised list.
- **Sky Events** — Moon phases, planets tonight, oppositions, elongations,
  conjunctions, lunar occultations, eclipses with local circumstances, meteor
  showers, comets from MPC elements. Informational only — never ranked against
  deep-sky objects.
- **Plans** — single-night and multi-night integration plans with a
  night-by-night outlook, favourites and 7/30/90-day opportunity scans.
- **Session Mode** (observing assistant, no hardware control) and a manual
  **Journal** with CSV export.
- **Feature-based equipment** — cameras, lenses/telescopes (zooms, variable
  apertures, reducers/Barlows), mounts with empirical calibration, filters with
  passbands, combined into profiles.
- **Locations** with geolocation and manual Bortle/SQM that override atlas
  estimates.
- **Offline data management** — verified, atomic pack updates; optional deep
  star packs; caches; full JSON backup and restore.
- English and Turkish UI; Light, Dark and red **Night Vision** themes.

## Quick start

```bash
npm ci
npm run dev            # http://localhost:5173
```

Requires Node.js ≥ 20.19 (22 recommended).

| Command                                                       | Purpose                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------- |
| `npm run build`                                               | type-check and build the static PWA into `dist/`                    |
| `npm run preview`                                             | serve the production build on http://localhost:4173                 |
| `npm test`                                                    | unit, integration and component tests (Vitest)                      |
| `npm run test:e2e`                                            | Playwright end-to-end and offline tests (run `npm run build` first) |
| `npm run typecheck` / `npm run lint` / `npm run format:check` | static checks                                                       |
| `npm run data:fetch` / `npm run data:build`                   | download upstream datasets and regenerate `public/data/`            |
| `npm run data:icons`                                          | regenerate the PWA icons                                            |

## Production build and deployment

`npm run build` produces a fully static site in `dist/` with relative asset
paths, so it can be served from any static host or sub-path (GitHub Pages,
any web server, `npx vite preview`). The optional **Deploy to GitHub Pages**
workflow publishes it; the app never depends on that deployment at runtime.

## PWA behaviour

- Install from the browser ("Install app" / "Add to Home Screen").
- The service worker precaches the app shell, `data/packs.json` and the bundled
  core data (~6 MB: catalogue + bright stars). A banner offers to reload when a
  new version is available.
- Optional packs (deeper stars, light-pollution atlases) are downloaded from
  the Offline Data page, verified with SHA-256 and activated atomically; a
  failed update never replaces working data.
- Weather (Open-Meteo) and survey previews (CDS hips2fits) are optional and
  fail gracefully: _"Current weather unavailable. Astronomical evaluation is
  still available."_

## Data preparation

See [`docs/offline-data.md`](docs/offline-data.md). In short:

```bash
npm run data:fetch   # OpenNGC + HYG → data-src/raw/ (git-ignored)
npm run data:build   # → public/data/ (committed)
```

Optional builders: `scripts/stars/build-gaia-pack.ts` (Gaia DR3 deep stars) and
`scripts/lightpollution/build-lp-pack.ts` (VIIRS-based light-pollution
estimates), also runnable through the manual **Build data packs** workflow.

## Documentation

- [Architecture](docs/architecture.md)
- [Scoring](docs/scoring.md) — Astro, Weather and Tonight scores with every formula and constant
- [Exposure engine](docs/exposure-engine.md) — FOV, NPF, tracking, sub-exposure, integration
- [Data sources & licences](docs/data-sources.md)
- [Offline data](docs/offline-data.md) — pack formats, updates, builders
- [Privacy](docs/privacy.md)
- [Testing](docs/testing.md)

## Licences

- **Code:** MIT — see [`LICENSE`](LICENSE).
- **Bundled data:** derived from OpenNGC and the HYG Database, both CC BY-SA 4.0;
  the derived datasets in `public/data/` are therefore CC BY-SA 4.0 — see
  [`DATA_LICENSE.md`](DATA_LICENSE.md) and the in-app _Data Sources & Licenses_
  page for full attribution.

## Scope

AstroTrack is a planner. It does not control mounts or cameras (no ASCOM/INDI,
triggering, plate solving, guiding, autofocus, meridian flips or mosaic
planning). The engine is framework-independent so such features could be added
later without redesigning the calculations.
