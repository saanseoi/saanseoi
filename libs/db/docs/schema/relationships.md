# Relationships

- `datasets`
- -> localised by
- `datasets.i18n`
- -> publisher versions are registered as
- `sourceReleases`
- -> materialised by resource type as
- `resourceReleases`
- -> owned by
- `publishers`
- -> made available under
- `licenses`

- `resourceReleases`
- -> grouped into canonical snapshots through
- `snapshotSourceReleases`
  - -> and together form
  - `snapshots`

- `apiVersions`
- -> version API families for
- `apiEndpoints`
- -> publishes data through
- `apiReleaseSets`

- `apiReleaseSets`
- -> identifies the published snapshot version as
- `apiReleaseSets.code`
- -> uses canonical field definitions from
- `schemaVersion`
- -> uses transformation logic from
- `rulesetVersion`
- -> links to selected canonical snapshots through
- `apiReleaseSetSnapshots`
- -> changed field provenance groups live in
- `apiFieldProvenanceGroups`
  - -> their member contributions live in
  - `apiFieldProvenance`

- `apiReleaseSetSnapshots`
- -> joins
- `apiReleaseSets`
- -> to
- `snapshots`

- `snapshots`
- -> provenance to upstream source releases lives in
- `snapshotSourceReleases`
- -> source rows ultimately live in
- `source{resourceType}Db`

- `resourceReleases`
- -> routed to physical source/history databases through
- `releaseShardAssignments`
- -> target shard rows are in
- `dataShards`

- `apiReleaseSets`
- -> select snapshots through
- `apiReleaseSetSnapshots`
- -> replay each snapshot's parent chain using
- `snapshotShardAssignments`
- -> target shard rows are in
- `dataShards`

- `dataShards`
- -> physical binding registry for
- `meta`
- `current`
- `history`
- `source`
