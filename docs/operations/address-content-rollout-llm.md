# LLM rollout guide: address content boundary

**Status: draft for review. Production execution is not authorised by this document.**

The user requested a guide to review before rollout. Reading this guide, preparing a
plan, passing tests, or receiving approval for documentation does not authorise live
changes. Obtain explicit approval for the concrete rollout manifest before entering
Phase 3. Do not deploy, apply remote migrations, pause live services, purge caches,
change migration receipts, or push a branch that triggers deployment during preparation.

## Objective and boundaries

Remove `parentAddressId`, `premisesType` and `premisesKind` from canonical addresses and
public/authored address content. Preserve `premisesName`, other address components,
source captures and all existing curation evidence. Retain the premises vocabulary for
the future building/place model. Do not create that model as part of this rollout.

Recalculate retained address hashes **in place**. This is a prerelease contract rewrite,
not a publication: do not issue releases, revisions, snapshots, new address identities
or synthetic deletion events. Preserve existing events even when their new hashes are
equal. Do not coalesce history as a side effect.

The rollout spans SaanSeoi storage, readers, ingestion and derived artefacts, plus
Hype's shared package and authored JSON migration. There is no transaction spanning all
these systems. Keep affected traffic and writers isolated until the complete set is
coherent.

## Start here

Read the applicable `AGENTS.md` in both repositories and these files at the exact
candidate revision:

- [Contract and database review](../datasets/address-content-migration.md).
- [SQLite planner and executor](../../scripts/migrate-address-content.ts) and its
  [tests](../../scripts/migrate-address-content.test.ts).
- [Address normalisation and hash inputs](../../libs/core/src/pipeline/services/addresses/normalisation.ts),
  [history stage](../../libs/core/src/pipeline/services/addresses/historyStage.ts), and
  [history replay](../../libs/core/src/pipeline/db/snapshotReplay.ts).
- [Public Address3D reads](../../apps/atlas-api/src/db/address3d.ts) and
  [collection membership semantics](../../libs/db/src/address3d.ts).
- `apps/harbour-api/wrangler.jsonc`, `apps/atlas-api/wrangler.jsonc`,
  `.github/workflows/deploy.yml`, and database migration scripts under
  `libs/db/scripts/`.
- In sibling Hype: `migrations/0146_address_content_boundary.sql`, the actual applied
  migration ledger, `package.json`, `bun.lock`, and
  `scripts/locations/verify-address-contract.ts`.

`scripts/address-premises/remote.ts` is a reference for existing maintenance mechanisms,
not the executor for this rollout. Its `begin`, `apply` and `finish` phases target a
separate premises-name migration. Do not run them as a substitute.

Use current Wrangler documentation and installed CLI help when preparing remote
commands. Keep credentials in the existing authentication mechanism; never print them or
include them in commands, manifests or public documentation.

## Known state and unresolved execution work

These are **22 October 2026 review observations**, not current preflight assertions:

| Binding                | Database name                  | Address rows | Parent links | Tombstones |
| ---------------------- | ------------------------------ | -----------: | -----------: | ---------: |
| `DB_CURRENT`           | `ss-current-db-prod`           |       186186 |         3220 |          — |
| `DB_HISTORY_HK_BEFORE` | `ss-history-hk-before-db-prod` |       185642 |         2289 |       1128 |
| `DB_HISTORY_HK_2025`   | `ss-history-hk-2025-db-prod`   |        12426 |          243 |       1864 |
| `DB_HISTORY_HK_2026`   | `ss-history-hk-2026-db-prod`   |       186455 |         3590 |       8002 |

The review found two CURRENT scopes, four collections with explicit section lists and no
running ingestion jobs. The live address schema used `granularity`. Parentage exports
and copies of 78 curation fixtures are in the ignored local directory
`.local/address-content/production-review/`. The 9342 exported links are review
evidence, not a complete database backup or proof that writers are still idle.

The implementation has generated schema migrations, a guarded **local SQLite** executor,
Hype migration 0146 and regression tests. It does not yet supply:

- A reviewed remote D1 executor for this content rewrite, with bounded writes, durable
  progress, stale-state guards and recovery from interrupted batches.
