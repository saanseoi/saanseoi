# Atlas Data Model

## Purpose

This document describes the atlas data model as it exists in the repository today.

It aligns to the implemented schema under:

- `libs/db/src/schema/meta`
- `libs/db/src/schema/current`
- `libs/db/src/schema/history`
- `libs/db/src/schema/source`

It also reflects the currently implemented ingest flow in:

- `libs/core/src/lib/services/upload.ts`
- `apps/harbour-api/src/lib/services/control.ts`
- `apps/harbour-workers/src/lib/worker.ts`
- `apps/harbour-workers/src/lib/services/division.ts`
- `apps/harbour-workers/src/lib/services/address.ts`

## Current Scope

The repository currently has four storage layers:

1. `meta`
   - publishers, datasets, releases, ingest runs, API release sets, shard assignments
2. `current`
   - latest canonical serving rows
3. `history`
   - versioned canonical rows with validity windows
4. `source`
   - source-specific snapshots and version history used during ingest

Raw uploaded parquet files are stored in `R2`. Canonical and operational metadata live in D1.

## Key Decisions In Code

### Dataset Identity

The implementation does not treat a monthly upload as a `dataset`.

Instead:

- `datasets` are stable logical feeds such as `overture/hk-address` or `overture/hk-division`
- `releases` are individual uploaded snapshots for a dataset

Examples from seed data:

- dataset code: `hk-address`
- release code: `overture-hk-address-2026-05-24.0`

This is the most important difference from the earlier spec.

### Release Lifecycle

Uploads create or reuse a logical dataset definition, then stage a new release row.

Relevant release fields are:

- `sourceVersion`
- `snapshotMonth`
- `rawObjectKey`
- `originalFileName`
- `status`
- `supersededByReleaseId`
- `revokedAt`
- `revocationReason`
- `ingestedAt`

The active/public state is modeled on `releases.status`, not on a month-scoped dataset row.

### Current And History Split

Canonical entities use:

- one current table for the latest row
- one typed history table for actual changes only

History rows carry validity metadata:

- `versionHash`
- `releaseId`
- `validFromReleaseSetId`
- `validToReleaseSetId`
- `validFromMonth`
- `validToMonth`
- `isCurrent`

Localized history tables use the same pattern, except they omit month bounds and keep:

- `versionHash`
- `releaseId`
- `validFromReleaseSetId`
- `validToReleaseSetId`
- `isCurrent`

### Canonical Field Naming

The implemented canonical tables do not use `ot*`-prefixed columns.

Canonical tables store normalized names directly, for example:

- `lng`, `lat`
- `basicCategory`
- `taxonomyPrimary`
- `sources`

Source-specific fidelity is preserved in the `source` database instead.

### Locale Handling

Localized text is normalized into dedicated `*I18n` tables.

Composite keys are:

- current tables: `(entityId, locale)`
- history tables: `(entityId, versionHash, locale)`

## Implemented Meta Schema

### `datasets`

Logical dataset definitions.

Fields:

- `id`
- `publisherId`
- `code`
- `regionCode`
- `releaseType`
- `releaseFrequency`
- `theme`
- `type`
- `sourceUrl`
- `licenseId`
- `category`
- `attribution`
- `tags`
- timestamps

Constraints:

- unique `(publisherId, code)`
- index on `(regionCode, theme, type)`

### `datasetI18n`

Localized dataset names and descriptions.

Primary key:

- `(datasetId, locale)`

### `releases`

One uploaded release per source version.

Fields:

- `id`
- `datasetId`
- `code`
- `sourceVersion`
- `sourceSchemaVersion`
- `publicationDate`
- `snapshotMonth`
- `rawObjectKey`
- `originalFileName`
- `status`
- `revokedAt`
- `revocationReason`
- `supersededByReleaseId`
- `ingestedAt`
- timestamps

Constraints:

- unique `code`
- unique `(datasetId, sourceVersion)`

### `ingestRuns`

Per-release phase tracking.

Fields:

- `runId`
- `releaseId`
- `phase`
- `status`
- `stats`
- `error`
- `startedAt`
- `finishedAt`
- timestamps

Constraint:

- unique `(releaseId, phase)`

Statuses:

- `queued`
- `running`
- `completed`
- `error`

### `stats`

Dataset-level metrics produced by ingest.

Fields:

