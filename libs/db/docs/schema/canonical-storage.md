# Canonical Storage

Saanseoi keeps canonical storage split by workload.

## Current Database

Purpose:

- serve live API reads
- store only the latest materialized row

Examples:

- `canonicalDivision`
- `canonicalAddress2d`
- `canonicalPlace`

## History Databases

Purpose:

- store only real version changes
- support replay by release set

Examples:

- `divisionsVersions`
- `address2dVersions`
- `placesVersions`

Validity is tracked against release sets, not calendar timestamps.

## Source Databases

Purpose:

- preserve source-native shape
- keep upstream semantics intact
- support debugging and provenance inspection

## Planned / Transitional

- `releaseSetShardAssignments` should become the normal route to current/history canonical shards
- current reporting still leans more heavily on `releaseShardAssignments`
