# Places Data Model

## Purpose

This document defines the data model and ingestion flow for the `places` API.

It focuses on:

- canonical dataset lifecycle
- normalized D1 schema
- identity and alias management
- multi-step incremental ingestion
- relationships between places, addresses, divisions, streets, and i18n rows

It does not attempt to finalize the public API contract beyond the minimum context needed to shape the data model.

## Design goals

- serve low-latency public reads from D1
- preserve historical lineage without duplicating unchanged rows every month
- support corrected Overture monthly releases through immutable replacement datasets
- keep Overture-origin fields explicit with `ot`-prefixed camelCase columns
- normalize i18n into dedicated locale-scoped tables
- support incremental ingestion with resumable enrichment stages
- support future replacement of SaanSeoi-generated IDs when a canonical Overture/GERS ID later becomes available
- support only `hk` and `mo`, with fixed numeric division levels

## Core decisions

### Storage split

- `R2` stores raw uploaded parquet files and other ingest artifacts
- `D1` stores dataset metadata, identity mappings, normalized entities, join tables, and serving indexes

`R2` is the raw archive. `D1` is the canonical operational store and serving index.

### Dataset identity

Datasets are identified as:

`datasetId = {regionCode}-{snapshotMonth}-{theme}`

Example:

- `hk-2026-05-places`

Only one dataset may be active for a given `(regionCode, snapshotMonth, theme)`.

### Corrected releases

If Overture republishes a corrected file for the same month:

- create a new immutable dataset row
- set `supersedesDatasetId` to the prior dataset
- mark the prior dataset as revoked and inactive
- rebuild or incrementally reconcile current state from the replacement dataset

Public reads only consider active datasets.

### Identity model

IDs fall into two groups:

- canonical source IDs, usually GERS-backed IDs from Overture
- local SaanSeoi IDs for entities not yet represented canonically

Local IDs use the `SS` prefix.

Examples:

- `SSa3f2...`
- `SS9be1...`

When a canonical Overture/GERS ID becomes available later:

- replace the local ID everywhere in canonical tables
- preserve continuity in an alias table so downstream consumers can upgrade stored references

### Casing

Use `camelCase` consistently for:

- table names
- columns
- API fields

### Overture provenance

Normalized tables may keep `ot`-prefixed fields where they represent source-specific values from Overture.

Examples:

- `otVersion`
- `otBasicCategory`
- `otTaxonomyPrimary`

This keeps source provenance explicit while still allowing future multi-source consolidation.

### i18n normalization

Do not retain nested multilingual values in normalized serving rows except where raw source fidelity is needed.

Instead:

- each localized entity gets its own `*I18n` table
- locale is always part of the composite primary key
- localized display/search fields are stored in dedicated columns

## Entity overview

The `places` serving model now depends on these normalized entity groups:

- dataset and ingest metadata
- canonical version lineage
- alias mappings
- places
- place i18n
- place-to-division mappings
- place membership
- divisions
- division i18n
- deferred quality-control issues
- two-dimensional addresses
- two-dimensional address i18n
- three-dimensional addresses
- three-dimensional address i18n
- streets
- street i18n
- street-to-address mappings
- spatial lookup rows
- locale-aware full-text search rows

## Shared operational tables

### `datasets`

Tracks uploaded datasets and correction lineage.

Fields:

- `datasetId` text primary key
- `regionCode` text not null
- `snapshotMonth` text not null
- `theme` text not null
- `source` text not null
- `sourceVersion` text not null
- `rawObjectKey` text not null
- `status` text not null
- `isActive` integer not null
- `supersedesDatasetId` text null
- `revokedAt` text null
- `revocationReason` text null
- `ingestedAt` text not null

Statuses:

- `staged`
- `processing`
- `active`
- `revoked`
- `failed`

Constraints:

- `datasetId = {regionCode}-{snapshotMonth}-{theme}`
- only one active dataset per `(regionCode, snapshotMonth, theme)`

### `ingestRuns`

Tracks multi-step execution and resumability.

Fields:

