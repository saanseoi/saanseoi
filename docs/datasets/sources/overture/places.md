# Overture Places

Overture Places are ingested from the monthly `place` reference-data parquet layer. The
accepted source contract is versioned in `libs/core/src/sourceRecordSchemas.ts` and
includes the publisher geometry, multilingual names, categories, contact fields, brand
data, source references, and operating status.

The normaliser requires a Point geometry and preserves the raw publisher payload in
`overturePlaces`. It converts the multilingual `names` and `brand.names` objects into
canonical English, Traditional Chinese, Simplified Chinese, and other explicitly
supplied locale rows where present. Locale-less values are marked as inferred.

Overture address identifiers are not treated as SaanSeoi ALS identifiers. Place
ingestion first accepts an identifier only when it is present in the selected ALS
snapshot; otherwise it uses the publisher's textual address values as a best-effort
match. The selected ALS snapshot is the compatible reference dataset recorded in the
Places snapshot provenance. A later release does not silently replace that historical
selection with today's latest address snapshot.

Each canonical place receives H3 cells at resolutions 5, 7, and 9. The H3 index supports
the Places `by-cell` API and is rebuilt with the current place snapshot. The
`placesDivision` projection is likewise current-only and is derived from the selected
address row's division snapshot and IDs. The full-text index is rebuilt after the
snapshot and its address, division, and street joins have been materialised.
