# Resumable SQL delivery

Delivery phases may retain checksummed workflow outputs alongside SQL payloads. Native
and remote preparation return the original outputs on resume without invoking their
generators. Canonical and Planning Division imports retain their original completion
counts, and canonical imports also retain their SQL artefact count. Family validators
check these outputs before native or remote replay starts. Missing or invalid counts
stop delivery without executing the retained SQL.

Address2D, Address3D, Divisions, Statistics and Places SQL delivery use local database
state for preparation. Each delivery phase seals every payload before sending writes.
The Address adapter prepares its full result in isolated SQLite copies and compiles the
final differences from the acknowledged mirror. Other families retain their own
preparation adapters; using the delivery engine alone does not give them the Address
adapter's write economy.

Plans live below `.local/harbour-sql/releases/{target}/{releaseCode}/`, in
`sql-delivery-address` or `sql-delivery-places`. The Address plan includes both
Address2D and Address3D together with their source and provenance writes. Each contains
the files below. Division, geometry, Statistics and Places auxiliary phases live under
`.local/harbour-sql/deliveries/{target}/release-{encodedReleaseId}/{phase}/`.

Each plan contains:

- `plan.json`: release, environment, mirror generation, frozen inputs, ordered targets,
  payload byte lengths and SHA-256 checksums;
- numbered `.sql` files or `.json` files containing resolved bound statements;
- `progress.json`: separate remote/local checkpoints, upload filenames, bookmarks and
  timing counters and available D1 row usage;
- `lock.sqlite`: an advisory lock that SQLite releases when the process exits.

A sealed plan is immutable. Recovery reads retained payloads without calculating
replacement SQL from a partially updated mirror. Changed checksums, target configuration
or mirror generation stop recovery.

Ingest phases that do not explicitly reopen completed work start with one atomic
conditional upsert. A fresh phase inserts its running row once. An unchanged running
report updates its heartbeat only when at least 60 seconds have elapsed since the last
update; changed progress statistics or a cleared error update immediately. Restarting an
errored phase reuses its run, resets its start time and clears its error and finish
time. Completed phases retain their state. Explicitly reopening phases keep their own
restart behaviour.

Geometry and native source metadata replay compare every proposed update value with the
stored value using null-safe predicates. Identical release assignments, processing
actions, statistics and other replayed metadata rows do not update. Changed lifecycle,
provenance and statistics values still apply in statement order, including intermediate
states required by the workflow.

## Resolved Address preparation

All Address sources upload from the same machine and share its acknowledged mirror. The
Address adapter copies every required data shard locally, runs Address2D and Address3D
preparation against those copies, resolves omissions and source provenance, and
validates the complete current projection before sealing any delivery. It compares only
its owned tables, leaving other families outside the Address plan. Its geographical
prerequisite rows must already exist; the Address plan does not hydrate Division tables.

The shared SQLite compiler computes keyed inserts, updates and deletes. Identical rows
produce no mutations, repeated intermediate writes collapse to their final result, and
changes confined to ignored timestamp columns preserve the baseline values. Component
history and unchanged source resolutions inherit from earlier snapshots and shards.
Staging tables, local journals and resolution scans stay local. The sealed report
records before/after counts, inserts, updates, deletes, unchanged rows, statement counts
and payload bytes by table and target.

Each bound statement is limited to 100 parameters and 100,000 SQL bytes; logical rows
use a conservative 2,000,000-byte budget. Address batches reserve one statement and
payload space for their publication guard, allowing at most 63 data statements and
`4 MiB - 4 KiB` of retained payload. Current Address3D collection changes are kept
within one transaction and rejected if they exceed that budget. Foreign-key ordering,
integrity checks and exact primary keys bound the generated work. D1 execution-time,
database-size and index-write costs still apply.

Current Address tables use stable lineage keys. Delivery claims
`addressPublicationState` with a publication token before applying current mutations,
guards every current batch and records completion only after projection validation.
Publication then marks the prepared scope current. The maintenance window lasts until
the selected scope and its publication are ready. Historical Address API reads replay
immutable component journals instead of requiring current snapshot copies.

The plan retains `address-membership.json` as a checksummed output. Acknowledgement
installs it at `<mirror>/address-membership/<scopeId>/<snapshotId>.json`. The next
release verifies that file and the mirror's actual Address2D and Address3D membership
before planning omissions. Review reports and approvals are described in the
[ALS source runbook](./sources/hkgov-dpo/address.md). Missing predecessor evidence or an
incremental branch from an older snapshot requires a chronological local rebuild.

