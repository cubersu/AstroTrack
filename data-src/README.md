# data-src

Raw upstream datasets are downloaded here by `npm run data:fetch` into
`data-src/raw/` (git-ignored). `npm run data:build` converts them into the
application-native datasets in `public/data/`, which are committed.

See `docs/data-sources.md` for licences and provenance and
`docs/offline-data.md` for the pack formats.
