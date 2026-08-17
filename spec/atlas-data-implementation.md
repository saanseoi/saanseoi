# Atlas Data Implementation

## Current architecture

SaanSeoi processes datasets in the local Harbour CLI. There is no remote
dataset-ingestion worker and no `processDataset` queue contract.

- `harbour-cli` validates, normalises, and loads a source dataset through the local
  pipeline.
- `harbour-api` is the authenticated control plane for local-release registration,
  release state, and durable publisher-source mirroring.
- Atlas API serves the published database-backed product and public source-archive
  downloads.
- `harbour-workers` consumes only delayed snapshot-cleanup jobs after publication.

The local pipeline records stages such as `processDataset` in release metadata. Those
are local processing phases, not remote queue messages.

## Remote D1 mirror integrity

The Harbour CLI maintains a local SQLite mirror of the remote D1 bindings as its SQL
planning and replay surface. A successful Harbour-managed upload replays the exact
generated SQL into that mirror and refreshes its metadata binding after publication.
That is sufficient only while Harbour is the sole writer. A valid SQLite file and a
matching local cache manifest prove that the mirror is usable; they do not prove that
another writer has not changed production.

All writers that can modify a remote SaanSeoi D1 binding, including administrative
scripts, migrations, repairs, and future ingestion services, must participate in a
shared remote cache operation journal. The journal lives in `DB_META` and records a
monotonically ordered operation checkpoint, the target environment, the affected
bindings, a stable hash of the operation's declared changes, writer identity, and its
state. Because the affected bindings cannot share a transaction, the journal must
serialize writers before any binding write. `DB_META` keeps one journal-head row with
the next checkpoint and active operation; a writer must atomically claim that row in a
`DB_META` transaction (or a compare-and-swap writer lease), allocate its checkpoint, and
insert its `pending` operation. The claim fails while another operation is pending, so
other writers must wait and retry rather than allocating a second pending operation or
writing a binding. A writer must:

1. acquire the journal claim and record its sole `pending` operation before changing any
   binding;
2. apply its changes;
3. mark the operation `committed`, and release the claim, only after every affected
   binding has succeeded.

If a writer fails after claiming the journal, the pending operation continues to block
other writers. A recovery procedure must establish the affected bindings' state and then
resolve the active operation before releasing the claim. It may not simply clear the
pending marker; a later writer may proceed only after the active operation commits or
recovery completes.

The local cache manifest stores the last committed journal checkpoint it has applied.
Before reusing a remote mirror, Harbour must retrieve the remote journal head and may
reuse the cache only when the local and remote committed checkpoints match and no
operation is pending. A mismatch or pending operation blocks the upload and requires a
cache rebuild or an explicit recovery procedure; it must never be treated as a cache
hit. This is a constant-size checkpoint comparison, not a row-count comparison or a
database download.

Harbour's own remote replay must create and complete the same journal operation. Its
local checkpoint advances only after both the remote write and local replay succeed. If
either fails, the cache is invalidated. The journal is an integrity protocol for
cooperating writers, rather than a content hash of every D1 database: unjournalled
manual writes are unsupported and must be followed by an explicit cache rebuild.

## Artefacts

The published product is the normalised data held in the current/history/source
databases. Intermediate Parquet is a local, transient processing input. It is never
uploaded to or retained in R2.

Publisher source artefacts are different: they are immutable provenance. For CSDI, the
updater downloads each archive slot's native publisher delivery, preserves a publisher
ZIP byte-for-byte or losslessly wraps a non-ZIP delivery, and mirrors the resulting ZIP
and its manifest to R2:

```text
by-source/hk/hkgov-csdi/{dataset-id}/{release-slot}/
  {source-sha256}-source.zip
  {manifest-sha256}-manifest.json
```

Each object is registered as a managed source asset. Atlas API publicly serves it at
`/v0/assets/{asset-id}`. There is no public bucket listing or separate conversion
artefact.

## Release policy

Every available source archive is mirrored. The manifest records the native package
contents and, where parsing succeeds, schema and semantic fingerprints. A SaanSeoi
dataset release is eligible only for an initial baseline or a semantic change (geometry,
attributes, or features), including schema changes. An identical upstream redelivery is
provenance only.

Snapshot cleanup remains asynchronous because it is a small post-publication operation
that safely removes superseded current snapshots. It is unrelated to source ingestion.