- Migration-ledger integration for manually coordinated schema/data maintenance. The
  SQLite executor runs SQL directly and does not record D1 migration receipts.
- A rehearsal against complete, fresh production exports, including Hype's actual
  schema, triggers and pending migration chain.
- An exact deployment, writer-isolation and cache-invalidation manifest for this
  rollout.

**Resolve these gaps in the review packet. Do not improvise them after approval or begin
a live rollout with them unresolved.** Creating a new executor is separate code
preparation; its immutable diff and rehearsal results must be included in the review.

## Phase 1 — read-only inventory and candidate preparation

1. Inspect both dirty checkouts. Isolate the task changes without discarding concurrent
   work. Record immutable candidate commit IDs or patch digests, dependency lockfile and
   package tarball digests. Do not deploy the entire working tree by accident.
2. Resolve the actual account, environment, database UUID and name for every binding.
   Compare deployment configuration with META's retained shard inventory and snapshot
   assignments. Include historical shards even if no longer used by the latest release.
   Inventory Hype independently; its production database and applied migrations were not
   established by the SaanSeoi review.
3. Record schema SQL, indexes, views, triggers and migration-ledger entries for every
   target. Discover the configured ledger name rather than assuming `d1_migrations`.
   Record every pending migration and its checksum; do not assume 0146 is Hype's only
   pending migration or that the observed SaanSeoi schema is unchanged.
4. Inventory active processing runs, queued jobs, cron/manual writers, cleanup workers,
   application writes, deployment automation and cache refresh jobs. Zero running rows
   alone does not establish a writer freeze.
5. Capture address row counts by storage scope/snapshot and operation, exact identity
   sets, parent/classification assertions, locale and lookup row counts, Address3D
   owners, section lists, units, sources and publication selections. Inventory tables or
   artefacts that persist address hashes outside `address2d`.
6. Identify every cache and prepared artefact by concrete location and owner. Include
   normalised/resolved Address files, staged SQL, delivery receipts, Place dependency
   views, Place enrichment caches and served response caches. Classify retained source
   evidence separately from regenerable output. Do not delete broad R2 prefixes.
7. Build and test the candidate. Verify the vendored address package matches SaanSeoi
   source and its lockfile integrity. Run the address, curation, history replay,
   migration, SQL delivery, shared collection, geocoding and Hype migration tests.
   Record unrelated baseline errors explicitly; investigate every new failure.

Preparation may read live state and write local review artefacts. It must not change
live availability, data, caches, migration receipts or deployment configuration.

## Phase 2 — full rehearsal and review packet

Obtain complete exports using the supported database export mechanism. Retain immutable
original exports and their checksums. Materialise disposable SQLite copies; a D1 SQL
export is not directly a SQLite database file. Capture schema and migration receipts
with the data. Do not restore a production export into a live database for rehearsal.

The following are **local-only examples**, run from the SaanSeoi repository after
creating the named disposable files and directories:

```sh
bun scripts/migrate-address-content.ts plan history \
  .local/address-content/rehearsal/history.sqlite \
  .local/address-content/rehearsal/history-plan.json

bun scripts/migrate-address-content.ts apply history \
  .local/address-content/rehearsal/history.sqlite \
  .local/address-content/rehearsal/history-plan.json \
  .local/address-content/rehearsal/history-backup.sqlite \
  .local/address-content/rehearsal/history-evidence.json
```

Use distinct files for each shard and `current` for CURRENT. The executor refuses to
overwrite backups or archives. Its apply is atomic only within that SQLite database;
this does not imply D1 or cross-database atomicity.

The planner currently selects from these generated migration directories:

| Family  | Scope transition                    | Kind column                       | Final removal                      |
| ------- | ----------------------------------- | --------------------------------- | ---------------------------------- |
| CURRENT | `20261022022411_nifty_mystique`     | `20261022093342_sad_misty_knight` | `20261022100419_easy_iron_patriot` |
| HISTORY | `20261022022445_warm_the_professor` | `20261022093343_minor_pestilence` | `20261022100419_clumsy_wasp`       |

