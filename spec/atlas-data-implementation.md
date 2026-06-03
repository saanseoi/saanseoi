# Atlas Data Implementation

## Purpose

This document is the implementation baseline for the SaanSeoi Atlas data service.

It covers:

- current architectural decisions
- current implemented scaffolding
- canonical data and database conventions
- ingestion phases
- deployment and migration flow
- local development database workflow
- remaining implementation work in priority order

This document is the implementation source of truth for Atlas data work.

## Current scope

Atlas is no longer a `places`-only service.

The Worker will serve and ingest data across:

- places
- addresses
- divisions
- streets
- geocoding-derived address enrichment
- future related atlas entities

Current API work is still centered on `places`, but the storage and ingestion model is atlas-wide.

## Platform and runtime

- Cloudflare Workers with Hono
- Cloudflare D1 for canonical operational storage
- Cloudflare R2 for raw parquet and ingest artifacts
- Drizzle ORM for application-side schema access
- SQL migrations stored in-repo and applied through Wrangler

Current Worker names:

- preview Worker: `ss-atlas-preview`
- production Worker: `ss-atlas-production`

Current D1 databases:

- preview database: `ss-db-preview`
- production database: `ss-db-prod`

Current D1 binding name in the Worker:

- `DB`

## Canonical companion specs

This implementation spec depends on:

- [atlas-data-model.md](./atlas-data-model.md)
- [atlas-api.md](./atlas-api.md)

If this document and the implementation diverge, update both the code and the companion specs.

## High-level architecture

### Storage split

- `R2` stores raw monthly parquet extracts and other ingest artifacts
- `D1` stores:
  - dataset lifecycle metadata
  - canonical normalized entities
  - current serving projections
  - aliases
  - join tables
  - search and spatial indexes

### Dataset identity

Each dataset is identified as:

`datasetId = {regionCode}-{snapshotMonth}-{theme}`

Example:

- `hk-2026-05-places`

Only one dataset may be active for a given `(regionCode, snapshotMonth, theme)`.

### Correction handling

If Overture republishes a corrected release for an already released month:

- create a new immutable dataset row
- mark the prior dataset revoked and inactive
- set `supersedesDatasetId`
- rebuild or incrementally reconcile active state from the replacement dataset

Public reads always use active datasets only.

### ID strategy

There are two classes of IDs:

- canonical IDs from Overture/GERS where available
- SaanSeoi-generated IDs with the `SS` prefix where canonical IDs do not yet exist

Examples:

- `SS...` for locally created `divisions`, `address2d`, `address3d`, or `streets` rows

When a canonical ID becomes available later:

- replace the `SS` ID in canonical tables
- preserve continuity in `entityAliases`

### Naming and casing

Use `camelCase` consistently for:

- table names
- column names
- API fields

Use `ot`-prefixed fields to explicitly mark Overture-origin values inside normalized tables.

Examples:

- `otVersion`
- `otBasicCategory`
- `otTaxonomyPrimary`

## Current implemented scaffold

The following files already exist and should be treated as the implementation starting point:

- Harbour upload entrypoints:
  - [apps/harbour/src/index.ts](/home/io/code/saanseoi/apps/harbour/src/index.ts)
  - [apps/harbour/src/lib/services/upload-session.ts](/home/io/code/saanseoi/apps/harbour/src/lib/services/upload-session.ts)
- Harbour CLI upload flow:
  - [apps/harbour-cli/src/cli.ts](/home/io/code/saanseoi/apps/harbour-cli/src/cli.ts)
  - [apps/harbour-cli/src/lib/upload.ts](/home/io/code/saanseoi/apps/harbour-cli/src/lib/upload.ts)
  - [apps/harbour-cli/src/lib/schema/overture.ts](/home/io/code/saanseoi/apps/harbour-cli/src/lib/schema/overture.ts)

- Drizzle config:
  - [apps/atlas-api/drizzle.config.ts](/home/io/code/saanseoi/apps/atlas-api/drizzle.config.ts)
- Drizzle client:
  - [apps/atlas-api/src/db/client.ts](/home/io/code/saanseoi/apps/atlas-api/src/db/client.ts)
