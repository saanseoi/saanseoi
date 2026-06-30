# Overture Address

This document describes the Overture-specific side of the address pipeline.

Related family doc:

- [Address family](../../families/address.md)

## Dataset Role

- Dataset metadata uses `publisherCode: overture`, `code: ds-hk-overture-address`.
- Uploads are ingested directly from parquet.
- The worker path is `apps/harbour-workers/src/lib/services/address.ts`.
- In runtime terms, Overture currently acts as the base address feed for canonical `address2d`.
- For snapshot-source provenance, Overture releases are currently recorded with role `enrichment`.

## Source Fields Used

The worker currently projects these Overture fields:

- `id`
- `address_levels`
- `street`
- `number`
- `geometry`
- `bbox`
- `sources`
- `version`

Fields not currently projected into canonical address rows include:

- `postcode`
- any building-, phase-, floor-, unit-, or village-level structure
- other Overture fields outside the subset above

## Upload-Time Parquet Repacking

Overture address parquet files can arrive with very large row groups. The Harbour
CLI rewrites Overture address uploads before dispatch so the R2 object has 2,048
row parquet groups while preserving the original schema and row count.

This is an ingestion-runtime optimization:

- the release still registers as `address.parquet`
- schema inspection and upload planning still use the source file semantics
- worker reads use 2,048-row windows and parquet offset indexes when available
- the smaller physical row groups keep Cloudflare Worker decode memory bounded

## Normalization

For each Overture row, the worker:

- uses Overture `id` as the source ID
- derives `areaId` from the first `address_levels` entry
- derives `districtId` from the second `address_levels` entry
- normalizes Hong Kong area aliases such as `HK`, `KLN`, and `NT`
- stores point geometry as parsed GeoJSON
- stores `bbox`
- stores `sources` as `{ "overture": <pruned row.sources> }`
- creates one `en` i18n row only
- formats the address as `<number> <street>` when both exist

Current Overture canonical contribution is therefore mostly:

- canonical address identity seed
- point geometry
- bbox
- English street text
- source provenance

Current non-contributions:

- `zh-hant` address text
- `identifiers`
- building and estate components

The worker processes parquet rows in small write batches and reads 2,048-row parquet windows from R2. Upload-time repacking keeps those read windows aligned with the physical row groups used during worker ingestion.

Large address releases are processed as sequential queue chunks. Each queue
message carries one parquet row range (`rowStart`, `rowEnd`) plus a stable
`processingRunStartedAt` marker. Upload finalization/requeue preplans all row
ranges and enqueues them up front; intermediate chunks leave the release phases
running, and only the final chunk runs missing-row cleanup, publishes the
snapshot, and completes `processDataset`.

The row-range plan relies on the harbour-workers queue consumer remaining
serial (`max_batch_size: 1`, `max_concurrency: 1`), because the first current
stage initializes the draft current snapshot before later ranges apply deltas.

Each row range is split into dedicated worker stage services that run inside the
same queue event:

- `normalize`: reads the parquet range, normalizes source rows, computes source payload hashes, and writes a normalized R2 artifact
- `source`: reads the normalized artifact and writes only source current/source version tables
- `history`: resolves canonical IDs, writes canonical history/version rows, and writes a resolved R2 artifact
- `current`: materializes changed canonical current rows and touches all seen current rows with the run marker
- `finalize`: performs missing-row cleanup and allows publish/completion to continue

## Canonical Impact

When no existing canonical row is matched:

- Overture `id` becomes canonical `address2d.id`

When a canonical row is matched:

- Overture can update the canonical row’s geometry, bbox, and source payload

Current canonical/source state is queried only for the source IDs and street-key candidates in the active parquet batch. The worker does not preload the full current address or source-address table before processing starts.

Overture is also the only source that currently drives canonical deletion:

- if an address disappears from the latest Overture release, the canonical current version can be closed
- missing-row cleanup scans cloned current rows in keyset pages and deletes rows whose `updatedAt` marker was not touched by any chunk in the release
- source-current cleanup uses the release ID advanced onto changed or unchanged source rows, then deletes current source rows still pointing at an older release

## Source Retention Tables

Current-state source tables:

- `sourceOvertureAddresses2d`
- `sourceOvertureAddress2dI18n`

Version tables:

- `sourceOvertureAddresses2dVersions`
- `sourceOvertureAddress2dI18nVersions`

For later releases with unchanged source payloads, the worker advances the current row to the new release without inserting another source version row.

Current retained source fields include:

- `releaseId`
- `datasetId`
- `sourceRecordId`
- `sourcePayloadHash`
- `regionCode`
- `version`
- `geometry`
- `bbox`
- `streetName`
- `streetNumber`
- `sources`
- `rawProperties`

Localized source retention currently stores:

- `streetName`
- `locality`
- `region`
- `country`

In the current worker flow, only `streetName` is populated for Overture address i18n rows and the other localized source fields remain `null`.
