# Address ResourceType

This document describes how the address resourceType is currently composed across
sources.

Related source-specific docs:

- [Overture address](../sources/overture/address.md)
- [HKGov ALS address](../sources/hkgov/address.md)

## Scope

The address resourceType currently has two seeded source datasets in meta:

- `publisherCode: overture`, `code: ds-hk-overture-address`
- `publisherCode: hkgov-dpo`, `code: ds-hk-hkgov-dpo-address`

Both feed the same canonical address resourceType, but they arrive in different shapes
and play different roles in the merge flow.

## Merge Order

### Division snapshot dependency

- Address processing depends on an already-published division snapshot.
- Overture address ingestion resolves `areaId` and `districtId` from source
  `area`/`district` enums against the same-cohort published division snapshot, falling
  back to the latest published division snapshot only when an exact cohort snapshot is
  unavailable.
- HKGov ALS preparation also resolves those IDs from the latest division snapshot before
  local SQL ingestion.
- Publishing an address API release set includes the same-region, same-cohort division
  snapshot as a required `supporting` snapshot when that snapshot exists. This preserves
  the source-release-to-API release relationship alongside the primary address snapshot.

### Overture must arrive first

- Upload planning rejects `hkgov-dpo` address uploads unless the same `cohortKey`
  already has an Overture address upload.
- This is enforced in `libs/core/src/lib/services/upload.ts`.

Current practical meaning:

- Overture establishes the base address set.
- HKGov ALS reconciles against that base and can enrich or overwrite matched canonical
  rows.

## Reconciliation

The local pipeline tries to match each incoming source row to an existing canonical
address in this order:

1. direct match on canonical `id == sourceId`
2. fallback match on a derived street key

The derived match key is:

- `districtId::normalizedStreetName::normalizedStreetNumber`

Implications:

- there is no explicit cross-source address mapping table
- HKGov ALS can merge into an Overture-backed canonical row when the street key matches
- if nothing matches, the incoming source row creates a canonical `address2d` row under
  its own source ID

Runtime behavior:

- reconciliation is performed per parquet processing batch
- the local pipeline looks up only the current canonical rows matching incoming source
  IDs and derived street keys for that batch
- if multiple rows in the same batch resolve to the same canonical `address2d.id`, the
  pipeline keeps only the last resolved row for that canonical ID before staging
  canonical history/current writes
- canonical history staging therefore emits at most one base version row and one i18n
  row per locale for each resolved canonical address ID in a batch
- it does not preload the full region-wide current address history map before row
  processing
- large releases are split into local parquet row ranges by the CLI
- each row range runs through separate `normalize`, `source`, `history`, and `current`
  local stages, with local artifacts carrying normalized and resolved rows between
  stages
- final cleanup uses a stable current-row `updatedAt` marker and current source-row
  `releaseId`, so release-wide seen address/source IDs do not need to be retained in
  memory

## Staged SQL Import Mode

Address ingestion uses the SQL import builder in
`libs/core/src/pipeline/services/addressPipeline/sqlImport.ts`.

Purpose:

- generate SQL artifacts that can be uploaded through the Cloudflare D1 REST import API
- avoid D1's bound-parameter limit during bulk writes
- reduce D1 round trips by replacing small Drizzle insert/update batches with set-based
  SQL

Current scope:

- normalized chunk artifacts can generate source-database staging and source
  current/version apply SQL
- resolved chunk artifacts can generate history-database and current-database
  staging/apply SQL
- the existing TypeScript normalization, canonical ID resolution, and `versionHash`
  generation remain authoritative

Operational shape:

- generated source SQL stages normalized rows in `stagingOvertureAddresses2d` and
  `stagingOvertureAddresses2dI18n`
- generated history/current SQL stages resolved rows in `zzAddressImportResolvedRows`
  and `zzAddressImportResolvedI18n`; current SQL drops them after each current apply,
  history-apply drops them after history apply, and final cleanup drops them as an
  idempotent fallback
- apply statements use `UPDATE ... WHERE EXISTS`, `INSERT ... SELECT ... ON CONFLICT`,
  and release/snapshot markers instead of per-row mutations
- first-chunk current initialization clones only the latest published address snapshot
  for the same region before applying the release delta
- generated `INSERT` statements are byte-limited below D1's individual SQL statement
  limit; use row-count chunks such as 10,000 only as a planning input, not as the SQL
  safety boundary
