# Architecture

AstroTrack is a **static, offline-first Progressive Web App**. There is no
backend, no account and no server-side state. Everything — catalogue search,
ephemerides, scoring, planning — runs in the browser.

```
┌────────────────────────── Browser ───────────────────────────────┐
│ React UI (main thread)                                           │
│  src/features/*   pages      src/ui/*  components                │
│  src/app/*        shell, router, AppState (settings, location,   │
│                   equipment, weather)                            │
│        │ typed postMessage RPC (src/workers/rpc.ts)              │
│        ▼                                                         │
│ Catalogue/planning Web Worker (src/workers/catalog.worker.ts)    │
│  CatalogStore (typed arrays)  scans · evaluations · star fields  │
│  events · comets                                                 │
│        │                                                         │
│        ▼                                                         │
│ Pure domain engine (src/astro/*) — framework independent         │
│                                                                  │
│ Storage                                                          │
│  IndexedDB "astrotrack-user"  (Dexie) — user data, backed up     │
│  IndexedDB "astrotrack-data"  (Dexie) — installed data packs,    │
│                                 weather/preview caches, comets   │
│  Service-worker precache      — app shell + bundled core data    │
└──────────────────────────────────────────────────────────────────┘
        │ optional, user-enabled network requests only
        ├── Open-Meteo (weather; rounded coordinates)
        ├── CDS hips2fits (DSS2 preview images; sky coordinates)
        ├── Minor Planet Center (comet elements; user-initiated)
        └── data-pack update source (packs.json of the same deployment)
```

## Layers

| Layer          | Location                               | Rules                                                                                                                                                                          |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Domain engine  | `src/astro/`                           | Pure TypeScript, no React, no I/O. All formulas and constants live here (`config.ts` for scoring constants, `units.ts` for conversions). Unit-tested against Astronomy Engine. |
| Catalogue      | `src/catalog/`                         | Binary formats, designation normalisation, `CatalogStore` (search/filter). Shared by build scripts and the worker.                                                             |
| Data access    | `src/data/`, `src/weather/`, `src/db/` | Adapters for packs, IndexedDB, Open-Meteo, previews. Adapters never contain domain logic.                                                                                      |
| Worker         | `src/workers/`                         | Owns the catalogue in memory (typed arrays); the UI only receives small result pages.                                                                                          |
| UI             | `src/app/`, `src/features/`, `src/ui/` | React function components, React state/context only (no state library). All strings through `src/i18n`.                                                                        |
| Build pipeline | `scripts/`                             | Converts upstream datasets into app-native packs, computes checksums, builds optional packs.                                                                                   |

## Canonical units

Degrees for angles and right ascension (never hours internally), arcminutes for
object sizes, arcseconds per pixel for pixel scale, epoch milliseconds (UTC)
for instants, explicit `S`/`H`/`Ms` suffixes for durations, millimetres for
optics and sensors, micrometres for pixels, mag/arcsec² for surface
brightness. See `src/astro/units.ts`.

## Night evaluation pipeline

1. `computeNight` (twilight.ts) finds sunset, civil/nautical/astronomical
   twilight and the usable dark period, anchored at local mean noon so it is
   independent of the device time zone; it degrades to nautical darkness at
   high latitude and reports "no darkness" when appropriate.
2. `buildNightGrid` samples the night (10 min default) once: local sidereal
   time, Sun altitude, topocentric Moon position, phase angle, darkness flags
   and the precession matrix.
3. For each object, J2000 coordinates are precessed once and altitudes are
   computed from the sidereal-time series — cheap enough to scan the whole
   catalogue (≈ 0.2–0.8 s for ~9,500 visible objects) in the worker.
4. `evaluateDso` (scoring.ts) builds the Astro Score, explanation, confidence,
   best window, optics/focal-length choice, exposure and integration guidance.
5. `tonightScore` (tonight.ts) multiplies in weather and time availability.

## Offline strategy

- The service worker (Workbox via vite-plugin-pwa) precaches the app shell,
  `data/packs.json` and all **bundled** packs in `data/core/`.
- **Optional** packs (`data/packs/…`) are not precached. They are downloaded on
  demand into IndexedDB, verified (size + SHA-256 + structural validation) and
  activated atomically (see `offline-data.md`).
- External services are optional. Failures are caught and the UI continues with
  astronomical evaluation only ("Current weather unavailable…").

## Extensibility for hardware control (not implemented)

The engine never talks to hardware. A future device layer (ASCOM Alpaca, INDI
web, etc.) could consume the same `EvaluateResponse` (target coordinates of
date, recommended sub-exposure, framing rotation, best window) without changes
to `src/astro/`. Mount/camera control, plate solving, guiding, autofocus,
meridian flips and mosaic planning are intentionally out of scope.
