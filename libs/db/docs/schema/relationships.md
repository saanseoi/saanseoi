# Relationships

`datasets`
-> localized by
`datasetI18n`
-> incremental snapshots are published as
`releases`
-> owned by
`publishers`
-> made available under
`licenses`

`releases`
-> grouped into canonical snapshots through
`snapshotSources`
  -> and together form
  `snapshots`

`apiVersions`
-> version API families for
`apiEndpoints`
-> publishes data through
`apiReleaseSets`

`apiReleaseSets`
-> identifies the published snapshot version as
`apiReleaseSets.code`
-> uses canonical field definitions from
`schemaVersion`
-> uses transformation logic from
`rulesetVersion`
-> links to selected canonical snapshots through
`apiReleaseSetSnapshots`
-> field provenance for that published release lives in
`apiFieldProvenance`

`apiReleaseSetSnapshots`
-> joins
`apiReleaseSets`
-> to
`snapshots`

`snapshots`
-> provenance to upstream source releases lives in
`snapshotSources`
-> source rows ultimately live in
`source{resourceType}Db`

`releases`
-> routed to physical source/history databases through
`releaseShardAssignments`
-> target shard rows are in
`dataShards`

`apiReleaseSets`
-> routed to canonical current/history databases through
`releaseSetShardAssignments`
-> target shard rows are in
`dataShards`

`dataShards`
-> physical binding registry for
`meta`
`current`
`history`
`source`