- Drizzle schema modules:
  - [libs/db/src/schema/index.ts](/home/io/code/saanseoi/libs/db/src/schema/index.ts)
  - [libs/db/src/schema/shared.ts](/home/io/code/saanseoi/libs/db/src/schema/shared.ts)
  - [libs/db/src/schema/divisions.ts](/home/io/code/saanseoi/libs/db/src/schema/divisions.ts)
  - [libs/db/src/schema/addresses.ts](/home/io/code/saanseoi/libs/db/src/schema/addresses.ts)
  - [libs/db/src/schema/streets.ts](/home/io/code/saanseoi/libs/db/src/schema/streets.ts)
  - [libs/db/src/schema/places.ts](/home/io/code/saanseoi/libs/db/src/schema/places.ts)
- Initial migration:
  - [libs/db/migrations/0000_initial.sql](/home/io/code/saanseoi/libs/db/migrations/0000_initial.sql)
- Worker config:
  - [apps/atlas-api/wrangler.jsonc](/home/io/code/saanseoi/apps/atlas-api/wrangler.jsonc)
- Deployment workflow:
  - [.github/workflows/deploy.yml](/home/io/code/saanseoi/.github/workflows/deploy.yml)
- Local DB / mirror scripts:
  - [libs/db/scripts/dump-db.sh](/home/io/code/saanseoi/libs/db/scripts/dump-db.sh)
  - [libs/db/scripts/reset-local-db.sh](/home/io/code/saanseoi/libs/db/scripts/reset-local-db.sh)
  - [libs/db/scripts/import-local-db.sh](/home/io/code/saanseoi/libs/db/scripts/import-local-db.sh)
  - [libs/db/scripts/mirror-db-to-local.sh](/home/io/code/saanseoi/libs/db/scripts/mirror-db-to-local.sh)
  - [libs/db/scripts/sql/rebuild-places-fts.sql](/home/io/code/saanseoi/libs/db/scripts/sql/rebuild-places-fts.sql)

## Current implemented tables

The current migration and Drizzle schema cover these non-deferred tables:

- `datasets`
- `ingestRuns`
- `entityAliases`
- `divisions`
- `divisionsVersions`
- `divisionsI18n`
- `divisionsVersionsI18n`
- `streets`
- `streetsVersions`
- `streetsI18n`
- `streetsVersionsI18n`
- `streetsAddress`
- `address2d`
- `address2dVersions`
- `address2dI18n`
- `address2dVersionsI18n`
- `address3d`
- `address3dVersions`
- `address3dI18n`
- `address3dVersionsI18n`
- `places`
- `placesVersions`
- `placesI18n`
- `placesVersionsI18n`
- `placesDivision`
- `placesCells`
- `placesFts`

## Deferred tables and features

These are intentionally documented but not implemented yet:

- `entitySpatialIndex`
- `issues`
- `placesMembership`
- `streetSegment`
- `segment`
- street geometry ingestion
- segment ingestion
- generalized cross-theme spatial index

## Data-model decisions that are locked

### Divisions are managed

`divisions` rows are a managed set.

Ordinary place ingest must not create divisions.

If a place, address, or geocoding flow reveals a likely missing or ambiguous division mapping:

- do not create a `divisions` row in-process
- defer review through the future `issues` table

### Address deduplication is deterministic

`address2d` deduplication is not fuzzy.

Canonical uniqueness is based on normalized structure.

Current canonical dedupe key:

- `streetId`
- `streetNumber` or equivalent building number
- `microhood`
- `neighbourhood`
- `subDistrict`
- `district`

To support this in SQLite/D1, the implementation currently uses a single `canonicalKey` field on `address2d`.

### Address linkage from places

`places.address2dId`:

- nullable
- points to the canonical 2D address when known

`places.address3dId`:

- nullable
- points to the single best canonical 3D address match for the place
- exists as a convenience link even though an `address3d` already links back to `address2d`

One `address2d` may have many `address3d` rows.

### i18n normalization

Localized values are normalized into dedicated `*I18n` tables.

For each localized table:

- locale is part of the composite primary key
- nested multilingual blobs should not survive normalization except in retained raw source JSON where needed

### Spatial indexing

Implemented now:

