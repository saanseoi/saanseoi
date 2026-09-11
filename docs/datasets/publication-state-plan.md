# Publication state

Publication-state tables live in the current database. Each receipt maps a stable
storage scope to one logical snapshot and records whether delivery is complete and the
published selection may be served. Advancing a snapshot does not change the storage keys
of unchanged records.

## Tables and identities

| Table                              | Identity                                                       | Materialisation                                                  |
| ---------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| `statsPublicationState`            | Dataset × exact reference period                               | Packed statistics and their versioned definitions.               |
| `addressPublicationState`          | Snapshot lineage (`scopeId`), with unique logical `snapshotId` | Address 2D/3D, localisations and building-number lookup.         |
| `divisionPublicationState`         | Snapshot lineage (`scopeId`), with unique logical `snapshotId` | Division records and localisations.                              |
| `placePublicationState`            | Snapshot lineage (`scopeId`), with unique logical `snapshotId` | Places, localisations, spatial cells and division links.         |
| `streetPublicationState`           | Snapshot lineage (`scopeId`), with unique logical `snapshotId` | Streets, localisations, changelog and companion rows.            |
| `divisionAreaPublicationState`     | Lineage × cohort (`scopeId`), with unique logical `snapshotId` | Area geometry for the lineage's provider variant and cohort.     |
| `divisionBoundaryPublicationState` | Lineage × cohort (`scopeId`), with unique logical `snapshotId` | Boundary geometry for the lineage's provider variant and cohort. |

The six scoped families keep one mutable current projection and one receipt per scope.
Their current table columns named `snapshotId` contain the physical scope ID. Current
references such as `divisionSnapshotId`, `addressSnapshotId` and `streetSnapshotId`
likewise identify physical scopes. Metadata, immutable history and API responses retain
logical snapshot IDs; readers resolve those IDs through publication state.

Geometry scopes encode the lineage and cohort as a JSON pair. Provider variants belong
to distinct lineages. A revision replaces its own scope, while independently retained
cohorts and variants remain available. Creating a distinct scope requires its initial
materialisation even when another cohort contains identical geometry.

## Current write economy

Within an existing scope, unchanged canonical content retains its rows and timestamps.
New records are inserted, changed components are updated and absent members of a
complete replacement are removed. Membership checks include companion tables such as
localisations, cells and links. An annual snapshot change alone does not copy every
Division, Place, Street or Address row.

Division, geometry, Place and Street delivery can transmit conditional upserts and
membership checks for candidate rows. Their equality predicates prevent D1 from writing
unchanged content rows. This saves row writes; it does not promise that only changed
rows appear in transmitted SQL or that comparison reads disappear. Publication receipts
have a small per-scope write cost; source assertions and other release metadata have
their own write costs.

Address delivery resolves and validates the complete candidate on isolated local
mirrors, then seals the final inserted, changed and retired rows for delivery. Its
intermediate staging and resolution SQL stays local. This final-difference delivery
contract is not assumed for every family.

Place rows preserve the `releaseId` and stored `lastSeenMonth` of their last real
content change. A complete published cohort asserts membership for all its current
Places, so current API responses derive `lastSeenMonth` from the selected cohort.
Historical responses preserve the recorded version values. Snapshot provenance records
release assertions without touching every unchanged Place.

Statistics deliberately uses a different membership boundary. One pack contains a
dataset × exact period × geography, with all dimension-qualified fields and their
versioned definitions. Current and history share that pack structure. Later annual
releases preserve earlier periods; partial revisions replace supplied fields while
retaining omitted fields and geographies. Unchanged reissues reuse canonical versions
and inherited snapshot membership. History adds complete versions and sparse journal
entries only for changed packs; publication promotes those changes into current.

## Delivery and publication