The compiler also supports final-row delivery from an empty baseline. The complete D1
bootstrap workflow exports the prepared schema and persistent contents for all shards.
The complete Places adapter and automatic historical Address hydration for Places
preparation/search are unfinished; they are not implied by this generic interface.

## Local SQL execution

Native SQLite bindings execute each generated SQL payload in one immediate transaction.
Every statement result is checked before the next statement or completion receipt runs.
A statement failure rolls back the entire payload, including work beyond an internal
statement-batch boundary. Lock retries retry the complete transaction. Address imports
and the shared Division, Statistics and Places SQL importer use this native path; D1
bindings retain their bounded prepared-statement execution.

Payload atomicity is not a durable local release checkpoint. A local workflow restart
can still repeat preparation and previously successful payloads; receipt-backed remote
mirror recovery remains distinct from native local-environment ingestion.

The native local checkpoint executor accepts sealed plans with `environment: local`. It
records a database identity in the operational receipt table and checks configured paths
and identities before replay. Payloads and receipts commit together; acknowledged
receipts that disappear cause recovery to stop. Full database reset scripts drop the
receipt table, invalidating its identity. Local plans require no Cloudflare credentials
and can be inspected or recovered with `sql:status` or `sql:resume --target local`.
Family ingestion entry points must explicitly prepare native plans; the executor alone
does not make a local workflow resumable.

The full local database reset holds the cache-wide delivery lock through database reset
and upload-state cleanup. It removes the pending ownership marker only after the reset
succeeds and local plans, release artefacts and R2 state are cleared. A failed reset
retains the marker; a reset of one database family also retains it.

Native preparation holds the cache-wide delivery lock while checking ownership,
registering database identities and sealing SQL. A successfully prepared plan reserves
the cache for its release before replay starts. Competing preparation or replay fails
while that lock is held; another release cannot prepare against a reserved cache.

Both Statistics importers use native local plans for source and canonical SQL. Canonical
Division and Planning Department SQL artefact imports also use native plans. Their local
database context carries configured file paths and named shard bindings. An unfinished
plan blocks another release from opening that context; successful publication releases
ownership after all registered payloads have local receipts. Local metadata preparation
and source preparation retain their own workflow boundaries.

Native local geometry materialisation runs the existing writer against SQLite
`VACUUM INTO` planning copies under the cache-wide lock. The copies include committed
WAL data and preserve read-after-write behaviour. A disk-backed journal captures exact
current, history and source mutations, including superseded-row closures and change
journals, without mutating the target during generation. SQL payloads and churn outputs
are checksummed in the sealed plan. Resume verifies normalised inputs and reuses those
outputs without rerunning the geometry writer. Publication follows successful replay;
deferred publication retains release ownership. Remote geometry materialisation retains
its separate mirror workflow.

Remote geometry plans include version-qualified closure updates for historical rows
named by the snapshot change journal and source rows closed by the release code. These
updates carry closure timestamps without retransmitting historical geometry. C&SD
simplified phases also retain source-derivative rows and their composite-key closures.

Local Places data, search and supplementary Address data use native plans. Supplementary
review and policy decisions remain outside SQL capture. Search follows committed Place
data, and the owning Places workflow clears its local pending marker only after success.

Local Address ingestion uses the same complete resolved plan for Address2D, Address3D
and publisher assertions. Retained plans supply the frozen generation message,
timestamps and outputs on workflow restart. Owner reads occur during isolated local
preparation. Publication follows successful delivery, and the owning workflow releases
its reservation only after acknowledgement and finalisation.

## Receipts

Each target records batch receipts in `harbourSqlDeliveryReceipts`, an operational table
created by delivery SQL outside the public dataset schema. A receipt contains the plan
ID, batch index and payload checksum. It is the final statement in an SQL import, or
part of the same bound transaction as its writes. Local replay commits the payload and
receipt in one SQLite transaction.

The importer persists intent before sending an ingest request. Recovery checks database
receipts before repeating work, including when a response or local acknowledgement was
lost. Active imports resume polling their retained bookmarks. An ambiguous outcome
without a receipt or recoverable bookmark stops; an inactive import alone is not proof
of success and does not authorise another ingest request.