- `placesCells`
- H3-based current-state place lookup

Deferred:

- `entitySpatialIndex`

### Search indexing

`placesFts` is a derived FTS5 virtual table.

It is locale-aware and should be rebuilt from normalized canonical rows, not treated as source-of-truth data.

## Ingestion model

### Ingestion principles

- ingestion is incremental
- ingestion is resumable across explicit phases
- current-state projections are derived from canonical data
- relationship enrichment is separated from raw place extraction
- corrected monthly datasets are real replacements and may create real deletions

### Required ingest phases

The canonical ingest pipeline is:

1. `requestUpload`
2. `stageRawParquet`
3. `extractPlaces`
4. `extractPlacesI18n`
5. `reconcileAddress2d`
6. `reconcileDivisions`
7. `reconcileStreets`
8. `deriveAddress3d`
9. `refreshSpatialIndex`
10. `refreshFts`
11. `publishDataset`

Each phase should be tracked in `ingestRuns` and be independently resumable.

### Phase behavior

#### 1. `requestUpload`

- the CLI inspects the parquet locally and derives the upload plan before any network upload
- the CLI validates the parquet against an accepted source schema registry
- the Harbour API receives the proposed plan plus parquet inspection and:
  - validates region/month/theme targeting
  - validates chronology and duplicate dataset rejection
  - validates schema compatibility against the latest accepted Harbour upload
  - creates a provisional `datasets` row in `uploading`
  - records an ingest run for the upload request
- the API returns a short-lived signed `PUT` URL for a single `R2` object key
- the client uploads the parquet directly to `R2` without proxying file bytes through the Harbour Worker

#### 2. `stageRawParquet`

- the client calls Harbour again after the direct `R2` upload succeeds
- Harbour fetches the uploaded object from `R2`
- Harbour re-inspects the parquet server-side
- Harbour replays the upload plan against the actual object and rejects drift or tampering
- Harbour writes the canonical `R2` object metadata used for future schema-drift checks
- Harbour promotes the dataset to `staged`
- the follow-up processing task enqueue is still deferred

#### 3. `extractPlaces`

For each source place row:

- normalize the Overture place payload
- compute `otVersionHash`
- compare with the active current row
- update `placesVersions`
- upsert `places`

Deletion rule:

- if a previously current place is absent from the new active dataset, treat it as a real deletion

#### 4. `extractPlacesI18n`

- resolve localized names from `names.common` and `names.rules`
- resolve localized brand values from `brand.names.common` and `brand.names.rules`
- upsert `placesI18n`

`otNameAlts` and `otBrandNameAlts` remain delimited text for now.

#### 5. `reconcileAddress2d`

Using `places.otAddressesJson` and other place-derived cues:

- normalize canonical 2D address candidates
- compute the deterministic address dedupe key
- match or create `address2d`
- upsert `address2dI18n`
- link `address2dId` back to `places`

This stage may leave `address2dId` null if reconciliation is incomplete.

#### 6. `reconcileDivisions`

Using reconciled address data and location context:

- map places to the managed division hierarchy
- populate `placesCurrentDivision`
- populate division foreign keys on `address2d`

This stage must not create `divisions` rows.

If division mapping is missing or ambiguous, it should eventually surface through the deferred `issues` mechanism.

#### 7. `reconcileStreets`

Using normalized address data:

- match or create `streets`
- upsert `streetsI18n`
- populate `streetsAddress`
- populate `address2d.streetId`

#### 8. `deriveAddress3d`

Using parsing and geocoding-driven enrichment:

- derive canonical 3D address rows where enough evidence exists
- create `address3d`
- upsert `address3dI18n`
- link the best `address3dId` back to `places`

This stage is intentionally separate because it may depend on slower or lower-confidence enrichment.

#### 9. `refreshSpatialIndex`

- derive H3 cells from `places.otLat` and `places.otLng`
- refresh `placesCells`

#### 10. `refreshFts`

- rebuild locale-aware `placesFts`
- use normalized localized place, address, street, division, and taxonomy text

#### 11. `publishDataset`

- mark the new dataset active
- revoke the superseded dataset if applicable
- ensure only one dataset is active per `(regionCode, snapshotMonth, theme)`

