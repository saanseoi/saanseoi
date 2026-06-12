# Hybrid Canonical Schema And D1 Sharding

This document proposes the next database shape for Saanseoi.

Beyond this design review artifact, we have:

- new D1 bindings: `DB_META`, `DB_CURRENT`, `DB_HISTORY_HK_2026`, and `DB_SOURCE_HK_2026`
- migration artifacts are present under `libs/db/migrations/`
- existing `DB` bindings remain in place for current code compatibility

## Goals

- keep publisher, dataset, release, API, and provenance concerns separate
- preserve a stable API contract while source releases and canonical logic evolve
- avoid full canonical snapshot duplication on every release set
- stay within D1 storage limits over multiple years

## Core Model

There are four distinct layers:

1. `source`
   - source-specific ingest tables, shaped for each publisher/feed
2. `canonical`
   - stable internal resource model used to serve APIs
3. `release sets`
   - metadata that defines which source releases and canonical logic version produced a snapshot
4. `api versions`
   - public response contracts like `v1`, `v2`

Relationship sketch:

```text
publisher
  -> dataset
    -> release
      -> source-specific tables

apiVersion
  -> apiReleaseSet
    -> selected releases from multiple datasets
    -> canonicalLogicVersion
    -> canonicalSchemaVersion

canonical current tables
  -> latest materialized rows only

canonical version tables
  -> one row per actual canonical change
  -> validity window over release sets
```

## Why The Hybrid Form

We explicitly do not want full canonical duplication per release set for large resources.

Instead:

- `canonical*` tables hold the latest current row only
- `canonical*Versions` tables hold only actual changes
- `apiReleaseSet` remains the snapshot boundary
- historical replay uses validity ranges against release sets

Example:

```text
RS1: address A created
RS2: address A unchanged
RS3: address A unchanged
RS4: address A districtId changes

canonicalAddress2dVersions:
- V1 valid from RS1 to RS4
- V2 valid from RS4 onward
```

## Release Sets

An API release set is the unit of reproducibility.

It records:

- which dataset releases were selected
- which canonical logic version was applied
- which canonical schema version was applied
- which API version it serves

The default `/v1/...` endpoints serve the active release set for `v1`.
Historical requests can resolve a specific release set.

## Meta Schema

These tables belong in the `meta` database.

### `publishers`

- `id`
- `code` unique
- `url`
- `contactUrl`
- `contactEmail`
- `contactPhone`
- `parentPublisherId`
- `createdAt`
- `updatedAt`

### `publisherI18n`

- `publisherId`
- `locale`
- `name`
- `description`
- `createdAt`
- `updatedAt`

PK:
- `(publisherId, locale)`

### `licenses`

- `id`
- `code` unique
  - example: `odc-by-1.0`, `cc-by-4.0`, `hkgov-open-data`
- `name`
- `url`
- `createdAt`
- `updatedAt`

### `datasets`

- `id`
- `publisherId`
- `code`
  - constructed as the stable logical dataset code within a publisher
  - shape: `{regionCode}-{type}`
  - examples:
    - publisher `overture` + region `hk` + type `address` -> `hk-address`
    - publisher `overture` + region `hk` + type `division` -> `hk-division`
    - publisher `hkgov` + region `hk` + type `address` -> `hk-address`
  - uniqueness is enforced by `(publisherId, code)`, so `overture/hk-address` and `hkgov/hk-address` can both exist
- `regionCode`
- `releaseType` (enum: `snapshot`, `static`)
- `releaseFrequency`
  - examples:
    - `monthly`
    - `quarterly`
    - `yearly`
- `theme` (enum: `addresses`, `base`, `divisions`, `transport`, `places`)
- `type` (enum: `address`, `division`, `place`, `street`)
- `sourceUrl`
- `licenseId`
- `attribution`
  - user-facing attribution text required for downstream display or redistribution
  - punctuation is meaningful:
    - `,` means one collective attribution string for a jointly credited source set
    - `;` means distinct attribution stages or contributors in the provenance chain
- `category` (enum: `terrain`, `transit`, `places`, `cultural`)
- `tagsJson`
- `createdAt`
- `updatedAt`

Unique:
- `(publisherId, code)`

### `datasetI18n`

- `datasetId`
- `locale`
- `name`
- `description`
- `createdAt`
- `updatedAt`