- `runId` text primary key
- `datasetId` text not null
- `phase` text not null
- `status` text not null
- `statsJson` text null
- `errorJson` text null
- `startedAt` text not null
- `finishedAt` text null

Each resumable step should update `ingestRuns`.

### `entityVersions`

Stores deduplicated version lineage for canonical entities.

Fields:

- `regionCode` text not null
- `theme` text not null
- `entityId` text not null
- `datasetId` text not null
- `featureType` text not null
- `otVersion` text not null
- `versionHash` text not null
- `validFromMonth` text not null
- `validToMonth` text null
- `isCurrent` integer not null
- `geometryType` text not null
- `otBboxJson` text null
- `payloadJson` text not null
- `sourcesJson` text null
- `createdAt` text not null

Primary key:

- `(regionCode, theme, entityId, versionHash)`

Semantics:

- a new row is added only when normalized stored content changes
- unchanged entities are not duplicated across months
- deletions close the prior current version
- corrected datasets produce a new active lineage for the affected month

### `entityAliases`

Tracks historical and alternative identifiers.

Purpose:

- preserve continuity when an `SS` ID is later replaced by a canonical Overture/GERS ID
- expose upgrade paths for downstream consumers

Fields:

- `aliasId` text primary key
- `entityType` text not null
- `aliasValue` text not null
- `canonicalId` text not null
- `sourceSystem` text not null
- `isCurrent` integer not null
- `validFromMonth` text null
- `validToMonth` text null
- `notes` text null
- `createdAt` text not null

Recommended uniqueness:

- unique `(entityType, aliasValue)`

Examples:

- map `SS...` place/address/division/street IDs to later canonical IDs
- retain old external IDs if Overture changes source identity

### `entitySpatialIndex`

Shared spatial lookup table across themes.

Fields:

- `regionCode` text not null
- `theme` text not null
- `entityId` text not null
- `versionHash` text not null
- `spatialKeyType` text not null
- `spatialKeyLevel` integer not null
- `spatialKey` text not null

Primary key:

- `(regionCode, theme, entityId, versionHash, spatialKeyType, spatialKeyLevel, spatialKey)`

Status:

- deferred implementation

This is the shared cross-theme and potentially version-aware spatial index.

For the initial implementation:

- `placesCells` is the implemented serving index for current `places`
- `entitySpatialIndex` remains documented for future cross-theme or historical spatial indexing

When implemented, `spatialKeyType` should standardize on `h3`.

## Places tables

### `places`

Current serving projection for places.

Fields:

- `regionCode` text not null
- `datasetId` text not null
- `id` text primary key
- `address2dId` text null
- `address3dId` text null
- `otVersionHash` text not null
- `otVersion` text not null
- `otLng` real not null
- `otLat` real not null
- `otBboxJson` text null
- `otOperatingStatus` text null
- `otBasicCategory` text null
- `otTaxonomyPrimary` text null
- `otTaxonomyHierarchyJson` text null
- `otTaxonomyAlternatesJson` text null
- `otBrandWikidata` text null
- `otWebsitesJson` text null
- `otSocialsJson` text null
- `otEmailsJson` text null
- `otPhonesJson` text null
- `otAddressesJson` text null
- `otConfidence` real null
- `sourcesJson` text null
- `firstSeenMonth` text not null
- `lastSeenMonth` text not null

Notes:

- `address2dId` and `address3dId` are nullable because place ingest and address reconciliation are separate resumable steps
- `theme` and `type` are omitted because this table is already theme-specific
- this table stores current place state only

### `placesI18n`

Localized place names and brand display data.

Primary key:

- `(placeId, locale)`

Fields:

- `placeId` text not null
- `locale` text not null
- `otName` text null
- `otNameVariantJson` text null
- `otNameAlts` text null
- `otBrandName` text null
- `otBrandNameVariantJson` text null
- `otBrandNameAlts` text null

Locale values initially supported:

- `en`
- `zh-hant`
- `zh-hans`

### `placesDivision`

Join table from places to divisions.

Primary key:

- `(placeId, divisionId)`

