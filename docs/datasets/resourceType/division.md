# Division ResourceType

This document describes how the division resourceType is currently composed and used.

Related source-specific docs:

- [Overture division](../sources/overture/division.md)

## Scope

The logical `ds-hk-overture-division` dataset is currently sourced from Overture only:

- `publisherCode: overture`, `code: ds-hk-overture-division`

There is no second division source in the current pipeline.

## Ingestion Model

- Division uploads are ingested directly from parquet by `apps/harbour-workers/src/lib/services/division.ts`.
- Processing creates or reuses a resourceType-scoped draft snapshot via `ensureDraftSnapshotForRelease`.
- If an earlier non-archived division snapshot exists, its current rows are bulk-cloned into the new draft snapshot before the upload delta is applied.
- The uploaded release is linked to that snapshot through `snapshotSources`.
- Division releases are recorded as `primary` sources for the division snapshot.

The worker stages current rows into `DB_CURRENT` under a `snapshotId`, while version history is written to the history shard.

## Canonical Tables

The division resourceType currently writes these canonical current tables:

- `divisions`
- `divisionsI18n`

It also writes these canonical history tables:

- `divisionsVersions`
- `divisionsVersionsI18n`

And it writes dataset-level stats rows in meta:

- `stats`

The division resourceType does not itself populate:

- `placesDivision`

That join table belongs to the place pipeline, but it references canonical division IDs and snapshots.

## Canonical Field Composition

Because the division resourceType currently has only one source, canonical composition is straightforward:

- `id`: Overture division `id`
- `level`: derived from Overture subtype/class/admin hints, not copied raw
- `type`: Harbour taxonomy-facing type derived from subtype/class/admin hints
- `geometry`: decoded from Overture WKB when needed, otherwise passed through if already GeoJSON
- `bbox`: copied from source when present
- `population`: copied when numeric
- `subtype`, `class`, `wikidata`: retained where present
- `hierarchy`: normalized from Overture `hierarchies`
- `parentDivisionId`: copied from `parent_division_id`
- `cartography`: retained when present
- `sources`: wrapped as `{ overture: ... }`

`divisionsI18n` currently stores:

- `locale`
- `name`
- `nameVariant`
- `nameAlts`
- `nameRules`
- `localType`
- `isLocaleInferred`

Locale storage behavior:

- current/history snapshots preserve normalized source locale rows such as `zh-hk` or `zh-hans`
- they also materialize canonical API locale rows for `en`, `zh-hant`, and `zh-hans`
- Atlas `compact`, `default`, and `map` responses default to the same locale filter as `en,zh-hant`
- the Atlas `full` profile defaults to all stored locales, equivalent to `locales=*`
- an explicit `locales` filter overrides profile defaults and only returns matching locale keys

## Change Detection and Versioning

Division processing uses two hashes:

- `versionHash`: based on base division fields only
- `churnHash`: based on base fields plus localized rows

Current behavior:

- unchanged rows are carried forward by snapshot clone rather than being rewritten row-by-row
- base-field changes create a new canonical version
- i18n-only changes reuse the same base `versionHash` but still refresh the current snapshot and i18n version state
- missing rows are closed in history and removed from the staged current snapshot

This is stricter than address processing:

- divisions always behave as a full-snapshot replacement set

## Source Retention

The resourceType retains normalized Overture source rows in the source database.

Current-state source tables:

- `sourceOvertureDivisions`
- `sourceOvertureDivisionI18n`

Source history tables:

- `sourceOvertureDivisionsVersions`
- `sourceOvertureDivisionI18nVersions`

Current behavior:

- changed source payloads update the current source tables and create new source version rows
- unchanged source payloads do not create new source version rows; only the current source row metadata is advanced to the latest release
- missing source rows are removed from current source tables and closed in source history

The worker no longer writes per-record provenance during division ingestion. Snapshot membership is tracked at the snapshot level through `snapshotSources`.

## Dataset Stats Produced

Division processing also computes dataset-level stats and stores them against the release:

- locale coverage stats
- churn stats comparing previous and current snapshots
- quality/regression stats such as locale or name regression

These are built in `apps/harbour-workers/src/lib/services/stats.ts` and written through `replaceDatasetStats`.

## API Support

### Registry endpoint metadata

The fixture-backed registry declares two division endpoint aliases for `api-divisions-v0.1`:

- `GET /v0/divisions`
- `GET /v0.1/divisions`

These are declared in `fixtures/meta/apiEndpoints/api-divisions-v0.1.json` and synced by `libs/db/src/registry/meta.ts`.

### Implemented routes today

Implemented Atlas routes now include:

- `/v0/divisions`
- `/v0/divisions/{id}`
- `/v0.1/divisions`
- `/v0.1/divisions/{id}`
- `/v0/meta/...`
- `/v0/{region}/places/{id}`
- `/v0/{region}/places/by-cell/{h3Level}/{h3Cell}`
- `/v0/{region}/search`

### Live runtime dependency on division data

Even without a standalone `/divisions` route, the division resourceType is already a live dependency:

- place detail responses join `placesDivision` to `divisions` and `divisionsI18n`
- place search FTS uses `divisionsI18n.name` as part of `divisionText`
- Overture address ingestion resolves `areaId`, `districtId`, and `countryId` from the latest published division snapshot
- HKGov ALS address preparation also resolves division IDs from the current divisions database

So divisions are already part of both serving and downstream canonicalization, even though there is no dedicated public divisions endpoint yet.
