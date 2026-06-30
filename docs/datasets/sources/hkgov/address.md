# HKGov ALS Address

This document describes the HKGov ALS-specific side of the address pipeline.

Related resourceType doc:

- [Address resourceType](../../resourceType/address.md)

## Dataset Role

- Dataset metadata uses `publisherCode: hkgov-als`, `code: ds-hk-hkgov-als-address`.
- Raw ALS is not ingested directly by the worker.
- The CLI first transforms ALS GeoJSON into a prepared parquet file in `apps/harbour-cli/src/lib/hkgov-als.ts`.
- The worker then ingests that prepared parquet in `apps/harbour-workers/src/lib/services/address.ts`.

In runtime terms, HKGov ALS currently acts as a richer reconciliation and overwrite layer on top of the Overture base set.

For snapshot-source provenance, HKGov ALS releases are currently recorded with role `primary`.

## Prerequisite

- `hkgov-als` address uploads are rejected unless the same `cohortKey` already has an Overture address upload.
- This is enforced in `libs/core/src/lib/services/upload.ts`.

## Preparation Step

The CLI preparation step:

- reads all 2D ALS GeoJSON files
- skips `als_addresses_3d_*` files
- builds a stable row `id` from `GeoAddress`, then `CsuId`, then a generated fallback
- resolves `areaId` and `districtId` from both English and Traditional Chinese division names
- carries the latest `divisionSnapshotId`
- serializes provenance into `sources`
- serializes `hkgovCsuId` into `identifiers`
- formats `zhHantFormattedAddress`
- formats `enFormattedAddress`
- writes a prepared parquet file for worker ingestion

Prep commands:

- `bun run --cwd apps/harbour-cli prep-hkgov-als <source-dir>`
- `bun run --cwd apps/harbour-cli prep-hkgov-als:preview <source-dir>`
- `bun run --cwd apps/harbour-cli prep-hkgov-als:production <source-dir>`

Command behavior:

- `sourceVersion` is inferred from the source path when it contains a `YYYY-MM-DD.NN` segment, otherwise `--source-version` is required
- `cohortKey` is derived from `sourceVersion`
- a temp parquet file named `hkgov-hk-{sourceVersion}-address.parquet` is written before upload

Environment mapping:

- `prep-hkgov-als` reads from the local preview D1 database state
- `prep-hkgov-als:preview` reads from the remote preview D1 database
- `prep-hkgov-als:production` reads from the remote production D1 database
- `--db` overrides environment-based lookup and reads from a specified SQLite file directly

If the selected database does not yet contain the seeded PRC level-0 division:

- `countryId` is left `null`
- `areaId` and `districtId` can still be resolved

Prepared parquet fields include:

- `id`
- `divisionSnapshotId`
- `countryId`
- `areaId`
- `districtId`
- `geometry`
- `identifiers`
- `sources`
- `geoAddress`
- `hkgovCsuId`
- English and Traditional Chinese formatted and component fields
- `easting`
- `northing`

## Worker Normalization

For each prepared ALS row, the worker:

- uses prepared `id` as the source ID
- trusts prepared `divisionSnapshotId`, `countryId`, `areaId`, and `districtId`
- parses prepared `geometry`, `identifiers`, and `sources` JSON
- leaves canonical `bbox` as `null`
- creates `en` and/or `zh-hant` i18n rows when formatted addresses exist
- carries building name, estate name, street name, and street number into canonical i18n rows

The worker processes prepared parquet rows in small write batches and reads 2,048-row parquet windows from R2.

Large address releases are processed as sequential queue chunks. Each queue
message carries one parquet row range (`rowStart`, `rowEnd`) plus a stable
`processingRunStartedAt` marker. Upload finalization/requeue preplans all row
ranges and enqueues them up front; intermediate chunks leave the release phases
running, and only the final chunk runs release-level cleanup, publishes the
snapshot, and completes `processDataset`.

The row-range plan relies on the harbour-workers queue consumer remaining
serial (`max_batch_size: 1`, `max_concurrency: 1`), because the first current
stage initializes the draft current snapshot before later ranges apply deltas.

The worker executes each row range through separate stage services:
`normalize`, `source`, `history`, `current`, and `finalize`. The row-range
stages run inside one queue event. Normalized and resolved chunk artifacts are
stored in R2 so retries and later stages do not need to re-decode parquet or
repeat source normalization work.

For current-row cleanup, processed canonical rows are touched with the stable
run marker and processed source rows are advanced to the current release ID.
Final cleanup can therefore scan current rows in keyset pages without retaining
the full release ID set in Worker memory.

This means HKGov ALS currently contributes the richer text model:

- `formattedAddress`
- `buildingName`
- `estateName`
- `streetNumber`
- `streetName`
- both `en` and `zh-hant` when available

## Canonical Impact

The worker first tries to match ALS rows onto existing canonical addresses by:

1. canonical ID equals source ID
2. `districtId::streetName::streetNumber`

If matched:

- HKGov ALS can overwrite the canonical row contents for that canonical address ID

If unmatched:

- HKGov ALS can still create a canonical `address2d` row under its own prepared source ID

Current canonical/source state is queried only for the source IDs and street-key candidates in the active parquet batch. The worker does not preload the full current address or source-address table before ALS processing starts.

HKGov ALS does not currently drive canonical deletion:

- missing ALS rows do not close canonical current versions

## Source Retention Tables

Current-state source tables:

- `sourceHkgovAlsAddresses2d`
- `sourceHkgovAlsAddress2dI18n`

Version tables:

- `sourceHkgovAlsAddresses2dVersions`
- `sourceHkgovAlsAddress2dI18nVersions`

For later releases with unchanged source payloads, the worker advances the current row to the new release without inserting another source version row.

Current retained source fields include:

- `releaseId`
- `datasetId`
- `sourceRecordId`
- `sourcePayloadHash`
- `regionCode`
- `geoAddress`
- `csuId`
- `x`
- `y`
- `geometry`
- `districtName`
- `estateName`
- `buildingName`
- `streetNumber`
- `streetName`
- `dataOwner`
- `rawPayload`

Localized source retention stores:

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
- `districtName`
