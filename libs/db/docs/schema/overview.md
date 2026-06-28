# Hybrid Canonical Schema & D1 Sharding

- [API Versioning](./api-versioning.md)
- [Data Versioning](./data-versioning.md)
- [Relationships](./relationships.md)
- [Meta Schema](./meta-schema.md)
- [Canonical Storage](./canonical-storage.md)
- [Provenance Model](./provenance-model.md)
- [D1 Sharding](./d1-sharding.md)

## Current State

Part of this model is implemented now:

- datasets, releases, snapshots, API versions, API release sets
- current/history/source/meta shard registries
- upload and publish flow
- field-level provenance table
- fixture-backed meta registry sync on deploy

Part of it is still planned or transitional:

- release-set shard assignment population during publish
- full replacement of `snapshotMonth` with snapshot-version driven identity
- schemaVersions and rulesetVersions as first-class database tables

Use the linked documents above as the current source of truth.