Resolve the required chain from the actual schema **and ledger**. Do not run only the
DROP migration or run the generic migration workflow first. Do not mark migrations as
applied merely because a similarly named column is absent. Rehearse receipt handling so
future automated deployment cannot execute the same ALTER statements again.

For each full export, verify independently:

- Every original parent/classification value is recoverable from the evidence archive
  and backup, associated with its exact address and scope/snapshot. All curation fixture
  checksums match. Archive all rows' removed classifications, not just non-null parents.
- The retained columns are unchanged except the explicitly planned scope conversion and
  HISTORY base hashes. Map `site`/`complex` to `premises` only as specified by the
  planner.
- Address IDs, snapshot IDs, CURRENT scope IDs, timestamps, operations, current flags,
  row counts, publication membership and producer/release bindings are identical.
- Recompute every HISTORY upsert hash from decoded persisted content using the canonical
  hash builder. Do not verify only that the stored hash equals the plan's stored value.
  Tombstones retain null hashes. CURRENT comparison hashes are computed on read and must
  agree with the corresponding replayed content; do not invent a CURRENT hash column.
- Locale payloads and hashes, source captures/hashes, Address3D content and lookup data
  remain intact. Duplicate resulting base hashes do not collapse distinct history rows.
- `historyEvents` and exact snapshot replay work across each retained shard and release
  boundary. Foreign-key checks pass. No new publication or revision IDs exist.
- Hype's actual migration chain preserves revision identities and immutable guards,
  archives authored originals in `addressContentMigrationEvidence`, removes only the
  intended authored fields and preserves `rawSource`, payload and legacy evidence.
- Representative API responses and consumer flows work with the candidate: latest and
  historical addresses, geocoding, compact/full profiles, multilingual names, direct and
  shared unit collections, ambiguous membership, address search and Hype address
  editing.
- Replaying unchanged prepared source content under the candidate produces no extra
  Address content events solely because of the removed fields. Run this comparison on
  disposable copies, never through a publishing command in production.

Measure runtime, memory, export size, backup size and remote batch requirements.
Rehearse the proposed D1 executor on an isolated target only when that target's use is
authorised. Prove interruption/resume and rollback; local SQLite tests alone do not
establish D1 statement limits or atomicity. Never send local `BEGIN`/`COMMIT`,
`VACUUM INTO` or a whole-database restore as an improvised D1 batch.

Present a review packet containing:

- Exact target inventory and immutable code/migration/package hashes.
- Required migration chain and ledger transitions, including Hype prerequisites.
- Complete rehearsal results, predicted row/hash changes and independent comparisons.
- Durable backup/archive locations, checksums, recovery procedure and restore rehearsal.
- Exact remote command manifest, batch/resume semantics and per-target completion
  markers.
- Deployment versions, maintenance routing, writer/cleanup isolation, cache paths and
  regeneration commands, smoke-test selections and planned outage duration.
- Unresolved findings and the rollback decision points below.

**Stop here until the user explicitly approves that concrete packet for the stated
environment.** If later findings require different targets, transformations or recovery
behaviour, return the changed packet for review. Routine execution within an approved
packet does not require repeated permission requests.

## Phase 3 — approved maintenance window

1. Revalidate target identities, code/migration hashes, schema and approved
   preconditions. Record the approval reference. Do not substitute a different build or
   database.
2. Prevent new ingestion, queue consumption, cron/manual writes and cleanup. Drain or
   fence in-flight jobs; capture their state without discarding queued work. Isolate
   affected API/consumer traffic before any incompatible schema change. Use rehearsed
   database write guards where required, allowing only the migration executor to write.
3. Once writers are frozen, capture fresh recovery bookmarks, full exports and complete
   curation/assertion archives. Store them durably outside ephemeral `/tmp` and outside
   a single local machine. Verify readability and checksums before proceeding.
4. Compare the frozen state with the approved plan. If it differs, stop and regenerate
   and rehearse the plan; elapsed time or earlier approval is not evidence of equality.