- imports remain target-specific because source, history, current, and meta live in
  separate D1 databases

Current operational shape:

- Harbour registers the release and records ingest-phase progress.
- The CLI runs the address SQL pipeline locally against a local SQLite copy of the
  target D1 databases.
- Intermediate normalized JSON, resolved JSON, and SQL artifacts are written under
  `.local/harbour-sql/releases/<target>/<releaseCode>/`.
- Remote preview/production imports still land in D1 through the Cloudflare D1 import
  API, but the SQL is uploaded from the local machine.
- Remote preview/production runs mirror a resourceType-specific local D1 cache: meta,
  division lookup/current tables, address current/history tables, and the address source
  tables required by the release. The cache is scoped by target, source version, cohort,
  region, and resourceType, so rerunning the same release reuses a validated cache.
  Source/history version tables are retained in the cache only for current rows
  (`isCurrent = 1`).
- Local target imports write directly to the local D1 SQLite files.
- Local SQLite writes and Harbour control calls that fail with transient
  `SQLITE_BUSY`/`database is locked` errors are retried with backoff before the upload
  is failed. Local SQL imports retry up to eight times; Harbour control calls retry up
  to three times. The CLI prints each retry attempt in the active progress UI.

Release precedence is enforced before processing starts:

- a `staged` release only starts when it is the newest non-failed release for its
  dataset lineage
- if a newer sibling release is already `staged` or `processing`, the older local upload
  fails fast instead of waiting
- if a newer sibling has already reached a terminal non-failed state, the older release
  is marked `superseded` instead of processing out of order

Local SQL processing uses the shared stage split from `libs/core/src/pipeline`, and the
CLI executes it as phased local work:

- `normalize` reads each parquet range and writes normalized JSON artifacts
- `sql-source` writes source-table import SQL from normalized artifacts
- `sql-history` resolves canonical IDs, writes resolved JSON artifacts, and writes
  history-table import SQL
- `sql-current` writes current-table import SQL, including first-chunk current-snapshot
  initialization SQL and one deferred history-apply file for the full run
- local orchestration runs those generation phases across disjoint chunks with bounded
  concurrency, then imports source/history/current/meta SQL with per-database
  concurrency and finishes with publish

## Canonical Tables

The address resourceType currently writes these canonical current tables:

- `address2d`
- `address2dI18n`

It also writes these canonical history tables:

- `address2d`
- `address2dI18n`

It does not currently populate:

- `address3d`
- `address3dI18n`
- `streetsAddress`

### Canonical field composition

`address2d` is source-dependent:

- `id`: existing canonical ID if matched, otherwise the incoming source ID
- `divisionSnapshotId`: latest published division snapshot for Overture rows, prepared
  ALS division snapshot for HKGov rows
- `districtId`, `areaId`, `countryId`: resolved from division lookups
- `geometry`: Overture point geometry or prepared ALS geometry
- `identifiers`: `null` for Overture, parsed prepared ALS identifiers for HKGov
- `bbox`: Overture only, `null` for HKGov
- `sources`: `{ overture: ... }` for Overture rows, parsed prepared ALS sources for
  HKGov rows

`address2dI18n` currently behaves like this:

- Overture usually contributes a single `en` row with `formattedAddress`,
  `streetNumber`, and `streetName`
- HKGov contributes richer `en` and `zh-hant` rows with `formattedAddress`,
  `buildingName`, `estateName`, `streetNumber`, and `streetName`

Because the canonical row is rewritten from the matched source row, a matched HKGov row
can replace previously Overture-only canonical fields for the same address ID.

## Source Retention

The resourceType also retains normalized per-source rows in versioned source database
tables. The current source row is the row where `isCurrent = 1`; there are no separate
non-version current source tables.

- `overtureAddresses2d`
- `hkgovAlsAddresses2d`
- `hkgovAlsAddress2dI18n`

Shared behavior:

- source rows are keyed by `sourceRecordId + versionHash`
- `isCurrent = 1` rows store the latest normalized payload per source record
- previous current source versions are closed with `validToRelease`
- source history is separate from canonical address history
- unchanged source payloads only advance current-row `releaseId`; they do not create new
  source rows
- address ingestion looks up current source rows only for source IDs present in the
  current parquet batch
