# Data licence and attribution

The files under `public/data/core/` and `public/data/packs/stars-hyg-deep/`
are **adapted** from the datasets below and are distributed under the
**Creative Commons Attribution-ShareAlike 4.0 International** licence
(<https://creativecommons.org/licenses/by-sa/4.0/>).

Changes made: conversion to compact binary/JSON formats, deduplication and
alias merging (OpenNGC), magnitude splitting and HEALPix tiling (HYG),
coordinate formatting. See `scripts/` for the exact transformations and
`public/data/core/*/manifest.json` / `catalogue.json` for source checksums.

## OpenNGC

- Author: Mattia Verga — <https://github.com/mattiaverga/OpenNGC>
- Licence: CC BY-SA 4.0
- OpenNGC was built by merging data from the NASA/IPAC Extragalactic Database
  (NED), operated by JPL/Caltech under contract with NASA; the HyperLeda
  database (<http://leda.univ-lyon1.fr>); the SIMBAD database operated at CDS,
  Strasbourg, France; HEASARC tables; and Harold Corwin's NGC/IC Positions and
  Notes.

## HYG Database v4.1

- Author: David Nash (astronexus) — <https://codeberg.org/astronexus/hyg>
- Licence: CC BY-SA 4.0
- Compiled from the Hipparcos, Yale Bright Star and Gliese catalogues.

Optional packs built with the scripts carry their own licences in their
manifests (Gaia DR3: CC BY-SA 3.0 IGO, ESA/Gaia/DPAC; VIIRS-derived light-
pollution estimates: NASA/NOAA terms).
