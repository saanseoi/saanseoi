# Division ResourceType

This document describes how the division resourceType is currently composed and used.

Related source-specific docs:

- [Overture division](../sources/overture/division.md)

## Scope

The logical `ds-hk-overture-division` dataset is currently sourced from Overture only:

- `publisherCode: overture`, `code: ds-hk-overture-division`

There is no second division source in the current pipeline.

## Ingestion Model

- Division uploads run locally from `saanseoi upload`, generate SQL artefacts, and
  import those artefacts into the target D1 databases.
- The local division SQL runner is
  `apps/harbour-cli/src/lib/divisionSql/processLocalDivisionSqlUpload.ts`.
- Processing creates or reuses a resourceType-scoped draft snapshot via
  `ensureDraftSnapshotForRelease`.
- If an earlier published division snapshot exists for the same region, its current rows
  are bulk-cloned into the new draft snapshot before the upload delta is applied.
- The uploaded release is linked to that snapshot through `snapshotSources`.
- Division releases are recorded as `primary` sources for the division snapshot.

The local pipeline imports SQL into:

- `DB_SOURCE_*` for source-retained Overture versions
- `DB_HISTORY_*` for canonical division version history
- `DB_CURRENT` for the cloned-and-patched current snapshot
- `DB_META` for release- and API-release-set stats

Pre-2025 division cohorts use the region-scoped `DB_SOURCE_HK_BEFORE` and
`DB_HISTORY_HK_BEFORE` bindings. Their metadata rows retain `shardType` as `source` or
`history`, set `regionCode` to `hk`, and leave `year` null.

For remote preview/production runs, the local D1 cache profile mirrors only the meta
database plus division current/history tables and Overture division source tables needed
by the release. The cache is scoped by target, source version, cohort, region, and
resourceType, so repeat runs for the same release reuse the validated cache.
History/source version tables are retained in the cache only for current rows
(`isCurrent = 1`).

## Canonical Tables

The division resourceType currently writes these canonical current tables:

- `divisions`
- `divisionsI18n`

It also writes these canonical history tables:

- `divisions`
- `divisionsI18n`

And it writes release-level stats rows in meta:

- `stats`

The division resourceType does not itself populate:

- `placesDivision`

That join table belongs to the place pipeline, but it references canonical division IDs
and snapshots.

## Canonical Field Composition

Because the division resourceType currently has only one source, canonical composition
is straightforward:

- `id`: Overture division `id`
- `level`: derived from Overture subtype/class/admin hints, not copied raw
- `type`: Harbour taxonomy-facing type derived from subtype/class/admin hints
- `geometry`: decoded from Overture WKB when needed, otherwise passed through if already
  GeoJSON
- `bbox`: copied from source when present
- `sourceKeys`: source-specific lookup and compatibility keys, currently Overture
  `subtype`, `class`, source-owned `version`, raw `hierarchies`, and derived
  compatibility `admin_level` where available
- `wikidata`: retained where present
- `hierarchy`: normalised from Overture `hierarchies`; country/self entries are dropped,
  entries are mapped to canonical `level`/`type` using the matching division row when
  needed, and labels are resolved from division i18n rows as `en`/`zh-hant`
- `cartography`: retained when present
- `sources`: provider-keyed source attribution, currently `{ overture: ... }`

`divisionsI18n` currently stores:

- `locale`
- `name`
- `nameVariant`
- `nameAlts`
- `nameRules`
- `isLocaleInferred`

Locale storage behaviour:

- current/history snapshots preserve publisher-derived locale rows such as `zh-hk` or
  `zh-hans`; these are canonical/API projections, not source-table rows
- they also materialise canonical API locale rows for `en`, `zh-hant`, and `zh-hans`
- Atlas `compact`, `default`, and `map` responses default to the same locale filter as
  `en,zh-hant`
- the Atlas `full` profile defaults to all stored locales, equivalent to `locales=*`
- an explicit `locales` filter overrides profile defaults and only returns matching
  locale keys

## Change Detection and Versioning

Division processing uses two hashes:

- `versionHash`: based on base division fields only
- `churnHash`: based on base fields plus localised rows

