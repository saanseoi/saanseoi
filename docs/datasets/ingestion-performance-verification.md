# Ingestion performance verification

The implementation scope is Address2D/Address3D, Divisions and geometry companions,
Statistics, and Places, for local and remote ingestion. Streets are excluded from
implementation changes. Basemap build and catalogue recovery are supplementary work;
Basemap is not a D1 resource family.

## Evidence and remaining acceptance

| Requirement                                     | Implemented evidence                                                                                                                  | Acceptance still needed                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Preserve the mirror as the SQL planning context | Existing family writers feed checksummed SQL or bound-statement plans; geometry and local Planning writers use SQLite planning copies | Compare a complete release's resulting rows, lineage and statistics with its expected source outcome          |
| Faster local and remote delivery                | Native SQLite replay; bounded payload grouping; batched remote receipt checks; independent Address3D target grouping                  | Full-release timings and memory measurements for each family on agreed local and preview targets              |
| Resume without regenerating committed work      | Sealed plans, transactional receipts, retained workflow counts, source/normalisation/enrichment caches                                | Interrupt and resume representative complete workflows, including the hand-off to completion reporting        |
| Fail closed on changed state                    | Payload checksums, database identity and reset generations, cache ownership, dependency validation                                    | Exercise reset/retry and concurrent-writer refusal in the selected acceptance environment                     |
| Preserve review and publication boundaries      | Address and supplementary review remain prerequisites; publication follows delivery                                                   | Inspect deferred publication state and confirm unresolved review still blocks the selected complete workflows |

Focused tests include real SQLite migrations and family-generated SQL. Remote delivery
fault tests use controlled transports. These are not proof that a complete release
finishes against live D1, or that its production wall time improves by the component
benchmark ratio.

## Retained component benchmarks

- `scripts/benchmark-native-bound-delivery.ts`: synthetic native bound delivery across
  two independent targets. The retained `native-bound-blWrgi` report has 1,000 control
  batches and 16 grouped batches, with median replay approximately 10.0 s and 185 ms.
- `scripts/benchmark-place-enrichment.ts --linked`: 2,000 synthetic Places, 100
  Address3D collections and 20 units per collection, using migrated local SQLite. The
  `place-enrichment-CUv45f` report records median direct/cold/warm times of
  approximately 93/104/6.6 ms, identical output and statistics, and same-snapshot edit
  invalidation.
- `scripts/benchmark-preparation.ts`: the retained `run-7k2K79` report for a real
  Planning geometry Parquet file found raw disk caching slower than direct decoding. Raw
  geometry decoding is not cached on the strength of this result.
- `scripts/benchmark-statistic-normalisation.ts`: component measurements determine the
  small-cohort cache bypass; they are not a complete Statistics release benchmark.

Reports live under `.cache/sql-delivery-benchmarks` or `.cache/preparation-benchmarks`.
They are local run artefacts, not published datasets.

## Small-fixture local acceptance evidence

The retained `run-YhCQaM` experiment under `.cache/ingestion-acceptance` uses an
independent source snapshot, dependency installation, local D1 databases, bucket, queue
and Harbour API on port 18888. Source archives, existing application state, secrets and
live Wrangler configurations are excluded. Remote API endpoints in the snapshot are
disabled. No remote resources or uploads were used in this experiment.

The Division fixture is a 2,648-byte synthetic Parquet containing the 18 district
identities and SAR anchor needed by the Hong Kong normaliser. The pipeline adds four
required anchors, producing 23 canonical rows and 69 localisations. All three name
locales are supplied so the test makes no translation requests.

- The uninterrupted materialisation and completion call took 1,362 ms. This is a
  small-fixture observation, not a measured production speedup.
- A controlled history-write failure left 23 current rows and 23 source rows committed,
  with zero history rows. Retrying the same release completed delivery and the Harbour
  completion call.
- `division-parity-report.json` verifies identical current, history and source Division
  rows and localisations, excluding only `createdAt` and `updatedAt`.
- Direct database inspection confirms the source resource release remains `processing`
  and the API release set remains `draft` with no publication timestamp. Internal
  snapshots are marked published by the deferred-completion operation; these exist only
  in the isolated local test databases.

Reports are `division-local-report.json`, `division-local-resumed-report.json`,
`division-interruption-state.json` and `division-parity-report.json`. The baseline
databases and failed fixture-development attempts are retained separately.

This test invokes the production Division materialisation adapter and real local Harbour
API, but seeds registry metadata directly and does not exercise upload registration or
source-object upload. Other families, geometry companions, remote D1 and complete
registration/upload workflows still require acceptance evidence.

`scripts/prepare-ingestion-acceptance.ts --prepare` creates a source-only workspace;
`scripts/configure-ingestion-acceptance-local.ts <run-directory>` creates local-only
bindings and a separate local API key. Neither script provisions or uploads remote
resources. The manifest proposes a 32-record-per-family, 5 MiB aggregate fixture budget;
a remote upload runner must enforce it before any upload.

## End-to-end acceptance procedure

Before running application ingestion, agree the disposable local and preview databases,
release identities, source artefacts, prerequisite snapshots and cleanup authority. Do
not use existing published application releases as benchmark scratch data.

For each in-scope family:

1. Retain source identity, reviewed inputs, database identities and starting state.
2. Run the complete workflow with publication deferred wherever supported, preserving
   review stops. Record preparation, SQL generation, delivery and completion times, peak
   memory, batch/request counts and the exact command.
3. Repeat with a controlled interruption after a committed batch. Resume the same
   release and verify receipt-backed skipping, unchanged SQL identity, and original
   completion statistics.
4. Compare source/current/history rows, closures, change journals, snapshot links and
   release statistics against the uninterrupted result. Places also require exact
   Address/Division/unit references and supplementary provenance checks.
5. Inspect release and publication state directly. A successful child process or a green
   unit test is not evidence that a release is published or ready to publish.

This acceptance pass has not run those complete local/preview workflows. The broad
performance goal remains open until that evidence is available. Basemap tests likewise
do not constitute a live Docker build or R2 publication test; its early interrupted
uploads can require retransmission, and publishing assumes one workspace.
