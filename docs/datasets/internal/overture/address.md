# Overture Address

This document describes the Overture-specific side of the address pipeline.

Related docs:

- [Address resourceType](../../resourceType/address.md)
- [ResourceType common processing](../../resourceType/common.md)

- Upload registration stores the Overture release-notes URL with the `#addresses`
  anchor; see
  [ResourceType common processing](../../resourceType/common.md#upstream-release-notes).

## Processing Pipeline

Address uploads use a local staged SQL workflow:

- normalize the prepared parquet data and compute source payload hashes
- resolve canonical IDs and compute canonical `versionHash` values
- generate source, history, current, and meta SQL artifacts
- import the generated SQL, clean up temporary staging tables, and publish the release

The meta SQL creates the draft snapshot, its `snapshotSources` link, assembly run, and
history-shard assignment before publish. The default address lineage is owned by the
Overture address dataset and is shared by later HKGov-enriched revisions. Current
snapshot initialization clones the draft snapshot's exact `parentSnapshotId`; history
materialization likewise checks the latest published snapshot in that lineage. It does
not select a parent through whichever address source happens to be primary. This keeps
monthly Overture releases and same-cohort HKGov revisions on one unambiguous branch. The
cloned rows are then aligned to the exact Overture division snapshot for the address
cohort. Transient local SQLite lock failures during import or Harbour progress updates
are retried three times with backoff before the upload fails.

The shared non-SQL stage handlers are not the local CLI upload path. Shared import and
release-ordering details are documented in
[ResourceType common processing](../../resourceType/common.md).

## Canonical Impact

When no existing canonical row is matched:

- Overture `id` becomes canonical `address2d.id`

When a canonical row is matched:

- Overture can update the canonical row’s geometry, bbox, and source payload
- if multiple Overture rows reconcile to the same canonical address ID, only the last
  resolved row is staged into canonical history/current writes

Current canonical/source state is resolved from the source IDs and street-key candidates
needed for reconciliation. The local pipeline does not preload the full current address
or source-address table before processing starts.

Overture is also the only source that currently drives canonical deletion:

- if an address disappears from the latest Overture release, the canonical current
  version can be closed
- missing-row cleanup scans cloned current rows in keyset pages and deletes rows whose
  `updatedAt` marker was not touched during the release
- source-current cleanup uses the release ID advanced onto changed or unchanged source
  rows, then deletes current source rows still pointing at an older release

## Source Retention

Overture-specific source rows are retained in:

- `overtureAddresses2d`

Shared source-version behavior is documented in
[ResourceType common processing](../../resourceType/common.md#source-retention).

Overture address source retention does not use localized source rows; Overture does not
provide i18n variance for street names in this dataset. `streetName` is retained
directly on `overtureAddresses2d`.

## Division Enums

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
