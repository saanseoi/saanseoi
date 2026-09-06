# Resumable SQL delivery

Address 2D, grouped Address3D and Places data delivery use the local D1 mirror as their
planning context. Each delivery phase seals every payload before sending writes.

Plans live below `.local/harbour-sql/releases/{target}/{releaseCode}/`, in
`sql-delivery-address`, `sql-delivery-address3d` or `sql-delivery-places`. Each
contains:

- `plan.json`: release, environment, mirror generation, frozen inputs, ordered targets,
  payload byte lengths and SHA-256 checksums;
- numbered `.sql` files, or `.json` files containing bound Address3D statements;
- `progress.json`: separate remote/local checkpoints, upload filenames, bookmarks and
  timing counters;
- `lock.sqlite`: an advisory lock that SQLite releases when the process exits.

A sealed plan is immutable. Recovery reads retained payloads without calculating
replacement SQL from a partially updated mirror. Changed checksums, target configuration
or mirror generation stop recovery.

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

Local recovery verifies remote receipts and skips locally committed batches. It never
repeats remote writes. Independent Address 2D database groups may execute concurrently,
preserving each database's order. Address3D keeps collection transaction boundaries,
parameter limits and prepared timestamps.

An unfinished delivery leaves `pending-sql-delivery.json` in its mirror directory. Other
releases cannot plan against that mirror until it is reconciled. Cache-wide and
plan-specific advisory locks prevent competing local recovery writers. Receipts prove
this delivery's completion; external writers must still respect release-operation
ownership of the mirror and target databases.

## Commands

Inspect checkpoints without contacting D1:

```sh
bin/saanseoi sql:status --target production \
  --plan .local/harbour-sql/releases/production/RELEASE/sql-delivery-address
```

Resume remote delivery and local replay:

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
perform curation or skip other lifecycle stages. Places supplementary-address
preparation and release publication retain their existing recovery boundaries.

## Timings

Plans record mirror preparation and SQL generation durations. Batch progress records
upload/initialisation, remote execution/polling and local replay time in milliseconds.
Bound query execution has no separate bulk-upload phase. These client-observed timings
include network latency. Summed concurrent batch times are not release wall-clock
duration. A recovered receipt can prove completion without recovering a timing sample
lost when the process terminated.

## Local benchmark

Run `bun run scripts/benchmark-sql-delivery.ts` to compare coalesced and uncoalesced
durable preparation on identical synthetic bound collections. Five alternating runs
report median preparation and retained-plan validation times. The benchmark verifies
payload identity, order, collection boundaries and reuse without SQL regeneration. It
also counts transport batches for one synthetic Places-sized SQL group. Use `--quick`
for a one-run smoke check. An alternating history/current target case shows the boundary
that prevents adjacent-batch coalescing for Address3D collections; consecutive source
records can still coalesce. Per-collection owner/section validation queries are outside
this local benchmark and require separate live measurement.

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