Fields:

- `placeId` text not null
- `divisionId` text not null

A place may map to multiple divisions across the hierarchy.

### `placesMembership`

Future join table for places inside other places.

Primary key:

- `(parentPlaceId, childPlaceId)`

Fields:

- `parentPlaceId` text not null
- `childPlaceId` text not null

Not ingested in the first implementation.

### `placesCells`

Current H3 lookup rows for places.

Primary key:

- `(regionCode, id, h3Level, h3Cell)`

Fields:

- `regionCode` text not null
- `id` text not null
- `h3Level` integer not null
- `h3Cell` text not null

### `placesFts`

Locale-aware FTS5 search table for places.

This table should be built around normalized i18n rows rather than JSON blobs embedded in `places`.

Suggested columns:

- `placeId`
- `locale`
- `nameText`
- `brandText`
- `taxonomyText`
- `addressText`
- `divisionText`
- `streetText`

Primary key strategy depends on the FTS5 layout chosen during implementation, but conceptually search rows are per `(placeId, locale)`.

## Division tables

### `divisions`

Canonical division table for HK/MO-specific hierarchy.

Divisions are a managed set and must not be created during ordinary place ingest.

Creation and maintenance of division rows happens through explicit administrative processes.

Fields:

- `id` text primary key
- `level` integer not null
- `otVersion` text null
- `otSubtype` text null
- `otAdminLevel` text null
- `otClass` text null
- `otWikidata` text null
- `otHierarchyJson` text null
- `hierarchyJson` text null
- `parentDivisionId` text null
- `otCartographyJson` text null
- `otBboxJson` text null
- `sourcesJson` text null

Division levels:

- `0`: SAR
- `1`: region
- `2`: district
- `3`: subdistrict
- `4`: neighbourhood
- `5`: microhood

If no canonical external ID exists yet, use an `SS` ID.

### `divisionsI18n`

Localized division names and labels.

Primary key:

- `(divisionId, locale)`

Fields:

- `divisionId` text not null
- `locale` text not null
- `otName` text null
- `otNameVariantJson` text null
- `otNameAlts` text null
- `otLocalType` text null
- `hierarchyJson` text null

`hierarchyJson` includes the resolved names for the localized division hierarchy.

### `issues`

Deferred quality-control and review queue table.

Status:

- deferred implementation

Purpose:

- track suspected data quality issues discovered during ingest or downstream QA
- provide a generic review queue that can expand beyond missing divisions
- separate unresolved quality-control work from the canonical data model

Initial motivating examples:

- suspected missing division mapping
- failed address parsing
- failed address geolocation
- ambiguous street reconciliation
- unresolved alias upgrade

Suggested fields:

- `id` text primary key
- `entityType` text not null
- `entityId` text not null
- `issueType` text not null
- `status` text not null
- `severity` text null
- `datasetId` text null
- `regionCode` text not null
- `locale` text null
- `detailsJson` text null
- `notes` text null
- `createdAt` text not null
- `updatedAt` text not null
- `resolvedAt` text null

Suggested statuses:

- `open`
- `reviewing`
- `resolved`
- `wontFix`

This table should not block the initial implementation, but it remains part of the planned operational model.

## Address tables

### `address2d`

Canonical two-dimensional address entity.

Fields:

- `id` text primary key
- `streetId` text null
- `microhoodId` text null
- `neighbourhoodId` text null
- `subDistrictId` text null
- `districtId` text null
- `regionId` text null
- `countryId` text null
- `otLng` real not null
- `otLat` real not null
- `otStreet` text null
- `otNumber` text null
- `otBboxJson` text null
- `otVersion` text null
- `sourcesJson` text null

Notes:

- this table is canonicalized independently of places
- an address may be sourced from Overture or synthesized/reconciled during ingest
- use an `SS` ID if no canonical ID exists yet
- deduplication is deterministic from the canonical normalized address structure, not heuristic

### `address2dI18n`

Localized structured display and component fields for two-dimensional addresses.

Primary key:

- `(addressId, locale)`

Fields:

