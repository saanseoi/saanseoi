# Overture Address

This document describes the Overture-specific side of the address pipeline.

Related docs:

- [Address family](../../families/address.md)
- [Address resourceType](../../resourceType/address.md)
- [ResourceType common processing](../../resourceType/common.md)

## Dataset Role

- Dataset metadata uses `publisherCode: overture`, `code: ds-hk-overture-address`.
- Uploads are ingested from parquet by the local SQL pipeline.
- Shared address pipeline code lives under `libs/core/src/pipeline/services/addressPipeline`.
- In runtime terms, Overture currently acts as the base address feed for canonical `address2d`.
- For snapshot-source provenance, Overture releases are currently recorded with role `enrichment`.

## Source Fields Used

The local pipeline currently projects these Overture fields:

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

This is a local ingestion-runtime optimization:

- the release still registers as `address.parquet`
- schema inspection and upload planning still use the source file semantics
- local reads use 2,048-row windows and parquet offset indexes when available
- the smaller physical row groups keep local SQL processing from decoding oversized row groups

## Normalization

For each Overture row, the local pipeline:

- uses Overture `id` as the source ID
- derives `areaId` from the first `address_levels` entry by normalizing it to the retained source `area` enum and resolving that enum against the same-cohort published division snapshot
- derives `districtId` from the second `address_levels` entry by normalizing it to the retained source `district` enum and resolving that enum against the same-cohort published division snapshot
- normalizes Hong Kong area aliases such as `HK`, `KLN`, and `NT`
- retains source-level `area` and `district` enum codes from the first two `address_levels` entries
- prepares the division lookup once for the address ingest run and reuses it across pipeline chunks
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

The local pipeline processes parquet rows in small batches and reads 2,048-row parquet windows from the cached parquet file. Upload-time repacking keeps those read windows aligned with the physical row groups used during ingestion.

The Overture `2025-09-24.0` Hong Kong SAR address parquet was checked directly:
all 182,155 rows have exactly two `address_levels` entries. The observed levels
are the Hong Kong area code (`HK`, `KLN`, or `NT`) followed by one of the 18
district names; no town, village, neighbourhood, or lower-level address level is
present in that file.

Large address releases are processed as local parquet chunks. Each chunk carries
one row range (`rowStart`, `rowEnd`) plus a stable `processingRunStartedAt`
marker. The shared chunking, release-ordering, and local SQL lifecycle are
documented in [ResourceType common processing](../../resourceType/common.md).

Each row range is still split into dedicated local stage services:

- `normalize`: reads the parquet range, normalizes source rows, computes source payload hashes, and writes a normalized local artifact
- `source`: reads the normalized artifact and writes only source current/source version tables
- `history`: resolves canonical IDs, writes canonical history/version rows, and writes a resolved local artifact
- `current`: materializes changed canonical current rows and touches all seen current rows with the run marker
- `finalize`: performs missing-row cleanup and allows publish/completion to continue

The staged SQL import builder can emit Overture source SQL from normalized
address artifacts. It stages normalized rows and localized rows, computes changed
source IDs in SQL, closes prior source versions, upserts current source rows,
replaces changed localized source rows, and inserts source version rows with
`INSERT ... SELECT ... ON CONFLICT`. Canonical history/current SQL is generated
from resolved artifacts after TypeScript has resolved canonical IDs and computed
canonical `versionHash` values.

SQL artifacts are written under `.local/harbour-sql/releases/<target>/<releaseCode>/`.
The local SQL path also writes a meta SQL artifact for the draft address
snapshot, its `snapshotSources` link, assembly run, and history shard assignment;
that meta artifact is imported before the release is published so Harbour can
resolve the snapshot during publish.
Shared import ordering is documented in
[ResourceType common processing](../../resourceType/common.md).

## Canonical Impact

When no existing canonical row is matched:

- Overture `id` becomes canonical `address2d.id`

When a canonical row is matched:

- Overture can update the canonical row’s geometry, bbox, and source payload
- if multiple Overture rows in one chunk reconcile to the same canonical address ID, only the last resolved row is staged into canonical history/current writes for that chunk

Current canonical/source state is queried only for the source IDs and street-key candidates in the active parquet batch. The local pipeline does not preload the full current address or source-address table before processing starts.

Overture is also the only source that currently drives canonical deletion:

- if an address disappears from the latest Overture release, the canonical current version can be closed
- missing-row cleanup scans cloned current rows in keyset pages and deletes rows whose `updatedAt` marker was not touched by any chunk in the release
- source-current cleanup uses the release ID advanced onto changed or unchanged source rows, then deletes current source rows still pointing at an older release

## Source Retention

Overture-specific source rows are retained in:

- `overtureAddresses2d`

Shared source-version behavior is documented in
[ResourceType common processing](../../resourceType/common.md#source-retention).

Current retained source fields include:

- `sourceRecordId`
- `versionHash`
- `releaseId`
- `validFromRelease`
- `validToRelease`
- `isCurrent`
- `version`
- `geometry`
- `bbox`
- `area`
- `district`
- `unit`
- `streetName`
- `streetNumber`
- `sources`
- `rawProperties`

Overture address source retention does not use localized source rows; Overture
does not provide i18n variance for street names in this dataset. `streetName`
is retained directly on `overtureAddresses2d`.

`area` is nullable and uses these source enum codes:

- `HK` for Hong Kong
- `KL` for Kowloon, including `KLN`
- `NT` for New Territories

`district` is nullable and uses these source enum codes:

- `CW` Central & Western
- `EST` Eastern
- `ILD` Islands
- `KLC` Kowloon City
- `KC` Kwai Tsing
- `KT` Kwun Tong
- `NTH` North
- `SK` Sai Kung
- `ST` Sha Tin
- `SSP` Sham Shui Po
- `STH` Southern
- `TP` Tai Po
- `TW` Tsuen Wan
- `TM` Tuen Mun
- `WC` Wan Chai
- `WTS` Wong Tai Sin
- `YTM` Yau Tsim Mong
- `YL` Yuen Long
