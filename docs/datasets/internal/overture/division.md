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

- source tables keep raw normalized source locales
- canonical current/history tables keep both:
  - raw normalized source locales
  - canonical API locales used by Atlas default responses

## Local SQL Upload Phases

Division uploads follow the shared local SQL lifecycle documented in
[ResourceType common processing](../../resourceType/common.md). The division-specific
generated artifacts are:

- normalize parquet rows into canonical division records and source-retained rows
- generate `source` SQL for `overtureDivisions` and `overtureDivisionI18n`
- generate `history` SQL for canonical version tables in the history shard
- generate `current` SQL, including optional snapshot clone SQL when a same-region
  published predecessor exists
- generate `stats` SQL for release-level rows in `meta.stats`

## Source Retention

Overture-specific source rows are retained in:

- `overtureDivisions`
- `overtureDivisionI18n`

Shared source-version behavior is documented in
[ResourceType common processing](../../resourceType/common.md#source-retention).

Division parquet uploads are treated as complete source snapshots. A later release
closes current source/history rows that are missing from the new parquet by clearing
`isCurrent` and setting `validToRelease` or `validToSnapshotId`. The local SQL division
path loads previous-year source and history shards for every division upload so a 2026
full snapshot can also close stale current rows still owned by the 2025 shard.