PK:
- `(datasetId, locale)`

### `releases`

- `id`
- `datasetId`
- `code`
  - constructed as the public release identifier
  - shape: `{publisher.code}-{dataset.code}-{sourceVersion}`
  - examples:
    - `overture-hk-address-2026-05-24.0`
    - `overture-hk-division-2026-05-24.0`
    - `hkgov-hk-address-2026-06-04.324`
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
- `createdAt`
- `updatedAt`

Unique:
- `(datasetId, sourceVersion)`
- `code`

### `apiVersions`

`apiVersions` should not be assumed to cover the entire product surface.

Recommendation:

- scope an API version to a contract family or route family, not necessarily to every route in the platform
- this allows addresses and places to evolve independently

Examples:

- `atlas-addresses@v0.1`
- `atlas-places@v0.1`
- later:
  - `atlas-addresses@v1`
  - `atlas-places@v0.2`

If we want to formalize that split, add an `apiSurfaces` table later:

- `apiSurfaces.id`
- `apiSurfaces.code`
  - examples: `atlas-addresses`, `atlas-places`
- `apiVersions.apiSurfaceId`

For now, `apiVersions.code` should encode that scope explicitly.

- `id`
- `code` unique
  - examples:
    - `ss-addresses-v0.1`
    - `ss-places-v0.1`
    - `ss-divisions-v1`
- `status` (enum: `draft`, `active`, `deprecated`, `retired`)
- `createdAt`
- `updatedAt`

### `apiReleaseSets`

- `id`
- `apiVersionId`
- `code`
  - examples:
    - `ss-addresses-v0.1-2026-06-01.01`
    - `ss-places-v0.1-2026-06-01.01`
- `canonicalSchemaVersion`
  - examples: `canon-address-v1`, `canon-place-v1`
- `canonicalLogicVersion`
  - examples: `addr-merge-v1`, `place-merge-v3`
- `status`
  - enum: `draft`, `active`, `archived`
- `publishedAt`
- `validFrom`
- `validTo`
- `notes`
- `createdAt`
- `updatedAt`

Unique:
- `(apiVersionId, code)`

### `apiReleaseSetMembers`

- `apiReleaseSetId`
- `datasetId`
- `releaseId`
- `role` (enum: `primary`, `enrichment`, `fallback`, `lookup`)
- `createdAt`

PK:
- `(apiReleaseSetId, releaseId)`

### `apiEndpoints`