## Local development database

### Goal

Local development must be independent from remote Cloudflare databases.

It should be safe to reset, mirror, and experiment against a local D1 state without touching preview or production.

### Current local DB path

- `.local/d1/dev`

### Current dev behavior

`bun run dev` uses:

- `wrangler dev --env preview --persist-to .local/d1/dev`

This means:

- development uses a local D1 database
- binding metadata comes from the preview environment, not production
- developers do not see a misleading production-labeled local binding

### Current local DB scripts

- `bun run db:reset:local`
- `bun run db:migrate:local`
- `bun run db:import:local`
- `bun run db:rebuild-fts:local`
- `bun run db:mirror:preview:to:local`
- `bun run db:mirror:production:to:local`

### Mirror flow

Current mirror scripts implement:

1. dump remote preview or production data
2. reset local D1 state
3. apply local migrations
4. import dumped data into local D1
5. rebuild local FTS

### Important D1 limitation

Because `placesFts` is an FTS5 virtual table:

- full D1 export is not used as the mirror source
- only normal tables are dumped
- FTS is rebuilt locally afterward as derived data

That limitation is already reflected in the current dump/import scripts.

## Deployment and migrations

### Current deployment policy

Remote D1 migrations are not applied by `wrangler deploy` automatically.

Therefore migrations run explicitly in CI before Worker deployment.

### Current GitHub Actions behavior

[.github/workflows/deploy.yml](/home/io/code/saanseoi/.github/workflows/deploy.yml) currently does:

Preview branch:

1. run tests/build
2. run `bun run db:migrate:preview`
3. run `bun run deploy:preview`

Main branch:

1. run tests/build
2. run `bun run db:migrate:production`
3. run `bun run deploy:production`

### Current remote migration commands

- preview: `wrangler d1 migrations apply ss-db-preview --remote --env preview`
- production: `wrangler d1 migrations apply ss-db-prod --remote --env production`

## What is already done

Completed:

- canonical data-model spec drafted and updated
- initial Drizzle schema created
- initial SQL migration created
- Wrangler D1 bindings configured
- preview and production D1 resources created
- old `ss-places-*` Workers deleted
- Worker names renamed to `ss-atlas-*`
- CI deploy workflow updated to run migrations before deploy
- local D1 persistence configured
- local mirror scripts added
- FTS rebuild script added

## What remains to implement

### Phase A: Align code and configuration

1. Remove or migrate away from `@cloudflare/workers-types` if the project adopts Wrangler-generated runtime types fully.
2. Add any missing Drizzle relation or helper modules if they improve app-side querying.

### Phase B: Implement database access in the Worker

1. Replace starter Hono routes with atlas-aware scaffolding.
2. Instantiate the Drizzle D1 client from the `DB` binding.
3. Add a basic health or metadata route that confirms DB access works.
4. Add repository/query helpers for:
   - datasets
   - places current
   - places i18n
   - place/division joins
   - FTS lookup
   - H3 lookup

### Phase C: Implement ingest orchestration

1. Keep the signed-upload flow as the only supported remote ingestion path:
   - CLI plan and prompt
   - CLI schema validation
   - `POST /v1/signUpload`
   - direct client `PUT` to `R2`
   - `POST /v1/finalizeUpload`
2. Keep ingest phase tracking through `ingestRuns`, including resumable phase state plus per-phase stats and error payloads.
3. Keep raw-object metadata on the finalized `R2` object so each dataset can validate future schema compatibility against Harbour-managed state.
4. Keep dataset lineage checks:
   - reject duplicate `datasetId`
   - require monotonic monthly versions within each `regionCode` + `type`
   - record `supersedesDatasetId` candidates before publication
5. Extend the CLI-managed schema registry:
   - keep accepted top-level source schemas per upload type
   - version schemas by month window and/or release window
   - fail fast on schema drift before requesting an upload URL
6. Add a shared normalization layer used by all dataset types:
   - stable source-version parsing
   - text cleanup and whitespace normalization
   - language-tag normalization
   - deterministic per-row content hashing for change detection

