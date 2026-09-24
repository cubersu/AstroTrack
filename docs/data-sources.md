# Data sources and licences

Only datasets whose redistribution rights were verified are bundled. Every
dataset is also listed in the in-app **Data Sources & Licenses** page.

## Bundled

| Dataset                                                | Licence                                     | Provenance                                                                                                                                            | Used for                                                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenNGC** (`NGC.csv`, `addendum.csv`) — Mattia Verga | CC BY-SA 4.0 (stated in the project README) | <https://github.com/mattiaverga/OpenNGC>, fetched from `master`; the SHA-256 of each source file is recorded in `public/data/core/dso/catalogue.json` | 13,375 deep-sky objects: NGC, IC, Messier, Caldwell (all 109 via OpenNGC identifiers) and addendum objects (e.g. B 33, Mel 22/M 45, Cr 399, Sh2-155) |
| **HYG Database v4.1** — David Nash                     | CC BY-SA 4.0 (repository LICENSE)           | <https://github.com/astronexus/HYG-Database> (`hyg/CURRENT/hygdata_v41.csv`; project now at <https://codeberg.org/astronexus/hyg>)                    | 41,487 stars ≤ 8 mag bundled; 78,138 fainter stars in the optional `stars-hyg-deep` pack                                                             |
| Meteor-shower parameters                               | factual values (IMO working list)           | <https://www.imo.net/>                                                                                                                                | peak solar longitude, ZHR, radiant, velocity                                                                                                         |
| Five bright ecliptic stars for Moon conjunctions       | from HYG v4.1                               | as above                                                                                                                                              | Aldebaran, Regulus, Spica, Antares, Pleiades/Alcyone                                                                                                 |

**Share-alike:** the derived files in `public/data/core/` and
`public/data/packs/stars-hyg-deep/` are adaptations of CC BY-SA 4.0 data and
are therefore distributed under **CC BY-SA 4.0** with attribution (see
`DATA_LICENSE.md`). The application code is licensed separately (MIT).

OpenNGC itself credits NED, HyperLEDA, SIMBAD, HEASARC and Harold Corwin's
NGC/IC notes; these acknowledgements are reproduced in the app.

## Not bundled (available through build scripts or user action)

| Dataset                                                                                                  | Licence / status                                                            | How it is used                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gaia DR3** subset                                                                                      | ESA/Gaia/DPAC, CC BY-SA 3.0 IGO                                             | `scripts/stars/build-gaia-pack.ts` queries the Gaia archive TAP service and produces an optional HEALPix-tiled pack. Not built in this repository because the archive was unreachable from the development environment. |
| **NASA Black Marble / VIIRS DNB** night lights                                                           | NASA data: no restrictions (attribution requested); NOAA EOG VNL: CC BY 4.0 | `scripts/lightpollution/build-lp-pack.ts` turns a radiance GeoTIFF into a light-pollution **estimate** pack. Not included in this build (source archives require Earthdata/EOG downloads).                              |
| **Minor Planet Center comet elements** (`CometEls.txt`)                                                  | MPC data policy; not redistributed                                          | The user downloads (or imports) the file; it is stored only locally with its update date.                                                                                                                               |
| **Stellarium DSO catalogue**, **VizieR** catalogues (Sharpless, Barnard, LDN/LBN, vdB, RCW, Abell PN, …) | redistribution terms not verified                                           | Not bundled. The catalogue pipeline and pack format support additional DSO packs once licensing is verified (see `offline-data.md`).                                                                                    |
| World Atlas of Artificial Night Sky Brightness (Falchi et al. 2016), D. Lorenz light-pollution atlas     | non-commercial / unverified terms                                           | Not used.                                                                                                                                                                                                               |

## Online services (optional, user-controlled)

| Service                         | Terms                                                                                                                                                                                                  | Data sent                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **Open-Meteo** forecast API     | free for non-commercial use, no key; data CC BY 4.0 (attribution shown in the UI)                                                                                                                      | latitude/longitude rounded to 0.01° (~1 km); only after the user enables weather |
| **CDS hips2fits** (DSS2 colour) | DSS: produced at STScI under U.S. Government grant NAG W-2166; plates © their institutions; use with acknowledgement. Images are fetched on demand and cached only on the user's device, never bundled | sky coordinates and field size                                                   |
| **Minor Planet Center**         | see above                                                                                                                                                                                              | none beyond the request itself                                                   |

## Software

Astronomy Engine (MIT), React (MIT), Dexie.js (Apache-2.0), Workbox and
vite-plugin-pwa (MIT). Build/test only: Vite, Vitest, Testing Library,
Playwright, ESLint, Prettier, TypeScript, tsx, geotiff (MIT).

## Verification notes

- OpenNGC licence: project README ("released under CC-BY-SA-4.0 license").
- HYG licence: `LICENSE` in the HYG repository (CC BY-SA 4.0).
- Positions: OpenNGC and HYG are J2000/ICRS; Gaia positions are propagated
  from J2016.0 to J2000.0 by the builder.
- Catalogue values are shown with their basis (catalogue / derived / assumed);
  surface brightness derived from magnitude and size is always flagged as an
  estimate.