The shared scoped receipt contains `scopeId`, `snapshotId`, `publicationToken`,
`preparedAt`, `status`, `createdAt` and `updatedAt`. A sealed delivery claims its scope
using a unique token and the exact acknowledged predecessor snapshot and token. The
receipt becomes `publishing`, with `preparedAt` unset. Each mutation batch verifies
ownership in the same transaction as its writes. A competing or stale delivery cannot
silently take over the scope.

There is one current projection per scope, so it is unavailable to public readers while
being updated. Completion validation records `preparedAt`; it does not grant permission
to serve. Interrupted work resumes its sealed delivery with the same ownership proof. A
valid empty projection requires the same completion evidence as a populated one.

Local mirrors may retain completed `publishing` receipts while publication is deferred
or remote finalisation has advanced. Preparation may use that acknowledged predecessor
only when its logical snapshot and token match. Row counts or matching values alone do
not certify a predecessor. Historical dependencies must be replayed or explicitly
prepared; a newer current scope must not be substituted for a selected older revision.

The finaliser resolves published selections from metadata, validates scope identity and
marks matching completed receipts `current`. Its updates check the snapshot, scope,
token and completion timestamp. Missing or unfinished delivery remains unavailable.
Repeated finalisation leaves ready receipts and observation rows untouched. A pinned
older geometry revision can share a scope whose selected replacement is ready; the older
geometry is read from immutable history.

Statistics promotes changed packs at publication time. Its `statsPublicationState`
checkpoint records dataset, exact period, logical snapshot and `publishing`/`current`
status; it does not use the shared delivery-token columns. Earlier periods keep their
own checkpoints. Unchanged reissues advance publication metadata without rewriting
canonical packs.

## Reads and historical revisions

Current API reads require the exact selected logical snapshot to have ready publication
state. Scoped readers compare publication tokens before reading and after all component
reads; Statistics rechecks its dataset/period publication checkpoints. A changed or
incomplete publication returns `503 snapshot_not_ready`; it cannot produce a partial
successful response. Empty ready collections return an empty result.

Explicit older revision selections use immutable history and snapshot journals when the
selected snapshot is no longer current. Ordinary Statistics requests use current even
for older reference periods. A reference year alone is not a revision selector.

Geometry included by a published release retains its exact selected revision. If a ready
replacement owns that lineage/cohort scope, the pinned geometry can replay from history.
An unfinished replacement does not authorise substituting its partial current geometry.
Public logical snapshot IDs remain separate from storage scope IDs.

## Search and cleanup

`addressSearchScopes`, `placeSearchScopes` and `divisionSearchScopes` map stable
region/domain/lineage search scopes to logical published snapshots. Search scopes and
physical storage scopes have distinct identities. Finalisation resolves base rows
through publication receipts and checks readiness in the same transaction as FTS
updates. Unchanged text retains its FTS rows across snapshot promotion; only the small
search mapping needs to advance. A ready base collection can still have an unavailable
search index and return `503 fts_not_ready` for search.

Cleanup first obtains metadata-authorised obsolete snapshots. A replaced logical
snapshot without its own receipt cannot delete the scope now owned by its replacement.
For an obsolete scope that still has a completed receipt, every delete checks the
captured snapshot, scope, token and completion timestamp, together with search and
current-dependency guards. All owned rows and the receipt are deleted atomically, with
the receipt last. Active deliveries with `preparedAt` unset remain protected. Statistics
packs are not deleted by this snapshot-scope cleanup.

## Reset and reingest

Generate migrations through Drizzle and include publication-state tables in current
reset/drop scripts and the relevant local cache profiles. A reset and chronological
reingest creates receipts through normal validated delivery and publication. There is no
inferred backfill or compatibility path that marks existing rows ready from their
presence.

Generic release rollback requires a ready predecessor projection before it changes any
database. Automatic restoration of an advanced mutable scope from history is not
implemented by that command. A draft that never acquired a current scope can still be
purged; a draft that replaced its predecessor requires restoration first.

The Streets source-payload consolidation and API-family unification remain separate work
in the [Streets family](families/streets.md). Publication state preserves publisher
payloads, street identity and notice evidence.
