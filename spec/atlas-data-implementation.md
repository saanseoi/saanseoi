# Atlas Data Implementation

## Purpose

This document is the current implementation guide for Atlas ingestion.

It replaces the older `places`-first view with the actual monthly dependency order:

1. `division`
2. `address`
3. `place`

The goal is simple:

- Harbour accepts and stages raw parquet uploads in `R2`
- a deferred processor turns staged parquet into normalized Atlas tables in `D1`
- each dataset type is processed independently, but in dependency order

## Current reality

What already exists:

- upload planning and validation
- direct upload to `R2`
- `finalizeUpload`
- dataset metadata in `datasets`
- phase tracking in `ingestRuns`
- normalized schema for divisions, addresses, streets, places, and i18n tables

What does not exist yet:

- post-finalize processing task dispatch
- parquet extraction workers
- dataset publication logic
- address and place reconciliation flows

## Core architecture

Use:

- `R2` for raw parquet
- `D1` for normalized and serving tables
- `harbour-api` for upload, staging, and ingest orchestration
- `harbour-workers` a Cloudflare queue-backed processor for deferred extraction work

Recommended processing contract:

1. `requestUpload`
2. direct client upload to `R2`
3. `finalizeUpload`
4. enqueue `processDataset`
5. run dataset-specific stages
6. publish dataset

`finalizeUpload` should stay small and synchronous. The heavy parquet work should happen in a background queue consumer.

## Queue and memory rules

### Queue

Add a Cloudflare Queue now.

Reason:

- `finalizeUpload` should not do heavy processing
- ingest must be retryable
- ingest phases should be resumable
- large parquet reads should not run inside the upload request path

Suggested queue message shape:

```json
{
  "datasetId": "overture-hk-2026-05-24.0-division",
  "type": "division",
  "regionCode": "hk",
  "source": "overture",
  "sourceVersion": "2026-05-24.0",
  "rawObjectKey": "raw/overture/hk/2026-05-24.0/division.parquet"
}
```

### Memory

Do not read the full parquet file into memory.

The safe approach is:

- read the object as a stream or array-buffer only in bounded chunks
- process row groups or record batches incrementally
- write database changes in batches
- keep only the working set needed for the current chunk

If the parquet library cannot process incrementally, treat that as a blocker for Worker-native processing. With a 128 MB budget, full in-memory loads are not reliable enough for monthly production ingest.

## Dataset lifecycle

Each dataset moves through:

1. `uploading`
2. `staged`
3. `processing`
4. `active` or `failed`
5. `revoked` if superseded by a corrected release

`ingestRuns` should track each named stage with:

- `queued`
- `running`
- `completed`
- `error`

## Canonical processing order

The dependency order is fixed:

1. divisions first
2. addresses second
3. places last

That order applies both:

- across monthly uploads
- within implementation priority

## Shared implementation rules

All dataset types should share the same baseline behavior:

- validate schema before processing
- normalize source values into canonical shapes
- compute deterministic version hashes
- compare against the current row for the same canonical id
- insert a new version row only when content changed
- upsert the current-state table
- close out missing current rows as real deletions when the entity disappears from the new active dataset
- record stage progress in `ingestRuns`

## Division dataset

This is the first real extractor to implement.

### Stages

1. `extractCore`
2. `extractI18n`
3. `publishDataset`

### `extractCore`

For each division row:

- notify Harbour that `extractCore` started
- parse a bounded parquet chunk
- normalize the division payload
- compute `otVersionHash`
- compare with the current `divisionsVersions` row for the same `id`
- insert or update `divisionsVersions`
- upsert `divisions`

Deletion rule:

- if a previously current division is missing from the new staged dataset, treat it as deleted
- mark the old current version no longer current
- close its validity window

### `extractI18n`

After base division extraction completes:

- notify Harbour that `extractCore` completed
- notify Harbour that `extractI18n` started
- resolve localized names from `names.common` and `names.rules`
- upsert `divisionsI18n`
- write matching history rows to `divisionsVersionsI18n` when needed
- notify Harbour that `extractI18n` completed

### Division implementation notes

- divisions are managed entities
- later address and place ingest may reference divisions
- later ingest must not create missing divisions implicitly - missing divisions should be addes to the issue table so they can be investigated by the admin

## Address dataset

Addresses depend on divisions already being available.

### Stages

1. `extractCore`
2. `extractI18n`
3. `reconcileStreets`
4. `deriveAddress3d`
5. `publishDataset`

### `extractCore`

For each address row:

- normalize the source payload
- resolve division foreign keys against existing managed divisions
- derive the deterministic `canonicalKey`
- compute version hashes
- compare against the current address row
- update `address2dVersions`
- upsert `address2d`

Deletion rule:

- if a previously current canonical address is absent from the new active address dataset, treat it as deleted

### `extractI18n`

- normalize localized formatted-address fields
- upsert `address2dI18n`
- write `address2dVersionsI18n` as needed

### `reconcileStreets`

- normalize street identity from address payloads
- add issues to the table if there are addresses with missing streets. Because streets is a managed dataset, we should not upsert `streets` and `streetsVersions`, `streetsI18n` - but only notify the admin of discrepancies. To be specified later.
- populate `streetsAddress`

## Place dataset

Places depend on divisions and addresses already being available.

### Stages

1. `extractCore`
2. `extractI18n`
3. `reconcileAddress`
4. `reconcileDivision`
5. `refreshSpatialIndex`
6. `refreshFts`
7. `publishDataset`

### `extractCore`

For each place row:

- normalize the source payload
- compute `otVersionHash`
- compare with the current row for the same `id`
- update `placesVersions`
- upsert `places`

Deletion rule:

- if a previously current place is absent from the new active dataset, treat it as deleted

### `extractI18n`

- resolve localized names from `names.common` and `names.rules`
- resolve localized brand values from `brand.names.common` and `brand.names.rules`
- upsert `placesI18n`
- write `placesVersionsI18n` as needed

### Reconciliation and derived indexes

- match places to existing `address2d` and `address3d`
- link places to existing managed divisions
- refresh `placesCells`
- rebuild `placesFts`

## Publication rules

Publishing should be explicit and last.

For any dataset type:

- mark the processed dataset active
- revoke or deactivate the superseded dataset if this is a replacement
- ensure only one active lineage exists for the intended region and type

Do not publish partial work.

## Immediate implementation order

Implement in this order:

1. add Cloudflare Queue config and a `processDataset` message contract
2. enqueue a processing task after `finalizeUpload`
3. add ingest-run helpers for queued, running, completed, and failed stage updates
4. implement `division` parquet extraction in chunked batches
5. implement division versioning, deletion handling, and i18n extraction
6. implement dataset publication for `division`
7. implement `address` extraction and reconciliation
8. implement `place` extraction and downstream indexes

## Constraints

- do not process full parquet files in memory
- do not create divisions during address or place ingest
- do not treat FTS or spatial indexes as canonical state
- do not publish a dataset until all required stages for that type complete