Remote recovery validates the sealed plan, configured targets, reset generation and
mirror ownership before restoring a failed resource to `processing`. A resource linked
to a published snapshot cannot be reopened. Metadata is refreshed before retained audit
SQL runs locally; data-shard baselines and sealed payloads are unchanged.

Upload registration recognises the exact retained owner only after checking every sealed
plan against the requested release code. That retry permits staged or processing
resources, not published resources.

The owning processor preserves its cached processing-release metadata when the exact
release, dataset, source version and sealed plans match. It does not replace that
metadata with a newly staged record during a retained replay.

Local cache dumps execute one prepared statement at a time inside the existing import
transaction. This avoids repeated parsing of large remaining SQL tails, finalises each
statement promptly and rolls back the dump on an error. Dumps containing trigger
definitions retain SQLite's complete-script parser.

If a bookmark becomes inactive, reports a storage reset or completes without a receipt,
recovery uses the exact payload ETag with up to three backoff retries. A saved polling
state without a bookmark also uses this lookup. A returned active bookmark is polled
continuously. Recovery never follows a replacement upload URL or sends another ingest
request, and only a matching database receipt permits advancement.

Local recovery verifies remote receipts and skips locally committed batches. It never
repeats remote writes. Independent database groups may execute concurrently while
preserving each database's order. Address delivery uses the resolved compiler's bounded
transactions; it does not deliver a second Address3D plan after Address2D completes.

The shared bound executor supports independent-target grouping for producers that opt
in. Native pending groups hold up to 64 statements or 16 MiB per target, with a 64 MiB
aggregate buffer budget. Ordinary SQL flushes pending groups as an ordering barrier.
These executor ceilings do not override the smaller limits of the resolved Address
compiler or authorise splitting an atomic collection.

Run `bun run scripts/benchmark-native-bound-delivery.ts` for three alternating local
control/grouped comparisons on identical synthetic collections. It measures durable
preparation, native replay and receipt-backed resume, verifies every row and its order,
and retains a report under `.cache/sql-delivery-benchmarks`. This measures delivery, not
full Address3D ingestion; `--quick` runs a smaller smoke comparison.

Recovery groups receipt lookups by target database, checking up to 99 batch indices in
each query. Local replay verifies all required receipts before any local payload runs.
Remote resume groups checks for previously attempted batches; new writes and ambiguous
outcomes retain their individual receipt checks. Positive results are held only for the
current locked invocation, not persisted as a substitute for remote verification.

An unfinished delivery leaves `pending-sql-delivery.json` in its mirror directory. Other
releases cannot plan against that mirror until it is reconciled. Cache-wide and
plan-specific advisory locks prevent competing local recovery writers. Receipts prove
this delivery's completion; external writers must still respect release-operation
ownership of the mirror and target databases.

The upload command automatically resumes every retained plan in this marker, after
confirmation and before opening the planning mirror. It uses the same checksum, target,
generation and receipt checks as explicit `sql:resume`, and does not run during a dry
run. If the owning release is not yet published, the marker remains until that release
workflow completes.

Before any automatic replay, every referenced plan must exist and match the marker's
release, cache directory and target environment. Missing plans stop recovery with the
owning release and exact directory in the error; the marker remains in place. Restore
matching plans and payloads only when the target databases still belong to that
delivery. After a database reset, reconcile the reset's ownership cleanup instead of
restoring SQL from the old database state.

Release completion holds the same cache-wide lock as phase registration while checking
plans and clearing ownership. Every registered plan must belong to that release and
cache. Malformed pending markers stop planning and completion; they are never treated as
an unowned cache.

Both native and remote preparation register cache ownership before releasing the
cache-wide lock after sealing a plan. A different release cannot begin preparation in
the gap between sealing and execution. Failed unsealed preparation does not reserve the
cache.

Scoped family reset SQL acquires the cache-wide delivery lock and rechecks pending
ownership immediately before execution. It refuses to issue local or remote SQL while a
retained delivery owns the cache, even if that delivery started after the reset
command's initial checks. This guard covers SQL execution and its cache cleanup; source
asset deletion and review-file cleanup/restoration share that lock. Family ownership
checks run again under the lock before invalidating plans or deleting assets. Source
objects are removed before their database ownership records; review-file completion runs
only after SQL and cache cleanup succeed. These steps are ordered, not a cross-storage
transaction: failures still require inspecting the retained reset manifest.