- `addressId` text not null
- `locale` text not null
- `formattedAddress` text not null
- `buildingName` text null
- `buildingNumberFrom` text null
- `buildingNumberTo` text null
- `blockType` text null
- `blockNumber` text null
- `blockTypeBeforeNumber` integer null
- `phaseName` text null
- `phaseNumber` text null
- `estateName` text null
- `streetNumber` text null
- `streetName` text null
- `intersection` text null

These fields are fully normalized columns, not nested JSON.

### `address3d`

Canonical three-dimensional address entity.

Fields:

- `id` text primary key
- `address2dId` text not null
- `sourcesJson` text null
- `createdAt` text not null
- `updatedAt` text not null

Notes:

- one `address2d` may have multiple `address3d` rows in the future
- `address3d` is canonical even though it may be discovered through place-driven enrichment
- use an `SS` ID when a canonical external ID does not exist

### `address3dI18n`

Localized structured display and component fields for three-dimensional addresses.

Primary key:

- `(address3dId, locale)`

Fields:

- `address3dId` text not null
- `locale` text not null
- `formattedAddressPart` text not null
- `accessHint` text null
- `unitPortion` text null
- `unitNumber` text null
- `unitType` text null
- `floorNumber` text null
- `floorType` text null

These fields are fully normalized columns, not nested JSON.

## Street tables

### `street`

Canonical named street entity.

Fields:

- `id` text primary key
- `yearBuiltJson` text null
- `referencesJson` text null

Notes:

- this table treats named streets as first-class entities
- geometry and segment ingestion are deferred
- use an `SS` ID if no canonical ID exists yet

### `streetI18n`

Localized street naming components.

Primary key:

- `(streetId, locale)`

Fields:

- `streetId` text not null
- `locale` text not null
- `name` text not null
- `base` text null
- `designator` text null
- `directionalPrefix` text null
- `directionalSuffix` text null
- `normalised` text null

### `streetAddress`

Join table from streets to canonical two-dimensional addresses.

Primary key:

- `(streetId, addressId)`

Fields:

- `streetId` text not null
- `addressId` text not null

### `streetSegment`

Future join table from streets to segment entities.

Primary key:

- `(streetId, segmentId)`

Fields:

- `streetId` text not null
- `segmentId` text not null

### `segment`

Future canonical segment table.

Fields:

- `id` text primary key

Not ingested in the first implementation.

## Relationship summary

The current target relationships are:

- one active dataset controls one month/theme/region view
- one canonical entity may have many version rows over time
- one canonical entity may have many aliases
- one place may link to zero or one `address2d`
- one place may link to zero or one `address3d`
- one `address2d` may link to many `address3d`
- one division may link to many places 
- one street may link to many addresses
- one localized entity may have many locale rows, keyed by `(entityId, locale)`

## Ingestion model

## Principles

- ingestion is incremental, not full-table rebuild by default
- ingestion is resumable across discrete phases
- normalized entity creation and enrichment are separated
- current-state serving tables are updated only after the relevant upstream stages complete
- a corrected monthly dataset is treated as a real replacement and may create real deletions

## Resumable phases

The ingest pipeline should be modeled as the following phases:

1. `registerDataset`
2. `stageRawParquet`
3. `extractPlaces`
4. `extractPlacesI18n`
5. `reconcileAddress2d`
6. `reconcileDivisions`
7. `reconcileStreets`
8. `deriveAddress3d`
9. `refreshSpatialIndex`
10. `refreshFts`
11. `publishDataset`

Each phase should be independently resumable and tracked in `ingestRuns`.

## Phase behavior

### 1. `registerDataset`

- create a `datasets` row in `staged` state
- validate that the incoming upload targets one `(regionCode, snapshotMonth, theme)`
- detect whether this dataset supersedes an active dataset for the same month/theme/region

### 2. `stageRawParquet`

- store the parquet object in `R2`
- record its location in `rawObjectKey`
- attach any initial ingest metadata

### 3. `extractPlaces`

For each source place row:

