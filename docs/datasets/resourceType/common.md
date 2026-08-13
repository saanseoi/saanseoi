# ResourceType Processing Common Model

This document describes the shared processing model for local SQL-backed resourceTypes.
ResourceType-specific pages should describe only the source mix, canonical table shape,
merge semantics, and exceptions from this common flow.

Current resourceType pages:

- [Address](address.md)
- [Division](division.md)

## Upload Entry Point

ResourceType uploads use the shared `saanseoi upload <file>` command. The CLI inspects
`resourceType + source`, selects the matching local SQL pipeline, and runs the heavy
dataset processing on the local machine instead of inside Cloudflare Workers.

Harbour still owns release registration and ingest-phase progress recording. For
`--target local`, the CLI records the upload session directly in the local SQLite
`DB_META` file instead of posting the parquet through the local Harbour Worker. The
prepared raw parquet is then copied into the release workspace under
`.local/harbour-sql/releases/<target>/<releaseCode>/objects/`.

## Upstream Release Notes

Every uploaded release records its upstream release-notes URL in `DB_META.releases`. The
CLI keys its local cache by the generated release code. Existing version-1 entries are
migrated when first read. Pass `--release-notes-url URL` to set or replace a value;
otherwise the CLI uses the cached value and prompts only when that key is unknown. Known
Overture releases are built in with theme-specific anchors (`#divisions` and `#places`)
so the public source registry links directly to the relevant upstream section.

The local CLI runs against local SQLite copies of the target D1 databases, then imports
generated SQL into the configured target:

- remote preview/production imports use the Cloudflare D1 REST import API
- local target imports write directly to local D1 SQLite files

Intermediate normalised JSON, resolved JSON, and SQL artefacts are written under
`.local/harbour-sql/releases/<target>/<releaseCode>/`.

## Release Ordering

Release precedence is enforced before local processing starts:

- a `staged` release only starts when it is the newest non-failed release for its
  dataset lineage
- if a newer sibling release is already `staged` or `processing`, the older local upload
  fails fast instead of waiting
- if a newer sibling has already reached a terminal non-failed state, the older release
  is marked `superseded` instead of processing out of order

## Local SQL Stages

Local SQL processing uses the shared stage split from `libs/core/src/pipeline`. The CLI
executes it as phased local work:

- `normalise` reads each parquet range and writes normalised JSON artefacts
- `sql-source` writes source-table import SQL from normalised artefacts
- `sql-history` resolves canonical IDs, writes resolved JSON artefacts, and writes
  history-table import SQL
- `sql-current` writes current-table import SQL, including first-chunk current-snapshot
  initialisation SQL when needed

The local orchestrator runs generation phases across disjoint chunks with bounded
concurrency, then imports generated SQL with per-database concurrency. Publishing
happens only after all required SQL artefacts import successfully.

## SQL Import Features

The staged SQL import mode exists to:

- generate SQL artefacts that can be uploaded through the Cloudflare D1 REST import API
- avoid D1's bound-parameter limit during bulk writes
- reduce D1 round trips by replacing small Drizzle insert/update batches with set-based
  SQL

Generated `INSERT` statements are byte-limited below D1's individual SQL statement
limit. Row-count chunks, such as 10,000 rows, are planning inputs and not the final SQL
safety boundary.

TypeScript remains authoritative for parquet reads, normalisation, canonical ID
resolution, and canonical `versionHash` generation. SQL artefacts are the bulk write
transport.

## Database Targets

SQL artefacts are grouped by target database because source, history, current, and meta
data live separately:

- `DB_SOURCE_*` stores source-retained version rows
- `DB_HISTORY_*` stores canonical version history
- `DB_CURRENT` stores the cloned-and-patched current snapshot
- `DB_META` stores release-, snapshot-, and API-release-set stats when a pipeline
  produces them

After SQL generation, local orchestration imports artefacts in database order:

- source shard SQL first
- history shard SQL second, including any deferred history-apply SQL after all history
  staging files
- current SQL third, with current snapshot init files before current deltas
- meta SQL when produced by the resourceType
- publish last

