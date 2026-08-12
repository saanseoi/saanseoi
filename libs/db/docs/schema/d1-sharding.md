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
- one region-scoped `history` and `source` `BEFORE` shard per environment for cohorts
  before 2025

## D1 Placement Convergence

Cloudflare's D1 `--location apac` value is only a broad placement hint. APAC contains
multiple possible D1 locations, and the control-plane `running_in_region: APAC` result
does not identify which APAC location was selected. For the Hong Kong shards, placement
is therefore inferred from round-trip timings measured by the deployed Atlas and Harbour
probe Workers. The convergence thresholds are the placement acceptance criteria; they
are not merely performance alerts.

`scripts/converge-d1-placement.ts` recreates a binding that fails those timing criteria,
redeploys the Workers, and probes again until the selected bindings pass. Use
`--bindings` as an explicit allowlist: unselected databases are neither probed nor
recreated. A passing binding is recorded in `.local/d1-placement-whitelist.json` and is
skipped on subsequent cycles. The allowlist and pass-once whitelist are separate: the
former selects what may be changed, while the latter records what has already passed.
After each replacement deployment, transient probe 5xx responses are retried with a
bounded backoff so D1 binding propagation does not abort the next cycle prematurely.

For the preview Hong Kong `BEFORE` shards, the convergence command is:

```bash
bun run d1:converge -- \
  --target preview \
  --bindings DB_HISTORY_HK_BEFORE,DB_SOURCE_HK_BEFORE \
  --location apac
```

The same command with `--target production` converges the production pair.
`--require-colo` constrains the request's Worker colo and is not a substitute for the D1
timing test.

## Assignment Tables

`releaseShardAssignments`

- maps source releases to physical shards
- currently used
- now modelled as a pure join table

`releaseSetShardAssignments`

- intended to map published canonical release sets to physical canonical shards
- currently not populated by the publish flow
- still planned rather than fully implemented
