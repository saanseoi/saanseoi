# HKGov ALS Address

This document describes the HKGov ALS-specific side of the address pipeline.

Related docs:

- [Address resourceType](../../resourceType/address.md)
- [ResourceType common processing](../../resourceType/common.md)

## Dataset Role

- Dataset metadata uses `publisherCode: hkgov-als`, `code: ds-hk-hkgov-als-address`.
- Raw ALS is not ingested directly by the canonical pipeline.
- The CLI first transforms ALS GeoJSON into a prepared parquet file in `apps/harbour-cli/src/lib/hkgov-als.ts`.
- The local SQL pipeline then ingests that prepared parquet using shared code under `libs/core/src/pipeline/services/addressPipeline`.

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
- writes a prepared parquet file for local SQL ingestion

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

## Local Pipeline Normalization

For each prepared ALS row, the local pipeline:

- uses prepared `id` as the source ID
- trusts prepared `divisionSnapshotId`, `countryId`, `areaId`, and `districtId`
- parses prepared `geometry`, `identifiers`, and `sources` JSON
- leaves canonical `bbox` as `null`
- creates `en` and/or `zh-hant` i18n rows when formatted addresses exist
- carries building name, estate name, street name, and street number into canonical i18n rows

The local SQL processor reads prepared parquet rows in small write batches and
reads 2,048-row parquet windows from the CLI-side cached file.

Large address releases are processed as local parquet chunks. Each chunk carries
one row range (`rowStart`, `rowEnd`) plus a stable `processingRunStartedAt`
marker. The shared chunking, release-ordering, and local SQL lifecycle are
documented in [ResourceType common processing](../../resourceType/common.md).

The local processor still executes each row range through separate stage
services: `normalize`, `source`, `history`, `current`, and `finalize`.
Normalized and resolved chunk artifacts are stored under
`.local/harbour-sql/releases/...` so later stages do not need to re-decode
parquet or repeat source normalization work.

For current-row cleanup, processed canonical rows are touched with the stable
run marker and processed source rows are advanced to the current release ID.
Final cleanup can therefore scan current rows in keyset pages without retaining
the full release ID set in memory.

The staged SQL import builder can emit HKGov ALS source SQL from normalized
address artifacts. It stages prepared raw payloads and localized rows, computes
changed source IDs in SQL, closes prior source rows, and inserts current source
rows with `INSERT ... SELECT ... ON CONFLICT`. Canonical history/current SQL is
built from resolved artifacts after TypeScript has performed canonical ID
resolution and `versionHash` generation.

This means HKGov ALS currently contributes the richer text model:

- `formattedAddress`
- `buildingName`
- `estateName`
- `streetNumber`
- `streetName`
- both `en` and `zh-hant` when available

## Canonical Impact

The local pipeline first tries to match ALS rows onto existing canonical addresses by:

1. canonical ID equals source ID
2. `districtId::streetName::streetNumber`

If matched:

- HKGov ALS can overwrite the canonical row contents for that canonical address ID
- if multiple ALS rows in one chunk reconcile to the same canonical address ID, only the last resolved row is staged into canonical history/current writes for that chunk

If unmatched:

- HKGov ALS can still create a canonical `address2d` row under its own prepared source ID

Current canonical/source state is queried only for the source IDs and street-key candidates in the active parquet batch. The local pipeline does not preload the full current address or source-address table before ALS processing starts.

HKGov ALS does not currently drive canonical deletion:

- missing ALS rows do not close canonical current versions

## Source Retention

HKGov ALS-specific source rows are retained in:

- `hkgovAlsAddresses2d`
- `hkgovAlsAddress2dI18n`

Shared source-version behavior is documented in
[ResourceType common processing](../../resourceType/common.md#source-retention).

Current retained source fields include:

- `sourceRecordId`
- `versionHash`
- `releaseId`
- `validFromRelease`
- `validToRelease`
- `isCurrent`
- `identifiers` JSON with `geoAddress` and `csuId`
- `easting`
- `northing`
- `geometry`
- `districtCode`
- `districtName`
- `estateName`
- `buildingName`
- `blockNumber`
- `blockDescriptor`
- `phaseName`
- `phaseNumber`
- `floor`
- `unit`
- `streetNumber`
- `streetName`
- `villageName`
- `sources` JSON
- `rawProperties`

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

## SQL Import Mode

ALS address ingestion writes generated import files under the local release
cache in `.local/harbour-sql/releases/<target>/<releaseCode>/`. The shared local
SQL upload, import ordering, and rollback behavior are documented in
[ResourceType common processing](../../resourceType/common.md).