- `id`
- `apiVersionId`
- `method` (enum: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`)
- `path`
- `operationId`
  - examples:
    - `listAddresses`
    - `getAddressById`
    - `listPlaces`
    - `getPlaceById`
- `resourceType` (enum: `address`, `division`, `street`, `place`)
- `createdAt`
- `updatedAt`

Unique:
- `(apiVersionId, method, path)`
- `operationId`

### `apiEndpointDatasets`

- `apiEndpointId`
- `datasetId`
- `usageType` (enum: `primary`, `filter`, `lookup`, `enrichment`, `join`)
- `required`
- `notes`
- `createdAt`

PK:
- `(apiEndpointId, datasetId)`

### `dataShards`

Routing metadata for D1 shard lookup.

- `id`
- `kind` (enum: `meta`, `current`, `history`, `source`)
- `regionCode`
- `year`
- `environment` (enum: `preview`, `production`)
- `databaseName`
- `databaseId`
- `bindingName`
- `status` (enum: `provisioning`, `active`, `readonly`, `retired`)
- `createdAt`
- `updatedAt`

### `releaseShardAssignments`

- `releaseId`
- `dataShardId`
- `createdAt`

PK:
- `(releaseId, dataShardId)`

### `releaseSetShardAssignments`

- `apiReleaseSetId`
- `dataShardId`
- `createdAt`

PK:
- `(apiReleaseSetId, dataShardId)`

## Source Schema

These tables belong in `source-*` databases.

The exact tables remain source-specific. The key rule is:

- do not force multiple sources into one shared raw table
- keep source-native fields and source-native semantics here

Examples:

- `sourceOvertureAddress2d`
- `sourceOvertureDivision`
- `sourceHkgovAlsAddress2d`
- `sourceHkgovAlsAddress2dI18n`

Every source row should carry:

- stable source record id
- `releaseId`
- `datasetId`
- `createdAt`
- `updatedAt`

Recommended shared metadata columns:

- `releaseId`
- `datasetId`
- `sourceRecordId`
  - the primary identifier of the record in the source-specific table
  - examples:
    - overture address row id like `08f2a...`
    - HKGov ALS row id like `geoAddress:12345678`
    - source table row UUID if the publisher has no stable upstream id
- `sourcePayloadHash`
- `createdAt`
- `updatedAt`

## Canonical Current Schema

These tables belong in the `current` database.

They hold the latest active row only and are optimized for live API reads.

### `canonicalAddress2d`

- `id`
- `regionCode`
- `geometryJson`
- `bboxJson`
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
- `identifiersJson`
- `currentVersionId`
- `createdAt`
- `updatedAt`

### `canonicalAddress2dI18n`

- `addressId`
- `locale`
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
- `currentVersionId`
- `createdAt`
- `updatedAt`

PK:
- `(addressId, locale)`

Apply the same pattern to:

- `canonicalDivision`
- `canonicalDivisionI18n`
- `canonicalStreet`
- `canonicalStreetI18n`
- `canonicalPlace`
- `canonicalPlaceI18n`

## Canonical History Schema

These tables belong in `history-*` databases.

They store only actual changes with validity windows over release sets.

### `canonicalAddress2dVersions`

- `id`
- `addressId`
- `regionCode`
- `geometryJson`
- `bboxJson`
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
- `identifiersJson`
- `validFromReleaseSetId`
- `validToReleaseSetId`
- `isCurrent`
- `createdAt`
- `updatedAt`

Indexes:

- `(addressId, isCurrent)`
- `(addressId, validFromReleaseSetId, validToReleaseSetId)`
- `(validFromReleaseSetId)`

### `canonicalAddress2dVersionsI18n`

- `id`
- `addressVersionId`
- `addressId`
- `locale`
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
- `validFromReleaseSetId`
- `validToReleaseSetId`
- `isCurrent`
- `createdAt`
- `updatedAt`

Indexes:

- `(addressId, locale, isCurrent)`
- `(addressId, locale, validFromReleaseSetId, validToReleaseSetId)`

The same pattern should be used for:

- `canonicalDivisionVersions`
- `canonicalDivisionVersionsI18n`
- `canonicalStreetVersions`
- `canonicalStreetVersionsI18n`
- `canonicalPlaceVersions`
- `canonicalPlaceVersionsI18n`

## Provenance Model

We do want provenance, but not at the individual record level.

The chosen scope is:

- one provenance rule per API release set
- per API field
- describing which dataset or datasets and source field paths the API field may be derived from

That means:

- no per-row provenance tables for canonical resources
- no per-record source tracing in API responses
- yes to field-level provenance metadata for an API release

### `apiFieldProvenance`

This table belongs in `meta`.

- `id`
- `apiReleaseSetId`
- `apiField`
  - canonical identifier for a field exposed by an API contract
  - examples:
    - `address.attributes.geometry`
    - `address.relationships.street`
    - `address.attributes.i18n.zhHant.formattedAddress`
    - `place.attributes.i18n.en.name`
- `sourceDatasetId`
- `sourceFieldPath`
  - path in the source-shaped dataset used to derive the API field
  - examples:
    - `otStreet`
    - `geometry`
    - `names.primary.en`
    - `formattedAddress`
- `resolverCode`
  - stable identifier for the transformation or merge rule
  - examples:
    - `direct_copy`
    - `join_lookup`
    - `lookup_fk`
    - `prefer_hkgov_then_overture`
    - `prefer_overture_then_hkgov`
    - `derive_bbox_from_geometry`
- `contributionType` (enum: `primary`, `fallback`, `enrichment`, `merge-input`)
- `priority`
  - lower number means higher precedence when multiple source datasets are listed for the same `apiField`
- `confidence`
  - optional numeric confidence score
  - examples:
    - `1.0` for direct authoritative mapping
    - `0.85` for heuristic reconciliation
- `sourceIdentifierPathsJson`
  - optional metadata describing how a consumer could trace to an individual source record field if they inspect source data directly
  - examples:
    - `["id"]`
    - `["properties.id", "properties.names.primary.en"]`
    - `["geoAddress", "buildingName"]`
- `createdAt`
- `updatedAt`

Unique:

- `(apiReleaseSetId, apiField, sourceDatasetId, sourceFieldPath, contributionType, priority)`

### Relationship To `apiReleaseSetMembers`

Use both tables together:

- `apiReleaseSetMembers`
  - tells us which releases were included in the release set overall
- `apiFieldProvenance`
  - tells us how each published API field in that release set is sourced, including multi-source and fallback rules

So:

- release-set membership explains the snapshot composition
- field provenance explains the contract-level field derivation

### User-facing trace model

The intended provenance flow is:

1. resolve the API release set used by the response
2. inspect `apiReleaseSetMembers` to see which source releases were used
3. inspect `apiFieldProvenance` to see how each API field in that release is defined
4. inspect the relevant source tables or source artifacts directly if deeper tracing is needed

This gives field-level provenance for the API contract without paying the storage cost of record-level provenance.

It also supports cases where a field may be:

- sourced directly from one dataset
- chosen from an ordered fallback chain
- assembled from multiple datasets under one resolver rule

## Historical Replay

To reconstruct a resource for a release set:

1. resolve the requested `apiReleaseSetId`
2. locate the correct `history-*` shard via `releaseSetShardAssignments`
3. read each canonical version row where:
   - `validFromReleaseSetId <= requestedReleaseSetId`
   - `validToReleaseSetId is null or requestedReleaseSetId < validToReleaseSetId`
4. optionally join `*VersionsI18n`
5. read `apiFieldProvenance` from `meta` for contract-level field provenance

## D1 Shard Layout

We shard by function first, then by region and year.

Initial shard set:

- `ss-meta-db-preview`
- `ss-meta-db-prod`
- `ss-current-db-preview`
- `ss-current-db-prod`
- `ss-history-hk-2026-db-preview`
- `ss-history-hk-2026-db-prod`
- `ss-source-hk-2026-db-preview`
- `ss-source-hk-2026-db-prod`

Future additions follow the same pattern:

- `ss-history-hk-2027-*`
- `ss-source-hk-2027-*`
- `ss-history-mo-2026-*`
- `ss-source-mo-2026-*`

## Worker Routing

Request routing should work like this:

### Current API request

1. read active release set from `meta`
2. read current canonical rows from `current`

### Historical API request

1. resolve release set in `meta`
2. resolve history shard in `meta`
3. read canonical version rows from the selected `history-*` shard

### Ingest/build flow

1. ingest source release into `source-*`
2. build canonical deltas
3. write history rows into `history-*`
4. update current rows in `current`
5. publish release set in `meta`

## API Versioning Guidance

Use `v0.x` while contracts are still unstable.

Recommendation:

- start with `ss-addresses-v0.1`
- start with `ss-places-v0.1`
- promote each route family independently to `v1` only once its contract is intentionally stable

That means:

- addresses can move from `v0.1` to `v0.2` without forcing places to move
- places can remain at `v0.1` while divisions are already at `v1`

Detailed routing and SemVer policy is documented in [API Versioning](./api-versioning.md).
Response-shape and field-path rules are documented in [API Contract](./api-contract.md).

## Locked Naming Decisions

The following names are now the source of truth for phase 1:

- `apiField` identifiers use the dot-separated JSON-path-like format defined in [API Contract](./api-contract.md), rooted at singular resource names like `address` and `place`
- canonical resource type names are singular:
  - `address`
  - `division`
  - `street`
  - `place`
- initial profile names are:
  - `compact`
  - `default`
  - `full`
  - `map`
- initial `resolverCode` vocabulary is:
  - `direct_copy`
  - `join_lookup`
  - `lookup_fk`
  - `derive_bbox_from_geometry`
  - `prefer_hkgov_then_overture`
  - `prefer_overture_then_hkgov`
  - `merge_first_non_empty`
  - `normalize_whitespace`
- dataset metadata also carries:
  - `releaseFrequency`
  - `attribution`
- initial release-set codes use a date-based publication suffix:
  - `{apiVersion.code}-{YYYY-MM-DD.NN}`

## Naming Conventions

Recommended D1 binding names:

- `DB`
  - existing legacy monolith binding, retained for now
- `DB_META`
- `DB_CURRENT`
- `DB_HISTORY_HK_2026`
- `DB_SOURCE_HK_2026`

These bindings should exist in both preview and production environments.
