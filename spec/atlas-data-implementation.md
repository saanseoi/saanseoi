# Atlas Data Implementation

## Current architecture

SaanSeoi processes datasets in the local Harbour CLI. There is no remote
dataset-ingestion worker and no `processDataset` queue contract.

- `harbour-cli` validates, normalises, and loads a source dataset through the local
  pipeline.
- `harbour-api` is the authenticated control plane for upload registration, release
  state, and narrowly scoped R2 upload authorization.
- Atlas API serves the published database-backed product and public source-archive
  downloads.
- `harbour-workers` consumes only delayed snapshot-cleanup jobs after publication.

The local pipeline records stages such as `processDataset` in release metadata. Those
are local processing phases, not remote queue messages.

## Artefacts

The published product is the normalised data held in the current/history/source
databases. Intermediate Parquet is a local, transient processing input and must not be
retained in R2 once the run completes.

Publisher source artefacts are different: they are immutable provenance. For CSDI, the
updater downloads each archive slot's native publisher delivery, preserves a publisher
ZIP byte-for-byte or losslessly wraps a non-ZIP delivery, and mirrors the resulting ZIP
and its manifest to R2:

```text
source-archives/hk/hkgov-csdi/{dataset-id}/{release-slot}/{sha256}/
  source.zip
  manifest.json
```

Atlas API publicly serves those exact objects at `/v0/source-archives/...`. There is no
public bucket listing or separate conversion artefact.

## Release policy

Every available source archive is mirrored. The manifest records the native package
contents and, where parsing succeeds, schema and semantic fingerprints. A SaanSeoi
dataset release is eligible only for an initial baseline or a semantic change (geometry,
attributes, or features), including schema changes. An identical upstream redelivery is
provenance only.

Snapshot cleanup remains asynchronous because it is a small post-publication operation
that safely removes superseded current snapshots. It is unrelated to source ingestion.
