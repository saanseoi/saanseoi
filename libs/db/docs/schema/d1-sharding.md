# D1 Sharding

Saanseoi shards by function first, then by scope.

Shard types:

- `meta`
- `current`
- `history`
- `source`

`dataShards.shardType` is the routing key.

## Scope Dimensions

- `environment`
  - `preview`
  - `production`
- `regionCode`
  - optional
- `year`
  - optional

Examples:

- one global `meta` shard per environment
- one global `current` shard per environment
- region/year `history` shards
- region/year `source` shards

## Assignment Tables

`releaseShardAssignments`

- maps source releases to physical shards
- currently used
- now modeled as a pure join table

`releaseSetShardAssignments`

- intended to map published canonical release sets to physical canonical shards
- currently not populated by the publish flow
- still planned rather than fully implemented