5. Execute the approved remote manifest: process retained HISTORY shards in its recorded
   order, then CURRENT. Keep traffic isolated throughout. Archive before DROP; rewrite
   hashes with exact address/snapshot identity and before-state guards. Record schema,
   data and ledger completion separately for every target.
6. Apply Hype's reviewed authored-content migration chain with its writes isolated.
   Check evidence archives and restored triggers. No request may reach new Hype
   validation with unmigrated authored JSON, or old readers with the new database
   schema.
7. Deploy the approved SaanSeoi reader and ingestion builds and Hype build while the
   maintenance boundary remains active. Prevent ordinary CI from independently running
   migrations or reopening traffic during this operation.
8. Quarantine the enumerated obsolete derived artefacts, preserving a manifest.
   Regenerate required delivery/dependency outputs against rewritten canonical events
   under existing publication IDs. Prepared Address contracts are
   `address.normalised.v2` and `address.resolved.v2`; stale versions must fail rather
   than restore obsolete hashes. Place enrichment cache contract 2 must not reuse
   contract 1 outputs.
9. Refresh only the approved served caches. Validate publication selection and search;
   unchanged address text is not permission to skip an end-to-end search check.

A remote timeout is an unknown outcome, not proof that the batch failed. Read the target
and durable progress marker before retrying. Resume only at an exactly recognised before
or after state; stop on a mixed or unrecognised state. Never bypass stale-state guards.

## Phase 4 — acceptance and reopening

Repeat the full row/hash/identity/archive checks against live databases, not just local
plans or write receipts. Verify all retained shards and Hype. Verify deployed versions,
real API output for current and historical selections, multilingual names, geocoding,
search, direct/shared Address3D lookup, ambiguous membership and Hype address reading.
Confirm removed fields are absent from their contracts while source evidence remains
available. Use an isolated canary for write-path checks; do not create production
revisions to test a rollout whose acceptance requires unchanged revision counts.

Remove maintenance guards and restore traffic and approved consumers only after the
cross-system checks pass. Resume writers in the manifest's order and monitor errors,
queue progress, unexpected address churn and cache regeneration. Delay cleanup until
recovery artefacts are protected under the agreed retention policy.

Record a completion report with per-target before/after counts and digests, migration
receipts, deployed versions, archive checksums, API evidence, reopening time and
monitoring results. A successful migration command or deployment job alone is not
completion.

## Failure and rollback rules

| Failure point                             | Required response                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before live mutation                      | Stop; report the failed precondition. Leave production data unchanged.                                                                                        |
| During schema/hash writes                 | Keep maintenance and writer guards active. Inspect exact per-target state; resume only under the rehearsed manifest or restore the affected targets.          |
| Schema/data complete, candidate API fails | Keep maintenance active. Use the rehearsed forward fix or restore matching data and code together. An old deployment against dropped columns is not rollback. |
| After reopening                           | Freeze writers again. Account for intervening writes before recovery; never restore a full backup over unreviewed new data.                                   |

Rollback must recover removed columns, values, original hashes, migration receipts,
triggers/views/indexes and compatible application versions. Use the frozen-state
bookmarks/exports or a fully rehearsed inverse with exact after-state guards. Re-adding
nullable columns alone does not recover the original data. Preserve archives,
failed-batch receipts and investigation logs throughout recovery. Reopen only after
restored identity, publication and API checks pass.

## Review checklist

All boxes start unchecked. Mark them only when linked evidence exists.

- [ ] Candidate commits/patches and package integrity reviewed; unrelated work excluded.
- [ ] Fresh complete target inventory, including Hype and retained history shards.
- [ ] Required migration and ledger transitions reviewed.
- [ ] Remote executor, interruption handling and writer/maintenance controls reviewed.
- [ ] Full production-export rehearsal and independent hash/identity checks passed.
- [ ] Curation/assertion archives and complete backups verified; rollback rehearsed.
- [ ] Derived artefact/cache inventory and regeneration commands reviewed.
- [ ] Deployment order and current/historical consumer acceptance evidence reviewed.
- [ ] Exact rollout packet explicitly approved for the stated environment.
- [ ] Live per-target verification, reopening and monitoring completed.