- `id`
- `type`
- `releaseId`
- `dimension`
- `metric`
- `metricUnit`
- `value`
- `groupBy`
- `groupValue`
- timestamps

This is currently populated by the division ingest pipeline.

### `entityAliases`

Generic alias mapping table.

Fields:

- `aliasId`
- `entityType`
- `aliasValue`
- `canonicalId`
- `sourceSystem`
- `isCurrent`
- `validFromMonth`
- `validToMonth`
- `notes`
- timestamps

Constraint:

- unique `(entityType, aliasValue)`

### API Release Metadata

The implementation also includes:

- `apiVersions`
- `apiReleaseSets`
- `apiReleaseSetMembers`
- `apiEndpoints`
- `apiEndpointDatasets`
- `apiFieldProvenance`

These tables are part of the operational model. History validity is anchored to `apiReleaseSets`, not directly to raw uploads alone.

### Shard Metadata

The implementation also includes:

- `dataShards`
- `releaseShardAssignments`
- `releaseSetShardAssignments`

These describe which D1 databases serve which role, region, year, and environment.

## Implemented Canonical Current Schema

### `places`

Current serving rows for places.

Fields:

- `id`
- `regionCode`
- `releaseId`
- `address2dId`
- `address3dId`
- `lng`
- `lat`
- `bbox`
- `operatingStatus`
- `basicCategory`
- `taxonomyPrimary`
- `taxonomyHierarchy`
- `taxonomyAlternates`
- `brandWikidata`
- `websites`
- `socials`
- `emails`
- `phones`
- `addresses`
- `confidence`
- `sources`
- `firstSeenMonth`
- `lastSeenMonth`
- timestamps

Notes:

- `releaseId` exists on current `places`
- `address2dId` and `address3dId` are nullable
- place ingestion is not implemented yet in `harbour-workers`, but the canonical schema and atlas API queries exist

### `placesI18n`

Primary key:

- `(placeId, locale)`

Fields:

- `name`
- `nameVariant`
- `nameAlts`
- `isLocaleInferred`
- `brandName`
- `brandNameVariant`
- `brandNameAlts`

### `placesDivision`

Join table between places and divisions.

Primary key:

- `(placeId, divisionId)`

### `placesCells`

H3 serving index for places.

Primary key:

- `(regionCode, id, h3Level, h3Cell)`

### `placesFts`

FTS5 virtual table mapping for place search.

Columns:

- `placeId`
- `locale`
- `nameText`
- `brandText`
- `taxonomyText`
- `addressText`
- `divisionText`
- `streetText`

Important:

- the real virtual table is managed by `libs/db/scripts/sql/rebuild-places-fts.sql`
- it is not created through ordinary Drizzle migrations

### `divisions`

Current division rows.

Fields:

- `id`
- `level`
- `type`
- `geometry`
- `bbox`
- `population`
- `subtype`
- `class`
- `wikidata`
- `hierarchy`
- `parentDivisionId`
- `cartography`
- `sources`
- timestamps

Notes:

- current `divisions` does not store `regionCode` or `releaseId`
- those exist in `divisionsVersions`

### `divisionsI18n`

Primary key:

- `(divisionId, locale)`

Fields:

- `name`
- `nameVariant`
- `nameAlts`
- `nameRules`
- `localType`
- `isLocaleInferred`

### `address2d`

Current two-dimensional canonical addresses.

Fields:

- `id`
- `geometry`
- `bbox`
- `countryId`
- `areaId`
- `districtId`
- `townId`
- `macrohoodId`
- `villageId`
- `neighbourhoodId`
- `hamletId`
- `microhoodId`
- `streetId`
- `identifiers`
- `sources`
- timestamps

Notes:

- current `address2d` stores geometry and bounding box
- it does not store standalone `lat` and `lng` columns

### `address2dI18n`

Primary key:

- `(addressId, locale)`

Fields:

- `formattedAddress`
- `buildingName`
- `buildingNumberFrom`
- `buildingNumberTo`
- `blockType`
- `blockNumber`
- `blockTypeBeforeNumber`
- `phaseName`
- `phaseNumber`
- `estateName`
- `streetNumber`
- `streetName`

### `address3d`

Fields:

- `id`
- `address2dId`
- `sources`
- timestamps

### `address3dI18n`

Primary key:

- `(address3dId, locale)`

Fields:

- `formattedAddressPart`
- `accessHint`
- `unitPortion`
- `unitNumber`
- `unitType`
- `floorNumber`
- `floorType`