## Snapshots

Processing creates or reuses a resourceType-scoped draft snapshot via
`ensureDraftSnapshotForRelease`. Persistent lineages record the previous cohort as the
revision-zero parent; cohort-scoped lineages start each cohort at a root. Same-cohort
revisions point to the previous revision. Writers may bulk-clone only that exact
`parentSnapshotId`; a missing materialisation is an error and must never fall back to
the latest published snapshot.

For remote preview/production SQL uploads, the CLI mirrors the target D1 tables into a
persistent per-target local cache under `.local/harbour-sql/db-cache`. Source/history
version tables are pruned to current rows in that cache because upload diffing and
reconciliation only need rows where `isCurrent = 1`. Wrangler D1 export still exports
tables rather than filtered row sets, so the pruning happens as the exported data is
imported into the local SQLite cache. After a remote SQL upload publishes successfully,
the CLI replays the generated source/history/current SQL into that local cache and
refreshes the cached `DB_META` file from remote. If cache replay or meta refresh fails,
the cache manifest is invalidated so the next upload rebuilds from remote instead of
diffing against stale state.

The post-publish `DB_META` refresh retries transient remote-export failures with
exponential backoff before invalidating the cache. This preserves the replayed local
source/history/current SQL cache when Wrangler has a short-lived connectivity failure.

Each replay has a durable per-release checkpoint under the target cache. Generated SQL
is idempotent, so transient local replay failures are retried before the cache is
invalidated and a remote clone is required. `--continue` only skips a published
SQL-backed release when its cache record has a valid snapshot lineage and source
membership, required shard assignments, and a materialised current snapshot.

At year rollover, uploads may need both the new year's source/history shards and earlier
source/history shards for continuity checks. The cache resolver reuses any locally valid
cached shard files from earlier years and mirrors only missing or invalid bindings, so a
new year should not force a full re-download of all previous-year shard databases.
Datasets with a cohort before 2025 use the region-scoped `DB_SOURCE_<REGION>_BEFORE` and
`DB_HISTORY_<REGION>_BEFORE` shards. These are yearless metadata assignments and must
not fall back to the 2025 shard. Year-rollover cache preparation also includes the
`BEFORE` shard when previous shard continuity is requested.

The uploaded release is linked to the snapshot through `snapshotSources`.
Snapshot-to-release membership is tracked at the snapshot level rather than by writing
per-record provenance during local SQL ingestion.

## Source Retention

ResourceTypes retain normalised per-source rows in versioned source database tables. The
current source row is the row where `isCurrent = 1`; there are no separate non-version
current source tables.

Shared source-version behaviour:

- source rows are keyed by `sourceRecordId + versionHash`
- `isCurrent = 1` rows store the latest normalised payload per source record
- changed source payloads close the previous current source row and insert a new current
  source row
- unchanged source payloads do not create new source rows; only current-row metadata
  advances to the latest release
- source history is separate from canonical resourceType history
- full-snapshot pipelines close missing source rows by clearing `isCurrent` and setting
  `validToRelease`

## Canonical Versioning

Canonical history is snapshot-aware and deduped by `(id, versionHash)`.

Shared behaviour:

- changed canonical rows close prior current versions and insert new current versions
- unchanged rows can be carried forward by snapshot cloning instead of being rewritten
  row-by-row
- missing-row handling is resourceType-specific because some sources define the complete
  canonical set while others only enrich it

## Latest Release Rollback

`saanseoi rollback:release --release <release-id|code>` can generate and import rollback
SQL for the active latest release of a supported resourceType. Rollback SQL removes the
latest release's current snapshot rows, deletes source/history rows inserted for that
release, reopens rows that were closed by that release, resets previous published
release metadata, and removes the latest release metadata.

## API Metadata

Fixture-backed endpoint metadata declares which public API aliases belong to a
resourceType. Those fixtures are synced by `libs/db/src/registry/meta.ts`.

The resourceType-specific pages list the endpoint aliases and the routes that are
currently implemented in Atlas.