The Overture `FeatureVersion` is a source compatibility field. It may advance when
Overture changes a feature and is exposed as `attributes.overture.version` in the full
profile. Atlas does not increment this integer: canonical history uses the content
addressed `versionHash`, so Atlas can create a new canonical version independently of
the upstream feature counter. Because compatibility keys participate in the base hash,
an upstream feature-version change is also recorded as a new canonical hash rather than
silently leaving the API provenance stale.

Current behaviour:

- unchanged rows are carried forward by snapshot clone rather than being rewritten
  row-by-row
- base-field changes create a new canonical version
- i18n-only changes reuse the same base `versionHash` but still refresh the current
  snapshot and i18n version state
- missing rows are closed in history and removed from the staged current snapshot

This is stricter than address processing:

- divisions always behave as a full-snapshot replacement set

Release precedence is also explicit:

- a `staged` division release only starts when it is the newest non-failed release for
  its dataset lineage
- if a newer sibling release is already `staged` or `processing`, the older local upload
  fails fast instead of waiting
- if a newer sibling has already reached a terminal non-failed state, the older release
  is marked `superseded` instead of processing out of order

## Source Retention

The resourceType retains normalised Overture source rows in versioned source database
tables. The current source row is the row where `isCurrent = 1`; there are no separate
non-version current source tables.

- `overtureDivisions`

The source row keeps Overture's multilingual `names` object unchanged. Locale-keyed rows
are canonical API projections rather than source evidence.

Current behaviour:

- changed source payloads close the previous current source row and insert a new current
  source row
- unchanged source payloads do not create new source rows; only the current source row
  metadata is advanced to the latest release
- missing source rows are closed by clearing `isCurrent` and setting `validToRelease`

The local SQL importer does not write per-record provenance during division ingestion.
Snapshot membership is tracked at the snapshot level through `snapshotSources`.

## Stats Produced

Division processing computes release-level stats and stores them against the release:

- locale coverage stats
- churn stats comparing previous and current snapshots
- quality/regression stats such as locale or name regression

These are built in `libs/core/src/pipeline/services/stats.ts`, serialised into a
dedicated `stats` SQL artefact, and imported into `DB_META`.

Atlas-facing division summaries should be written as `type = apiReleaseSet` stats
against the API release set. The standard rows are:

- `records/count/count` total, plus `groupBy = table` rows for `divisions`
- `localised_records/count/count` with `groupBy = table`, `groupValue = divisionsI18n`
- `records/count/count` grouped by `level`
- `records/count/count` grouped by `divisionType`
- locale completeness rows: `locale_count`, `locale_coverage`,
  `locale_coverage_non_inferred`, and `locale_alt_coverage`
- churn rows for `count`, `added_count`, `changed_count`, `unchanged_count`, and
  `removed_count`, optionally grouped by `level` and `divisionType`
- quality rows for `parent_changed_count`, `geometry_changed_count`,
  `locale_regression_count`, and `name_regression_count`

## Latest Release Rollback

`saanseoi rollback:release --release <release-id|code>` can generate and import rollback
SQL for the active latest division release only. The rollback SQL removes the latest
release's current snapshot rows, deletes source/history rows inserted for that release,
reopens rows that were closed by that release, resets the previous published release
metadata, and removes the latest release metadata. A non-dry-run import requires
confirmation; automation must opt in explicitly with `--yes`.

## API Support

### Registry endpoint metadata

The fixture-backed registry declares the Divisions endpoints for `api-divisions-v0.1`:

- `GET /divisions/v0`
- `GET /divisions/v0/{id}`

These are declared in `fixtures/meta/apiEndpoints/api-divisions-v0.1.json` and synced by
`libs/db/src/registry/meta.ts`.

### Implemented routes today

Implemented Atlas routes now include:

- `/divisions/v0`
- `/divisions/v0/{id}`
- `/v0/meta/...`
- `/places/v0/{region}/places/{id}`
- `/places/v0/{region}/places/by-cell/{h3Level}/{h3Cell}`
- `/places/v0/{region}/search`

### Live runtime dependency on division data

The standalone Atlas divisions routes are public now, and the division resourceType is
also a live dependency elsewhere:

- place detail responses join `placesDivision` to `divisions` and `divisionsI18n`
- place search FTS uses `divisionsI18n.name` as part of `divisionText`
- HKGov ALS address preparation also resolves division IDs from the current divisions
  database

So divisions are already part of both serving and downstream canonicalisation, even
though there is no dedicated public divisions endpoint yet.
