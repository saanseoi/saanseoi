# Address ResourceType

This document describes how the address resourceType is currently composed across sources.

Related source-specific docs:

- [Overture address](../sources/overture/address.md)
- [HKGov ALS address](../sources/hkgov/address.md)

## Scope

The address resourceType currently has two seeded source datasets in meta:

- `publisherCode: overture`, `code: ds-hk-overture-address`
- `publisherCode: hkgov-als`, `code: ds-hk-hkgov-als-address`

Both feed the same canonical address resourceType, but they arrive in different shapes and play different roles in the merge flow.

## Merge Order

### Division snapshot dependency

- Address processing depends on an already-published division snapshot.
- Overture address ingestion resolves `countryId`, `areaId`, and `districtId` from the latest published division snapshot.
- HKGov ALS preparation also resolves those IDs from the latest division snapshot before worker ingestion.

### Overture must arrive first

- Upload planning rejects `hkgov-als` address uploads unless the same `cohortKey` already has an Overture address upload.
- This is enforced in `libs/core/src/lib/services/upload.ts`.

Current practical meaning:

- Overture establishes the base address set.
- HKGov ALS reconciles against that base and can enrich or overwrite matched canonical rows.

## Reconciliation

The worker tries to match each incoming source row to an existing canonical address in this order:

1. direct match on canonical `id == sourceId`
2. fallback match on a derived street key

The derived match key is:

- `districtId::normalizedStreetName::normalizedStreetNumber`

Implications:

- there is no explicit cross-source address mapping table
- HKGov ALS can merge into an Overture-backed canonical row when the street key matches
- if nothing matches, the incoming source row creates a canonical `address2d` row under its own source ID

## Canonical Tables

The address resourceType currently writes these canonical current tables:

- `address2d`
- `address2dI18n`

It also writes these canonical history tables:

- `address2dVersions`
- `address2dVersionsI18n`

It does not currently populate:

- `address3d`
- `address3dI18n`
- `streetsAddress`

### Canonical field composition

`address2d` is source-dependent:

- `id`: existing canonical ID if matched, otherwise the incoming source ID
- `divisionSnapshotId`: latest published division snapshot for Overture rows, prepared ALS division snapshot for HKGov rows
- `districtId`, `areaId`, `countryId`: resolved from division lookups
- `geometry`: Overture point geometry or prepared ALS geometry
- `identifiers`: `null` for Overture, parsed prepared ALS identifiers for HKGov
- `bbox`: Overture only, `null` for HKGov
- `sources`: `{ overture: ... }` for Overture rows, parsed prepared ALS sources for HKGov rows

`address2dI18n` currently behaves like this:

- Overture usually contributes a single `en` row with `formattedAddress`, `streetNumber`, and `streetName`
- HKGov contributes richer `en` and `zh-hant` rows with `formattedAddress`, `buildingName`, `estateName`, `streetNumber`, and `streetName`

Because the canonical row is rewritten from the matched source row, a matched HKGov row can replace previously Overture-only canonical fields for the same address ID.

## Source Retention

The resourceType also retains normalized per-source rows in the source database.

Current-state source tables:

- `sourceOvertureAddresses2d`
- `sourceOvertureAddress2dI18n`
- `sourceHkgovAlsAddresses2d`
- `sourceHkgovAlsAddress2dI18n`

Source history tables:

- `sourceOvertureAddresses2dVersions`
- `sourceOvertureAddress2dI18nVersions`
- `sourceHkgovAlsAddresses2dVersions`
- `sourceHkgovAlsAddress2dI18nVersions`

Shared behavior:

- current tables are keyed by `sourceRecordId`
- current rows store the latest normalized payload per source record
- source version rows are keyed by `sourceRecordId + versionHash`
- previous current source versions are closed with `validToRelease`
- source history is separate from canonical address history
- unchanged source payloads only advance current-row `releaseId`/`datasetId`; they do not create new source version rows

## Versioning and Deletion

Canonical address history is snapshot-aware but deduped by `(id, versionHash)`.

Current behavior:

- a new draft address snapshot bulk-clones the latest non-archived snapshot before applying incoming deltas
- changed rows close prior current versions and insert a new current version
- unchanged rows are carried forward in the cloned current snapshot without rewriting canonical history rows
- snapshot-to-release membership is tracked through `snapshotSources`, not a per-record provenance table in the worker hot path

Deletion is asymmetric:

- Overture uploads can close canonical addresses that disappeared from the latest Overture release
- HKGov ALS uploads do not delete canonical addresses

So, in runtime terms:

- Overture defines base address existence
- HKGov ALS acts as a non-deleting reconciliation and overwrite layer

## API Support

### Registry endpoint metadata

The fixture-backed registry declares four address endpoint aliases for `api-addresses-v0.1`:

- `GET /v0/addresses`
- `GET /v0.1/addresses`
- `GET /v0/addresses/{id}`
- `GET /v0.1/addresses/{id}`

These are declared in `fixtures/meta/apiEndpoints/api-addresses-v0.1.json` and synced by `libs/db/src/registry/meta.ts`.

### Implemented routes today

Those standalone address handlers are not currently implemented in `apps/atlas-api`.

Implemented Atlas routes are:

- `/v0/meta/...`
- `/v0/{region}/places/{id}`
- `/v0/{region}/places/by-cell/{h3Level}/{h3Cell}`
- `/v0/{region}/search`

### Live API dependency on address data

The address resourceType is still used by live API behavior indirectly:

- `places.addressSnapshotId` and `places.address2dId` reference canonical address rows
- place search FTS joins `address2dI18n` and `address3dI18n` into indexed search text
- `/v0/{region}/search` therefore depends on canonical address text

Current limitation:

- `/v0/{region}/places/{id}` does not currently hydrate and return the referenced address object

## Metadata vs Runtime Role Labels

Snapshot-source metadata currently labels:

- HKGov ALS as `primary`
- Overture as `enrichment`

That matches `prepareAddressVersionInsertContext` and the endpoint metadata, but the implemented canonical flow still behaves more like:

- Overture = base address set
- HKGov ALS = richer reconciliation layer on top of that base
