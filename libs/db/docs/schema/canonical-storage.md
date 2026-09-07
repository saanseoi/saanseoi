# Canonical Storage

Saanseoi keeps canonical storage split by workload.

## Current Database

Purpose:

- serve live API reads
- store only the latest materialised row

Examples:

- `canonicalDivision`
- `canonicalAddress2d`
- `canonicalPlace`

## History Databases

Purpose:

- store only real version changes
- support replay by release set

Examples:

- `divisions`
- `address2d`
- `places`

Validity is tracked against release sets, not calendar timestamps.

## Source Databases

Purpose:

- preserve source-native shape
- keep upstream semantics intact
- support debugging and provenance inspection

## Historical Routing

Release sets select snapshots through `apiReleaseSetSnapshots`. Historical replay walks
each snapshot's parent chain and uses `snapshotShardAssignments` to locate the history
shards containing each immutable journal delta. `releaseShardAssignments` locates
source-release storage for provenance and reporting.
