# Meta Schema

The `meta` database is the control plane.

Core groups:

- publisher and license registry
- dataset and release registry
- snapshot registry
- API contract registry
- provenance registry
- shard registry

## Publisher And Dataset Registry

Tables:

- `publishers`
- `publisherI18n`
- `licenses`
- `datasets`
- `datasetI18n`
- `releases`

Key points:

- `datasets.code` uses:
  - `ds-{region}-{publisherCode}-{resource-slug}[-{product-slug}]`
- `releases.code` uses:
  - `dr-{region}-{publisherCode}-{resource-slug}[-{product-slug}]-{sourceVersion}`
- Saanseoi-owned code segments are lowercase kebab-case; structured fields are never
  recovered by parsing a code.
- Programmatic resource types such as `divisionArea` become `division-area` in codes.

## Snapshot Registry

Tables:

- `snapshots`
- `snapshotLineages`
- `snapshotSources`

Key points:

- `snapshots.code` should use the snapshot-version format
- `snapshots.parentSnapshotId` records the exact parent in the lineage DAG
- `snapshotSources` records versioned upstream membership

## API Registry

Tables:

- `apiVersions`
- `apiEndpoints`
- `apiReleaseSets`
- `apiReleaseSetSnapshots`
- `apiFieldProvenance`

Key points:

- `apiVersions.code`
  - `api-{family}-v{version}`
- `apiVersions.familyType`
  - stores the API contract family such as `divisions` or `addresses`
- `apiReleaseSets.code`
  - `data-{region}-{family}-{cohort}-{revision}--{domain}`
- `apiFieldProvenance`
  - stores field-level sourcing for one published API release set
  - `resolverCode` names the actual transformation rule
  - `contributionType` distinguishes direct source rows from `resolver-input` rows

## Shard Registry

Tables:

- `dataShards`
- `releaseShardAssignments`
- `snapshotShardAssignments` (history shards containing each snapshot journal delta)
- `releaseSetShardAssignments`
