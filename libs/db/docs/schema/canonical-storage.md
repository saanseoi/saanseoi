# Canonical Storage

SaanSeoi keeps canonical storage split by workload.

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

## Index policy

CURRENT is the lookup hot path. Secondary indexes follow the equality predicates and
ordering of actual API queries. Physical `snapshotId` columns identify serving scopes;
publication receipts map logical snapshots to those scopes. Place category, taxonomy and
status indexes include the scope and final record ID for ordered pagination. Division
lists use `(snapshotId, level, class, id)`. Place division filters select IDs through
`(placeSnapshotId, divisionId, placeId)` before reading Place records.

Address division roles use partial `(roleId, snapshotId, id)` indexes for non-null
memberships. The leading role also supports foreign-key checks that know the Division
scope without knowing the Address scope. The separate `divisionSnapshotId` index
supports dependency maintenance. Division filters union indexed role lookups and
deduplicate `(snapshotId, id)` before applying global list ordering and pagination; the
same ID in different scopes remains a distinct record. Selected publications are passed
as JSON so the parameter count does not grow with the number of scopes.

HISTORY retains primary keys for exact identity/version reads, journal access paths and
operational indexes for lifecycle updates and release/snapshot maintenance. Replay
queries bind complete record/version keys, including locale for localised rows. General
name, building-number and statistical list filters belong to CURRENT. HISTORY
`isCurrent` indexes support ingestion cache maintenance, not publication membership.

SOURCE retains three shared operational indexes:

- `resourceReleaseId` for release inspection and maintenance;
- `(validFromRelease, validToRelease)` for source validity selection;
- a non-unique `sourceRecordId` index restricted to `isCurrent = 1` for open-assertion
  scans and reconciliation. Multiple assertions for one publisher ID may remain open.

Primary keys already support unfiltered publisher-ID lookups. Source-specific indexes
need a concrete provenance, ingestion or maintenance caller. Do not duplicate a primary
key or another index's leading columns without measured benefit.

Index changes require generated migrations and query-plan checks against the migrated
schema. Verify list ordering, cross-scope isolation, replay identity and ingestion
behaviour as applicable. Give replacement indexes distinct names so generated SQL
explicitly drops the old definition and creates the new one. Planner checks establish
access paths; representative-data measurements establish performance.