- normalize the source feature
- compute `otVersionHash`
- detect whether the canonical current row changed
- insert or update `entityVersions`
- upsert `places`
- clear or preserve nullable foreign keys according to later enrichment results

Delete handling:

- if a previously current place is absent from the new active dataset, treat it as a real deletion
- close the prior version in `entityVersions`
- remove it from `places` and dependent current indexes

### 4. `extractPlacesI18n`

- resolve `names.common` and `names.rules` into localized rows
- resolve `brand.names.common` and `brand.names.rules` into localized rows
- upsert `placesI18n`

No nested i18n structures should remain in normalized localized tables.

### 5. `reconcileAddress2d`

Use `places.otAddressesJson` and other place-derived cues to:

- parse canonical two-dimensional address candidates
- match against existing `address2d` rows
- create new `address2d` rows where needed
- create or update `address2dI18n`
- link matched `address2dId` back to `places`

`address2d` matching is deterministic from the canonical normalized structure. This stage should not use fuzzy duplicate merging as part of the canonical deduplication rule.

Because this may be incomplete or deferred, `places.address2dId` remains nullable.

### 6. `reconcileDivisions`

Using reconciled address data and geographic context:

- map places to the managed division hierarchy
- populate `placesDivision`
- populate division foreign keys on `address2d`

Important:

- ordinary place ingest must not create new `divisions` rows
- missing or ambiguous division mappings should surface as reviewable quality issues rather than triggering in-process division creation

### 7. `reconcileStreets`

Using normalized address data:

- match or create `street` rows
- create or update `streetI18n`
- populate `streetAddress`
- set `address2d.streetId`

Street geometry/segments remain out of scope for the initial implementation.

### 8. `deriveAddress3d`

Use freeform address parsing and geocoding/enrichment to:

- derive canonical three-dimensional addresses where enough evidence exists
- create `address3d` rows
- create `address3dI18n` rows
- link `address3dId` back to `places`

This phase is intentionally separate because it may depend on slower external or heuristic processing.

### 9. `refreshSpatialIndex`

For each current place:

- derive H3 cells from `otLat`/`otLng`
- update `placesCells`

`entitySpatialIndex` is deferred. The implemented current-state spatial index is `placesCells`.

### 10. `refreshFts`

Build locale-aware search rows using:

- `placesI18n`
- reconciled address display text
- reconciled division display text
- reconciled street display text
- selected place taxonomy text

The FTS index should be locale-aware and based on normalized i18n rows rather than flattening multilingual JSON into one row.

### 11. `publishDataset`

- mark the new dataset `active`
- revoke the superseded dataset if one exists
- ensure only one dataset is active for the same `(regionCode, snapshotMonth, theme)`
- expose the new current state to public read paths

## Change detection

Change detection should be based on the normalized stored place content used for `otVersionHash`.

Changes to any preserved material field count as an update.

At minimum this includes:

- coordinates
- bounding box
- operating status
- basic category
- taxonomy
- websites/socials/emails/phones
- overture addresses payload
- confidence
- localized names and brand names after normalization

Relationship enrichment stages may update normalized linked entities independently of the original raw place row.

## Indexing guidance

This document is focused on the data model, but the following indexes are structurally important:

- `datasets`: unique active dataset lookup by `(regionCode, snapshotMonth, theme, isActive)`
- `entityVersions`: `(regionCode, theme, entityId, isCurrent)`
- `entityAliases`: unique `(entityType, aliasValue)`
- `placesDivision`: `(divisionId, placeId)`
- `streetAddress`: `(addressId, streetId)`
- `placesCells`: `(regionCode, h3Level, h3Cell, id)`
- locale tables: indexes by `(locale)` in addition to composite primary keys if locale-specific queries are common

## Deferred items

These items are acknowledged but not finalized here:

- exact API response shapes
- exact SQL migration syntax
- exact FTS5 virtual table layout
- `issues` table implementation
- `entitySpatialIndex` implementation
- segment ingestion
- street geometry ingestion
- membership ingestion between places
- external geocoder choice and error policy for `address3d`
