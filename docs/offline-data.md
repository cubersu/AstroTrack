# Offline data

## Pack model

Astronomical data are distributed as **packs**. `public/data/packs.json` is the
registry; each pack directory contains a `manifest.json`.

| Pack             | Kind              | Bundled         | Contents                                                        |
| ---------------- | ----------------- | --------------- | --------------------------------------------------------------- |
| `dso-core`       | `dso-catalogue`   | yes (precached) | `index.bin`, `names.json`, `details/NNN.json`, `catalogue.json` |
| `stars-core`     | `star-catalogue`  | yes (precached) | `stars.bin`, `names.json`                                       |
| `stars-hyg-deep` | `star-tiles`      | no (download)   | `tiles/NNNN.bin` (HEALPix order 2), `tiles.json`                |
| `stars-gaia-*`   | `star-tiles`      | build script    | Gaia DR3 tiles                                                  |
| `lp-<region>`    | `light-pollution` | build script    | `grid.bin`, `model.json`                                        |

Manifest fields: `id`, `kind`, `title`, `version` (release date + content-hash
prefix), `released`, `contentHash`, `bundled`, `optional`, `basePath`,
`files[] {path, size, sha256}`, `totalSize`, `records`, `license`,
`attribution`, `sourceUrl`, `sourceChecksums`, and kind-specific `tiling`,
`magLimit`, `region`.

## Binary formats (`src/catalog/format.ts`, `src/data/lightPollutionFormat.ts`)

All little-endian.

- **DSO index `ATDSO001`** — 16-byte header (magic, count), then columns:
  Float32 ×8 (`ra`, `dec` J2000 degrees; `major`, `minor` arcmin; `pa`; `magV`;
  `magB`; `sb`), Uint8 ×3 (`type`, `flags`, `constellation`). NaN = missing.
  ~35 bytes/object: 100,000 objects ≈ 3.5 MB, loaded into a Web Worker only.
- **Names** — `[id, primaryName, aliases[], commonNames[]]` rows. Stable IDs
  `ongc:<OpenNGC name>` survive catalogue updates.
- **Details** — chunks of 500 objects loaded on demand.
- **Stars `ATSTAR01`** — header, Float32 `ra`, `dec`; Int16 `mag×100`,
  colour index ×1000 (B−V for HYG, BP−RP for Gaia — declared in `tiles.json`).
- **Light pollution `ATLP0001`** — 36-byte header (magic, width, height,
  bounds), Uint8 cells north→south: 0 = no data, else
  `SQM = 16 + (v−1)/254 · 6.5`. Sampled with flux-weighted bilinear
  interpolation; smaller regional packs take precedence over larger ones.

## Spatial indexing

Star tiles use nested HEALPix (`src/astro/healpix.ts`, verified by
round-trip tests). The framing simulator requests a disc around the target;
the worker loads only intersecting tiles and applies a magnitude limit that
depends on the field (`8 + 3.3·log10(10°/field)`, clamped 6–12.5).

## Installing and updating (`src/data/packs.ts`)

1. The Offline Data page loads `packs.json` from the update source
   (default: the app's own origin, bypassing caches; configurable in Settings).
2. Each file is downloaded into IndexedDB under the **new version key**, and
   its size and SHA-256 are verified with Web Crypto.
3. A kind-specific validator decodes the content (index/names count match,
   star/tile/grid structure).
4. Only then is the active pointer switched in a single IndexedDB transaction;
   older versions are deleted afterwards.
5. Any failure deletes the partial version; the previous data remain active.
   This is covered by `src/data/packs.test.ts` (checksum mismatch, network
   error mid-download, structurally invalid content).

Bundled packs can be updated the same way (the installed version shadows the
bundled copy) and reverted by removing the installed version.

## Building data

```bash
npm run data:fetch      # download OpenNGC + HYG into data-src/raw/ (git-ignored)
npm run data:build      # regenerate public/data/core, packs/stars-hyg-deep, packs.json
```

Optional packs (network access to the archives required):

```bash
# Gaia DR3 deep stars, G 8–11, HEALPix order 4
npx tsx scripts/stars/build-gaia-pack.ts --gmin 8 --gmax 11 --order 4

# Light-pollution estimate for a region from a VIIRS radiance GeoTIFF
npx tsx scripts/lightpollution/build-lp-pack.ts \
  --input VNP46A4_mosaic.tif --region "turkey:25,35,45,43" --res 0.02 \
  --calibration my-sqm-readings.csv
```

The **Build data packs** GitHub workflow (`.github/workflows/data-packs.yml`,
manual trigger) runs these builders on a GitHub-hosted runner and uploads the
result as an artifact for review; nothing is committed automatically.

## Light-pollution estimation model

`scripts/lightpollution/skyglow.ts`:

1. Radiance (nW·cm⁻²·sr⁻¹) is area-averaged onto the output grid.
2. Skyglow index at each site:
   `I = Σ L_j · A_j · (d_j + 1 km)^−2.5 · exp(−d_j / 100 km)` for sources within
   150 km (Walker's law with an extinction cut-off; fine grid to 30 km, coarse
   grid beyond).
3. `SQM = 22.0 − 2.5·log10(1 + C·I)`. `C` is fitted by least squares (log
   space) to local SQM-meter readings supplied as `lat,lon,sqm` CSV; without
   calibration a default (`C = 0.2`) is used and the pack title says
   "(uncalibrated)".

This is an approximation (no radiative transfer, no terrain, no atmospheric
variability). The app always labels atlas values as **estimates**, and manual
SQM/Bortle values override them.

## Caches

Weather forecasts and survey previews are cached in IndexedDB and can be
cleared on the Offline Data page. Storage usage and persistent-storage
permission are shown there too.