Scoped resets advance the owned releases' delivery generations before destructive SQL.
Native and remote plans bind that generation and check it before replay, so receipts
from reset data cannot confirm a fresh import. Other releases' generations and receipt
evidence remain intact. Normal reset cleanup removes only the owned releases' retained
phase directories; `--keep-cache` preserves them as invalidated diagnostic artefacts.
Full local database reset clears local release and delivery artefacts without removing
preview or production release artefacts.

## Commands

Inspect checkpoints without contacting D1:

```sh
bin/saanseoi sql:status --target production \
  --plan .local/harbour-sql/releases/production/RELEASE/sql-delivery-address
```

Resume remote delivery and local replay explicitly when recovering a delivery outside
the upload workflow:

```sh
bin/saanseoi sql:resume --target production \
  --plan .local/harbour-sql/releases/production/RELEASE/sql-delivery-address
```

Use `--mode remote` for remote delivery only, or `--mode local` to repair the mirror
without remote writes. Receipt verification requires `CLOUDFLARE_D1_TOKEN` and the
configured Cloudflare account. Recovery clears the pending marker only after confirming
the release is published and every registered plan is reconciled. Completing one phase
of a processing release retains mirror ownership. Metadata refresh validates a
replacement SQLite file before replacing the existing metadata mirror.

Recovery covers the named SQL phase. It does not publish releases, prepare sources,
perform curation or skip other lifecycle stages. Places supplementary-address SQL is
captured only after policy decisions and before row verification; curation, review
artefacts and release publication remain lifecycle operations outside SQL recovery.

Division and geometry imports and Statistics source, canonical and metadata phases
combine adjacent same-database SQL into payloads of at most 64 MiB. Large generated
artefacts split between statements; individual statement limits still apply. All SQL in
a phase is sealed before delivery, then confirmed remotely before exact local replay.
Planning Department releases use their scoped mirror for generation and the shared
mirror for delivery receipts and replay. Places metadata and supplementary Address SQL
use the same phase mechanism. Places search SQL is delivered remotely before publication
and replayed locally only after the retained Places data has reached the mirror.

## Timings

Geometry replay reads data tables through SQLite iterators only when preparing a new
plan. SQL generation retains a bounded statement window rather than whole-table row and
SQL arrays. Existing plans bypass these replay-table reads and SQL generation. Metadata
is small and materialised separately; source normalisation and geometry materialisation
remain earlier workflow stages.

Plans record mirror preparation and SQL generation durations. Batch progress records
upload/initialisation, remote execution/polling and local replay time in milliseconds.
Bound query execution has no separate bulk-upload phase. These client-observed timings
include network latency. Summed concurrent batch times are not release wall-clock
duration. A recovered receipt can prove completion without recovering a timing sample
lost when the process terminated.

## D1 row usage

Remote batch checkpoints retain `rowUsage.rowsRead`, `rowUsage.rowsWritten` and a
`complete` flag. Bound delivery sums D1 statement metadata, including the receipt insert
and receipt-table creation. Grouped requests attribute each statement to its sealed
batch and count shared table creation once. SQL imports retain the terminal import
result's cumulative metadata once; polling and receipt-confirmed recovery do not add
that result again. Bounded source retirement contributes its returned metadata to the
owning batch.

`sql:status` and remote/local reconciliation results expose the phase totals and
measurement completeness. These totals cover delivery mutations and retirement, not
receipt-verification reads or unrelated Worker, migration or R2 activity. Missing
metadata and lost acknowledgements are unknown usage, not zero usage. An incomplete
summary is a lower bound. Existing sealed checkpoints without usage remain recoverable
and report incomplete measurement. `usagePending` is persisted before execution so a
crash cannot silently turn an unmeasured request into a complete cost report.

## Initial production bootstrap

