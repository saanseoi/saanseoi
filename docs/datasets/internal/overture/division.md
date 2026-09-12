# Overture Division

This document describes the Overture-specific side of the division pipeline.

Related docs:

- [Division family](../../families/division.md)
- [Division resourceType](../../resourceType/division.md)
- [ResourceType common processing](../../resourceType/common.md)

Upload registration stores the Overture release-notes URL with the `#divisions` anchor;
see
[ResourceType common processing](../../resourceType/common.md#upstream-release-notes).

Stored i18n fields mean:

- `name`: canonical value for the locale
- `nameAlts`: pipe-joined alternative values
- `nameVariant`: JSON array containing `name` followed by alternatives
- `nameRules`: JSON array of `{ value, variant }` rule records retained from Overture

Current storage boundary:

- source rows include the publisher's `names` object unchanged; they do not create
  locale-keyed rows or infer locales
- canonical current/history tables create locale-keyed rows for API consumption,
  including the canonical API locales used by Atlas default responses

## Local SQL Upload Phases

Division uploads follow the shared local SQL lifecycle documented in
[ResourceType common processing](../../resourceType/common.md). The division-specific
generated artefacts are:

- normalise parquet rows into canonical division records and source-retained rows
- generate `source` SQL for `overtureDivisions`, including the native `names` object
- generate `history` SQL for canonical version tables in the history shard
- generate `current` SQL, including optional snapshot clone SQL when a same-region
  published predecessor exists
- generate `stats` SQL for release-level rows in `meta.stats`

## Source Retention

Overture-specific source rows are stored in:

- `overtureDivisions`

`overtureDivisions.names` is the exact publisher multilingual value. Locale inference,
normalisation, and API fallbacks are canonical transforms, retained only in canonical
current/history i18n rows and release processing actions.

Shared source-version behaviour is documented in
[ResourceType common processing](../../resourceType/common.md#source-retention).

Division parquet uploads are treated as complete source snapshots. A later release
closes source rows that are missing from the new parquet with `validToRelease`.
Canonical history clears the mutable `isCurrent` cache flag and writes a deletion
tombstone to `snapshotVersionChanges`; snapshot/cohort validity ranges are not used. The
local SQL division path loads previous-year source and history shards for every division
upload so a 2026 full snapshot can also close stale current rows still owned by the 2025
shard. For cohorts before 2025, the same continuity baseline is loaded from the
region-scoped `DB_SOURCE_HK_BEFORE` and `DB_HISTORY_HK_BEFORE` shards.
