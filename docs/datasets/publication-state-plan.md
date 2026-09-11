# Publication state

Publication-state tables live in the current database. They record delivery completion
and permission to serve the selected published data. They contain small snapshot or
scope checkpoints, independently of the number of canonical records.

## Tables and identities

| Table                              | Identity                                               | Materialisation                                                                   |
| ---------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `statsPublicationState`            | Dataset × exact reference period                       | Packed statistics and their versioned definitions.                                |
| `addressPublicationState`          | Snapshot lineage (`scopeId`), with unique `snapshotId` | The lineage's Address 2D/3D projection, localisations and building-number lookup. |
| `divisionPublicationState`         | Snapshot, with indexed lineage scope                   | Division records and localisations.                                               |
| `placePublicationState`            | Snapshot, with indexed lineage scope                   | Places, localisations, spatial cells and division links.                          |
| `streetPublicationState`           | Snapshot, with indexed lineage scope                   | Streets, localisations, changelog and companion rows.                             |
| `divisionAreaPublicationState`     | Snapshot, with indexed lineage/cohort scope            | Area geometries and their retained provider variant.                              |
| `divisionBoundaryPublicationState` | Snapshot, with indexed lineage/cohort scope            | Boundary geometries and their retained provider variant.                          |

Snapshot-keyed families retain a receipt for each materialisation being prepared or
served. This allows a new snapshot to be prepared alongside the published snapshot.
Publication retires completed ancestor receipts only after every selected replacement is
ready. Independent snapshots and active deliveries remain protected. The number of
receipt writes follows publications, not record counts.

Address uses one mutable projection per lineage. Its publication state owns that mapping
and gates the entire scope during delivery. Statistics keeps a separate checkpoint for
every exact reference period, so an annual release does not retire older statistics.

## Delivery and publication

The shared receipt contains `snapshotId`, `scopeId`, `publicationToken`, `preparedAt`,
`status`, `createdAt` and `updatedAt`. A delivery token identifies the owner of a sealed
import. A receipt starts as `publishing`, with `preparedAt` unset. Each write batch must
still own that token. Completion validation sets `preparedAt`; it does not grant
permission to serve the snapshot.

Local import mirrors can retain a completed `publishing` receipt after remote
publication, or while API publication is deliberately deferred. Import preparation can
use that acknowledged snapshot as its baseline when its snapshot and delivery token
match the selected predecessor. This does not grant public read permission: API and
search reads require `current`.

Snapshot inheritance and identical-geometry reuse also require completed delivery
receipts. Matching row counts or values alone cannot certify a predecessor whose import
is unfinished.

The publication finaliser resolves the published resource selections from metadata and
requires their completed receipts. It changes matching receipts to `current` using
conditional updates against the snapshot, scope, token and completion timestamp. Missing
or interrupted delivery remains unavailable. A valid empty snapshot has a completion
receipt and returns an empty collection. An unchanged reconciliation does not rewrite
receipts or observations.

Statistics owns its promotion at publication time and retains its dataset/period
checkpoint contract. Its canonical versions and sparse revision journal continue to
ensure that unchanged reissues do not rewrite packs.

Current API responses require ready receipts before reading and verify the same
publication tokens after all component reads. If publication changes during the read,
the response is discarded with `snapshot_not_ready`. Historical selectors continue to
use the appropriate immutable snapshot replay path. Current geometry selection retains
independently published cohorts and variants.

## Search and cleanup

`addressSearchScopes`, `placeSearchScopes` and `divisionSearchScopes` certify the FTS
projection for their published search scopes. These remain separate from publication
state. Search finalisation checks base publication readiness in the same transaction as
index updates. A base collection can be ready while its search index requires repair.

Cleanup first respects metadata retention and dependent records, then protects snapshots
with publication receipts or active search scopes. Delete predicates recheck publication
state within the deletion transaction. Publication retires completed receipts for
superseded ancestors of its selected snapshots; active deliveries remain protected.

## Reset and reingest

Generate schema migrations through Drizzle and include every publication-state table in
current-database reset/drop scripts and relevant local cache profiles. The next database
reset and reingest creates the receipts through normal validated delivery and
publication. There is no inferred backfill or compatibility path that marks existing
rows ready based on their presence.

The Streets source-payload consolidation and API-family unification remain separate work
described in the [Streets family](families/streets.md). Publication readiness does not
change publisher payloads, street identity or notice evidence.
