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
  - `ds-{region}-{source}-{resourceType}[-{subType}]`
- `releases.code` remains the source release identifier

## Snapshot Registry

Tables:

- `snapshots`
- `snapshotSources`

Key points:

- `snapshots.code` should use the snapshot-version format
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
  - `ss-{region}-{resourceType}-{releaseDate}.{increment}`
- `apiFieldProvenance`
  - stores field-level sourcing for one published API release set
  - `resolverCode` names the actual transformation rule
  - `contributionType` distinguishes direct source rows from `resolver-input` rows
  - `sourceIdentifierPaths` is debugging metadata, not executable lookup configuration

## Shard Registry

Tables:

- `dataShards`
- `releaseShardAssignments`
- `releaseSetShardAssignments`