For a fresh local run, `saanseoi init --target local --r2 production` retains source and
provenance objects in production R2 while keeping registrations and processing in local
D1. See the [R2 bootstrap mode](./d1-bootstrap.md#ingest-locally-with-production-r2) for
continuation, authentication and object-verification requirements.

A local initialisation can prepare and validate the final persistent database contents
before a first production import. A SQL export for each D1 shard must include the
required schema, indexes, history, snapshot membership and metadata, and omit transient
staging tables and local execution receipts. R2 artefacts and production bindings need
separate preparation and verification.

D1 imports SQL rather than accepting an arbitrary local SQLite file as a Time Travel
restore. Final inserts and index creation remain billable. Local preparation can avoid
remote staging writes, intermediate version updates, temporary-index work and repeated
draft rebuilds. Its benefit depends on the final retained rows and indexes, not the
compressed upload size. A bootstrap workflow must target empty, verified databases and
publish only after all shards and artefacts pass cross-reference checks. The
[initial D1 bootstrap runbook](./d1-bootstrap.md) provides destination-creation, local
export, restore-validation and guarded import commands for the complete shard set.
Bundles retain a checksummed SQLite mirror of each exported shard and acknowledged ALS
membership. Successful remote checks record each SQL checksum in
`verified-imports.json`. After all shards verify and the destination bindings are
configured, `seed-mirror` installs those retained files into a new production mirror
directory without another remote export. It never replaces an existing mirror. Artefact
verification and Worker publication remain separate steps.

## Local benchmark

`bun scripts/benchmark-statistic-normalisation.ts` compares direct and cached canonical
normalisation for synthetic 18-row and 2,000-row cohorts with 20 fields per row. It
verifies identical output digests and includes cache-identity hashing and checksum
validation in cache timings. An observed 2,000-row run took 93 ms for warmed direct
normalisation and 69–70 ms for warm cache reads, with 295 ms to populate the cache. The
18-row cohort takes approximately 1 ms directly and bypasses canonical disk caching.
These are component measurements, not end-to-end release speedups.

`bun scripts/benchmark-preparation.ts <existing.parquet>` compares direct Parquet
decoding with cold and warm checksummed row preparation. It checks exact row digests,
forbids network access, leaves application databases untouched and retains its report
under `.cache/preparation-benchmarks/`. Timings exclude input-checksum calculation and
result verification. Reported RSS is an end-of-phase process reading, not isolated peak
memory for a phase.

A preparation cache is not automatically faster than decoding Parquet. Measure the
complete work it replaces, including normalisation and hashing, before applying it to
another family. A local 5,269-row Planning geometry sample took 308 ms to decode, 2,900
ms to create the row cache, and 370–371 ms to reopen it. Those measurements cover raw
preparation only, not geometry materialisation, SQL delivery or a full release.

Run `bun run scripts/benchmark-sql-delivery.ts` to compare coalesced and uncoalesced
durable preparation on identical synthetic bound collections. Five alternating runs
report median preparation and retained-plan validation times. The benchmark verifies
payload identity, order, collection boundaries and reuse without SQL regeneration. It
also counts transport batches for one synthetic Places-sized SQL group. Use `--quick`
for a one-run smoke check. An alternating history/current target case shows the boundary
that prevents adjacent-batch coalescing for Address3D collections; consecutive source
records can still coalesce. Batched owner/section validation lookups are outside this
local benchmark and require separate live measurement.

The benchmark refuses network access and retains its plans and JSON report in a unique
directory below `.cache/sql-delivery-benchmarks/` printed at completion. It does not use
a real mirror or source dataset. Timings depend on the repository filesystem and warm
caches; the uncoalesced control is not an end-to-end pipeline baseline. Transport counts
do not model flushes between real generation groups or database targets.

A live comparison requires a disposable D1 database and matched input/schema for each
run. Measure total wall time alongside generation, upload, polling, receipt checks and
local replay; verify resulting rows before comparing results. Do not use a shared
preview release or production database as a benchmark target.

## Isolated live benchmark

`bun run scripts/benchmark-sql-delivery-remote.ts --run` runs matched synthetic SQL and
bound workloads against the dedicated `ss-sql-bench-20260907` database. The script pins
its database ID and verifies the remote name before writing; it cannot select an
application binding. It requires `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_D1_TOKEN`.

Each sample uses a fresh table and scratch mirror. Two repetitions reverse the order of
small and combined batches. The report separates preparation, remote delivery,
receipt-only resume and local replay wall time, and counts API calls. It verifies every
remote/local row and checks that completed-plan recovery performs no remote writes. Both
variants use the receipt-aware engine; this comparison isolates batching rather than
comparing complete ingestion pipelines.

Reports and plans remain under `.cache/sql-delivery-benchmarks/remote-*/`. The database
and synthetic tables remain for inspection; this script neither deletes the database nor
updates application configuration. Do not automatically rerun a failed sample: inspect
its retained plan and remote receipts first.