### `streets`

Fields:

- `id`
- `yearBuilt`
- `references`
- timestamps

### `streetsI18n`

Primary key:

- `(streetId, locale)`

Fields:

- `name`
- `base`
- `designator`
- `directionalPrefix`
- `directionalSuffix`
- `normalised`

### `streetsAddress`

Join table between streets and `address2d`.

Primary key:

- `(streetId, addressId)`

## Implemented Canonical History Schema

The following typed history tables exist:

- `placesVersions`
- `placesVersionsI18n`
- `divisionsVersions`
- `divisionsVersionsI18n`
- `address2dVersions`
- `address2dVersionsI18n`
- `address3dVersions`
- `address3dVersionsI18n`
- `streetsVersions`
- `streetsVersionsI18n`

Rules reflected in the implementation:

- primary keys are stable ID plus `versionHash`
- relationship columns point to stable canonical IDs, not to version rows
- `regionCode` is present on `placesVersions`, `divisionsVersions`, and `address2dVersions`
- `address3dVersions` and `streetsVersions` do not currently carry `regionCode`

## Implemented Source Schema

The repository also persists source-specific snapshots and source-specific version history in the `source` database.

This is where publisher-specific fidelity belongs.

Currently implemented source families include:

- Overture divisions
- Overture addresses
- HK Gov ALS addresses

Those tables are intentionally separate from the canonical `current` and `history` schemas.

## Relationship Summary

Implemented relationships are:

- one publisher has many datasets
- one dataset has many releases
- one release has many ingest runs
- one API release set has many selected release members
- one canonical entity has one current row and many version rows over time
- one canonical entity has many localized rows
- one place may reference zero or one `address2d`
- one place may reference zero or one `address3d`
- one place may map to many divisions through `placesDivision`
- one `address2d` may map to one street by `streetId`
- one street may map to many addresses through `streetsAddress`

## Actual Ingest Flow

### Upload Registration

`libs/core/src/lib/services/upload.ts` plans the upload, infers metadata, writes the parquet file to `R2`, and registers a release in `meta`.

This step creates the initial control-plane record before worker processing starts.

### Worker Phases Implemented Today

The worker currently reports these phases:

- `processDataset`
- `extractDivisions`
- `extractDivisionsI18n`
- `extractAddresses`
- `extractAddressesI18n`
- `publishDataset`

Important:

- division datasets are implemented
- address datasets are implemented
- place datasets are not implemented in `apps/harbour-workers/src/lib/worker.ts`
- street reconciliation is not a standalone worker pipeline yet

### Division Processing

Division ingest currently does all of the following:

- reads parquet from `R2`
- normalizes canonical division rows
- upserts current `divisions`
- replaces current `divisionsI18n`
- inserts `divisionsVersions` and `divisionsVersionsI18n` on change
- closes superseded history versions
- deletes missing current rows for removed divisions
- mirrors Overture data into the `source` database when configured
- computes dataset stats rows

### Address Processing

Address ingest currently does all of the following:

- reads parquet from `R2`
- normalizes canonical address rows
- resolves division lookups from current divisions
- upserts current `address2d`
- replaces current `address2dI18n`
- inserts `address2dVersions` and `address2dVersionsI18n` on change
- closes superseded history versions
- deletes missing current rows for removed addresses
- mirrors Overture or HK Gov ALS source rows into the `source` database when configured

Current address ingest is centered on `address2d`. It does not yet run a full canonical `street` or `address3d` derivation pipeline.

### Publish Behavior

`publishDataset` marks the new release current and updates the previously current release for the same dataset:

- corrected release for the same base source version: previous release becomes `revoked`
- ordinary newer release: previous release becomes `historic`

The correction check is implemented by comparing the `sourceVersion` prefix before the final `.` suffix.

## What Is Not Implemented

These items appeared in the older spec but are not implemented as described:

- `entitySpatialIndex`
- `placesMembership`
- `issues`
- `streetSegment`
- `segment`
- a place worker pipeline with phases such as `extractPlaces`, `reconcileAddress2d`, `deriveAddress3d`, or `refreshFts`
- canonical `ot*`-prefixed columns in serving tables
- month-scoped uploaded datasets as the primary identity model

## Documentation Rule

When source-data processing changes, also update:

- the relevant `docs/datasets/families/*.md`
- the relevant `docs/datasets/sources/{source}/*.md`
