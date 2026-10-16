# HKGov DPO ALS addresses

Retained source assertions use
[distinct validity periods for recurring content](../../families/source-evidence.md#recurring-source-validity-periods).
An unchanged open occurrence continues; returning content starts a new occurrence.

Processing retains shared rule definitions and curation application counts under the
[shared processing contract](../../pipeline.md#processing-stages-and-retained-evidence).

Publisher Point geometries without coordinates retain their source representation.
Division membership uses the available district and bilingual locality evidence when
point coordinates are absent; it does not infer a location.

Automatic ALS audit operations retain one declaration and aggregate count per operation.
Per-record publisher and canonical evidence is excluded from automatic audit entries;
curated identity decisions retain individual fixture references.

Canonical references and retained processing evidence follow the
[source evidence contract](../../families/source-evidence.md).

The v1 Address field mapping retains exact ALS-only and supplementary Places source
signatures under the ALS lineage anchors. Combined curated Division lookups declare
their selected Division and DivisionArea datasets explicitly. Supplementary address
fields retain the Places `addresses[]` publisher path and captured resolution rule;
sources absent from a selected signature contribute no field provenance.

ALS audit verification reads bounded evidence partitions and preserves the registered
bulk-search prefix without concatenating all preparation actions. Large non-tabular
search catalogues retain bounded derived text; complete preparation evidence remains
available in the immutable audit partitions.

Canonical ALS premise and 3D collection IDs use `ss-`. Collection UUIDv5 seeds use the
normalised prefixed parent ID, retaining deterministic identity across repeated
ingestion and parent prefix formatting. Publisher source occurrence IDs remain separate.

Premise structure and Roman-numeral normalisation decisions are retained in release
processing actions alongside the publisher representation. They are preparation evidence
and are omitted from canonical Address `sources`; unchanged premises produce no
structure normalisation action.

Record-content hashes exclude observation timestamps and publisher version labels,
including nested attribution metadata. Effective dates, statistical periods and content
dependency hashes remain significant. Retained source payloads preserve the original
metadata. File checksums and processing-cache identities retain their complete inputs.

ALS ingestion reuses complete prepared releases only when source contents, processing
code, fixtures, runtime, identity history, decisions and the exact selected Division
lookup match. Every prepared Parquet, Address3D, seal, membership and audit file is
checksummed on reuse. Missing or altered files require preparation; dependencies changed
during preparation prevent caching. `--no-cache-artefacts` disables this reuse. Original
parsed 2D feature containers are released after their canonical rows and immutable
publisher evidence are captured, before combined 3D preparation. Completed releases are
filtered before preparing their Division prerequisites. Cached preparation does not
replace publication, predecessor-membership validation or review recording.

### Local identity review

Prepared identity-drift cases can be reviewed at
`http://localhost:5174/local-review/identity-changes.html?release=2024-07-31.0` while
the basemap viewer development server is running. Set `release` to the exact prepared
source version. The map compares previous and current coordinates, highlights changed
address components and retains the full identity evidence. Shared coordinates use one
labelled marker; a shared source anchor does not establish identity continuity.

Cases use explicit identity resolutions with optional evidence notes. Drafts are saved
in browser storage for the exact review digest. Any selected subset can be exported,
including an empty set. Exports include the source version, identity pairs and evidence
digest without reviewer names; importing changed evidence fails. Omitted cases and
investigations remain unresolved and cannot authorise ingestion.

Run `bun scripts/als-identity-review.ts /path/to/export.json` to validate an export and
prepare a proposed identity fixture. This checks the prepared Parquet and 3D inventory
digests as well as every identity pair. Add `--write` to apply the reviewed decisions to
`fixtures/meta/curations/hkgov-dpo-address.json`; conflicting existing decisions are
rejected. Optional notes and the evidence digest stay with each new decision. Partial
imports apply the resolved choices and leave other cases pending. Prepare the release
again before continuing ingestion. The web endpoint is read-only and is available only
in development.

The reviewed `2024-07-31.0` identity changes give 88WL and Terra distinct identities,
with notes recording a new corporate office and a new development respectively. Fu Tip
Estate Social Service Building and Lingnan University's amenities building retain their
predecessor IDs. These decisions adopt the current source descriptions; they do not
approve unrelated retirements. The exact identity pairs, optional notes and sealed
evidence digest are retained in the identity fixture.

Each chronological release runs in a fresh ingestion process. The coordinator waits for
publication and the identity-history write before starting the next release, so large
preparation and snapshot-replay heaps are released between cohorts. Before SQL
generation, preparation audit copies and the input identity ledger are released; the
ledger is reloaded and advanced only after successful publication. Parent replay
payloads are released after their compact identity/hash lookup indexes are built. Child
failures stop the sequence and preserve completed-release checkpoints. Review gates,
target selection and final reconciliation apply across the complete sequence.

Prepared Parquet columns are constructed and written in batches of 5,000 premises,
preserving explicit nullable string and integer types without retaining all serialised
columns in memory. The 3D backfill reader retains feature inventories only for the
building IDs named by applicable backfills; unrelated source occurrences stream through
unchanged.

SQL normalisation reads at most 4,096 premises per Parquet window and runs one window at
a time. Completed chunk data is cleared and collected before the next window to bound
the combined Address2D, Address3D and evidence working set.

Large ALS withdrawal batches clear inherited locales and building-number lookup rows
with one state scan per snapshot. Replayed parent restoration requires explicit child
events; deleted components do not return implicitly.

ALS upload sequences defer Address search finalisation until all selected source
releases succeed. Without `--defer-api-release-set`, `hkgov-dpo:ingest` reconciles once
at the end, including when completed releases are skipped on retry. With that option,
the enclosing initialiser performs reconciliation. A curation stop or failed upload
leaves the existing search index intact. Search indexes only the current published
selection and applies differences in indexed content; advancing a snapshot alone does
not rewrite its search documents.

Unchanged open ALS assertions retain their original release ID and timestamps. Source
retirement compares complete incoming membership, with indexed omission updates;
retained retirement plans traverse row IDs monotonically in bounded transactions.

The prepared `publisherSource` envelope carries untouched publisher provenance. Its
nullable UTF-8 addition is permitted by schema validation only when all other prepared
fields match the recorded schema. Other additions, removals and type changes remain
subject to schema-drift rejection. An absent publisher envelope may be encoded as native
null or JSON null. Both mean that the prepared row carries no publisher assertion;
neither creates source evidence.

ALS source preparation reads the selected geographic snapshot from immutable history.
The Address delivery candidate requires its Division projection and translations to
already exist in the local mirror. Its owned mutation tables cover Addresses, source
assertions and provenance; it does not restore or upload missing Division rows. Prepare
those dependencies through the geographic workflow. Identity matching, ownership
validation and source-omission comparisons use the local mirror.

Address2D and Address3D are fully prepared before delivery starts. Current storage uses
one stable scope per Address lineage, with `addressPublicationState` identifying the
logical snapshot and publication status. Delivery claims the scope before changing
current data, guards each batch with its publication token and records preparation only
after complete projection validation. Publication marks the matching prepared scope
ready; interrupted delivery remains unavailable until its sealed plan resumes. Unchanged
content remains open without timestamp touches or snapshot copies. Changed content and
explicit retirement journals preserve exact historical membership. Search uses the same
scope mapping.

Published rollback replays the exact retained Address predecessor and its reviewed ALS
membership sidecar. A composed restoration prepares Division and Street dependencies
before Address, then validates the complete current candidate. The sealed delivery
restores serving selection while retaining publisher evidence and historical versions.

Subsequent canonical comparison uses that selected predecessor's exact component
journals; building-number lookups use the restored serving content. Retained history
flags are not permission to inherit a revoked publication's canonical state.

Current Division and Street references contain physical scope IDs. Preparation and
history retain logical snapshot IDs, and the writer resolves each exact selected
reference through a completed receipt. Missing or advanced dependency projections fail
closed and require chronological preparation. `snapshotDependencies` records the exact
logical Division lookup with the `division` role for historical dependency replay.
Address and the other scoped families deliver final row differences resolved locally,
with family-specific membership and shared readiness guards. See the
[publication-state contract](../../publication-state-plan.md).

Address2D base, locale and building-number history are compared independently,
preserving the original hash and owning shard of unchanged component rows. Address3D
base inventory and each locale payload have independent version hashes. Locale-only
changes leave the base inventory open, and historical locale reads follow the matching
locale event. SOURCE validity periods record publisher changes and omissions
independently of canonical Address retention. Processing decisions remain in retained
preparation audits.

Complete publisher omission retires the omitted source assertion. Curations can retain
the canonical address without erasing that source event. Preflight compares final
prepared canonical membership after alias, hierarchy and curation processing. It groups
retirements by address level, separates provider omissions from canonical retirements,
and stops for unreviewed building/complex loss, whole-inventory loss and substantial
removal spikes. Invalid parent and owner references always fail validation. Flat
removals remain reportable even when no review stop is required.

Forward-fill fallbacks never replace a present publisher premise or inventory record,
nor reject its reappearance because its retained evidence hash differs. This applies to
2D and 3D backfills, house retentions, commercial retentions and estate-premise
reconstruction. New publisher inventories proceed through normal ownership and conflict
validation. Dated evidence and the publisher omission remain explicit when a fallback is
applied.

Preparation retains `<prepared>.membership.json` alongside the prepared data. It records
raw publisher IDs and unit tokens before curation, final canonical identities and
levels, parent references, bilingual labels, map coordinates, aliases and compact 3D
collections. Prepared 2D and 3D hashes bind the membership to the uploaded contents.

Chronological review writes `.local/hkgov-dpo/deletions/<sourceVersion>.json`, including
predecessor and current membership digests, per-level previous and removed counts,
percentages, parent chains, map links, descendant counts and curated retentions. Omitted
publisher assertions include retained canonical IDs, remaining supporting source IDs and
compact curation references. Retained units distinguish remaining source or alias
support from curation retention, including reparented inventories. Any building,
complex, phase, site or section retirement requires review, as does whole inventory
loss. A deletion spike is at least 100 removals and at least 5% at a level, or at least
1,000 removals at a level.

Approval is an exact report digest in `.local/hkgov-dpo/deletion-reviews.json`, with
`schemaVersion: 1` and `reviews` entries containing `digest`, `sourceVersion`,
`previousSourceVersion`, `reason` and `reviewedAt`. Unreviewed reports block assembly
and ingestion. Changed resolved membership or report contents remain unreviewed until a
fresh review. Prepared-file container hashes are excluded from the approval digest;
changed files still require preparation and checksum validation. Delivery retains a
sealed `address-membership.json` inside its `sql-delivery-address` directory. After
acknowledgement, the mirror receives `address-membership/<scopeId>/<snapshotId>.json`.
The next release requires that exact predecessor file and checks its Address2D IDs,
Address3D owners and unit IDs against the mirror. A prepared sidecar alone cannot
establish the predecessor. Missing or mismatched acknowledged membership requires a
chronological local rebuild. The upload also retains its final comparison as
`address-deletions.json` in the release directory.

The reviewed 21 August 2024 omission cohort retains 15 buildings and five complexes
under `hkgov-dpo-address-august-deletion-retentions.json`. Decisions preserve the
acknowledged July canonical IDs from 21 August onwards and restore missing premises from
dated publisher evidence. Terra keeps its bilingual building name. James’ Garden and The
Nascent retain their reviewed transitional-housing premises. Fu Tip Estate and Lingnan
University keep complexes distinct from their buildings; the Lingnan campus is a
complex. Returning publisher assertions must match the reviewed per-release hashes; new
evidence or ambiguous matches require review. Retained premises carry curation
provenance without inventing publisher rows or approving deletion reports.

[Minimal initialisation](../../minimal-initialisation.md) selects the earliest two
retained versions before division-cohort resolution, curation and completed-release
filtering. Each selected delivery is processed in full.

Address API publication calculates release churn from immutable Address2D and Address3D
snapshot membership and content hashes, including retained translations. Comparisons use
the preceding compatible API release and include history across shard years. Local
retained release statistics can be rebuilt with
`saanseoi stats:backfill-addresses --target local`.

The release audit groups reviewed exceptions by their resolution: temporal coverage,
coordinate replacement, duplicate consolidation, identifier and component corrections,
containment, inventory edits and dated changes. Group names describe handling; address
names belong to individual context headers. Each instance presents structured input and
output fields, a copyable retained decision, and the recorded application lifecycle.
Counts refer to decisions within the selected release's scope, excluding explicit
zero-match epochs and empty fixtures. A schedule alone does not prove application; the
audit distinguishes this from an observed guard result.

Preparation retains separate guard counters at successful identity, coordinate,
component-gap, inventory-source, parent, section-ownership, shared-owner,
inventory-agreement and record-size checks. Skipped checks do not produce successful
guard results. Releases without these counters report that detailed guard results were
not retained; SQL completion is not a substitute for source validation.

ALS division lookups replay the selected Overture snapshot from parent to target using
all assigned history shards. Both preflight fingerprints and source preparation use this
retained membership, so eviction of older current projections cannot interrupt
chronological review. Translations use their own retained version hashes.

Each pending release is prepared and ingested in chronological order. Unresolved cases
are recorded per release without an all-release review gate. Delivery validates the
prepared files and acknowledged predecessor independently of review status.

ALS 2D source rows retain supplied `sources` references, including the `hkgovAls`
wrapper. Missing or empty references are stored as SQL `NULL` in both worker ingestion
and bulk SQL import; synthetic source-record IDs are not provenance.

Non-blocking curation logs use `ALS_MANUAL_REVIEW` JSON records. Skipped assertion
guards record their source version, fixture, decision or source assertion hash, and
failure message; the failed correction remains unapplied. Issue logs require
reconciliation across every retained release before they constitute a complete review
inventory.

The guarded `on-yam-combined` suppression takes precedence over coordinate backfills:
only retained individual house addresses receive canonical point corrections. The
combined source assertion and its publisher point remain preserved as provenance.

The reviewed Tsui Lam complex promotion routes the blockless Pik Lam House 3D assertion
to retained Block 1. Both publisher assertions contribute source references to one
430-unit inventory; conflicting inventories stop preparation. The promoted estate
complex does not own those residential units.

The Tsui Lam promoted inventory selects its unique numbered owner by CSU, estate and
block number. Publisher building-name detail such as `PIK LAM HOUSE (BLK 1)` remains
unchanged and does not prevent inventory attachment; missing or ambiguous owners stop
preparation.

Pik Lam House's numbered Block 1 parent is forward-filled from the exact 22 July 2026
Address2D assertion only when that numbered premise is absent. A returning numbered
source, including `PIK LAM HOUSE (BLK 1)` / `碧林樓(1座)`, bypasses the fallback with
its publisher point and bilingual premises unchanged. The blockless assertion sharing
that CSU remains separate. Future omissions beyond 19 August 2026 carry unverified
curation provenance until reviewed.

ALS Address2D source records retain the complete publisher premises assertion in
`properties`, using documented flat field names. Address3D source records retain only
the bilingual unit inventories that the 3D delivery adds: `address3dEn` and
`address3dZhHant`. Each array row has `floorNum`, `floorDescription`, `unitNo` and
`unitDescriptor`; the enclosing array supplies the locale. The corresponding Address2D
source record retains CSU IDs, coordinate attributes and premises components, avoiding
their repetition for every 3D occurrence. Original 3D geometry remains in
`sourceGeometry`, with source identity, release tracking and compact acquisition
references alongside it. Canonical history/current tables own normalised and corrected
projections. Canonical Address references belong to their component history; processing
decisions belong to retained preparation and audit artefacts. Existing source versions
remain immutable and are not backfilled into this compact representation.

The sealed source ledger includes every uploaded 2D and 3D occurrence, including records
combined or replaced by house retention. Inventories reconstructed from historical
evidence belong to canonical collections and carry compact evidence references; they do
not become additional publisher rows for the current upload. Deliveries containing only
2D input also retain a sealed ledger.

Address3D source versions are keyed by `(sourceRecordId, versionHash)` and reused when
their publisher payload is unchanged. Collection corrections and release provenance do
not contribute to the source payload hash. `validFromRelease` records first appearance;
changed or removed assertions receive `validToRelease` and cease to be current. Release
rollback restores the preceding source state without deleting reused source versions.

History resolution preserves prepared ALS canonical premise IDs, including reviewed
aliases. `CsuId` (or `GeoAddress`) and premise components establish source identity;
district, street and building number cannot override it. Distinct premises sharing a
street address retain separate Address2D records and Address3D ownership.

Fresh official-address initialisation replaces a stale target manifest only after the
clean address baseline checks pass and new before-images are captured. A running
manifest resumes automatically. Before ingestion, retained official-address SQL
deliveries are replayed and their owning release finishes from its sealed prepared
files, including Address3D and publication. Completed source releases are skipped.
Failed baseline checks preserve the manifest and its reset ownership information.

ALS preflight includes both passes of 3D preparation for each release: source-parent
ownership resolution followed by corrected bilingual inventory validation. Shared-owner
ambiguity, conflicting inventories and row-size violations stop preflight before
ingestion. `writeOutput: false` suppresses artefact writes, while retaining 3D
validation and its parent block enrichment and duplicate suppression. Block-free
enrichment candidates must have no bilingual source block objects. Descriptor-only
blocks such as `CARPARK BLK` / `停車場` retain their publisher components and use their
existing 2D parent without numbered-block enrichment.

`--skip-curation-checks` permits preparation to retain pending correction verification
and identity drift evidence locally. Ingestion checks the sealed review cache before
assembly; unresolved cases, including deletion reviews, block it. Grouped initialisers
and direct `hkgov-dpo:ingest` use the same gate. This flag does not approve an identity,
change fixture verification dates or bypass integrity validation.

Strict ALS preflight stops on an alias-coalescence guard mismatch with the release,
curation fixture and decision ID. It writes an unresolved JSON review item under
`.local/hkgov-dpo/review-queue/`, retaining the decision, failed assertion and
owner/alias prepared rows, including their source provenance and coordinates. The error
includes the JSON path for curator or LLM investigation. Identical evidence reuses the
same item; different evidence creates a separate item. Review items do not approve
corrections or alter source coordinates. Completed checkpoints remain on disk; reuse
still requires matching preparation dependencies.

Grandeur Terrace Block 1 uses the curator-selected northern block-alias point
`[114.00057, 22.46887]` for retained releases from `2026-04-25.0` through
`2026-08-19.0`. Coalescence requires the exact named-premise point
`[114.00057, 22.46877]`, alias point and bilingual identity guards. Its provenance
retains both publisher geometries and the derived geometry. Earlier matching points
remain unchanged; any different source pair requires review.

Grandeur Terrace Block 4 uses the fixed curator-selected point B `[114.00141, 22.46971]`
across all historical and future releases, with no release bounds. Publisher coordinate
differences do not block this decision; bilingual building identity guards still apply.
The named record retains its identity, the separate alias is suppressed, and provenance
retains both publisher geometries and the derived geometry.

Grandeur Terrace Blocks 5–11 retain their curator-selected B coordinates from
`2026-04-25.0` until revoked: respectively `[114.00169, 22.46999]`,
`[114.00203, 22.46947]`, `[114.00214, 22.46911]`, `[114.00224, 22.46874]`,
`[114.00235, 22.46837]`, `[114.00155, 22.46891]` and `[114.0012, 22.46866]`. The fixed
coordinates remain independent of subsequent publisher point changes; bilingual identity
guards remain mandatory and both publisher geometries remain in provenance. Releases
after `2026-08-19.0` carry unverified curation provenance. Earlier releases retain their
matching publisher coordinates.

ALS ingestion retains the effective Address assembly recipe and exact source selections,
including enrichment and lookup inputs, following the
[assembly provenance contract](../../pipeline.md#snapshot-assembly-provenance).

ALS preparation seals its audit inputs to the prepared Parquet digest in an
`.audit.json` sidecar. The retained R2 audit contains preparation and normalisation
declarations, automatic substep counts, reviewed fixture documents and individual
identity-continuity decisions. Publisher payloads remain source evidence; bulk audit
rules do not copy publisher rows or canonical outputs. Publication requires registered
provenance and completed delivery retries reuse the same retained graph. See the
[processing provenance contract](../../processing-provenance.md).

ALS delivery prepares Address2D, grouped Address3D and publisher assertions in the same
isolated local candidate. Owner and section validation precede the sealed remote plan.
The plan contains final keyed mutations, and publication follows successful delivery of
all outputs. The acknowledged mirror advances only after the remote receipts are
reconciled; interrupted delivery resumes the retained payload and timestamps.

Remote transport groups up to eight consecutive pending batches on the same database
within a 512-data-statement and 8 MB retained-payload budget. This includes the retained
2D publisher ledger. Grouping preserves each sealed batch's receipt, statement order and
bound parameters; committed batches are not resubmitted on recovery.

Local source-version retirement runs in bounded transactions. The final remote plan
contains only source assertions whose open state or payload differs from the
acknowledged mirror, using the sealed release timestamp. Unchanged assertions retain
their original validity start and content. Receipt checks determine whether interrupted
delivery needs to send a batch again.

ALS supplies bilingual premise addresses. The
[import specification](../../internal/hkgov/address.md) describes source preparation,
identity curation and ingestion. The [Addresses family](../../families/addresses.md)
describes their canonical role.

Uncurated `parentAddressId` is initialised to null. ALS component names and number
ranges alone do not establish a containing Address or justify creating missing numbers.

The shared normalisation stage classifies `granularity` after guarded component
corrections, for both SQL and Worker ingestion. The corrected Ngong Ping tourist-complex
estate component yields `complex`. Supporting decisions and evidence are retained in the
codebase component and granularity curation fixtures. Only the resulting granularity is
materialised; classification does not alter publisher source records. Number-only
addresses, conflicting locale components and ambiguous facility labels remain `unknown`;
a building-number range never turns its individual numbers into units. See
[granularity curation](../../families/addresses.md#granularity-curation) for guarded
manual overrides and how changed evidence reopens review.

## SQL delivery

Grouped Address3D ingestion validates all owners and unresolved sections against the
selected 2D projection before writing collections. Lookups stream in groups of at most
99 references, reserving the remaining D1 parameter for the snapshot. Missing owners and
sections without exactly one reviewed parent match block ingestion; batching does not
infer or change parent relationships.

One `sql-delivery-address` plan seals the complete Address2D, Address3D and
source/provenance result against the acknowledged mirror. Source checksums, schema and
baseline identity bind the delivery to its preparation. Database receipts allow recovery
after a lost acknowledgement. See [resumable SQL delivery](../../sql-delivery.md).

Initial uploads export the complete prepared database contents, retaining immutable
history and a single final current projection per lineage. Subsequent uploads compile
only resolved changes. SQL staging is local preparation state and is excluded from the
remote plan. The resolved mutation compiler checks 100 parameters, 100,000 SQL bytes and
a conservative 2,000,000-byte logical-row budget. Address batches reserve space for the
publication guard and contain at most 63 data statements and slightly less than 4 MiB of
retained payload. A current Address3D collection stays within one bounded transaction;
an oversized collection fails preparation. These bounds do not remove D1's database-size
or execution-time limits.

## Component correction fixture

[`hkgov-dpo-address-components.json`](../../../../fixtures/meta/curations/hkgov-dpo-address-components.json)
stores reviewed building-to-estate classifications separately from ALS identity
decisions. Each correction records its ID and revision, inclusive source-version range,
CSU ID and accepted GeoAddresses, expected bilingual fields, component overrides,
excluded names and evidence. A null upper version bound allows subsequent releases only
while their identity and expected components still match.

The shared Address normalisation stage applies the fixture to a copy of the prepared row
for both local SQL and Worker ingestion. A targeted record with an unexpected identity,
component or missing source version raises a `requires review` error. Earlier releases
and unrelated source records receive no correction. Review the retained source before
updating expectations, accepted identifiers or the applicable range; increment the
correction revision when changing a reviewed decision.

The correction moves the existing bilingual building labels into `estateName` and clears
`buildingName`. It preserves publisher spelling and formatted address text. Source
`properties` and source-content hashes retain the publisher classification. Canonical
`sources.hkgovAlsComponentCorrections` records the fixture version and applied
correction IDs/revisions; this provenance participates in canonical content versioning.
Canonical IDs, street numbers and geometry are not overridden.

## Ngong Ping tourist complex

The fixture classifies `NGONG PING THEME VILLAGE / 昂平市集` as an estate at **111 NGONG
PING ROAD / 昂平路111號**. These spellings are retained from ALS. Eleven retained
Islands district deliveries from September 2025 through August 2026 substantiate the
expected components and stable CSU ID. The GeoAddress changes between the 22 and 25
April 2026 deliveries; both verified identifiers are recorded in the fixture.

`NGONG PING TSUEN / 昂坪村` is explicitly excluded. No tourist branding aliases are
introduced. Shop numbers such as `9B` must not replace street number `111`. This rule
creates only the corrected parent Address2D projection; sub-premise identification and
Address3D matching are outside its scope.

The fixture is bundled with ingestion code. Editing it requires an updated ingestion
build and a new snapshot generation; it does not rewrite prepared source files, resume
already-normalised chunks with new results, or mutate published releases.

## Reviewed estate, building and section hierarchy

The reviewed Chun Shek car-park omission uses the premise-reconstruction fixture to
restore its February 2026 assertion in all seven retained releases from April onward.
Actual evidence dates and source absence remain explicit. The car park retains its
identity and stays distinct from the shopping centre, with no inferred unit inventory.

Chuk Yuen North Estate's reviewed preferred name is `Chuk Yuen (North) Estate` /
`竹園北邨`, following HA's estate-specific parentheses. The estate-name fixture
preserves ALS spellings and identity while updating canonical components and display
addresses.

Reviewed nested commercial premises use `hkgov-dpo-address-nested-premises.json`. Choi
Yuen Food Court links to Choi Yuen Plaza, which links to Choi Yuen Estate, across all
retained releases. `hkgov-dpo-address-premise-reconstructions.json` backfills the July
22 location into twenty-six older representations and both July gaps, retaining the
actual evidence date and original publisher assertions. The food court has one
normalised identity. Containment neither merges the unnamed same-CSU record nor assigns
residential inventory to the food court.

`hkgov-dpo-address-premise-consolidations.json` guards Choi Ying Place's reviewed
cross-CSU consolidation. Reviewed consolidation, named-premise retention and derived
hierarchy parents assign stable SaanSeoi-issued `ss-<uuid-v5>` address IDs; these are
not GERS identifiers. One named `CHOI YING PLACE / 彩盈坊` record is retained in each
release; the underspecified duplicate is suppressed wherever present and the corrected
Chinese name is backfilled. Original components and discarded assertions are preserved
as evidence. A curated identity spans the publisher's temporary CSU change; the rule
does not generalise shared points or CSU values into permission to merge.

`hkgov-dpo-address-school-reconciliations.json` keeps the exact 3 Tsing Luk Street Ho
Chak Wan Primary School assertions as one school throughout retained history. The
estate-only CSU is retained as raw estate-membership provenance while the bilingual
school label is backfilled onto the stable owner; the missing named assertion is not
treated as a closure. The separate Liu To Road premise is outside this exact-match
decision.

`--skip-curation-checks` applies reviewed Address3D suppressions when their evidence
guards match. An unresolved guard mismatch does not fail preparation or apply the
suppression. Rejected Hung Hom Phase 2 inventories remain raw source evidence and do not
emit collections referencing removed address owners.

Local ALS baseline ingestion ignores retained address lookup caches without an exact
parent snapshot. Later releases reuse only the matching parent cache, preventing stale
unchanged-row decisions from omitting 2D inventory owners.

Skipped 3D section-ownership, ambiguous block-parent and shared-building-owner checks
emit single-line `ALS_MANUAL_REVIEW` JSON records to the ingestion log. Each carries the
source version, file, feature index, CSU, names and candidate address IDs. These remain
unresolved; parent-link integrity failures still stop the affected preparation rather
than fabricating an owner.

Tsz Lok Phase 3 unnamed CSU `3864823026T20050430` is suppressed from 3D collections for
its reviewed July 2024–January 2025 assertions using a complete feature hash. Its 633
bilingual floor/flat expressions are already represented in named building records. Raw
evidence and 2D addresses remain intact, with no changes to the named inventories or
reassignment of ownership.

Tung Tau (II) Estate multi-storey car park CSU `3790621798T20050430` persists at 183
Tung Tau Tsuen Road until revoked under the address-only retention rules. Complete
source assertions guard the restoration after its publisher disappearance.

`hkgov-dpo-address-oi-hei-backfill.json` guards all 30 retained Oi Hei House 2D
assertions. GeoAddress `1542227735T20110329` and coordinates `[113.97444, 22.38873]` are
backfilled without changing CSU `1545427760T20050430` or its inventory. Raw bilingual
premises, GeoAddress and geometry remain provenance.

The house-retention fixture also retains refuse collection point CSU
`3796421950T20050430` at 183 Tung Tau Tsuen Road until revoked, including releases after
its June 2025 source disappearance. Exact 2D assertion hashes guard the retained
evidence. It has no 3D inventory and is excluded from 3D retention. Its canonical
English building label is Tung Tau (II) Estate Refuse Collection Point; raw `TUNG TAU`
and `東頭（二）邨垃圾站` labels remain in provenance. No residential inventory or
estate-level identity is inferred.

Shek Kip Mei Phase 2 unnamed CSU `3532121484T20121220` is suppressed only for its
reviewed July and August 2026 assertions, guarded by the complete source-feature hash,
including bilingual inventory and identity. Both named houses retain their separate
779-unit inventories. Raw assertions and 2D addresses remain intact; neither a shared
inventory parent nor a block-number correction is inferred.

Approved issue-batch evidence mismatches warn instead of stopping under
`--skip-curation-checks`. The unresolved decision leaves its records unchanged, and
other matching decisions continue to apply.

Reviewed Housing Authority estate names are stored in
`hkgov-dpo-address-estate-names.json`. Choi Wan uses the preferred `Choi Wan (I) Estate`
/ `彩雲一邨` names in canonical components and display addresses, preserving ALS `(1)` /
`(一)` spellings in raw evidence. Naming preferences do not change identity keys or unit
ownership. Numeral style follows the particular HA name rather than a universal Roman
numeral rule.

Explicit whole-inventory omissions use `hkgov-dpo-address-3d-backfills.json`. Ching Sum
House's June 2025 gap receives 949 units corroborated by identical May and August
inventories. The June bilingual parent must match the evidence premise, and the source
CSU must be absent from that 3D delivery. Cross-release evidence retains its actual date
and separate curation provenance; raw deliveries remain unchanged.

Reviewed closures remain dated source removals. Pak Tin Catholic Primary School is
absent from 25 February 2025, Pak Tin Commercial Centre from 26 April 2025, and the
Salvation Army Sam Shing Chuen Lau Ng Ying School from 18 October 2024. These are
delivery dates, not asserted closure dates. Historical assertions remain available;
these premises are not forward-filled. Pak Tin Shopping Centre remains a separate
premise. Exact chronology fingerprints in `hkgov-dpo-address-history-decisions.json`
guard the accepted removal events.

Yung Shing's `8 Fai Ming Road` and `22 Wah Ming Road` entries are two valid addresses of
one physical building, guarded by `hkgov-dpo-address-yung-shing-shared-building.json`.
Both address records and bilingual source labels remain available with `building`
granularity. They share an explicit physical-building identifier and inventory-owner
reference; Address3D emits one 138-unit collection containing references to both
original assertions. Neither address is modelled as a subordinate section.

Hin Fat House retains its 872-unit inventory across all reviewed releases from
January 2025. Its reviewed estate membership aligns the early 2D and 3D assertions; the
later evidence dates remain explicit. Yip Wong's Yip Wo, Yip Tsz, Yip Tak and Yip Sin
Houses retain independent identities and inventories of 684, 680, 888 and 1,036 units
from the July 2024 baseline until revoked. These rules reconstruct missing named 2D
owners as well as 3D inventories, even where the estate is wholly absent from that
release's district delivery. Present publisher houses bypass these retention rules,
including reappearances with changed details; future retained omissions are marked
unverified. Earlier evidence is backfilled only for these explicitly approved houses,
without changing other retention rules' dated-evidence requirements.

Ban Tip House at Fu Tip Estate and Kai Wang House and Kai Chun House at Kai Chuen Court
have omission-only retention rules from July 2024 until revoked. A present publisher
house bypasses the patch entirely, including on reappearance: its identity, components
and source payload remain authoritative. When the house is absent, the latest preceding
retained evidence supplies its address and inventory. The 3D fallback applies only to an
omitted 2D house and never replaces a present publisher 3D record. The retained
inventories contain 655, 550 and 468 units respectively. All thirty retained releases
through August 2026 contain these houses and therefore skip the fallback. Later
omissions retain dated evidence with unverified curation status; revocation disables
application to later releases.

`hkgov-dpo-address-house-retentions.json` records the reviewed Queens Hill and Shek Yam
house assertions and guards. Replayable publisher features live in the ignored
`.local/hkgov-dpo/curations/house-retention-evidence.jsonl` cache, regenerated on demand
from retained ALS releases by `bun scripts/build-als-house-retention-evidence.ts`. All
house-retention rules are omission-only. Queens Hill, Shek Yam, So Uk and the other
listed houses retain dated address and inventory evidence while the named house is
absent. A returning named 2D house skips both its address and house-inventory fallback;
a present 3D record also passes through unchanged. Standalone inventory backfills apply
only when their corresponding publisher inventory record is missing. Unnamed empty
aliases remain separate source evidence rather than being replaced by the fallback.
Active retention continues until revoked, with verification status recorded separately
from the evidence release. Duplicate coalescence, fixed-point corrections and publisher
identity overrides are not performed by retention on present records.

`hkgov-dpo-address-approved-issue-batch.json` holds exact bilingual, geometry and
inventory evidence for reviewed duplicate and component decisions. On Yam's combined Yiu
Yam/Tak Yam assertion and Shek Kip Mei's combined Mei Shan/Mei Hung assertion do not
emit additional collections; inventories belong to the separately named houses. Ping
Tin's empty alias, Sau King's empty alias and the reviewed Shek Mun estate assertion are
suppressed. Pok Hong Community Hall uses 6H Sha Kok Street across its equivalent
assertions. Sha Kok's extension label is backfilled without merging the main-school or
campus records. Sau King uses the user-reviewed 101 Sau Mau Ping Road / 秀茂坪道 address
while retaining the raw 101 Sau Ming Road / 秀明道 assertion and its 799-flat inventory.

The same issue fixture suppresses Sheung Lok's empty assertion throughout retained
history, Sheung Tak's separate Sheung Nim and Sheung Yee alias epochs, and the Bik Shui
and Tung Wong aliases from 22 July 2026. The named houses retain their inventories; Tung
Wong's discarded 83–88 Tai Hang Tung Road assertion is recorded in provenance.

`hkgov-dpo-address-estate-complex-decisions.json` distinguishes Shun Lee Estate at 15
Lee On Road from Shun Lee Commercial Centre (Phase II) at 6 Shun King Street. The centre
references the estate as its parent, with separate coordinates and unchanged raw ALS
names. The fixture also restores Sun Tin Wai's inventory-free estate premise at 29 Sha
Tin Tau Road across retained omissions. A returning estate-level premise bypasses
reconstruction and its associated fallback classification. The existing shopping centre
is not merged into the estate. These decisions are bounded to the retained releases and
preserve their source evidence dates.

Camellia House at So Uk retains its last 374-flat inventory and one curated identity
across the source omission, continuing until revoked with explicit verification status.
Sun Fong House's approved current coordinates are backfilled across retained history;
its inventory remains intact. Sun Yee House retains its reviewed earlier point,
`[114.18144, 22.36961]`, throughout retained history with its 720 flats.

`hkgov-dpo-address-street-estate-complexes.json` derives separate `complex` identities
for Tai Yuen Estate at 10 Ting Kok Road and Tin Wan Estate at 26 Tin Wan Street. Tai
Yuen uses the user-supplied marker `[114.1667207, 22.4555134]` across the 30 reviewed
releases; Tin Wan is backfilled and retained until revoked. Deterministic SaanSeoi
`ss-UUID` identifiers do not claim publisher GeoAddress or CSU values: those fields
remain null, and exact publisher assertions remain provenance. House inventories are not
assigned to these estate identities.

`hkgov-dpo-address-complex-promotions.json` promotes only the blockless Pik Lam House
assertion to the Tsui Lam Estate complex at 11 Tsui Lam Road. Its latest reviewed point,
`[114.24977, 22.32093]`, is backfilled from the earliest retained release. Block 1 stays
as the independent numbered building assertion, with its source components and point
unchanged.

Youth College's campus-specific bilingual label starts on 19 August 2026, guarded by the
reviewed history-event fingerprint and CSU `4361820309T20050430`. The earlier
`YOUTH COLLEGE / 青年學院` label is retained without backfill. Tsui Heng House's exact
`311A/C/D → 311` and `408A/D → 408` mergers are instead backfilled from the start of
retained history, using bilingual identity and inventory hashes in the 3D correction
fixture. Original inventories remain source evidence.

`hkgov-dpo-address-upper-estate-complexes.json` retains Upper Ngau Tau Kok Estate at 15
On Tak Road and Upper Wong Tai Sin Estate at the user-approved 8 Wong Tai Sin Road until
revoked. The former is a distinct estate identity, leaving the source car-park premise
and Sheung Yuet House intact. The latter selects only CSU `3781722749T20080408`,
preserving its original 9 Wong Tai Sin Road assertion as provenance and leaving the
separate 136 Lung Cheung Road assertion intact. Derived estate identities carry neither
publisher CSU nor GeoAddress nor house inventories.

Tsz Fai House's exact `418A/B/C` to `418` merger is dated 13 August 2025. Flat `419`
starts on that same date as a new flat and is not backfilled into earlier releases.

`hkgov-dpo-address-yau-yue-decisions.json` retains separate street-bearing complexes for
Yau Lai Estate at 9 Yau Tong Road, Yau Oi Estate at 3 Yau Oi Road and Yue Wan Estate at
365 Chai Wan Road. Yau Lai's other estate premises reference the complex as their
parent; the Fung Lai/Ying Lai identity and inventory ambiguity is left unchanged. Exact
source assertions and their evidence dates guard the retained complexes, with publisher
identifiers kept only in provenance rather than assigned to the derived estate
identities.

The same fixture removes only Yue Wan's unnamed CSU `4304314177T20050430` across the
reviewed releases. Both that assertion and the separately retained named pump house are
checked against release-specific hashes. The discarded assertion remains provenance,
including its later GeoAddress changes; no pump-house or residential inventory is moved.
Yiu Cheong House's `412A/B/C`, `212A/B/C` and `213A/B` mergers are backfilled to the
start of retained history, producing 272 units with exact bilingual inventory guards. Oi
Hei House retains CSU `1545427760T20050430`, which is already unchanged throughout the
retained releases; this decision does not change its separate GeoAddress or geometry.

Ching Ho House / 青荷樓 at Cheung Ching Estate is forward-filled from its September 2025
omission, together with its verified 851-unit inventory. The compact 4/F–40/F, 01–23
template is guarded by the exact August 2025 bilingual inventory hash. The paired 2D and
3D curations apply until revoked: releases through 19 August 2026 are verified; later
releases retain an explicit unverified status until reviewed. The removed ALS assertions
and evidence source remain provenance rather than being overwritten.

For Ching Lok, Ching Hay, Ching Sin and Ching Shun Houses, the paired
`hkgov-dpo-address-2d-backfills.json` fixture reconstructs named Address2D records
across the sixteen retained releases before June 2025. The inventory fixture supplies
their 4,234 units across seventeen releases before August 2025. Both start at 25 July
2024, after the Housing Authority's corroborated 2022 intake year. Reconstruction enters
the ordinary identity and division pipeline; later publisher assertions retain the same
normalised identities. Existing unnamed same-CSU premises remain separate source
records.

When a uniquely matching bilingual ALS 2D parent lacks a block while its ALS 3D parent
supplies matching `BLK n` and `n座` components, SaanSeoi enriches the canonical
Address2D with the existing building and block fields. The rule requires the same CSU,
estate, building name, street and number components in both languages. It records the
exact 3D source feature in Address2D provenance and as a release processing action.
Missing, ambiguous or non-standard components stop Address3D preparation for review
rather than creating another Address2D record.

Fortune Estate Carpark's reviewed estate-component restoration fills the five-release
April–July 2026 gap in derived fields and formatted addresses. Exact versions, CSU and
bilingual building/street components guard the correction. Raw assertions and identities
remain intact; the unnamed estate premise is not merged into the car park.

Bounded bilingual estate-component gaps are restored throughout the retained source
range only where a single unchanged premise has identical bilingual estate components on
both adjacent source releases. The generated fixture and verification retain the exact
target and bracketing versions. This restores derived fields rather than raw publisher
JSON, and never generalises from a CSU alone.

Estate-component restorations may also be active until revoked. Their application starts
after the fixture's reviewed source version and only when the complete bilingual source
target still matches. A later application is recorded as unverified in release
provenance until a later explicit review verifies or revokes it. Historical bounded
repairs remain bounded.

The unnamed zero-unit CSU `3370111759T20150127` is suppressed only across its reviewed
February 2025–July 2026 appearances as a duplicate of the named Lei Moon House. Its
estate, bilingual blank-premise structure, route, point and named owner are all guarded;
the full publisher assertion is retained in owner provenance. The HA Low Block remains a
derived section, and the later distinct Lei Fook Low Block source premise is unaffected.

`hkgov-dpo-address-coordinate-backfills.json` applies a current point to its preceding
continuous publisher-coordinate epoch only when the audited event is named,
coordinate-only and every shift is strictly below 50 metres. Each generated rule is
bounded by release, CSU, estate, English building name and the exact earlier point. The
estate guard uses the retained publisher estate name when supplied, independently of HA
display-name curation, and otherwise uses the prepared estate component. The replaced
publisher point is retained in the row's curation provenance; no later record or
unreviewed premise is altered.

Cheung Hong Commercial Centre No. 2 uses a bounded named-premise retention: preserve the
named premise, suppress the reviewed unnamed cross-reference only while both source
records occur, and reconstruct the name only for its five-release absence. The later
removal of both source records remains dated. The rule guards complete components and
coordinates, not CSU alone.

The Fai Ming Estate locality fixture backfills FANLING / 粉嶺 into the derived locality
provenance and formatted addresses for both reviewed buildings. Exact bilingual source
components and dates guard the decision. Raw source JSON, identities, divisions, block
details and inventories remain unchanged.

Easeful Court retains ALS Tower 1 and Tower 2 block components, matching the reviewed
360-unit and 150-unit buildings respectively. The block-identity review fixture guards
both source layers across retained releases; no building-name backfill or merge is
needed.

The historical review policy automatically accepts exact same-floor A/B-, A/B/C- or
A/B/C/D-to-base unit mergers when both languages and unchanged premise components agree.
Accepted events retain dated publisher inventories and distinct successor IDs; they do
not backfill earlier snapshots. Policy and authority are stored in
`hkgov-dpo-address-history-decisions.json`; generated decisions retain exact source
hashes in the estate audit. Mixed or ambiguous changes remain pending.

Kui Wo House's separately approved correction backfills the 2/F 213A/B/C/D merger to 213
across earlier retained inventories. Exact bilingual publisher and corrected hashes
guard this exception; automatic four-way merger acceptance alone preserves dated
history.

Hing Wai House uses the approved current point across retained releases. Fook Wo House
uses its reviewed earlier point with Block 11 components. Tai Ping's empty aliases are
suppressed against their respective Ping Ching and Ping Yee owners, preserving both
house inventories and their shared 8 Po Ping Road address.

Tai Wo Hau Shopping Centre retains CSU `3079225467T20050430`; the separate Tai Wo Hau
Shopping Centre (2) retains its latest available CSU `3071925270P20050725`. Both remain
available until revoked, guarded by reviewed source assertions and explicit verification
status. The second centre's missing releases are restored from retained evidence,
without an inferred unit inventory or a merge into the main centre.

User satellite-map review identifies CSU `3363111709T20141201` as Lei Fook Low Block in
the July and August 2026 deliveries. Its publisher identity and point represent the
section, with unresolved coverage of Lei Fook's combined 404-unit inventory. The raw
unnamed source remains intact. This is distinct from the Lei Moon Low Block premise.

The user-identified Lei Moon Low Block premise, CSU `3370111759T20150127`, supplies the
section's source identity and point in its February 2025–10 July 2026 deliveries. It
replaces the derived Low Block child in those releases and has unresolved coverage of
Lei Moon's building inventory. Raw unnamed components remain unchanged; section
identification is curation evidence. A nonempty inventory on this section requires
review.

Inventory corrections are stored in
[`hkgov-dpo-address-3d-corrections.json`](../../../../fixtures/meta/curations/hkgov-dpo-address-3d-corrections.json).
Each rule specifies source versions, CSU, expected building components, original and
corrected bilingual inventory hashes, exact floor/unit removals and additions, evidence
and review authority. Preparation corrects a copy and records the decision in source
provenance; raw publisher assertions remain intact. Changed evidence fails with a review
error. Lei Tim's reviewed omission adds flats 207, 217 and 219 on 2/F to nine
July–October 2024 inventories, yielding 720 units in each, matching the November 2024
evidence. Heng Tsui House's three reviewed August–September 2024 stale reversions
replace 1/F 118A/B/C with 118, matching the first merged July 31 inventory. The initial
July 25 split inventory stays unchanged; removal requires exactly one matching unit in
each language.

Lei Fook and Lei Moon in Ap Lei Chau Estate retain distinct building owners and 404
units each. Each owner has reviewed High and Low `section` children with unresolved unit
membership. The rule checks CSU and bilingual premise components across the 30 retained
releases, from July 2024 through August 2026. The derived sections retain curation
provenance and their parent's location; no separate section position or unit partition
is asserted. Identical floor/unit arrays never merge these two buildings. Other Ap Lei
Chau historical changes remain pending in the
[review report](./address3d-review.md#ap-lei-chau-estate).

[`hkgov-dpo-address-hierarchies.json`](../../../../fixtures/meta/curations/hkgov-dpo-address-hierarchies.json)
records source-backed hierarchy observations separately from component corrections. A
complex such as `MODEL HOUSING ESTATE / 模範邨` contains named buildings, while official
street-number records can identify sections or entrances within a continuous building.
The fixture records the finest level supported by ALS and does not infer missing
numbers.

For example, ALS identifies `MAN NING HSE / 民寧樓` as the `750-758 KING'S ROAD` range,
whereas `MAN HONG HSE / 民康樓` has separate records for 762, 764, 766, 768, 770 and 774
King's Road. The 3D entries contain floor and unit references only; they do not identify
an entrance or street number. A repeated unit payload can therefore be shared across
section records, but it must not be presented as section-specific unit attribution.

## Grouped inventories and estate hierarchy

The October 2024 deletion triage is recorded in
[`hkgov-dpo-address-october-deletion-retentions.json`](../../../../fixtures/meta/curations/hkgov-dpo-address-october-deletion-retentions.json).
It records the user's 54 retained identities and one approved retirement from the
55-entry review. The rules apply from `2024-10-18.0`; complete publisher CSU groups and
selected premise hashes guard every inspected delivery through `2026-08-19.0`. Changed
or uninspected publisher evidence stops processing.

Exact bilingual labels, address numbers, source points and structured components support
continuity, name omissions and renames. FTLIFE Tower becomes CTF LIFE Tower; SML Tower
becomes Upper Living. Hoi Pa Building at number 8 and Texwood Plaza at number 6 retain
their identities independently of other frontage numbers. Parent complexes and phases
remain distinct from Crestmont Block 9, Bella Vista blocks, Wellness Lodge Substation,
Hilltop Villa Block A, 2Gether South Wing and the 14 source-backed towers of The Reach.
Source IDs that move between these levels do not transfer a building identity to its
parent.

The three Cameron Lodge houses, Kowloon International Baptist Church, Wo Hop Shek House
B, Personage Hotel and 2Gether North Wing are retained with their genuine predecessor
evidence. North Wing and South Wing have separate building identities beneath the
retained 2Gether complex; a sub-premise never takes the complex identity. Personage
Hotel remains distinct from the already coexisting unnamed Cumberland Road address. The
user approved retirement of entry 28, Ngong Wan Road temporary substation; the approval
requires its exact predecessor membership and does not retire the nearby unnamed address
at number 129. A suffix match from number 5 to number 15 is invalid.

ALS preparation and isolated-review caches fingerprint Bun's emitted JavaScript for
TypeScript code. Erased type declarations and test edits do not invalidate prepared
artefacts. Executable changes, runtime version, source files, processing metadata,
selected division lookups and every output digest remain part of the cache contract.
Invalid TypeScript stops fingerprinting; changed runtime inputs during preparation still
prevent sealing the checkpoint. A consistency failure identifies the changed dependency
group so that source, processing, code and division-lookup changes can be investigated
without weakening the seal. Local release-set reconciliation retries Harbour
`control_unavailable` responses with a bounded delay; other structured failures stop
ingestion.

The November 2024 ALS triage is recorded in
[`hkgov-dpo-address-november-deletion-retentions.json`](../../../../fixtures/meta/curations/hkgov-dpo-address-november-deletion-retentions.json).
It contains 59 user-reviewed retentions from the 62-entry deletion review and one
supporting rule for the existing Chinese Recreation Club complex. Complete CSU groups
and selected premise hashes guard all inspected deliveries through `2026-08-19.0`. The
fixture records reasons and confidence alongside the user decision authority.

Fu Tip Estate houses retain their IDs when Chung Nga Road is corrected to Choi Tip
Street. Regency Centre becomes Metro South; St James Concourse becomes 1 Cheong San;
Kerry Warehouse becomes China Resources Logistics Fanling Warehouse. Palm Springs houses
retain their estate, phase and house qualifiers when the publisher moves their numbers
into village fields; the village number is cleared from curated structure to avoid
repeating the house number. Raw publisher JSON remains unchanged.

Wong Teck Building and Wai Tak Building retain genuinely recorded frontage addresses
independently of surviving frontages. Bella Vista Block 12A remains a building beneath
the reviewed complex; its broadened parent assertion joins that complex's existing
publisher variants. Chinese Recreation Club's named building remains distinct from its
complex and the already coexisting unnamed address. The Chinese Women's Club College
complex retains its identity across a replacement CSU and point correction.

The user retains Bamboo Vista, Gun Club Hill Barracks Block K2, Wo Hop Shek number 331
Block B and Loong Fung Terrace despite publisher withdrawal. Their identities and
specific premises remain separate from neighbouring or broader assertions. Entry 39
keeps its building name. Only entries 24, 38 and 41 retire: Yip Fat Factory Building,
Rose Court at Rose Street and Good Year Industrial Building, which the user confirms
were demolished. Retirement approvals require exact predecessor membership evidence.

The February 2025 ALS review uses `hkgov-dpo-address-february-deletion-retentions.json`.
Exact bilingual premise and frontage assertions retain their canonical identity.
Withdrawn building qualifiers, names and frontages remain separate from broadened
complex or phase assertions; qualified successors remain separate from retained parents.
Village numbers and phase assertions participate in premise selection, so a shared
publisher group cannot collapse independently recorded addresses. Complete
publisher-group hashes bound every inference to the inspected deliveries through
August 2026. Unsupported withdrawals remain behind the deletion-review gate.

Beaulieu Peninsula retains its broad parent above 40 separately identified houses, and
Celestial Heights retains its parent above 34 constituent buildings. Cho Yiu Centre
preserves blocks A and B independently of its Lim Cho Street parent and King Cho Road
frontage. St. Mark's School retains its identity when its bilingual name moves from
estate to building fields and Oi Tung Estate is added as context. The complete
constituent source groups are included in the evidence guards.

The user review covers all 387 February entries: 374 retain/reconcile decisions and 13
exact predecessor retirements. House C PT and ZONE S H.A.N.D.S are distinct sections
beneath House C and Oi Yung House. La Serene, the St. Luke's pastoral centre, Lai Chi
Kok Bay Garden and Tui Min Hoi Chuen retain their constituent buildings. Diocesan Boys'
School retains its campus and named components. Broad Fontana Gardens, Tai Po Plaza,
Stanley Plaza, Tai Tong Holiday Camp, Choi Kai Yau School and Conway Mansion assertions
are deduplicated without collapsing qualified buildings or separate frontages. Wings at
Sea towers, Coral Villa and Yuen Long Building remain retained. Human authority and the
earlier automatic confidence are recorded separately; browser reviews display confidence
alongside automatic matches.

Hin Fat House retains its reviewed owner identity, bilingual estate membership and
872-unit inventory when the raw named publisher assertion appears in February. The
predecessor unit identities must survive; matching counts alone do not prove inventory
continuity.

The January 2025 ALS review is recorded in
`fixtures/meta/curations/hkgov-dpo-address-january-deletion-retentions.json`. Thirty
supported reconciliations retain named buildings, independent Siu King frontages, and
constituent buildings beneath broadened complexes. Alberose retains its 132, 132A, 132B,
134 and 136 frontages independently of the 132–136 complex. YOHO West retains its broad
address assertions separately from newly qualified towers. Harbour East retains its
identity through the Hong Kong Li-Ning Building rename; the January named replacement
and unnamed predecessor assertions are consolidated. Complete publisher groups and each
selected assertion are guarded across the inspected releases through August 2026.
Changed or uninspected source evidence fails closed.

The reviewed demolition of Pine Court & Pine Grove at 23 Sha Wan Drive also applies to
their separately recorded named complexes, with exact predecessor guards in
`fixtures/meta/curations/hkgov-dpo-address-approved-retirements.json`. Ten reviewed
entries are approved to retire. The Convenience Foods building assertion at 7 Dai Fu
Street retires while its independently recorded unnamed street address remains. The
retained Silicon Hill Greenwood Towers 1, 2, 5 and 6 preserve their individual
identities and the supplied names and coordinates, including coincident points for
Towers 1, 5 and 6. Gee Luen Hing keeps both street frontages; the Silverstrand podium,
Black Point Power Station and Tam Gardens remain distinct premises. The original January
review has no undecided entries.

The December 2024 ALS review is recorded in
`fixtures/meta/curations/hkgov-dpo-address-december-deletion-retentions.json`. Seventeen
retained identities and the existing recreation-ground complex have complete CSU and
premise-assertion guards through `2026-08-19.0`. W Mega's 250–254 and 252 frontages
remain separate; Capitol Centre's 5–17 frontage remains distinct from its coexisting
5–19 frontage. Wo Hop Shek columbarium Blocks A and B keep their identities when their
street numbers are exchanged. Linda Vista and Kai Fat House retain their withdrawn
names. Seasons Monarch Houses 71 and 72 retain their house, estate and Kam Tin Road
components when the publisher moves the houses into village fields; raw JSON stays
unchanged. The Fu Tung market remains distinct from its plaza and estate. The university
complex assertions at 8 and 8–12 Wai Tsui Crescent remain independent, with the
residential building beneath the number 8 complex.

Fu Tip Block 7 and Hin Tip House have the same publisher CSU and matching 465-flat
inventories. The existing named-house identity and its existing unit IDs are canonical.
The withdrawn duplicate building ID is recorded as an alias, with the complete unit-ID
correspondence retained in source provenance. A duplicate inventory is reconciled only
when an explicit owner alias exists, both predecessor inventories match completely, and
all canonical unit IDs and bilingual floor/flat labels remain unchanged in the current
inventory. Partial matches, duplicate tokens, missing predecessor inventories and
regenerated canonical unit IDs still require deletion review. The report records each
unit alias replacement separately from physical retirement.

The reviewed Department of Health Institute of Immunology at 800 Victoria Road retains
its named building identity separately from the coexisting unnamed address. Pine Court &
Pine Grove at 23 Sha Wan Drive and Wang Cheong Factory Estate at 781 Lai Chi Kok Road
are approved demolished premises. Their exact predecessor records are guarded in
`fixtures/meta/curations/hkgov-dpo-address-approved-retirements.json`.

The September 2024 deletion review is recorded in
[`hkgov-dpo-address-september-deletion-retentions.json`](../../../../fixtures/meta/curations/hkgov-dpo-address-september-deletion-retentions.json).
Its 43 reconciled identities apply from `2024-09-03.0`, with exact publisher assertion
guards through `2026-08-19.0`. Renames, corrected component ordering and reviewed block
specificity retain the reviewed canonical IDs. Villa La Plage houses remain independent
of the unrelated Ching Tin houses. Get Nice Centre retains the reviewed 272 Chatham Road
North identity; the demolished Chinachem duplicate at that number is excluded from
curated output while its publisher assertion remains available. The two reviewed Shui
Chun retirements are recorded separately in the approved-retirement fixture.

Wing Fai Building retains its 398–400 Lockhart Road building owner and its distinct 398,
398A and 400 street-number sections, following the Model Estate hierarchy. Wong's
Building retains its building identity with the reviewed 84–90 Tam Kung Road range; its
individually addressed shops are `unit` children. New Lucky House retains the 13B Jordan
Road shop identity and its other source-backed shop addresses beneath a distinct
curation-derived building owner. No floor, shop number or unit inventory is inferred.
The fire-station complex and Fire Safety Ambassadors Club House building retain distinct
identities and a parent relationship. The Society for the Blind complex also remains
distinct from its source-backed factory and hostel building. Source absence is
represented as reviewed curation evidence rather than an invented publisher occurrence.

The estate review cohort consists of names present in any retained ALS
public-rental-housing 3D delivery, not every development named in 2D addresses. Review
the earliest baseline followed by chronological deltas; preserve exact release presence
and explicit curation bounds. See the report for the separate 2D-only inventory and
one-estate-at-a-time review queue.

ALS 3D inventories use one collection per reviewed Address2D owner. The
[hierarchy review report](address3d-review.md) records guarded estate relationships,
official corroborating evidence, source-release coverage and outstanding decisions.
Repeated source features remain independently traceable even when their identical unit
inventories share one curated building owner. Source names are retained, not translated.

Source-release record statistics report Address2D rows and translations, plus Address3D
collections and collection translations when a validated 3D sidecar is present.
Collection counts do not count the units stored within each collection. Missing 3D
statistics are unknown rather than zero. These facts are recorded during source
ingestion; `stats:backfill-addresses` rebuilds API release-set statistics only.

## Publisher source boundary

Publisher values, acquisition references, original geometry and canonical resolutions
follow the [source record storage contract](../../source-records.md). Field renaming and
flattening preserve upstream values; corrections and resolved identities remain outside
`properties`.

## Publisher record envelope

Follow the [source record contract](../../source-records.md). The response contains
publisher attributes and source identity; internal resource types, variants and
acquisition locators are excluded. Optional geometry preserves native coordinates and
CRS, independently of canonical geometry processing.

ALS source properties use locale-prefixed flat names, including `enPhaseName`,
`zhHantPhaseNo`, `enStreetLocationName` and `zhHantStreetLocationName`. The publisher's
repeated 3D addresses remain arrays under `en3dAddress` and `zhHant3dAddress`; their
grouping and literal values are preserved. The release schema distinguishes absent
optional fields from explicit null values.

## Artefact destination

Fresh local initialisation supports `--target local --r2 production`: immutable source
and provenance objects are retained in production R2, with registrations kept in local
D1. Follow the
[storage-target workflow](../../d1-bootstrap.md#ingest-locally-with-production-r2) when
selecting or continuing this mode.

Official-address initialisation stores the identity-history before-image in a separate
file beside its manifest. Keep both files for reset recovery. Completion queries release
metadata and ready Division publication receipts; it does not export source or history
shards. A missing before-image blocks reset before mutations. Full local database reset
clears the generated identity-history ledger before the next chronological ingestion.
Authored identity decisions are retained in their fixtures.

Initialisation manifest version 2 records baseline and materialised Division scope IDs.
Scoped reset resolves owned logical Address snapshots to their physical scopes before
removing current rows and Address/Division publication receipts. History and metadata
cleanup retain logical snapshot identities. Incompatible manifest versions are rejected;
reset/reingest creates the required state without backfill or manifest conversion.

## Registry metadata

Dataset processing metadata declares the registered ALS preparation, normalisation and
curation rules. Releases retain the resolved policy at creation. Source GeoJSON geometry
uses EPSG:4326; publisher easting and northing properties retain their separate
coordinate evidence.

Source storage and public records use `properties` for retained attributes. API-field
inputs reference this path through the shared dataset-scoped `publisherFields` mapping.
Processing-rule definitions remain in their registered fixtures and are pinned by the
selected release.

Retained locale-bearing labels use `En`, `ZhHant` and `ZhHans` suffixes, for example
`buildingNameEn` and `dcZhHant`. Publisher mappings place these labels after other
properties. Original publisher paths and language dictionary identifiers retain their
spelling; demographic measures about language are not locale-bearing labels.

Ho Sin Hang Building (何善衡樓), Lingnan University, has omission-only 2D retention from
25 July 2024 until revoked. Its reviewed named building and point are restored only when
absent; returning named publisher premises bypass the fallback. The unnamed CAMPUS
assertion sharing its CSU remains separate. No unit inventory is inferred.

The reviewed unnamed CAMPUS assertion is the Lingnan University (嶺南大學) complex. Its
canonical address omits the CAMPUS block label while retaining the raw bilingual source
assertion and publisher point. Ho Sin Hang Building remains a separate building even
where the two assertions share a CSU.

Dash Living on Prat (一尚酒店香港尖沙咀店), 21–23 Prat Avenue, uses its reviewed 2023
rename throughout retained ALS releases. The two named publisher CSUs share one
canonical hotel identity; the unnamed street address remains separate. Raw Butterfly on
Prat and Dash Living on Prat assertions remain in provenance. This is an explicit name
correction, not an omission-only retention.

China Resources Logistics East Asia Industrial Building (華潤物流東亞工業大廈), 2 Ho Tin
Street, uses the reviewed name across the 30 retained releases. Its original canonical
building ID is retained. Release-specific hashes guard the bilingual publisher assertion
and geometry; raw East Asia names and publisher coordinates remain in provenance. This
approved rename does not authorise retirement or imply omission retention.

The reviewed Redhill Peninsula House 20 identity has house/block number 20 and building
street address 20 Palm Drive (棕櫚徑20號). Its parent complex is The Redhill Peninsula
(紅山半島), at 18 Pak Pat Shan Road. These are separate address fields and levels; this
explicit mapping does not equate house numbers with street numbers generally. Raw
release addresses and house coordinates are preserved. The derived complex uses the
dated estate-address assertion point and does not inherit the house CSU.

The approved Redhill mapping includes Palm Drive houses 10, 14, 18, 20 and 22, and Cedar
Drive houses 80, 86, 92, 94, 96, 102, 106, 108, 112, 126, 128, 148, 152 and 176. Each
mapping has independent dated ALS evidence.

The retained `redhill-peninsula-centaline-evidence.json` records the four Centaline
building tables with source URLs and response hashes: Site A (Phase IV) has 10 towers
and 248 units; B has 58 houses, C has 42, and D has 146. The totals are 256 buildings
and 494 residential units. Building labels, occupation-permit years, publisher
coordinates, floor-plan links and dated sale/rent counts remain supplementary source
evidence. These counts do not supply individual flat identities, and coordinate
candidates require review before canonical matching.

The two House 24 addresses are distinct: ALS CSU `4151310224T20050430` identifies 24
Palm Drive and retains its publisher coordinates. The reviewed Centaline point
`[114.226669, 22.230345]` identifies 24 Cedar Drive; it is not a replacement point for
the Palm Drive ALS record. The supplementary evidence records this explicit separation
and the approved Cedar Drive point.

Bay View Villa at 39 South Bay Road is reviewed as redeveloped. Houses 1, 2, 3 and 8 may
retire on publisher omissions within the retained release range. The scoped retirement
fixture matches the exact prior address evidence and permits no descendant loss. Reports
retain these four removals as reviewed; unrelated retirements, changed evidence and
deletion spikes still require review.

Ban Tip House at 11 Chung Nga Road retains one reviewed canonical identity across the 30
retained releases. Its BLK 1 / 座1 component is backfilled only in the four releases
that omit it; publisher-present block detail is preserved. Exact release hashes guard
the source assertion and geometry. Raw bilingual names and coordinates are preserved.
This component completion is separate from the approved omission-only house retention.

Golden Wheel Plaza (金輪天地), 68 Electric Road, retains the named complex identity when
its three reviewed bilingual estate-name omissions are restored. The identity decision
is scoped to those restorations and preserves the raw unnamed source assertions.

The reviewed redevelopment retirements cover Kam Cheung Building at 470 Hennessy Road,
Kam Fai Commercial Building, the three Kam Po Building addresses, and the 13 Ta Lung
House entries: 18 exact canonical records. Approval is scoped to their retained
membership evidence; unrelated removals and dependent inventories remain gated.

Kawada Plaza II (川田工貿廣場2期), 5 Lok Yip Road, retains its building identity across
the 30 retained releases. Its reviewed building representation overrides the On Lok
Tsuen complex assertion while preserving raw bilingual source evidence and coordinates.

Shun Ting Terraced Home uses the canonical bilingual identity Transitional Housing -
Shun Ting Terraced Home (過渡性房屋 - 順庭居) across retained releases. The name
backfill preserves the unnamed ALS payloads and their source coordinates. Tai Hang Fire
Dragon Heritage Centre (大坑火龍文化館) similarly retains its earlier building name.

Ta Lung House is covered by the reviewed redevelopment retirements. Union Square is
forward-filled as a complex when its estate component is omitted; its component is not
treated as a phase. Bougainvilea Gardens is represented as the estate
`BOUGAINVILEA GARDENS` with numbered blocks 1–4, including the reviewed Block 2
component, without adding a building name. Raw ALS names and coordinates remain in
source provenance.

The reviewed premise-retention fixture preserves the baseline El Futuro tower and house
IDs and bilingual names. Its 22 houses use individually matched Centaline points from
<https://hk.centanet.com/estate/en/El-Futuro/2-DBAPWPPEPA>, retrieved on 12 September
2026; the fixture retains Centaline building codes, coordinates and floor-plan links.
Existing ALS house records are patched without duplicating buildings. Tower names
`TOWER 1` / `第１座` and `TOWER 2` / `第２座` remain available when ALS supplies only
numbered block components. Raw ALS premises and geometry remain source evidence.

One Soho and The Harmonie retain their reviewed building names on existing unnamed
address records. Kai Chuen Court backfills Kai Chi, Kai Tao and Kai Wu from their first
retained evidence on 3 September 2024 to the July baseline, alongside the existing Kai
Wang and Kai Chun retention decisions. These address-only reconstructions do not create
historical flat inventories.

Tin Wang Court retains a complex and three separate building children from the baseline:
Wang King House / 宏景閣 (A) at `[114.187272, 22.344419]`, Wang Yuen House / 宏遠閣 (B)
at `[114.186855, 22.344509]`, and Wang Mei House / 宏美閣 (C) at
`[114.186602, 22.344148]`. Named Wang Yuen and unnamed complex assertions are
distinguished even when ALS reuses the complex CSU for the house. The complex is
restored on omission; church and car-park records remain independent premises.

Victoria Garden uses blocks A and B throughout, including releases with I/II source
labels. Releases named Victoria Coast keep that publisher estate name and the same
reviewed building identities; this decision does not override estate names.

These premise rules are active until revoked. Historical release assertions guard the
full bilingual premise and point, including expected presence or omission. Future
applications accept only recognised source evidence and are labelled unverified; changed
assertions fail for review. Revocation stops future application while retaining
scheduled historical repairs. Restoration is scoped to the input district, and retained
source evidence is not represented as a current publisher assertion.

Hankow Apartments is reviewed as redeveloped. Retirement approval covers the five
baseline addresses and the later 45 Hankow Road identity, bounded to retained releases
and matched against exact membership evidence. It permits no descendant inventory loss.

The reviewed continuity decisions preserve the original ID for 28 Kwai Wing Road while
removing the obsolete cooked-food-market name, and for Lingnan University's renamed
Wofoo Joseph Lee Student Activity Centre (和富李宗德學生活動中心). Union Square remains
a complex with its reviewed ID, separate from the car-park assertion sharing its CSU.
Kai Wang and Kai Chun carry blocks 1 and 2. El Futuro uses the newer Chinese tower
labels座1 and 座2. These explicit component decisions preserve raw publisher evidence.
Ming Yiu Villa, the three Nam Tak Mansion addresses and Sheng Kung Hiu Kindergarten have
exact-record retirement approval. Hankow Apartments has redevelopment approval.

Proposed identity policy: assign a persistent ID using source reference, structured
route and number, and distinct block, phase or unit components. Use the building name
only when it is required to separate otherwise indistinguishable premises across
retained history. Once assigned, preserve the ID through name omissions, renames and
classification changes. A release-local uniqueness check alone is insufficient: an
omitted neighbour must not change the surviving record's identity. This general policy
remains a proposal; reviewed continuity rules currently resolve the approved cases.

University Hill retains its ten reviewed Marina and Scenic towers on omissions from 31
July 2024 until revoked. Returning publisher towers bypass replay, including separate
section-name and tower-number fields and changed CSUs. Marina Towers 1 and 2 remain
distinct even when they share a CSU. Exact release evidence guards each tower; returned
source attributes and coordinates are preserved. Centaline Phases 2A and 2B corroborate
the inventory, without replacing the publisher points. No earlier existence is inferred.

### Local review before assembly

ALS preparation retains unresolved identity drift, curation verification, division
linkage and 3D inventory cases in `{preparedFile}.review.json`. The preparation seal
binds this cache to the exact Parquet and 3D sidecar checksums. Ingestion rejects a
missing, changed or mismatched cache and stops before assembly when any issue remains.
Resolve the underlying evidence or curation decisions and prepare the release again;
editing or deleting the issue list does not establish readiness. `--yes` and
`--skip-curation-checks` cannot bypass this gate.

ALS prepares and ingests releases chronologically. Local deletion reports compare the
prepared membership with the acknowledged predecessor and block assembly until every
required report has its exact digest approval. Stale approvals do not authorise changed
membership. `.local/hkgov-dpo/review-backlog/` links the per-release review evidence;
review state does not belong to META. File-integrity, parent-reference and ID-collision
checks also apply.

Historical Address releases retain their exact published Division selection in
provenance and history. Current Address foreign keys use that Division lineage's
persistent scope, validated against its complete publication receipt. A newer Division
projection does not invalidate the older selection; missing receipts and lineage
mismatches remain ingestion errors.

Address metadata replay writes release statistics using `category`, `measure`, `unit`,
`dimension`, and `dimensionValue`, while retaining processing statistics owned by their
separate stage.

Building-number history compares the retained versions for each exact address and number
before selecting matching baseline content. Multiple lookups can reuse the same prepared
query safely within one release.

Address3D validation compares canonical unit IDs and localisation keys as sets. Counts
and content checks remain mandatory; a missing key fails validation even when an
unrelated extra translation keeps the total count unchanged.

Retirement dependency planning scans baseline parents before indexed deletion lookups.
Surviving children and deferred descendant deletions retain their dependency ordering
without repeating a full parent-table scan for each retirement.

Historical Address replay selects each immutable version by record ID and content hash,
plus locale for translated rows. Bounded queries use the existing composite identity
indexes and remain within D1 parameter limits. SQL planning uses the configured
`TMPDIR`; full local history copies require sufficient temporary disk space.

Retirement preparation batches historical row updates and locale tombstones in
transactions on isolated candidate shards. A failed preparation discards those copies
before any delivery is emitted.

Combined publisher-ledger reconciliation runs inside transactions on disposable source,
history and current candidates. Per-record batches use nested savepoints; failed
preparation rolls back open transactions and emits no delivery.

Preparation-cache code fingerprints exclude test files; runtime code and all source,
curation and division dependencies still invalidate reuse when their contents change.

## Island association

Preparation retains a direct canonical `landformId` when exact village/location-name and
district evidence resolves to one individual island in the selected division snapshot.
Ambiguous evidence stays unlinked. The derived association and its lookup snapshot are
recorded separately from the retained ALS publisher assertion and do not change the
supplied formatted address.

## Town associations

ALS preparation resolves `townId` from exact English or Traditional Chinese town names
in structured street/village `LocationName` or `VillageName` fields. Names are matched
against town divisions in the selected division snapshot, with case and whitespace
normalisation and matching district ancestry. Missing district ancestry, duplicate town
names within a district and conflicting recognised town names remain unlinked. Street
names, building names and formatted-address substrings do not establish town membership.
Derived `townAssociation` evidence retains the input names, method and division snapshot
separately from the publisher payload. Prepared files carry `townId` into Address2D
storage and version hashing.

Canonical Address2D identifiers use publisher-grouped objects with camelCase identifier
types: `hkgov-dpo.csuId` and `hkgov-dpo.geoAddress`. Identifier values remain unchanged.
Curation identities use `saanseoi.curationId`; native source properties retain their own
source contract.

## Geographic membership

ALS preparation-cache fingerprints retain source files, runtime code, processing
metadata, identity decisions and history, and the selected published division lookup.
Dataset input lists and catalogue documents are outside the preparation fingerprint;
editing them during preparation does not discard a valid prepared release. Changes to
processing inputs during preparation prevent a reusable checkpoint from being sealed.

Fresh ALS preparation selects the latest published SaanSeoi Division edition and the
latest published DivisionArea snapshot with the same variant and cohort. Without a
published curated edition, both references use the requested Overture cohort. Their
exact snapshot IDs are recorded in the release lookup dependencies and preparation
audit.

The initialisation prerequisite materialiser uses the same snapshot selector as ALS
preparation, so retained SaanSeoi identities and their translations are available before
Address delivery.

Membership runs after reviewed coordinate and locality corrections. Point inclusion
populates levels 3–6 wherever polygons exist and independently resolves island
landforms. Exact bilingual structured locality names resolve towns, villages and hamlets
without polygons, constrained by district and compatible canonical ancestry. Duplicate
names, conflicting recognised names and ambiguous spatial peers remain unresolved.
Per-premise provenance retains the method and references without altering the publisher
assertion. Prepared nullable fields carry all locality IDs into current and historical
Address storage and version hashing.

## API composition membership

The ALS Address snapshot variant is `hkgov-dpo`. It is the `primary` member of the
`saanseoi` Address domain and a `lookup` member of the `overture` Places domain. Both
memberships refer to the same snapshot lineage.

## Processing policy ownership

Ingestion retains publisher attributes and native geometry for 2D and 3D ALS
occurrences. Reconstruction, deduplication, curation and canonical Address normalisation
are snapshot assembly policies. SOURCE retention remains independent of those reviewed
canonical decisions.

The [processing policy contract](../../pipeline.md#define-audit-processing-rules)
separates captured ingestion and snapshot assembly definitions.

## Archive ownership

Original publisher inputs use `releaseSourceArchive` assets owned by their source
release. Resource-specific source exports use Parquet `resourceSourceArchive` assets
owned by their resource release. Each archive has a downloadable manifest recording its
original filename and packaging.

The March 2025 review records 15 high-confidence reconciliations in
`hkgov-dpo-address-march-deletion-retentions.json`, with complete publisher-group guards
through August 2026. Sing Yick Building keeps its 75, 77 and 75–77 frontages. Named
sports, park and court premises remain distinct from surviving unnamed street
assertions. Ka Yu/Ka Yue and Ap Lei Chau Municipal Services Building retain their
identities through spelling and abbreviation corrections. Capital Tower retains its
broad site identity as a complex, with Towers A and B independently beneath it. Lok Wah
Catholic Primary School and Lok Man Sun Chuen retain their campus/complex identities.
Human review confirms 17 retentions and two demolitions. Pao Yue Kong Swimming Pool
retains its named premise; A Hotel retains its building identity as Epoch Hotel. KK
Hotel and Le Hoteru Hotel retire as demolished premises, with replacement buildings
remaining distinct. The fixture preserves the original automatic confidence alongside
human-reviewed decisions; browser reviews show confidence and matching evidence.

The April 2025 review automatically reconciles Tai Fai House and Sing Fai House when the
publisher adds their Block 2 and Block 1 qualifiers, preserving all 952 unit IDs.
Reviewed retention rules preserve Chung Yuet Lau beneath Jat Min Chuen, Cheung Ching
Community Hall, Amber Place, and the Yu Nga Court complex separately from Nga Shing
House. Fu Shan Public Mortuary retains its identity as FPS Storage Facility; the former
Cognitio College retains its identity through the recorded change of use. Exact
publisher assertions across the retained deliveries guard these decisions. New source
evidence requires verification before the rules can apply.

The reviewed Seaside Sonata entries retain four distinct towers—1, 2, 3 and 5—with
201–218 Hai Tan Street as their shared address. Tower 4 is intentionally absent; the
development has four towers, not five, as listed in the
[project sales information](https://hk.centanet.com/info/en/new-property/Cheung-Sha-Wan/Seaside-Sonata/1696).
Shiu King Building retains its 177–181 Ngau Tau Kok Road, 2–8 On Wah Street and 10 Chun
Wah Road building addresses. Its 6 On Wah Street shop address is represented as a unit
child of the 2–8 On Wah Street building record. Identity aliases link distinct
predecessor IDs to the retained shop ID; an identity already equal to that ID does not
create an alias edge.

The ALS preparation checkpoint rejects changed dependency keys from its bounded header
before loading the large result. Matching checkpoints still require the complete result
hash and sealed-file checks. It writes and hashes result entries incrementally. It keeps
the sealed-file and dependency checks while avoiding duplicate complete JSON strings for
the large preparation result. Interrupted writes cannot establish cache reuse.

### Retirement review preparation

Search Google for each suspected demolished building using its name and address before
presenting the retirement review. Record source links, the date checked and the relevant
closure or redevelopment evidence; identify screenshots supplied by the reviewer as
reviewer-provided evidence. A Google “permanently closed” listing supports closure but
does not by itself establish physical demolition or its date. Retain conflicting or
inconclusive findings for review.

Group browser review cases into approximately 1 km × 1 km latitude/longitude cells,
ordered north to south and then west to east, with stable case numbers within each cell.
Use a ground-distance longitude correction for Hong Kong latitude. Preserve original
case numbers, identity keys, source version and deletion-report digest in JSON exports.
Provide Google satellite coordinate links and building-name/address search links for
both previous identities and proposed matches.

### May 2025 address decisions

The review with digest
`65d4b6fc6c41e5381f0c4d63e0622c2ff136c3aa89e4f31804dcc3c87e1fea6f` records 18
retention/reconciliation decisions and one approved retirement. The May curation fixture
preserves the original case numbers, notes and candidate selections. Cases 7 and 11 use
their sole same-source candidate to implement the explicit building-level instruction
despite an empty candidate selection.

THE STEP Blocks 1–5 remain separate retained buildings until revoked; its broader estate
assertion remains distinct. Six Lok Yuen House addresses use building-level names rather
than estate classification. Century Industrial Centre, Centre de Laguna, WE Hotel and
Tseung Kwan O Sports Ground reconcile to the selected named premises, keeping the
generic street addresses, broader estate and refreshment kiosk distinct. Fung Hse/EC
Healthcare Tower and Ovolo/Hollywood Hill retain their identities through the reviewed
renames. THE HEDON retains its identity at 11–15 Matheson Street.

Rules validate exact premise and geometry hashes across inspected deliveries, replay
publisher evidence only on omission, and record curation provenance. Wong’s Factory
Building retirement is restricted to the exact reviewed predecessor record in the
approved-retirement fixture. The reviewer-provided Google listing indicates permanent
closure; it does not establish physical demolition or its date.

Hin Fat House uses one reviewed owner through the publisher’s estate-qualified named
record. The approved 872-unit inventory is retained on a 3D omission even when its
publisher 2D building remains present. A returning 3D assertion takes precedence over
the fallback; all reviewed unit identities remain subject to validation.

Returning Yip Wong house records preserve the reviewed physical owner identities and
unit IDs. The approved June Ching Sum backfill keeps its predecessor owner and 949 units
while retaining the publisher’s Block 2 components. Source hashes guard that continuity
decision across the inspected deliveries.

June 2025 confidence-based continuity preserves 11 predecessor premise IDs for clear
renames, spelling corrections, equivalent addresses and publisher record replacements.
The June confidence fixture records the selected successor, confidence reason, available
linked evidence and exact publisher payload hashes. Separate street frontages retain
separate identities. Ambiguous hierarchy changes and new retirements remain subject to
manual review; closure alone is not proof of demolition.

June review decisions reuse active curations before requesting another decision. Wong
Teck Building retains its separate frontages under the established frontage policy.
Ching Tin Estate and Tung Tau (II) Estate Refuse Collection Point keep their existing
curated identities; approved duplicate predecessor identities become guarded aliases.
The selected Block 7B typo corrections use the same alias mechanism, preserving both
street frontages. The June review fixture records eight user decisions and four
applications of prior authority, with publisher or target-record evidence guards.

The September Get Nice Centre rename decision also supports the June 274 Chatham Road
North frontage, guarded by its own publisher source evidence.

The final June review retains The Vim and Kei Wah Court names, Anchor Street Refuse
Collection Point, and the distinct West Kowloon Government Offices complex and its North
and South towers. The Kodak House building retains its identity without the obsolete
name. The selected Eastcore rename preserves continuity, and the Shek Pik staff-mess
address is reconciled through an alias. Ten exact predecessor records have retirement
approval, distinguishing demolition, facility closure and dropped names without
inferring demolition from closure alone.

### August 2025 continuity review

Source-guarded curations preserve the established identities for Sky One (Hotel COZi
Wetland), Sunny House (Pentahotel), Tung Tsz Scout Centre and the South Horizons estate
address. The South Horizons decision reuses the existing estate-component curation.

Two Yip Wo House address representations keep their separate identities while duplicate
unit inventories resolve to the established inventory. This requires exact owner
metadata, complete matching unit tokens, and unchanged canonical unit IDs across both
releases; partial or changed inventories remain subject to review.

The August 2025 user review retains named buildings and the Palm Springs project name,
reconciles the Lee Wang frontages and corrected college address, and preserves distinct
buildings beneath the RMHC, Good Mansion and Silverstrand complexes. Three exact prior
identities have user-approved retirement decisions. Browser reviews support copying JSON
directly or downloading the same document; both include the exact report digest.

September 2025 continuity reuses the six existing identity decisions for the four Grand
Central towers, GR8 Inno-Tech Centre and Lions–YMCA Junk Bay Youth Camp. Exact publisher
evidence guards preserve the predecessor IDs. Cape Collinson Crematorium retains its
complex identity across a coordinate and Chinese spelling correction at the same street
address.

### September 2025 reviewed premises

The 3 September review retains sixteen premise records through guarded publisher
evidence and explicit identity reconciliation. The kindergarten and management-centre
frontages reconcile to the selected Laguna Street addresses while other valid frontages
remain available. Tsing Fung retains its combined frontage alongside the separate shop
addresses; YKK retains both phase addresses. Named buildings persist when the publisher
omits their names, Horizon Bay is named De Hua Tower, and Eminence Tower 1 is classified
as a building. Five Chek Chue Barracks block records have explicit user-approved
retirement decisions; these decisions do not assert physical demolition. The review
receipt and fixture preserve the submitted report digest and reasons.

If the reviewed management-centre frontages reappear in later publisher deliveries,
exact bilingual address and coordinate guards preserve the selected canonical identity
and retain the returned publisher assertions in curation evidence.

### November 2025 continuity

Six exact publisher continuity rules preserve predecessor identities for Woody House,
Tanner Hill Towers 1 and 2, Champion Tower, ICBC Tower and the Three Garden Road
complex. Publisher selectors and payload assertions guard the renamed or reformatted
premises; existing alternative Tanner Hill addresses remain available. Other November
premise changes follow the explicit user decisions below.

### November 2025 reviewed premises

The completed 4 November review retains all 113 Shek Kong Barracks identities, including
the complex. Guarded archived publisher records preserve their original IDs and scope.
Summerbreeze is a building; Sang On retains its valid frontages. Far East Bank Building
continues as Silka Far East Hotel, with the two separate predecessor frontages recorded
as aliases of the combined predecessor identity. The selected HSBC Building address owns
the reviewed alias. Dorsett Kai Tak, CLP Headquarters, Peng Chau Rural Committee and
Harbour Mansion remain distinct named premises. The Palm Springs and Royal Palms house
IDs survive publisher address formatting changes. CUHK Medical Centre retains its
complex classification. Lok Yuen retains both combined building frontages and seven
separate shop/unit addresses beneath the matching frontage. AIA Hong Kong Tower has an
explicit retirement approval; the decision does not assert an exact demolition date.

### Explicit review outcomes

Review JSON schema 2 records the intended operation and affected IDs in `resolution`.
Options distinguish keeping the previous premise, renaming the same premise, merging
duplicates with an explicit surviving identity, linking a building to a complex,
correcting one record's classification, retaining a building alongside selected shops,
and retaining separate address frontages. Each option previews the result. Shop and
frontage choices accept multiple candidates; hierarchy choices specify the parent and
child. Required choices must be complete before copying or downloading JSON. Draft
imports validate the report digest, membership and operation fields. Review selections
remain instructions until processed; the page never publishes dataset changes.

The address-structure review option keeps the previous ID while adopting a selected
candidate street and number. Estate context and real building names are selected
independently. The export carries bilingual components, clears the erroneous house/block
prefix, and records the chosen classification. Publisher village fields used for road
addresses can be moved into street fields without duplicating the old village address.
For example, 25 Maple Drive can retain The Green as estate context with no building name
or building classification. This remains a reviewer instruction until processed.

### December 2025 reviewed addresses

The 16 December 2025 review preserves ORIA, Stone Rise and Centre for Food Safety
building names and canonical identities. Kingdom Power Commercial Building continues as
Lee Fung Commercial Building. Kailey Tower uses 14–16 Stanley Street with duplicate
Stanley Street identities recorded as aliases; 23 Wellington Street remains separate.
The user's written address instructions take precedence over the forced reviewer
selection, and both are retained in the local decision receipt.

12 Santa Barbara Avenue retains Royal Palms / 加州豪園. 23 and 25 Maple Drive retain The
Green / 歌賦嶺 as estate context, with the house prefixes removed and Maple Drive stored
as the street rather than a building name. Explicit street-address classification
(`unknown`) takes precedence over classification inferred from the estate name. Tsing Yi
Town Clinic keeps its building identity separately from the clinic complex. The previous
“39 Sha Tsui Road” identity has retirement approval; the current 37–43 Sha Tsui Road
address remains. No demolition date is asserted.

The guarded rules are in `hkgov-dpo-address-december-2025-reviewed-retentions.json`; the
retirement is recorded in `hkgov-dpo-address-approved-retirements.json`. Publisher
evidence remains unchanged.

### Deferred 2026 investigations

The authorised 2026 import records uncertain address changes as
`needs-further-investigation`. This permits the publisher's omission to take effect
without approving retirement or asserting demolition. The deletion report retains
`requiresReview: true`, with `ingestionDisposition: ready-with-investigations`; the
unresolved work remains visible after ingestion.

`SAANSEOI_ALS_INVESTIGATION_AUTHORITY` supplies the explicit authority for creating 2026
deferrals. Each acknowledgement matches the source version, predecessor and exact report
digest. The durable queue is retained in the `ss-evidence` R2 archive, catalogued in
`fixtures/reviews/manifest.json` and cached in
`fixtures/reviews/hkgov-dpo-address-investigations/`. It preserves previous identities,
candidate evidence and lost inventories, including unit IDs. Preparation deferrals
preserve the sealed evidence for identity drift, unverified curations and conflicting
reviewed street components. A street conflict retains the assembled source assertion,
previous correction and conflicting values; it does not apply the disputed correction.
Missing street fields may be restored only when all supplied values agree with the
reviewed street. Missing previously reviewed inventories retain the expected canonical
unit IDs in preparation investigations. Existing inventories with changed canonical unit
IDs still fail integrity validation. Preparation evidence is sealed after these
inventory checks. Conflicting hierarchy evidence preserves the proposed relationship and
all estate records as an investigation before any part of that relationship is applied.
The disputed correction remains unapplied; final parent and membership validation still
runs. A change to evidence invalidates the matching acknowledgement. Invalid hierarchy,
missing parents, file-integrity failures and division-linkage errors remain blocking.

Confident continuations require one-to-one evidence. Exact bilingual addresses,
number-format corrections and omitted names retain the established identity when the
publisher, location and other premise components agree. House prefixes can become street
numbers while preserving bilingual estate and phase context. Different house numbers,
ambiguous matches, site-part scope changes and genuinely different names remain
investigations. The predecessor preparation is included in the cache fingerprint. Each
automatic continuation records its reasoning and alias in prepared provenance.
Estate-restoration rules accept a matching name already supplied by confident
continuity, retain both provenance records, and reject conflicting derived names.

Exact source assertions also record verified coordinate-only adjustments to earlier
curations where all bilingual premise fields and publisher identities agree. When a
publisher reintroduces an additional street address whose provisional ID is already
owned by a curated address, an explicitly reviewed rule assigns a separate stable ID.
The shared provisional ID does not become an alias of the additional address. D Hall,
Ablutions Block and Bauhinia House at 10 Hollywood Road and 16 Old Bailey Street are
recorded this way in `hkgov-dpo-address-2026-reviewed-continuity.json`. ORIA and Stone
Rise return with bilingual publisher names from July 2026. Each matches its existing
reviewed canonical identity; the returned record supplies the location without inserting
a duplicate retained record. The same exact-evidence handling covers The Stellar, Six
Pacific Place, Kowloon East Government Offices and CUHK Medical Centre, preserving their
reviewed classifications when publisher names move between fields. West Kowloon
Government Offices retains its reviewed complex and both distinct towers when the
publisher omits the complex record; the tower parent links continue to target the
retained complex.

A subsequent revision can resolve an investigation and restore a previously omitted
identity. Original publisher assertions, earlier memberships and the investigation
evidence remain available for that decision. Deferral itself does not establish that a
record persisted.

## Executable review decisions

Editorial review JSON is durable ingestion input. The TypeScript under
`apps/harbour-cli/src/lib/sources/hkgov/dpo/` executes semantic operations during
preparation. Monthly names identify historical evidence cohorts and regression tests;
execution does not depend on monthly handlers or hard-coded release dates.

`fixtures/meta/curations/hkgov-dpo-address-review-program.json` selects ordered
operations over fixtures registered in `hkgovAlsAuditFixtures.ts`. Its adjacent JSON
Schema supports editor completion and rejects unsupported operation fields. The runtime
validates both the program and each referenced decision collection before executing any
stage. Unknown codes, missing collections, invalid scopes and malformed evidence fail
closed.

| Code                         | Decision collection and effect                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guard-source-group`         | Checks complete publisher CSU groups against exact-version premise/geometry hashes, including siblings and empty groups. Missing district inputs remain outside that preparation.                         |
| `retain-premise`             | Replays reviewed source assertions and applies identity/component decisions under their exact source evidence and application lifecycle. Cohort order is explicit in the program.                         |
| `reconcile-identity`         | Preserves a guarded canonical owner and records aliases. Returned aliases are either rejected or coalesced only after bilingual address and coordinate checks; their publisher evidence remains retained. |
| `assign-parent`              | Links child IDs, resolved aliases or qualified estate blocks to a distinct canonical parent. Repeated publisher assertions may share that parent identity before consolidation.                           |
| `classify-premise`           | Checks the selected record's component guards, assigns its reviewed parent and optionally classifies it as a building, section or unit.                                                                   |
| `suppress-duplicate-premise` | Removes only a reviewed matching duplicate and retains its publisher assertion on the surviving owner.                                                                                                    |
| `derive-parent`              | Creates a reviewed parent from a retained assertion and links its source group without claiming an independent publisher assertion.                                                                       |
| `record-coalescence`         | Validates the canonical owner's publisher identity and name before recording reviewed coalescence evidence.                                                                                               |
| `guard-inventory`            | Requires the reviewed count and every canonical unit ID. Missing coalesced inventories may produce an investigation only within the authorised policy scope.                                              |
| `preserve-section-ownership` | Preserves a reviewed section's native inventory and unit namespace after checking its parent and granularity.                                                                                             |
| `reconcile-block-frontages`  | Requires the declared block set, selects the reviewed frontage owners, records aliases and applies the reviewed common street range.                                                                      |
| `reconstruct-frontages`      | Derives the declared building frontages and shop subpremise from the selected source record, preserving canonical IDs, address formatting and predecessor evidence.                                       |

The shared executor is split by responsibility: `hkgovAlsReviewProgram.ts` handles
source guards, parent assignments and identity aliases; `hkgovAlsReviewHierarchy.ts`,
`hkgovAlsReviewFrontages.ts` and `hkgovAlsReviewInventories.ts` handle their respective
stages. Operation input types and validation live in `hkgovAlsReviewOperationSchema.ts`
and `hkgovAlsReviewRetentionSchema.ts`.

For example, an editor registers a reviewed source guard collection using:

```json
{
  "id": "review-cohort-source-guards",
  "code": "guard-source-group",
  "fixture": "hkgov-dpo-address-reviewed-cohort",
  "collection": "sourceGuards",
  "sourceVersionFrom": "2026-08-19.0"
}
```

The referenced collection supplies `sourceFile`, `csu` and
`assertions: [{ "version": "…", "hashes": ["…"] }]` for each group. Fixture names omit
`.json`. Register a new fixture once in `hkgovAlsAuditFixtures.ts` and add its
operations to the program; extending an existing behaviour requires no monthly
TypeScript handler. Retention decisions should explicitly identify their originating
`curationFile`. Keep report digests, authority, reasons and inspected source assertions
with the editorial decisions. A triage label such as `retain-reconcile` does not provide
sufficient evidence to execute a mutation.

Stage order is part of the contract. Source guards precede assertion retention;
duplicate suppression, derived parents and coalescence evidence precede parent
assignment; initial parent assignments precede frontage reconstruction. Identity
reconciliation follows resolved-ID consolidation. Shop classification precedes final
retention cleanup, followed by final parent classification and hierarchy reapplication.
Section ownership runs during hierarchy processing. Inventory guards run after final
membership assembly and before the review cache is sealed. Program order is preserved
within each stage. `sourceVersionFrom` is inclusive; exact-version assertions remain
mandatory wherever the operation requires them.

`hkgov-dpo-address-review-operations.json` holds reviewed reconstruction and
classification data, including the original identities, authority strings and provenance
keys. Existing identity keys and provenance values are preserved as data; they are not
interpreted as operation codes. All 24 retained-premise cohorts are selected by
`retain-premise` operations. The audit includes the program, policy and referenced
decision documents. Field-lineage instruction selectors follow the program's referenced
collections as well as direct fixture imports.

Source-specific inventory processing uses three further guarded codes:
`suppress-exact-inventory` in `hkgov-dpo-address-3d-suppressions.json`,
`derive-estate-range` in `hkgov-dpo-address-estate-range-hierarchies.json`, and
`suppress-empty-premise-duplicate` in `hkgov-dpo-address-duplicate-premise-guards.json`.
Their inclusive release bounds, ordered evidence epochs, exact source hashes,
coordinates and expected assertion counts are data. Empty-inventory checks and source
retention remain mandatory.

### Investigation and continuity policy

`hkgov-dpo-address-review-policy.json` declares bounded `confident-continuity` and
`defer-investigation` scopes. Scope starts are inclusive and ends are exclusive. These
scopes control automatic continuity and creation of new investigation acknowledgements.
The current scope covers 2026 and does not extend to 2025 or 2027. Existing
acknowledgements replay only when their original authority and exact-evidence checks
pass. Confident continuity still requires one-to-one matching evidence. Deferral still
requires an explicit authority and an acknowledgement bound to the exact review
evidence.

Only identity drift, unverified curation, street-component conflict, reviewed inventory
omission and hierarchy-evidence conflict are eligible investigation codes. Unknown or
structural failure codes cannot be added to the deferral list. Changed canonical unit
IDs, invalid hierarchy, missing parents, integrity failures and division-linkage errors
remain blocking. A generated `.review.json` records issues and sealed evidence; it does
not authorise corrections or retirements. Deletion approval digests and membership
integrity remain independent gates.

An operation or policy with new semantics requires an explicit implementation contract,
guarded inputs and focused tests. Extend reviewed data within the existing vocabulary
when the treatment is already supported. Do not use an exception catch or a release
number to introduce a new editorial decision.

## Canonical source attribution

Canonical Address attribution uses `publisher: hkgov-dpo`,
`dataset: ds-hk-hkgov-dpo-address` and the retained publisher occurrence as `recordId`.
Address3D inventories list all contributing publisher occurrences. Content hashes, audit
references and component corrections belong to retained source history or the R2 audit,
not public attribution. Reappearing source assertions retain separate validity
intervals.

### Snapshot event storage

Canonical HISTORY stores a changed component once, with its introducing `snapshotId`,
`operation`, content hash and payload in the same row. Unchanged components inherit the
selected parent. Deletions append identity-only tombstones, and ancestor rows remain
immutable. Reversions and independent branch changes have distinct introducing events.
The read-only `historyEvents` view stores no additional membership rows. Snapshot reads
resolve ancestry before filtering and use the exact introducing snapshot to fetch
content. SOURCE release validity and interpretation evidence remain separate.

Canonical Address2D retains point geometry without a `bbox` column or API attribute. Its
immutable HISTORY events and CURRENT projections retain `createdAt` without `updatedAt`.
Publication receipts retain operational update timing.

Canonical HISTORY events follow the shared
[producer ownership contract](../../families/source-evidence.md#history-producer-ownership).
The introducing snapshot retains its exact producing inputs; source attribution and
field-level evidence identify the contributing publisher records.

The Fu Tip Estate Social Service Building and Lingnan amenities building retain their
reviewed July 2024 predecessor IDs in subsequent retention fixtures. The identity
decisions and retention rules must name the same canonical premises.

The `2024-09-03.0` identity decisions retain the predecessor IDs for all 22 Emerald Bay
premises, using the reviewed Emerald Bay A11 decision and the explicit instruction to
apply it across the group. China Taiping Finance Centre, 383 King’s Road, Bamboo Vista
and The Rainbow use distinct IDs. Ying Lun Centre, Tsuen Fook Kui and Kin Sang Car Park
retain their predecessor IDs. Exact identity pairs and the sealed review digest
accompany every decision.

The `2024-10-18.0` Emerald Bay to Ocean Camino name changes retain the same 22 published
premise IDs under the explicit group instruction. Exact source comparisons permit only
the building-name change; every other identity component remains equal. S22 and Five
Pacific Place remain separate review cases.

The remaining `2024-10-18.0` decisions identify S22 and Five Pacific Place as new
developments with distinct IDs. Their exact identity pairs and sealed review digest are
recorded with the optional development notes.

Identity review researches the building’s construction, groundbreaking or occupation
permit dates before requesting decisions. A documented new development whose
construction is roughly contemporaneous with the source-name appearance may receive a
distinct ID under the explicit review instruction. Evidence must match the exact site
and retain its source URLs and dates. An established building’s rename, ownership change
or refurbishment alone does not establish a new development; unclear cases remain
subject to review.

The `2024-11-13.0` Wang Cheong Factory Estate site record receives a distinct ID from
the former Block 1 under the construction-research instruction. Housing Authority’s
[2024/25 corporate plan](https://www.housingauthority.gov.hk/en/common/pdf/about-us/publications-and-statistics/publication-archive/corporate-plan/CP_2024-25.pdf)
records clearance in January 2023 and demolition starting in March 2023. Its
[May 2024 contract awards](https://www.housingauthority.gov.hk/en/common/pdf/business-partnerships/tenders/BP_Tender_Award_May.pdf)
record foundation contract 20230324 awarded on 20 May 2024; the contractor’s
[2024 interim report](https://www1.hkexnews.hk/listedco/listconews/sehk/2024/1209/2024120900219.pdf)
lists foundation works in progress as at 30 September 2024. This supports a distinct
replacement-site identity around the November source change without asserting that a new
residential building was complete. Exact identity keys, evidence URLs and the sealed
review digest accompany the decision.

The `2024-12-12.0` Felix Villas record at 61 Mount Davis Road retains its existing ID
under the exported review decision. The source keeps the CSU and coordinates while
removing Block 2 and moving Felix Villas into the estate name.
[HKU’s staff quarters record](https://staffquarters.hku.hk/felix-villa) identifies eight
houses built in 1922; this is a source-label correction for an established property. The
decision retains the exact identity pair and sealed review digest.

The `2025-01-23.0` GDS HK3 Data Center record at 23–33 Chai Wan Kok Street receives a
distinct ID under the construction-research instruction. The Buildings Department’s
[March 2023 Monthly Digest](https://www.bd.gov.hk/doc/en/whats-new/monthly-digests/Md2023e.zip),
table 5.5 (printed page 24), records notification of commencement of general building
and superstructure works for the data centre at that exact address. This construction
period supports the January 2025 name addition as a new development without asserting an
exact completion date. The decision retains the exact identity pair and sealed review
digest.

The January 2025 review assigns a distinct ID to the reprovisioned campus at 1D Oxford
Road. Its English building name is curated as `Shine Skills Centre` through
`hkgov-dpo-address-premise-renames.json`, independently of the identity decision. The
correction covers verified publisher assertions from January 2025 onwards and updates
the formatted address while preserving the original source names, Chinese name and
geometry. Unexpected source evidence requires review.

From the February 2025 release, `hkgov-dpo-address-structured-components.json` separates
Houses 1–3 at 8 Hang Hau Wing Lung Road into house descriptors and references, leaving
the street number as 8 and the building name empty. The separate unnamed source record
at that location is not assigned a house number. Tam Towers uses its building name with
Blocks 1–3; Tam Gardens uses its own name with Blocks 4–5. Chinese labels are split
consistently, estate membership is retained, and formatted addresses do not repeat an
identical estate and building name. Exact source-and-geometry hashes guard these
component corrections. Publisher assertions and independently reviewed premise
identities remain intact; published releases before February are not revised.

The numbered Tam Towers and Tam Gardens Block 5 corrections end with February 2026, when
those specific source assertions end. The later unnumbered Tam Towers representation is
not assigned an inferred block number. Tam Villas retains its separate parent identity;
Tam Towers Block 1 retains its distinct child identity.

The April 2025 retirement approval for the SDM Jazz & Ballet Académie label is bound to
its exact March membership record, including source ID, bilingual labels, coordinates
and parent. Tamson Plaza retains its published March identity through the reviewed
`THE 80|20` rename at 161 Wai Yip Street. These decisions do not infer demolition or a
new development from a publisher name change.

The June 2025 Tung Tau (II) Estate refuse collection point uses the explicitly reviewed
canonical identity in `june-2025-reviewed-alias-34`. Its earlier shortened English label
remains an alias of that identity. The exact CSU, address, Chinese name and coordinates
match the reviewed target; this is identity reconciliation, not a construction-date
inference or a physical retirement.

The June 2025 identity review retains the predecessor IDs for St Luke’s Church Pastoral
Centre at 47 Victoria Road, the newly named Yip Wo House address at 25 Tin Hau Road, and
8 Jordan at 6–8 Jordan Road. These reviewed level and name corrections preserve
continuity. Yip Wo House’s separately curated building inventory remains independently
identified.

When reviewed identity continuity consolidates multiple source address variants, 3D
inventories retain the exact parent keys of those variants and resolve them to the
surviving canonical owner. This preserves inventories whose publisher parent still omits
a newly added building name. Unrelated owner IDs and ambiguous parent matches remain
subject to review.
