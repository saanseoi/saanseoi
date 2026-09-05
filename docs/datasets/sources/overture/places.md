# Overture Places

Overture Places are ingested from the monthly `place` reference-data parquet layer. The
accepted source contract is versioned in `libs/core/src/sourceRecordSchemas.ts` and
includes the publisher geometry, multilingual names, categories, contact fields, brand
data, source references, and operating status. The retained release windows reflect the
upstream additions: `basic_category` is added in 2025-10-22.0 and `taxonomy` in
2025-12-17.0. The upload validator accepts these known additive transitions while
continuing to reject unrelated drift.

The normaliser requires a Point geometry and preserves the raw publisher payload in
`overturePlaces`. It converts the multilingual `names` and `brand.names` objects into
canonical English, Traditional Chinese, Simplified Chinese, and other explicitly
supplied locale rows where present. Locale-less values are marked as inferred.

Overture `id` values are validated against the Overture GERS Registry rather than being
classified from their UUID shape. Harbour caches the registry evidence for the retained
Division and Place IDs in `.local/harbour-sql/gers-registry/cache.json`. The cache
stores the registry history and release path for each match, and records unmatched IDs
explicitly. Refresh it and print the coverage report with:

```sh
./bin/saanseoi cache:gers --require-gers
```

The complete publisher `addresses` value is retained in the source assertion. The
canonical Place `addresses` field contains only the non-empty publisher `freeform`
strings. The structured `address.freeform`, `address.locality`, `address.country`,
`address.region`, and `address.postcode` values remain in the retained source record's
`rawProperties`; they are observational source values and are not authoritative inputs
to any parsed canonical field or relationship.

Overture address identifiers are not treated as SaanSeoi ALS identifiers. Place
ingestion only accepts an identifier when it is present in the selected ALS snapshot;
otherwise it uses an explicit publisher identifier or the address `freeform` value as a
best-effort match. Locality, country, region, and postcode are not used for that match.
The selected ALS snapshot is the compatible reference dataset recorded in the Places
snapshot provenance. A later release does not silently replace that historical selection
with today's latest address snapshot.

Places with `CN` or `MO` address country codes are excluded from the Hong Kong
projection. Places with a missing country code remain included. Both cases are recorded
as one `overture_place_country_review_required` action per Place in the release Audit.
Ingestion stops with a warning if any Place contains more than one publisher address.
The warning requires reconsideration of the Place-to-address implementation before the
release can be materialised.

Each canonical place receives H3 cells at resolutions 5, 7, and 9. The H3 index supports
the Places `by-cell` API and is rebuilt with the current place snapshot. The
`placesDivision` projection is likewise current-only and is derived from the selected
address row's division snapshot and IDs. The full-text index is rebuilt after the
snapshot and its address, division, and street joins have been materialised.