- Overture address source rows keep `streetName`, `area`, `district`, and `unit`
  directly on the base source table because Overture does not provide street-name i18n
  variance

## Stats Produced

Atlas-facing address summaries should be written as `type = apiReleaseSet` stats against
the API release set. The standard rows are:

- `records/count/count` total for primary `address2d` rows
- `records/count/count` grouped by `table` for `address2d` and `address3d`
- `localized_records/count/count` grouped by `table` for `address2dI18n` and
  `address3dI18n`
- `detail_records/count/count` grouped by `table`, `groupValue = address3d`
- `localized_detail_records/count/count` grouped by `table`,
  `groupValue = address3dI18n`
- locale completeness rows: `locale_count`, `locale_coverage`,
  `locale_coverage_non_inferred`, and `locale_alt_coverage`
- churn rows for `count`, `added_count`, `changed_count`, `unchanged_count`, and
  `removed_count`, optionally grouped by `table` for `address2d` and `address3d`
- quality rows for `division_linked_count`, `street_linked_count`,
  `missing_division_count`, `missing_street_count`, `geometry_changed_count`,
  `locale_regression_count`, and `name_regression_count`

## Versioning and Deletion

Canonical address history is snapshot-aware but deduped by `(id, versionHash)`.

Current behavior:

- a new draft address snapshot bulk-clones the latest non-archived snapshot before
  applying incoming deltas
- address snapshot cloning and division-snapshot alignment run only on the first
  row-range chunk
- division-snapshot alignment rewrites carried-forward rows onto the target division
  snapshot and nulls any division FK whose ID is no longer present there, so cohort
  rollovers do not fail on stale references
- changed rows close prior current versions and insert a new current version
- unchanged rows are carried forward in the cloned current snapshot without rewriting
  canonical history rows, but are touched with the stable run marker so final cleanup
  knows they were seen
- snapshot-to-release membership is tracked through `snapshotSources`, not a per-record
  provenance table in the processing hot path
- missing-row cleanup scans current rows in keyset pages and removes rows that were not
  touched by any release chunk

SQL-mode address ingestion keeps TypeScript responsible for parquet reads,
normalization, canonical ID resolution, and canonical `versionHash` generation. Bulk D1
writes are emitted as SQL artifacts under the local release cache, where target is
`source`, `history`, `history-apply`, or `current`.

After SQL generation, local orchestration imports artifacts in database order:

- source shard SQL first
- history shard SQL second, with one deferred `history-apply` import after all history
  staging files
- current SQL third, with current snapshot init files before current deltas

Address cohorts before 2025 use the region-scoped `DB_SOURCE_HK_BEFORE` and
`DB_HISTORY_HK_BEFORE` bindings rather than the 2025 year shard.

- publish last, after all SQL artifacts import successfully

Deletion is asymmetric:

- Overture uploads can close canonical addresses that disappeared from the latest
  Overture release
- HKGov ALS uploads do not delete canonical addresses
- missing-row cleanup scans current IDs in keyset pages instead of materializing the
  full current address/source corpus

So, in runtime terms:

- Overture defines base address existence
- HKGov ALS acts as a non-deleting reconciliation and overwrite layer

## API Support

### Registry endpoint metadata

The fixture-backed registry declares four address endpoint aliases for
`api-addresses-v0.1`:

- `GET /v0/addresses`
- `GET /v0.1/addresses`
- `GET /v0/addresses/{id}`
- `GET /v0.1/addresses/{id}`

These are declared in `fixtures/meta/apiEndpoints/api-addresses-v0.1.json` and synced by
`libs/db/src/registry/meta.ts`.

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

- `/v0/{region}/places/{id}` does not currently hydrate and return the referenced
  address object

## Metadata vs Runtime Role Labels

Snapshot-source metadata currently labels:

- HKGov ALS as `primary`
- Overture as `enrichment`

That matches `prepareAddressVersionInsertContext` and the endpoint metadata, but the
implemented canonical flow still behaves more like:

- Overture = base address set
- HKGov ALS = richer reconciliation layer on top of that base

## Latest Release Rollback

`saanseoi rollback:release --release <release-id|code>` can generate and import rollback
SQL for the active latest address release only. The rollback SQL removes the latest
release's current snapshot rows, deletes source/history rows inserted for that release,
reopens rows that were closed by that release, resets the previous published release
metadata, and removes the latest release metadata.
