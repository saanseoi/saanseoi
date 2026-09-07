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