7. Add the deferred processing-task enqueue after `finalizeUpload`.
8. Add division ingest subphases first.
9. Add division row validation and canonical source field mapping.
10. Add division name extraction and i18n normalization.
11. Add division version-hash computation and current-vs-history comparison.
12. Add division reconciliation restricted to existing logical divisions.
13. Add division current/history writes plus ingest diagnostics.
14. Add division publication handling, including active dataset flip and revocation of superseded division datasets.

15. Add address ingest subphases second.
16. Add address row validation and canonical source field mapping.
17. Add address localized name extraction and i18n normalization.
18. Add `address2d` reconciliation:
    - normalize street, number, floor, unit, block, estate, and locality fields
    - derive deterministic `canonicalKey`
    - compute version hashes independent of source row order
19. Add address-to-division linkage without creating missing divisions.
20. Add street reconciliation for addresses.
21. Add `address3d` derivation from normalized `address2d` plus vertical components.
22. Add address current/history writes plus ingest diagnostics.
23. Add address publication handling, including active dataset flip and revocation of superseded address datasets.

24. Add place ingest subphases last.
25. Add place row validation and canonical source field mapping.
26. Add place normalization and version-hash logic.
27. Add place localized name extraction and i18n normalization.
28. Add place-to-address reconciliation against previously ingested address datasets.
29. Add place-to-division reconciliation against previously ingested division datasets.
30. Add place canonical identity resolution and historical change detection.
31. Add place current/history/name writes plus ingest diagnostics.
32. Add spatial index refresh after place and address writes.
33. Add FTS rebuild after place publication.
34. Add final dataset publication and revocation handling across all three dataset types so only the intended lineage is active per region/type.


### Phase D: Implement current-state places reads

1. Implement `GET /v1/:region/places`
2. Implement `GET /v1/:region/places/:id`
3. Implement `GET /v1/meta/regions`
4. Implement `GET /v1/meta/datasets`

Query expectations:

- use `basicCategory` from `otBasicCategory`
- use `taxonomy` from `otTaxonomyPrimary`
- `taxonomyPrefix` may initially be Worker-side logic
- `q` uses `placesFts`
- `bbox` and `near` use `placesCells`
- `profile` remains `list` or `detail`

### Phase E: Implement historical and delta reads

1. Implement `GET /v1/:region/places/:id/history`
2. Implement `GET /v1/:region/places/changes`
3. Implement `GET /v1/:region/places/as-of`

Requirements:

- use active dataset lineage only
- exclude revoked datasets by default
- support corrected releases cleanly

### Phase F: Observability and operations

1. Add internal ingest status routes.
2. Add structured ingest metrics and logging.
3. Add failure and retry handling for resumable phases.
4. Document and later implement the deferred `issues` workflow.

### Phase G: Generalize beyond places

1. Reuse shared tables for additional atlas themes.
2. Add theme-specific serving projections as needed.
3. Keep route and naming conventions region-scoped.

## Immediate next implementation step

The next practical coding step is:

1. add the deferred task enqueue after `finalizeUpload`
2. define the processor contract for `division`, `address`, and `place` datasets
3. implement the first real `division` extraction path from staged raw parquet

That is the shortest path to validating:

- signed upload finalization boundaries
- resumable ingest phase orchestration
- raw parquet to canonical-row extraction
- publish-time lineage handling

## Constraints and cautions

1. Do not create divisions during ordinary place ingest.
2. Do not treat FTS as canonical data.
3. Do not use production-named bindings for local dev.
4. Do not rely on `wrangler deploy` to apply D1 migrations automatically.
5. Do not use fuzzy duplicate merging for canonical `address2d` rows.
6. Treat `entitySpatialIndex` and `issues` as deferred, not partially implemented.

## Hand-off summary

If starting work from a new thread, assume the following:

- the atlas service is a Cloudflare Worker using Hono, D1, R2, and Drizzle
- `places` is the first implemented theme, but the system is atlas-wide
- the normalized schema and first migration already exist in `apps/atlas-api`
- preview and production D1 databases already exist
- deployment already runs migrations before deploy
- local development uses a persistent local D1 database under `.local/d1/dev`
- local mirror scripts exist for preview and production
- the remaining work is Worker integration, ingest orchestration, and query implementation
