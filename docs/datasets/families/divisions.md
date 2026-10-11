# Divisions dataset family

Division Wikidata links use `identifiers.wikidata.id`, for example
`{ "wikidata": { "id": "Q123" } }`. Canonical Division rows, prepared SaanSeoi records
and API attributes have no standalone Wikidata field. Overture's native `wikidata`
assertion is retained in its source payload and mapped into the grouped identifier
during canonical processing and SaanSeoi preparation.

API Division attributes are ordered as `divisionCode`, `category`, `class`, `level`,
`i18n`, `hierarchies`, `geometry`, `bbox`, `cartography`, `identifiers`, `sources`,
`snapshotId`, `createdAt`, `updatedAt`. Profile omissions preserve this order.
Identifiers are available in the default, map and full profiles.

## Representative points and separate areas

A canonical Division carries a representative GeoJSON `Point`, never a polygon.
Publisher points are preserved when valid. If the publisher supplies only a Polygon or
MultiPolygon, canonicalisation selects the centre of the largest inscribed circle in the
largest connected polygon part. The point stays strictly inside the area, away from
edges and holes. The `division-representative-point` audit guard rejects invalid areas,
non-finite coordinates and supplied points outside the canonical area, inside a hole, or
on its boundary. This handles concave shapes and disconnected polygon parts without
using a centroid that may fall outside the area.

An `island_group` label point may sit outside its member-island geometry, including in
the water between islands. Its coordinates must still be finite WGS 84 coordinates, and
its canonical area must remain valid. Individual islands and other divisions must retain
a point strictly inside their canonical area.

Area polygons remain in separate DivisionArea resources; boundary lines remain in
DivisionBoundary resources. Publisher source geometry is retained unchanged. Containment
uses the canonical area available to that operation, not every alternative, simplified
or transformed representation. If neither point nor area evidence is available, the
Division geometry is `null`; canonicalisation does not invent coordinates.

Request `include=areas` or `include=boundaries` to load geometry resources through
`relationships.areas` or `relationships.boundaries` and the response's `included` array.
A derived Point receives a point bounding box. Existing authored display bounds are
preserved; use the area resource's bounding box for the polygon extent.

Village-name curations retain the place name when adding ` Village` in English or `村`
in Traditional Chinese. Standalone suffixes are excluded from alternate names and
variants; the unsuffixed place names remain available as source alternatives.

## Identifier and construction metadata

SaanSeoi `identifiers` contains publisher-keyed identifier types with text, numeric or
list values. Geometry representation labels, construction methods, curation objects and
partition metadata are not identifiers. Construction methods, curation actions and
partition details belong to `ApiFieldsProvenance` at the API release-set level.
Record-level `sources` contains only retained dataset and record references, with
optional geometry component indexes. The `isLand` and `isTerritorial` fields describe
the geometry representation.

LandsD place-name identities use `hkgov-landsd.geoNameId`. Retained Overture Division
records establish `overture.divisionId`; UUID syntax alone does not establish publisher
identity. `BASEMAP:ISLAND:*` denotes a SaanSeoi review identity and stays in
`saanseoi.sourceId`. Selected native Protomaps records use `protomaps.sourceId`. OSM
export identities additionally use `osm.areaId`, `osm.nodeId`, `osm.wayId` or
`osm.relationId` according to the exported element prefix. Osmium area IDs are export
identifiers, not inferred OSM way or relation IDs. Coastline component IDs are
content-addressed Protomaps source records and have no OSM element identifier.

Curated Areas can retain identifiers of their associated division. Geometry input
records remain in `sources`; construction, island-group and partition objects are
rejected as identifier values. Historical repairs resolve publishers from retained
native records and do not assign current geometry selections to historical records
without retained evidence.

The SaanSeoi preparation audit separates its summary and before/after results from flat
fixture lists, classifies instructions as rules, bulk/custom curations or patches, and
supports release-scoped additions, exclusions and name decisions. It groups curations by
purpose and retains names from the pinned ingredients and final edition for readable,
searchable labels. Drawn and withheld Division Area inputs have geometry previews; file
metadata is separate from record counts. See
[preparation audit](../sources/saanseoi/division.md#preparation-audit).

Kwong Pan Tin Tsuen Sections 1, 2 and 4 and Hoi Pa San Tsuen Section II are excluded
from Overture sourcing during SaanSeoi division preparation through the `overture` scope
in `fixtures/meta/curations/saanseoi-division/division-exclusions.json`. The curator
identifies Kwong Pan Tin Tsuen Section 1 as a bus-stop reference; what Hoi Pa San Tsuen
Section II refers to is unclear. The unsuffixed source entries Kwong Pan Tin Village
(光板田村, `994be2bb-d03d-4a79-b860-ebde916fe86c`) and Hoi Pa New Village (海壩新村,
also named Hoi Pa San Tsuen, `35053297-d2a0-4ad9-af32-73fc76250c4a`) remain available
for preparation. All native Overture records remain retained.

## Native Overture source audit

Source ingestion retains the registered Overture payload mapping, including native
geometry and property-key handling. Source identity and dropped-field assumption checks
belong to ingestion; canonical hierarchy and normalisation checks belong to snapshot
assembly. Geometry intake records the Guangdong spillover filter and its counts before
source retention, independently of whether a canonical snapshot is reused. Reviewed
API-field schema compatibility is retained only when upload preflight ran.

Country-anchor preparation retains the reference rule and its validated single-record
addition. Upstream Hong Kong extraction and clipping need an execution receipt from the
extraction tool; cached files alone are not audit evidence for those operations.
Retained historical manifests are evidence of the operations recorded by their producer,
not a claim that every operation in the current implementation ran for that release.

Missing country ancestors are supplied during preparation from matching cached publisher
metadata or the reviewed country reference. The Source Audit retains the reference and
its hash; canonical assembly does not supply missing ancestors.

Overture retains its publisher inventory and geometry independently of SaanSeoi
editorial decisions. Canonical normalisation maps publisher level, class and category
into the shared Division schema, normalises locale tags and splits recognisable
bilingual names. It does not apply SaanSeoi identity-specific names, classifications,
translations, exclusions, hierarchy corrections or constructed area geometry.

SaanSeoi preparation owns editorial patches and curated source selection. It writes
final names, taxonomy, hierarchy and geometry into the published SaanSeoi archive;
canonical materialisation reads that prepared contract.

An **inventory** selects the primary `division` resource within a domain: its
identities, attributes, names and hierarchy. Area and boundary variants are compatible
geometry companions. Sources describe provenance and can contribute to an inventory
without becoming independently selectable inventories. The agreed
[domain and inventory contract](../../../spec/divisions-inventories.md) specifies the
API `0.2` boundary. Runtime selection is version-scoped; publication requires complete
curated monthly ingredients.

Curated classification belongs to SaanSeoi: the inventory selects the class and the
SaanSeoi taxonomy supplies its category and level. Overture IDs are retained for matched
identities without adopting or validating against publisher levels. Raw publisher
classification and names remain source evidence.

SaanSeoi additions use deterministic `ss-` IDs from stable fixture keys. Generated
administrative areas, Hong Kong city and unmatched island identities also use `ss-` IDs.
SaanSeoi preparation flags new primary/common-name matches for GERS upgrade review.
Confirmed matches adopt the GERS ID throughout the curated fixtures; matching aliases
alone never merges places. Jordan and Kwun Chung are distinct, as are Hok Tsui Lower
Village (鶴咀下村) and Hok Tsui Tsuen (鶴咀村). Lei Cheng Uk retains its GERS ID and “Li
Cheng Uk” as an English alias.

Division localisation history versions hash the locale row independently of the base
division. Names and their provenance therefore retain distinct versions when a base
division returns to an earlier state. Initialisation defers curated API publication
until required companion datasets have been ingested. The full Divisions initialiser
ingests the locked Protomaps and RVD source archives, then assembles and uploads the
SaanSeoi Division and DivisionArea releases before reconciling API composition.

The deprecated Divisions API `0.1` continues publishing Overture inventories with
`rs-division-merge-v1`. Its catalogue retains the twelve cohorts from September 2025
through August 2026 and the September 2026 Overture cohort. API `0.2` publishes the
SaanSeoi monthly inventory with `rs-division-merge-v2`, starting with the September
edition. Publication selects the API whose composition exposes the source variant as its
primary inventory, including deprecated versions. Geometry companions follow that
inventory. Reconciliation retains each draft's explicit API-version association.

Catalogue revisions are scoped to an API version and region. Their publication date
records when the catalogue was published; member cohort dates describe the data's
effective chronology. Initialisation therefore creates separate `v0.1` and `v0.2`
catalogue histories rather than backdating catalogue publication.

The full Divisions initialiser publishes government-domain release sets while deferring
their catalogue revisions. The September geographic edition publishes the first v0.2
catalogue with those domains included; October publishes the second. Government imports
use the process-scoped `SAANSEOI_INIT_DEFER_DIVISIONS_CATALOG` marker, which forwards
`deferApiCatalogRevision` to Harbour without deferring release-set or source
publication. Standalone government initialisers publish their catalogues normally.

Division audit actions retain repeated field values in bounded column dictionaries. R2
delivery uploads independent objects concurrently and registers the release audit only
after all dependencies and its manifest are verified. The Audit page expands the
retained actions for evidence display and search. Automatic rules retain declarations
and counts; translations retain applied decisions and aggregate unused-instruction
counts without per-instruction skipped actions.

Initialisation recognises a retained native baseline as complete when its published
curated snapshot records the exact source release through the registered SaanSeoi
assembly rule and has a complete delivery receipt with the matching publication scope.
Derived curated releases require their snapshot history assignment; source-row shard
assignments apply to the ingested native releases rather than the derived archives.
Curated assembly reads hash-pinned publisher archives directly and does not depend on
CURRENT projections or a populated database.

Canonical Division and geometry provenance follows the
[source evidence contract](source-evidence.md).

Canonical Division and included area/boundary resources expose `sources` only with
`profile=full`, including geometry included by Statistics responses.

Record-content hashes exclude observation timestamps and publisher version labels,
including nested attribution metadata. Effective dates, statistical periods and content
dependency hashes remain significant. Retained source payloads preserve the original
metadata. File checksums and processing-cache identities retain their complete inputs.

The [versioned geocoding contract](../../geocoding.md) uses published SaanSeoi area
polygons, with Overture fallback, for containment and preserves separate administrative
and landform identities. It reports missing coverage and unresolved hierarchy branches
explicitly.

Published rollback reconstructs exact base, locale, area and boundary predecessors from
retained journals and their owning history shards. It preserves unrelated domains and
cohorts, validates dependent current families, and seals only actual serving-row
changes. Source assertions, history and published compositions remain retained.
Readiness and search finalisation follow the shared
[rollback and recovery contract](../publication-state-plan.md#reset-and-reingest).

Forward releases compare against the restored predecessor's exact journals and owning
shards. Retained versions from a revoked publication remain reusable content; their
history flags do not select the next release's baseline or suppress its required
journal.

## Classification and stored ancestry

Geographic divisions expose `category`, `class` and `level`. Administrative classes are
`sar` (0), `area` (1) and `district` (2); localities are `city` (1), `town` (3),
`rural_area` (4), `village` (5) and `hamlet` (6); hoods are `macrohood` (4),
`neighbourhood` (5) and `microhood` (6). The separate country anchor remains
administrative. Planning and statistical domains retain their domain-specific classes
with no geographic category. Landforms use `major_island`, `minor_island`, `islet` and
`island_group`, all with `level: null`. Individual island land area determines the
class: `islet` below 10,000 m² (1 hectare), `minor_island` from 10,000 m² inclusive to
10 km² exclusive, and `major_island` from 10 km² inclusive. Island groups are
independent of area. Classification alone does not establish containment. Levels can be
shared and skipped; a hood does not require a city parent.

Public Divisions names expose `name`, `nameAlts` and `nameRules`. SaanSeoi source-record
samples and their schema use the same field selection. `nameVariant` remains retained
internal evidence and is omitted from these public outputs.

Curated assembly resolves ancestor labels from the final division localisations in
Traditional Chinese then English order, separated by one space. Duplicate values are
omitted and a missing translation uses the available name. Spatially generated paths,
explicit ancestors without polygons and retained paths all use this label contract.

Ingestion stores `hierarchies.administrative`, `hierarchies.locality`,
`hierarchies.landform` and `hierarchies.full` as arrays of ancestor paths. Every entry
is `{ id, name, class }`. Paths run broadest to narrowest and exclude the division
itself. Locality paths retain the nearest settlement, enclosing rural areas and hood
ancestry; full paths combine administrative ancestry with landform and locality/hood
paths. Cities and explicitly equivalent landform labels are suppressed from the full
display path while their separate associations remain. Paths preserve source
correlations: multiple districts or hoods do not create a Cartesian product of invented
paths. `name` is Traditional Chinese followed by English, trimmed and deduplicated, or
the one available name; absent names are null. The API returns these stored paths
without ancestor lookups or locale-dependent label construction. Optional
`include=hierarchy` loads the distinct ancestor resources, including cities, in
`included`.

Spatial hierarchy branches retain the positive-area remainder outside all matching
parents at each tier. That remainder continues through narrower tiers with its existing
ancestry, so a division partly inside a macrohood also retains a path for the portion
outside it. Overlapping parents are subtracted together; boundary contact alone does not
create a branch. Containment flags describe the whole division against each ancestor and
do not themselves determine the number of paths.

Hong Kong Island, Kowloon and New Territories administrative areas have deterministic
SaanSeoi UUIDs and district-union geometry. Kowloon city retains its source UUID
`17009785-57fd-4e5b-af86-2d27352e4718`; Kowloon area uses
`ss-bb5c7e0a-fd09-5416-8bb8-9593c90280fb`. The `KL` statistical code identifies the
area, not the city. Kowloon city and area share the same district-union geometry. Hong
Kong city retains its source identity and geometry when present; its missing identity or
geometry is reconstructed from Central and Western, Wan Chai and Eastern districts. Hong
Kong Island area also includes Southern District. Publisher assertions remain unchanged
and reconstruction evidence is retained separately.

The current/history schema requires these materialised paths. Populated databases need a
separately authorised rebuild and reingestion; generated schema migrations do not
reconstruct names, city identities or branching in existing snapshots. Do not publish an
old flat hierarchy as the new contract.

Open source versions with unchanged hashes retain their release ID, validity and
timestamps. Publisher membership determines omissions independently of release markers.
Geometry source and derivative conflict updates run only for closed assertions; closing
a changed version targets that current version without rewriting older history. Source
and derivative validity bounds store the release's `sourceVersion` component, such as
`2025-09-24.0` or `2021`, without a dataset or resource prefix.

New Territories area restoration includes the nine statutory district land geometries
and Lok Ma Chau Loop, then removes the configured Shenzhen Bay Port exclusion.

[Minimal initialisation](../minimal-initialisation.md) selects two Overture and Planning
versions while retaining the configured companion geometry prerequisites.

Lantau retains its Overture Division identity as `landform / major_island`, while its
SaanSeoi area uses the curated Protomaps island polygon. A guarded fixture excludes it
from administrative ancestry. The three administrative Areas are Hong Kong Island,
Kowloon and New Territories. Source assertions remain unchanged. See the
[internal geographic review workflow](../internal/geographic-review.md) for
cohort-scoped ancestry decisions and local area drawing.

SaanSeoi Division and DivisionArea share one jointly versioned source edition. A
read-only builder combines purpose-specific editorial decisions, authored drawings and
hash-pinned upstream archives into immutable ZIPs. The ordinary uploader handles both
resource types on local and remote targets. Each contributing source retains its own
source release, resource release, archive hash and release notes; the synthetic release
records their exact identities in its manifest and snapshot membership. See the
[SaanSeoi archive contract](../sources/saanseoi/divisionArea.md).

Each curation file has a root `purpose`. The shared loader generates identities and
reference geometry from pinned archives. Names, classifications, identity matches,
exclusions, authored geometry, source-geometry selections, independent point/bounds
overrides and explicit parent decisions have separate owners. Category and level are
derived from class; hierarchy labels and containment are generated. Unique original
drawings and pencil linework remain with authored geometry. Editable recovery state is
optional local cache under `.local/division-review/`. Published Division records retain
complete materialised hierarchy paths. See the
[curation ownership table](../sources/saanseoi/divisionArea.md#curation-ownership).

Named islands are curated as geographic landforms in a separate SaanSeoi assembly. The
native Overture Division source remains independently selectable. Where a curated
crosswalk exists, the assembled division retains the Overture ID; otherwise the assembly
uses a stable SaanSeoi fallback ID. LandsD Place Name records provide official names and
aliases, while `protomapsIslandFeatures` retains the selected native polygon. The
assembly never unions Overture and island polygons. Each canonical record exposes its
ingredient identifiers in `identifiers` and retained dataset/record references in
`sources`. Island polygons carry the explicitly selected Protomaps record ID and any
coastline component indexes. Processing roles and construction methods belong to
release-set `ApiFieldsProvenance`, not record responses. The local curation processor
emits the review artefact at `.local/harbour/islands/curated-review.json`, sorted by
area, with English, Traditional Chinese and alias names. Explicit exclusions and island
groups are omitted from the individual-island polygon output. Curated island-group
identities remain in the Division inventory, and the SaanSeoi assembly stops when a new
basemap name or new geometry for a previously no-geometry candidate needs review.

## API release statistics

Division API release statistics replay immutable snapshot membership across assigned
history shards, including inherited records and localised names. Counts, locale coverage
and churn therefore describe the complete API inventory. Churn compares the preceding
published cohort/revision in the same region, domain and API version; the first release
counts its inventory as added. Identity, hierarchy, attributes and names participate in
change detection; geometry and ingestion provenance do not.

Both general and Planning division publication calculate these API statistics.

Planning source SQL uses schema-derived column lists and retains publisher attributes in
`properties` alongside the complete source geometry. Reconciled division release sets
use the same calculation and recover missing churn for both current and archived
cohorts. Draft API sets wait for their required companion snapshots before calculating
statistics. To rebuild local statistics for all published division domains, run:

```sh
./bin/saanseoi stats:backfill-divisions --target local --dry-run
./bin/saanseoi stats:backfill-divisions --target local
```

`--release CODE[,CODE...]` limits the repaired releases without limiting predecessor
selection. The command validates every selected inventory before writing. It replaces
API presentation statistics only; source statistics, snapshots and publication state
remain intact. Missing history assignments or content versions stop the backfill.

Planning division release statistics include identity and attribute churn, separately
from source input counts. Repair statistics appear under Quality Checks. See the
[Planning source documentation](../sources/hkgov-pland/divisionArea.md) for local
retained-history backfill instructions.

Published source releases expose [schemas and samples](../source-record-access.md) from
their retained publisher records. Source validity follows the source release, including
shared Planning division/area projections and every assigned source shard. Restoring a
missing source ledger uses the registered archive and its content hash; canonical
divisions and published release metadata remain independent of that repair.

Geometry release churn describes incoming source records against the parent snapshot.
For merge uploads, parent members absent from the input remain in the snapshot and are
not counted as removed. Replacement uploads count absent parent members as removed.

## Resetting division data

`saanseoi reset:divisions --target local --dry-run` previews a reset of all division
identities, areas and boundaries across every domain. Omit `--dry-run` to confirm and
execute it; `--yes` skips the confirmation. Preview and production targets use the same
command with `--target preview` or `--target production`.

The reset removes division releases, snapshots, API release sets and catalogue
revisions, canonical current and history rows, and release-owned source rows across all
configured Hong Kong annual shards. Dataset definitions, curated identities and source
evidence assets remain available for reinitialisation. Source releases shared with
another resource family remain. Generated delivery and release caches are removed unless
`--keep-cache` is specified; delivery generations are invalidated in either case.

Dependencies in addresses, Places division links, statistics and other snapshot or API
families block the reset before deletion. Remote targets require a matching local
metadata cache and check dependencies directly in D1. The command rechecks the plan and
dependencies under the SQL delivery writer lock before execution. Pending delivery work
must be resolved first. Stop ingestion writers before resetting; database families are
reset sequentially, so an interrupted reset must be rerun before reinitialising
divisions.

## Processing

Hong Kong Area insertion is a bulk normalisation rule, not a patch or curation. A
separate `hong-kong-sar-area-district-hierarchy` guard checks the resulting ancestry for
districts and district descendants. For each source path, it requires exactly one
recognised Area between the Hong Kong SAR and district, rejects conflicting or duplicate
ancestors, and blocks unresolved mappings for review. Non-district branches do not
acquire invented district parents. Audit retains checked/failed counts separately from
the rule's assignment count.

Curated supplemental replacements are resolved before row processing. For an identity
being replaced, the hierarchy guard checks the final replacement after normalisation;
the intermediate source row remains available for source provenance.

Sai Wan Ho, Kornhill, Shau Kei Wan, So Kon Po, Braemar Hill, Tin Wan and Tai Hang
Mid-Levels use guarded level-5 neighbourhood patches. Aldrich Bay normalises to level-5
neighbourhood from its publisher classification.

QA corrections use explicit patch origins and fixtures under `fixtures/meta/patches/`.
Curations name their related review guard; patch source checks are application
preconditions, not triggers for requesting review. Area and boundary normalisers share
the `division-geometry-exclusions.json` executable policy, retained as a resolved
dependency in both declarations. WKB decoding has a shared registered rule too.

The curated Hong Kong hierarchy excludes level-6 squares, plazas, promenades and East
Wing Forecourt. These named public spaces and building plazas remain in publisher source
evidence but do not become canonical geographic divisions.

South Bay Garden (南灣花園) is excluded by a guarded Overture division patch because it
is a residential development rather than a geographic division. The publisher source
assertion remains retained.

Shek Pai Wan (石排灣) is excluded from the curated hierarchy by a guarded Overture
division patch. The publisher source assertion remains retained.

Division, area, boundary, classification, translation, Planning and synthetic-area
normalisers register JSON declarations from `fixtures/meta/processing-rules/assembly/`;
Audit retains those same frozen definitions. Taxonomy mappings, locale priorities and
geometry exclusions are consumed from their parameters. Merge ruleset references resolve
these definitions and include their content in the resolved ruleset hash.

API locale fallback lists contain only alternative source locales. Existing target names
are kept before alternatives are checked; English has no alternatives. The audit
presents locale rules together in one flat mapping table.

Division normalisation retains executor-backed branch conditions, stable branch IDs and
precedence for level/type classification, API locale copying and text locale inference.
Bulk audit counts record selected matches and changed outputs per branch; shadowed
candidates do not count as matches. Classification changes compare the canonical result
with the raw source `level` or `type`. Locale copying counts added locale rows, and
inference counts evaluated text values that produce locale-bearing output. Preparatory
hierarchy lookups do not contribute to these counters.

SaanSeoi source preparation retains these widgets for its normalised Overture ingredient
comparison, with counters restricted to identities retained in the edition. Its locale
table compares reviewed output names with normalised ingredient names, including removed
names, rather than reporting API fallback. The final administrative hierarchy guard
checks each applicable division across all of its district paths. See the
[SaanSeoi preparation audit](../sources/saanseoi/division.md#preparation-audit) for
count semantics and local reconstruction.

Recorded zero means no selected matches or changes in that execution. Missing branch
definitions or counters mean **not recorded**. Audit presents only retained policy and
never substitutes the current implementation for a historical declaration.

Overture attribution remains in `properties.sources`, including explicit nulls or empty
arrays supplied by the publisher. Private acquisition locators do not repeat publisher
attribution or canonical identifiers. A source table includes `sourceLocator` only when
its writer retains acquisition coordinates; archive and table-wide evidence belongs in
the release and processing receipt. Planning Cell and New Town assertions omit this
column because they have no row-specific acquisition coordinates; the Planning Cell
`TPUSU` layer is table-wide.

Local geometry prerequisite checks may read a pending delivery only when its sealed
plans prove ownership by the exact release being resumed. Other releases remain blocked
until that owner completes publication and releases the database.

Source records retain publisher payloads in `properties`, with identity, provenance and
release history alongside them. Publisher record versions remain in
`properties.version`; content hashes and release validity track source history.
Extracted names, classifications, hierarchy, cartography and geometry flags belong to
canonical history/current tables, not duplicate source columns. Native geometry may be
retained separately when the publisher delivers it outside the attribute payload.
Planning source tables retain the original `sourceGeometry`; repaired results belong to
canonical `geometry`. Source-keyed processing actions record the repair method and
affected records. Source tables do not duplicate repaired geometry or repair flags.

Division `identifiers` contain source codes and identifiers. Geography classification
belongs to `class` and other classification fields; C&SD HMA identifiers contain only
`CENSTATD:code`.

Canonical and geometry ingestion retain recipes, source rules and exact selections under
the [assembly provenance contract](../pipeline.md#snapshot-assembly-provenance).
Verified reuse preserves the published assembly evidence; draft companion inputs refresh
it.

Canonical, Planning Department and geometry processing retain
[processing audits](../processing-provenance.md) in content-addressed R2 objects. D1
registers the compact manifest and attempt status. Bulk rules expose registered
declarations and counts; bulk curations expose selected fixtures. Individual curations
are paginated and searchable. Failed blocking guards prevent publication. Audit
verification uses a bounded cache of verified JSON objects for shared fixture
references, checking every individual pointer without repeatedly parsing its fixture.
Remote provenance delivery transfers up to four verified objects concurrently and
registers the manifest only after every dependency and the final root are acknowledged.
Remote release-set reconciliation refreshes metadata before calculating published API
statistics, so publication and recoverable statistics attempts use committed membership.
History caches retain all Division identity and name versions needed by published
snapshot journals, including superseded versions used for predecessor comparisons.
Geometry processing opens all configured regional history shards because its selected
Division reference snapshot can belong to a later year than the source release. Source
and geometry writes remain assigned to the source release's shard year. Cache rebuilds
group selected tables by data/schema export mode per binding. Binary geometry rows
retain their separate byte-for-byte verified transfer. Post-publication statistics
failures are recorded against their ingest stage without changing current or archived
source-release status.

Curated Division codes use `SCREAMING_SNAKE_CASE` (for example, `TSEUNG_KWAN_O`).
Metadata registry synchronisation assigns each code to its canonical Division and
removes superseded codes for that same domain and canonical ID. Division processing
reads these curated assignments; domain codes and source identifiers retain their own
formats.

The `/v0.1/identityBridge` endpoint derives source-to-canonical mappings from the
selected API release set. Planning keys include their level; subunit values include
their TPU. Curated mappings needed by ingestion live in
`fixtures/meta/curations/identity/` and are not metadata database rows. See
[identity lookups](../../identity-bridge.md) for selectors and pagination.

Planning Division retries reuse sealed SQL and completion counts without repeating
normalisation, comparison, materialisation or import artefact generation. Local
materialisation runs on WAL-safe planning copies; target mutations start only after the
complete plan is sealed. Remote preparation uses its isolated release mirror.

Canonical Division delivery reads comparison baselines, normalises records and builds
source, history, current and metadata SQL only inside new-plan preparation. The sealed
plan retains the original SQL artefact count and extraction/localisation counts as
checksummed workflow outputs. Retries skip those baseline reads and normalisation, and
report the original counts even after partial replay. Snapshot lineage preparation
remains a separate stage.

Canonical Division inserts stay below 96 KiB per SQL statement. Oversized text is
assembled in payload-scoped staging tables before the original insert executes, so
geometry, Unicode text, constraints and conflict-update rules retain their full values.
The staging tables are removed before the delivery receipt is written.

Remote geometry delivery generates SQL from lazy mirror-table iterators inside the
sealed-plan preparation callback. A retained plan skips those reads. Statement packing
tracks UTF-8 byte counts incrementally and closes the iterator on interruption.

Ordinary geometry metadata upserts update only when a replayed value differs, including
changes to or from `null`. Exact and simplified phases can repeat release assignments,
processing actions and statistics within the statement limit without updating identical
rows. Changed lifecycle, provenance and statistics values still replay in order; see
[SQL delivery](../sql-delivery.md) for the oversized-row exception.

Remote replay selects immutable canonical versions through the snapshot's upsert journal
keys; delete journals determine removed membership. Source closures update exact source
version keys without replacing historical geometry; C&SD source derivatives are retained
too.

Canonical Division and Planning Department SQL artefact imports use native local
delivery plans as well as remote delivery plans. Local geometry materialisation uses
WAL-safe SQLite planning copies, capturing exact mutations and retained churn outputs
for receipt-backed replay without regenerating geometry writes. See
[SQL delivery](../sql-delivery.md).

Canonical, Planning Department and geometry SQL imports use
[sealed delivery phases](../sql-delivery.md). The local mirror supplies the planning
context. Remote receipts confirm each retained payload before the identical SQL reaches
the shared mirror; publication follows delivery.

The Divisions API family combines canonical divisions with geometry companions. Geometry
variants are source-specific records and are not merged. Geographic `include=areas`
selects the assembled `saanseoi` variant by default; `include=areas:overture` selects
the native Overture geometry. The family currently requires canonical `division`,
Overture `divisionArea`, Overture `divisionBoundary`, and the latest published HAD and
C&SD district-area snapshots at or before the set cohort. The boundary requirement
remains exact-cohort Overture. This keeps the two authoritative district-area sources in
every Overture release without selecting future data.

When Divisions release-set publication is deferred, every nested source upload retains
that deferral. It may publish its source release and snapshot, but it cannot create an
API revision for an already current cohort; only explicit reconciliation publishes a
draft release set.

Reconciliation schedules current-scope cleanup for archived members in the selected API
family and region, including retries when no drafts remain. Current or draft release-set
references and independently retained geometry remain protected. The cleanup worker
removes obsolete completed projections and their publication receipts together; source
records and immutable history remain available for archived releases.

Initialiser continuation recognises an unselected native Division snapshot after its
CURRENT receipt is removed when the latest recorded Division SQL delivery and subsequent
publication both completed. Current and draft API members still require their exact
prepared receipt. Failed or unfinished rebuilds cannot use an older successful run to
claim completion; this check reuses processing runs without additional audit writes.

C&SD statistics archives use a combined intake path. The `hkgov-censtatd:statistics`
command includes available `division` and `divisionArea` companions by default,
alongside `divisionStatistic`. `--defer-stats-release-set` selects Statistics-only
intake unless `--include-geography` is also supplied; `--geography-only` processes the
geography companions without Statistics. This Statistics-resource choice is independent
of Divisions release-set publication, which is controlled by `--defer-api-release-set`
and may be reconciled separately.

A publisher archive can contain geometry for several reference years. In that case the
registered source and resource release keep the publisher cohort, while each geometry
snapshot keeps its own reference-year cohort. Source assertions are written to the
publisher-year source shard; immutable geometry history is written to the snapshot-year
history shard. The resource release remains processing until its final reference year,
when all attached exact and simplified snapshots are published together.

Registry codes use lowercase kebab-case even though programmatic resource-type enums use
camelCase. For example, `divisionArea` is encoded as `division-area` and
`divisionBoundary` as `division-boundary`. A dataset describes one publisher product and
declares one or more available resource types; each release records the specific
resource type it materialises. Dataset metadata supplies publisher, product, and source
variant directly; publication code must not infer them by parsing an identifier.

The reusable resource contract and variant rules are documented in
[`divisionGeometry`](../resourceType/divisionGeometry.md) and
[`spec/divisions-geometry.md`](../../../spec/divisions-geometry.md). The Overture and
Home Affairs Department profiles are kept in the provider source folders:

- [`Overture geometry`](../sources/overture/divisionGeometry.md)
- [`Home Affairs Department area`](../sources/hkgov-had/divisionArea.md)
- [`Overture historical reconstructions`](../sources/overture/historicalReconstruction.md)
- [`Planning Department TPU and subunit areas`](../sources/hkgov-pland/divisionArea.md)
- [`LandsD place names`](../sources/hkgov-landsd/placeName.md)

The default `geographic` domain retains SaanSeoi as its assembled provider variant.
SaanSeoi preparation owns the reviewed Hong Kong Island, Kowloon and New Territories
identities and their district-union geometry. Their retained identifiers and taxonomy
are defined by the curated source edition and recorded in its Source Audit. Native
Overture inventories and geometry remain independent of those editorial decisions.

C&SD Permanent Living Quarters maps its three source codes to these SaanSeoi area
identities. Its polygons join the `hkgov-censtatd` companion selected by the SaanSeoi
API composition after the curated Division editions are available. The Overture API
composition does not select or require this companion. It retains the separate C&SD
land-clipped district geometry and HAD district geometry.

The 2021 HMA statistics output instead supplies the separate HMA domain's primary
canonical division snapshot (`hkgov-censtatd:2021`), paired with its native
`hkgov-censtatd-hma` geometry. Although the HMA source dataset also publishes
statistics, its statistics and its division geography have distinct snapshot lineages.

Planning Department Planning Units and New Towns are independent API domains, not
optional members of the Geographic release. Each Planning Department source dataset
exposes both `division` and `divisionArea` from the same upstream layer and cohort. Each
domain release contains only snapshots that can be returned together. Planning-domain
canonical rows therefore never need an Overture cohort in order to be published, and a
2006 planning cohort can be backfilled even when no 2006 Overture divisions exist. New
Town identities are cohort-scoped; Planning Unit and Overture lineages use persistent
identity. New Town source record keys and `hkgov-pland.newTownId` lookup identifiers use
lowercase English-name slugs, with spaces, slashes and punctuation collapsed to single
hyphens. Canonical UUIDs derive independently from the cohort and normalised publisher
name; the original trilingual labels remain in source properties. Updater-driven
Planning Department intake verifies the mirrored archive's managed key and SHA-256
before parsing it. TPU ingestion accepts both the original historical packages and
CSDI's equivalent deduplicated repackages, after verifying their provider-cell-key
coverage. Historical Planning backfills retain verified derived Parquet locally by
archive digest and preparation contract, allowing a retry to reuse source reconstruction
without reusing mutable release materialisation state.

Published domain releases are immutable. Adding another eligible secondary snapshot to
an already published cohort creates the next trailing composition revision (`...-0` to
`...-1`). The publication then creates a family-and-region API catalogue revision that
points at the richer release. An older catalogue continues pointing at the earlier
domain release, which preserves knowledge-time replay without duplicating canonical
rows.

The uploader reports readiness as an `API DOMAIN RELEASE` and reports the catalogue
revision created when the domain release becomes publishable. Geographic readiness
checks its Overture, HAD, and C&SD composition members; each Planning Department domain
is checked independently.

## Composition-owned ingestion dependencies

The API composition also defines the prerequisites required to materialise its members.
This is intentionally not source-dataset metadata. For the Geographic domain, canonical
`division` must be materialised before Overture `divisionArea` or `divisionBoundary` for
the same cohort; the Planning Unit and New Town areas similarly require their domain's
canonical division. `saanseoi update` expands the requested family with these providers
and performs them in dependency order. The resulting geometry snapshot records the exact
selected division source release as a lookup input, preserving replayable provenance
without duplicating the dependency declaration in each source fixture.

## Bootstrap recovery

`saanseoi update --target <environment> --api-family divisions --download --yes` reads
the selected environment's release report before choosing source work. A successful
report is authoritative: saved local check state never represents a source release that
the environment has not reported. An empty Geographic report rebuilds the current
Overture STAC release and the retained Overturist archive catalogue in release order.
C&SD district areas are independently keyed by their 2016 and 2021 cohorts, so an
interrupted bootstrap rebuilds only an absent cohort; a cohort already reported by the
target is not selected again. This lets the command resume safely after interruption
without re-publishing completed source releases.

The canonical `schemaVersion` may remain unchanged when a new source merely supplies
more values in the same response shape. Merge rulesets are domain-scoped for new
planning releases; the existing Overture ruleset keeps its legacy code. Adding a new
closed-enum domain or include variant is instead an API contract-minor change.

Functional domains are explicit (`administrative`, `planning`, `electoral`, and
`geographic`). A division may have secondary domain memberships, while hierarchy edges
carry domain context so planning or electoral relationships cannot enter the default
administrative traversal accidentally. Cohort keys identify the period selected for a
release; source publication and validity metadata remain provenance.

The LandsD Place Name database is registered as the separate `hkgov-landsd` geographic
domain because its settlement points are an alternative primary division collection, not
an Overture geometry companion. Only `PLACE_CLASS=Settlement` records belong in that
division domain. Its Hydrographic and Topographic records remain source data for a
future government place-name projection; they should not be forced into the divisions
taxonomy. Source records retain the joined official and alias labels in
`properties.placeNames`, alongside publisher classification attributes. Each joined row
contains `nameEn`, `nameZhHant` and `nameStatus`. Locale grouping belongs to canonical
assembly and completeness metrics. This source collection includes Settlement,
Hydrographic and Topographic records; selection for the settlement domain is a separate
assembly step.

Source-release statistics for LandsD Place Names cover all source records, including
Settlement, Hydrographic and Topographic. Record counts and class distribution come from
the source-validity window; changes compare the preceding published source release.
Locale completeness measures publisher-provided official names across that full
inventory. Canonical settlement statistics belong to the API release set.

The LandsD selection Bulk Rule belongs to the assembly audit and records counts for all
native inputs, selected settlements and exclusions by publisher class, including missing
or unexpected classes. The
[source documentation](../sources/hkgov-landsd/placeName.md#divisions-projection)
describes the retained audit and local backfill.

Native LandsD intake delivers the settlement projection and its source-version
resolutions before publication. A completed, row-count-verified delivery receipt is
required alongside snapshot metadata; reconciliation names any snapshot missing that
receipt. The native archive remains the source artefact throughout canonical delivery.

All division geometry uploads calculate their canonical WGS84 bbox directly from the
normalised geometry. Canonical geometry and bbox are persisted only in history and
current; source records include publisher evidence, while named source derivatives
retain their explicit transform output. Upstream bbox fields are not trusted as
persisted geometry extents. Canonical area and boundary geometry omits the optional
embedded GeoJSON `bbox`; the separate `bbox` column holds the calculated extent. Source
geometry retains its embedded metadata unchanged.

Source-specific aggregate geometry canonicalisation is permitted only when its provider
profile documents the triggering topology condition and the source records remain
unchanged. The Planning Department 2021 TPU aggregate uses this policy for coincident
geometry fragments and boundaries that a pairwise overlay cannot node.

Canonical division source releases persist locale completeness and churn stats as well
as a district distribution. A district row contributes to itself; every other row is
counted against the `district` entry in its normalised hierarchy. Atlas joins those
canonical identifiers to the HAD district-area geometry for a comparable map across
division datasets.

Geometry releases additionally persist release-owned district geometry facts from the
exact canonical EPSG:4326 snapshot: features, Polygon/MultiPolygon parts, area, boundary
segments, and boundary length. A boundary segment is a non-zero coordinate-to-coordinate
edge across every exterior or interior polygon ring, or every boundary line. It
indicates geometric complexity rather than positional accuracy; an exact C&SD release
and its `simplified` display derivative therefore never share or replace these
measurements.

Historical C&SD district areas are cohort-qualified statistical-geometry companions,
never defaults. The census land-clipped district releases use
`hkgov-censtatd-landclipped`; annual district polygons and C&SD Area/type polygons use
`hkgov-censtatd`. Both keep an explicit snapshot for each source-authorised cohort, even
when its geometry bytes match an earlier cohort. `simplified` is a named 10-metre
display transform of the selected companion snapshot, not an independent composition
member.

The processing cache retains each simplified WGS84 GeoJSON coverage under
`.local/dataops/simplified-coverage`, keyed by the complete input geometry, the 10-metre
tolerance and the versioned simplification contract. Re-uploading unchanged source
geometry therefore reuses the verified display derivative; a changed source, tolerance
or contract produces a new one.

Several C&SD source releases can contribute to one companion cohort. The materialiser
compares each incoming complete canonical row set before writing: when every row is
already present with the same materialisation, it is retained as a `snapshotSource` with
`verified_identical_geometry`, rather than duplicating canonical current/history rows.
Non-overlapping rows are recorded as `contributed_geometry` and merged into the
companion. This distinction is per complete materialisation, not a source-level
duplicate.

Completed-release validation recognises these recorded geometry contributions while
their shared composition is draft. It verifies the source membership, shard assignments
and materialised rows independently of API activation; it does not require the
contributing dataset to own the composition lineage.

For API-field provenance, Population and Household Statistics is the canonical C&SD
district relationship whenever it is available. Permanent Living Quarters may still
contribute geometry to that companion. District Land Area, Population and Density
remains a source and can seed an earlier companion, but becomes redundant for the
API-field signature once either canonical C&SD source is present. The redundant source
is reported with the release-set lookup rather than becoming a competing field mapping.

The 2016 and 2021 C&SD district cohorts are separate required inputs. They share the
named `hkgov-censtatd-landclipped` variant and have distinct cohort keys and source
releases. Both processed geometry resource releases remain published while their cohorts
are available. Exact and simplified materialisations have separate variants.

Current geometry storage retains the selected published snapshot for each contributing
dataset, region, cohort and variant whose processed resource release remains published.
Selection prefers authoritative geometry, then the latest publication and revision.
Lookup-only sources do not retain a geometry snapshot. Current and draft API release-set
members remain protected independently, including while a replacement is being prepared.
Superseded rolling releases and replaced revisions are eligible for current snapshot
cleanup. Historical geometry requests reconstruct the selected snapshot from its version
journal and history shards after its current materialisation is removed.

For Overture, locale inference, API-locale fallbacks and `CN-GD` geometry exclusions
contribute aggregate counters to registered processor declarations, without affected
record lists. Curated area geometry retains its fixture-backed union/exclusion patch and
parameters. AI and human name translations are individual fixture curations with source
text, resulting text, target locale and available parent names. The retained fixture
preserves unused entries as well as applied instructions. Translation applications are
captured for every source using the shared Division processor, including C&SD. Lok Ma
Chau Loop uses a guarded classification fixture in both direct normalisation and
hierarchy lookup. The same fixture can retain curated English and Traditional Chinese
alternate names in canonical locale rows. The local curated assembly applies the same
aliases when it rebuilds from an already normalised Overture snapshot. The admin-level
expectation permits an omitted field only when the accepted source-release schema has no
`admin_level` column; supplied values must match the fixture. Translation preparation
passes the source-release context through the same normalisation guard. Identity, class
and subtype checks remain mandatory, and source drift blocks ingestion. Audit shows bulk
summaries first and loads declarations, fixtures and individual pages on request.

For Hong Kong Overture divisions, locale-less Chinese names—including alternate name
rules—are inferred as `zh-hant`; an explicit source `zh` tag is also normalised to
`zh-hant`.

Overture division hierarchy columns follow the accepted schema for the declared source
release. From `2026-02-18.0`, the Parquet file must contain `admin_level`; earlier
cohorts use subtype, class, parent and name fields. Missing required columns block
processing.

## Reviewable API name translations

Division imports retain publisher names. Missing English and Traditional Chinese names
may use explicitly human-translated fixture entries. Automated translations are ignored
in every locale, including cached AI-assisted research and dictionary-derived spellings.
Imports do not generate translations. Missing translations remain absent rather than
blocking an otherwise valid source import. Simplified Chinese is supplied only by
explicit Overture names.

Translation memory lives in `fixtures/i18n/datasets/<datasetCode>.json`. Version 2
fixtures use `contexts`, `translations` and `usages` maps. Entries retain their source
text, source and target locales, context, provenance, references and record IDs.
Historical AI entries remain review evidence; their presence does not authorise
application. Human curation must verify the geographic identity and attested spelling
before marking an entry `human-translated`. Source names and genuine alternative names
are retained.

Local translation generation removes its adjacent `.english-review.json` research queue
after successful full resolution and fixture persistence. Remote runs and imports that
ignore automated entries preserve existing research queues.

## Publisher source boundary

Publisher values, acquisition references, original geometry and canonical resolutions
follow the [source record storage contract](../source-records.md). Field renaming and
flattening preserve upstream values; corrections and resolved identities remain outside
`properties`.

A recognised Hong Kong Area identity supplied as a point can have source ancestry
through one of its own districts. When that district belongs to the same curated Area,
canonical ancestry ends at the Hong Kong SAR. The Area is never inserted into its own
ancestry. The original source row, identity, names and geometry remain retained, and the
hierarchy normalisation is recorded in the release audit.

Initialisation stops at the first failed upload so a retained SQL delivery keeps
exclusive ownership until its release is recovered. If audit delivery also fails, the
log includes both the original guard reason and the delivery error.

Initialisation skips a published Division or geometry release only when its snapshot has
a complete delivery receipt for the matching current scope, together with its source
membership and shard assignments. Completed empty snapshots are valid. Superseded
releases remain skippable after their current projection has been cleaned up.

## Source record response

The [source record contract](../source-records.md) exposes publisher attributes in
`properties`, including publisher-authored attribution. Records expose source identity
and optional native geometry. Resource types, variants and internal acquisition locators
are not publisher-record fields. Geometry retains the source coordinates and CRS;
canonical geometry is available through the family’s canonical API.

## Local D1 with production artefacts

For a fresh local initialisation, `--target local --r2 production` keeps processing and
registrations in local D1 while retaining source and provenance objects in production
R2. See the
[storage-target workflow](../d1-bootstrap.md#ingest-locally-with-production-r2) for
immutable uploads and continuation requirements.

## Registry metadata

Official division dataset processing metadata declares the identity bridge, Lands
Department settlement selection and Planning Department normalisation where applicable.
Source and resource releases retain their creation-time policy. Planning release
statistics use the `release` kind.

Ancestor hierarchy names retain source localisations when translation fixtures add
missing locales. An empty translation result preserves every source name used for Hong
Kong Area assignment and hierarchy validation.

## Retained source fields

Publisher properties use collision-checked camelCase keys. Provenance preserves each
original publisher path and its retained location. HAD source records use `OBJECTID` as
`sourceRecordId`, independently of canonical area IDs. Bounding boxes are derived from
processed geometry; publisher attribution is wrapped under its publisher key.

Source storage and public records use `properties` for retained attributes. API-field
inputs reference this path through the shared dataset-scoped `publisherFields` mapping.
Processing-rule definitions remain in their registered fixtures and are pinned by the
selected release.

Retained locale-bearing labels use `En`, `ZhHant` and `ZhHans` suffixes, for example
`buildingNameEn` and `dcZhHant`. Publisher mappings place these labels after other
properties. Original publisher paths and language dictionary identifiers retain their
spelling; demographic measures about language are not locale-bearing labels.

## Text search

`GET /divisions/v0.1/search?q=水埗` searches the latest published catalogue selection
across all supported Division domains. `/divisions/v0/search` is the current-version
alias. Supply `domain=geographic`, `hkgov-censtatd-hma`, `hkgov-pland-pu`,
`hkgov-pland-new-town` or `hkgov-landsd` to restrict the search. A domain without a
published selection contributes no results. Region defaults to Hong Kong; `region=gba`
uses Hong Kong data, and `region=mo` selects Macao independently.

Search matches localised names, alternate names, name-rule values and curated
`divisionCode` values. English partial text is case-insensitive; Chinese substrings can
contain one or more characters. Punctuation separates search terms. All terms must
match, and FTS operators and SQL wildcards are not query syntax. Queries allow at most
120 characters and eight terms. Optional `locale` restricts the matching localisation;
otherwise all localisations participate. Code-only records without localised names use
`locale=und` in results.

Ancestor names are excluded unless `ancestors=true`. This option searches the stored
names from all materialised hierarchy paths; it performs no inferred ancestry or live
ancestor-name lookup. Direct matches rank ahead of ancestor matches, followed by exact
name/code and name-prefix matches. Results contain one entry per Division ID and domain,
with `match=self` or `match=ancestor`, the matched localisation, snapshot ID, name,
code, class, category and level. The same division can occur in several domains. `limit`
defaults to 20 and is bounded to 100. Historical selectors are rejected with HTTP 422;
historical list and detail access remain available separately.

Search finalisation selects each domain's published default for each region. The
`divisionSearchScopes` table maps stable region/domain/lineage scopes to snapshots, and
`divisionSearchFts` contains only their current search documents. Finalisation compares
complete projected content and atomically deletes removed/changed documents, inserts
new/changed documents and promotes scope mappings. Unchanged snapshot promotion writes
only the mapping. Names, aliases, codes and stored ancestor text all participate in
change detection.

Standalone publication finalises search after publication. Deferred upload sequences
finalise once during release-set reconciliation, after all pending sets are ready.
Reconciliation also retries a failed finalisation when no new sets need publishing.
Search returns HTTP 503 `fts_not_ready` until every requested published scope is ready.
Cleanup preserves snapshots referenced by search scopes. Apply the generated current
schema migration and run release-set reconciliation to initialise an existing database.

FTS5 trigrams accelerate substring matching for terms of at least three characters.
Shorter terms scan the latest indexed documents. These reads do not rewrite the index.
The repair SQL in `libs/db/scripts/sql/rebuild-divisions-fts.sql` synchronises only the
existing scope selection; publication/reconciliation owns release selection.

## Publication readiness

Current Division records and localisations use the stable snapshot lineage as their
physical `snapshotId`. `divisionPublicationState` has one receipt per lineage and maps
it to the logical published snapshot. Division and Planning preparation runs on isolated
local candidates. The shared final-difference compiler preserves unchanged content and
timestamps, and delivers only keyed inserts, changed columns and removals within the
complete replacement's scope. Source assertions and history remain in their owning
shards; metadata and publication receipts retain their separate lifecycle operations.

The core Division processor and CLI Division/Planning delivery compare base and
individual locale history components independently. Unchanged content retains its
canonical version, owning history shard and original source provenance; a base-only edit
leaves unchanged locales open, and a locale-only edit leaves the base open. Semantic
geometry comparison decodes stored geometry before comparison. Source interpretations
inherit through snapshot ancestry; repeated assertions produce no resolution rows, while
explicit source omissions remain recorded. Canonical identifiers participate in both
current and history content.

The core processor accepts explicitly named `historyShards` for replay across annual
databases. It validates the complete parent ancestry, component ownership and retained
content against the materialised current scope before publishing. A single database
handle is sufficient for a single-shard parent. Closures target the exact base or locale
version in its owning shard; child deletion journals are recorded in the active shard.
Reappearing content preserves its retained canonical provenance. Localisation identity
includes name provenance independently of base content.

Area and boundary projections use separate lineage/cohort scopes and publication
receipts. Provider variants retain their own lineages. A revision updates only changed
geometry in its scope; a different retained cohort requires its own materialisation.
Area and Boundary history stores immutable versions keyed by record ID and content hash.
`snapshotVersionChanges` and the selected parent ancestry define membership within each
lineage/cohort/variant scope. Complete uploads record removals only for members of their
selected parent; a root snapshot starts with empty membership. A version shared by
another provider, cohort or variant keeps its content and original provenance. The
stored history `isCurrent` field does not define geometry membership or availability.

Parent replay follows the recorded shard assignments, including earlier annual shards.
Retained historical parents remain usable after their serving current scope advances.
Remote replay exports content by the exact journal record/hash keys and inserts missing
versions without rewriting existing content. Snapshot deletion journals affect
membership only; they do not close or delete retained geometry versions.

Geometry uses the same local candidate compiler for native delivery and remote replay.
C&SD companion contributions merge within their cohort; ordinary complete geometry
releases replace membership within their own scope. Ingestion resolves the exact
selected Division dependency through a completed receipt or immutable history, without
restoring historical Division rows into serving current storage.

Parented area and boundary snapshots replay the complete parent ancestry and validate
its shard assignments, owning history content and selected current projection before
inheriting membership. An identical selected version adds neither another history
payload nor a child upsert journal, including across annual history shards. Changed and
reappearing features receive explicit upserts; removals come from the selected parent's
membership rather than mutable history `isCurrent` flags. Companion contributions
preserve inherited members outside their input. Parentless checkpoints retain full
membership journals, and each distinct retained cohort still receives its own current
projection. Removed versions in arbitrary older shards are not searched for reuse.

Geometry source assertions, release assignments and processing-audit delivery have
separate lifecycles. Native delivery retains the geometry writer's `sourceResolutions`
rows. The remote geometry SQL exporter does not deliver that table; R2 processing-audit
delivery does not populate it either. Remote per-record source-resolution parity remains
an independent delivery limitation and is outside geometry journal savings.

Delivery validates canonical and localisation counts, and each current mutation batch
checks its sealed publication token. Completion records preparation; metadata
publication grants readiness. A selected scope returns `503 snapshot_not_ready` while
its delivery is incomplete, including an incomplete empty projection. Ready current
reads retain public logical IDs. Pinned older geometry revisions replay from history
once a ready replacement owns their scope. Search, guarded cleanup and reset/reingest
follow the [publication-state contract](../publication-state-plan.md).

## Geographic definition changes

`GET /divisions/v1/changes` compares release-pinned effective definitions by stable
division ID. It reports additions, deletions, changed fields, membership impact and
transitive descendant dependencies, with content-addressed before/after definition and
geometry links. See the [division changes contract](../../division-changes.md) for
pagination, retention, authoritative geometry coverage and error semantics.

## Local polygon topology repair

Working drawings and the current Undo snapshot are stored together in one IndexedDB
transaction. Saved localStorage drawings remain readable and are removed only after a
successful IndexedDB save. Large drawing snapshots do not consume localStorage quota.
Archived history remains separate from the working state.

Coastline intersections retain polygonal coverage before topology predicates run.
Isolated point and line contacts carry no area and are excluded from the coverage
target, allowing mixed GeometryCollection intersection results to be processed.

Drawn Polygon and MultiPolygon areas are supported through level 6, including import,
export, pencil expansion and node editing. Level 6 point membership remains available
when no area has been drawn. Starting a pencil drawing makes its level visible. L6
drawings support selected-level cleanup, simplification and cross-level boundary
alignment.

Cross-level alignment uses an explicitly selected reference outline and relationship.
Inside-reference alignment enforces containment; neighbour alignment creates a shared
edge without interior overlap. Nearby edges align within a conservative 5 m limit,
following reference bends and inserting shared nodes. The reference keeps its outline;
other selected divisions retain their original working baselines. Distant ownership
changes, collapsed rings and invalid geometry stop the whole operation. Alignment
supports selected drawn divisions at levels 0–6 and has a complete pre-operation Undo.
Level numbers alone do not establish a parent relationship. Alignment does not change
stored hierarchy assignments.

Loading saved drawings preserves their division associations. Recovery exports include
the current drawing, undo snapshot and retained browser history for the requested
divisions; exporting history does not change a drawing.

Pencil expansion replaces the contacted boundary arc. Crossing replacement outlines are
noded and polygonised automatically; the valid face retaining the most original area is
used, excluding loops attached only at a point. Original holes remain excluded, and net
growth and validity checks apply before saving. Same-level interior overlaps save with
warnings on both polygons. Shared edges and cross-level containment are not flagged.
Warnings are recomputed after edits and imports. The pre-operation backup supports Undo.

The division-area review map cleans selected divisions at one level from unsimplified
inputs. Simplification uses the same selection and verifies each selected drawing
against its retained cleanup result. Unselected drawings remain untouched; their
junction vertices remain fixed. The simplification level follows the last requested
cleanup level. It nodes source and authoritative land boundaries together, polygonises
the shared graph and assigns overlap faces in division-ID order. It preserves exact
source coordinates and collinear nodes, except where clipping, noding or an accepted
street snap changes a boundary. Only exact consecutive duplicates and ring closures are
normalised; invalid self-intersections stop cleanup with diagnostics.

The shared graph uses source boundaries, land boundaries and any explicit coverage
boundary. Derived clipped boundaries are excluded from graph construction to avoid
re-noding independently computed intersections. Invalid polygoniser rings retain their
coordinates for map highlights and downloadable diagnostics. Coverage comparisons accept
intersection residue only within eight coordinate-scale floating-point epsilons, with an
area bound and vertex/midpoint checks against both outlines. This comparison does not
round or change saved coordinates. Coverage diagnostics identify the nearest source
boundary rather than the last division visited during validation.

The coverage target defaults to the union of source polygons intersected with
`hongkong-2026-09-01.coastline-land.geojson`. Existing gaps therefore remain intentional
unless a separate intended coverage polygon is supplied to the repair function.
Unassigned faces in an explicit target are reported for ownership review. Cleanup does
not infer missing coverage from proximity.

Street snapping operates on shared internal chains with fixed junctions and exterior
endpoints. A chain can follow one straight centreline segment when its endpoints already
lie on that segment, all projections retain strict order and every displacement is
conservatively bounded by 5 metres. Coastline nodes remain fixed. Ambiguous, curved or
non-matching chains remain unchanged. Final validation checks rings, duplicate edges,
exact shared nodes, interior overlaps, land containment and an empty symmetric
difference against the coverage target. A snap that fails validation is discarded before
validating the unsnapped repair.

The browser stores a complete pre-operation backup before cleanup and retains it across
reloads. Inputs marked as simplified are rebuilt from a unique retained `sourceAreaId`
match in the reference catalogue. Missing identities and conflicting source shapes
require an original drawing or verified backup; cleanup cannot reconstruct lost nodes.
Failure diagnostics identify the division, operation and available coordinates, with map
markers at those coordinates.

Simplification is an explicit later operation on shared internal chains, with its own
tolerance and retained unsimplified geometry. The review map can preview the selected
result in detailed, simplified or comparison display without changing saved estimated
areas. It validates unchanged coverage and shared topology before saving. Cleanup
restores that retained geometry before rebuilding; edited simplified results require
source recovery to avoid discarding edits. Neither operation publishes fixtures
automatically.

## Canonical identities and identifiers

SaanSeoi-generated division and geometry identities use stable `ss-` UUIDs. Geometry
identity is scoped by entity kind, provider and original record identity, independently
of publication or display transform. Publisher record IDs remain in source storage.

Canonical identifiers are grouped by publisher code, then camelCase identifier type:
`hkgov-pland.ppu`, `hkgov-pland.subunit`, `hkgov-had.areaId`, `hkgov-landsd.geoNameId`
and `saanseoi.sourceId`. Each publisher maps to an object; identifier values, including
leading zeroes and source ID prefixes, are preserved. Native publisher source properties
retain their native shape. SaanSeoi source archives and canonical division and area
records use this same identifier structure.

Planning subunits carry the complete root-to-parent `PPU → SPU → TPU` path in `full`.
Empty `administrative`, `locality` and `landform` categories are omitted. A root has
`full: []`; hierarchy labels are present only where source names are available.

Waterfall Bay (瀑布灣) is a curated SaanSeoi supplemental neighbourhood at level 5,
retained in the Hong Kong Overture division import with explicit SaanSeoi provenance.
Its provisional administrative ancestry is Southern District, Hong Kong Island and Hong
Kong SAR. Its point and boundary await geometry review.

Telegraph Bay (鋼綫灣) uses a guarded level-5 neighbourhood patch in the Overture
division import; its original microhood subtype remains in source provenance.

Sandy Bay (沙灣) uses a guarded level-5 neighbourhood patch in the Overture division
import; its original microhood subtype remains in source provenance.

West Kowloon (西九龍) uses a guarded level-4 macrohood patch in the Overture division
import; its original neighbourhood subtype remains in source provenance.

Prince Edward (太子) is a curated SaanSeoi supplemental neighbourhood at level 5,
retained in the Hong Kong Overture import with explicit SaanSeoi provenance. Its
provisional administrative ancestry is Yau Tsim Mong District, Kowloon and Hong Kong
SAR. Its point and boundary await geometry review.

Jordan (佐敦) is a curated SaanSeoi supplemental neighbourhood at level 5, retained in
the Hong Kong Overture import with explicit SaanSeoi provenance and Yau Tsim Mong
District, Kowloon and Hong Kong SAR ancestry. Its point and boundary await geometry
review.

Austin (柯士甸) is a curated SaanSeoi supplemental neighbourhood at level 5, retained in
the Hong Kong Overture import with explicit SaanSeoi provenance and Yau Tsim Mong
District, Kowloon and Hong Kong SAR ancestry. Its point and boundary await geometry
review.

Shek Kip Mei (石硤尾) uses a guarded level-5 neighbourhood patch, retaining its Overture
macrohood subtype in source provenance. Lei Cheng Uk (李鄭屋) is a curated SaanSeoi
supplemental level-5 neighbourhood with provisional Sham Shui Po District, Kowloon and
Hong Kong SAR ancestry. Its point and boundary await geometry review.

Thirty Houses (卅間, also 三十間 and 30 Houses) is a curated SaanSeoi supplemental
level-6 microhood in Sheung Wan. Its representative point and Wikidata identity are
retained while its boundary awaits geometry review.

Tai Tam Gap (大潭峽) is a curated SaanSeoi supplemental level-5 neighbourhood. Its
mountain-pass point and Wikidata identity are retained with provisional Eastern
District, Hong Kong Island and Hong Kong SAR ancestry while its boundary awaits geometry
review.

Tai Tam Tau (大潭頭) is a curated SaanSeoi supplemental level-6 microhood beside Bluff
Head. Its mapped cape point and provisional Southern District, Hong Kong Island and Hong
Kong SAR ancestry are retained while its boundary awaits geometry review.

Cape Collinson (歌連臣角) is a curated SaanSeoi supplemental level-5 neighbourhood. Its
mapped locality point and provisional Eastern District, Hong Kong Island and Hong Kong
SAR ancestry are retained while its boundary awaits geometry review.

Sandy Bay Gap (沙灣坳) is a curated SaanSeoi supplemental level-6 microhood. Its mapped
mountain-pass point and provisional Central and Western District, Hong Kong Island and
Hong Kong SAR ancestry are retained while its boundary awaits geometry review.

Chung Hom Kok (舂坎角) and Ma Hang (馬坑) use guarded level-5 neighbourhood patches in
the Overture division import, retaining their publisher microhood classifications in
source provenance.

Bluff Head (黃麻角) uses a guarded level-5 neighbourhood patch in the Overture division
import, retaining its publisher microhood classification in source provenance.

Tai Long Wan (大浪灣) uses a guarded level-4 macrohood patch, while Cape D’Aguilar
(鶴咀) uses a guarded level-5 neighbourhood patch. Hok Tsui Tsuen (鶴咀村) uses its
existing Overture identity with a guarded level-6 hamlet classification and retains “Hok
Tsui Village” as an English alias. Publisher classifications and names remain in source
provenance.

Hok Tsui Lower Village (鶴咀村, source spelling 鶴咀下村) is a distinct curated SaanSeoi
supplemental level-6 hamlet. Its mapped locality point and provisional Southern
District, Hong Kong Island and Hong Kong SAR ancestry are retained while its boundary
awaits geometry review.

Tai Tam Tuk (大潭篤) uses a guarded level-5 neighbourhood patch in the Overture division
import, retaining its publisher microhood classification in source provenance. Tai Tam
Tuk Village (大潭篤村) remains a distinct level-6 hamlet.

Mid-Levels Central (中半山) and Happy Valley Mid-Levels (跑馬地半山) use guarded level-5
neighbourhood patches in the Overture division import, retaining their publisher
microhood classifications in source provenance.

East Point (東角) is retained as English and Traditional Chinese alternate names of
Causeway Bay (銅鑼灣). Its separate Overture neighbourhood is excluded from canonical
coverage. The level-6 Tai Hang (大坑) microhood is also excluded as a duplicate of the
retained level-5 Tai Hang neighbourhood. Both publisher assertions remain in source
provenance.

Kowloon City (九龍城) uses a guarded level-5 neighbourhood patch in the Overture
division import; its original macrohood subtype remains in source provenance.

Ma Tau Chung (馬頭涌) uses a guarded level-5 neighbourhood patch in the Overture
division import; its original macrohood subtype remains in source provenance.

B Block (前座) is excluded by a guarded Overture division patch because it represents a
building block. The publisher source assertion remains retained.

San Po Kong (新蒲崗) uses a guarded level-5 neighbourhood patch in the Overture division
import; its original macrohood subtype remains in source provenance.

Un Chau (元洲) uses a guarded level-6 microhood patch in the Overture division import;
its original neighbourhood subtype remains in source provenance.

King's Park (京士柏) uses a guarded level-5 neighbourhood patch in the Overture division
import; its original macrohood subtype remains in source provenance.

Hung Hom Bay (紅磡灣) uses a guarded level-5 neighbourhood patch in the Overture
division import; its original microhood subtype remains in source provenance.

Kai Tak City Centre (啟德城中心) is a level-5 neighbourhood. Kai Tak Runway Precinct
(啟德跑道區) and Kai Tak South Apron (啟德南停機坪區) are level-6 microhoods with
curated English names. Their original Overture classifications and names remain in
source provenance. Kai Tak Sports Park (啟德體育園), Kai Tak Metro Park (啟德都會公園)
and Kai Tak Cruise Terminal (啟德郵輪碼頭) are curated supplemental level-6 microhood
markers under the Kai Tak macrohood; their boundaries await geometry review. Kai Tak
North (啟德北) is excluded from curated coverage through a guarded Overture source
assertion; its publisher record remains in source storage.

Whole-island source macrohoods are excluded from curated coverage: High Island (糧船灣),
Lamma Island (南丫島), and the duplicate Lantau (大嶼山) macrohood. Po Toi Islands
(蒲台群島) and Soko Islands (索罟群島) retain their Overture identities with the curated
`island_group` classification. Their island landforms remain independently available.
Named settlement divisions such as Cheung Chau and Ap Lei Chau remain separate locality
identities.

Ma Tau Wai (馬頭圍), Ma Tau Kok (馬頭角) and Tai Wo Ping (大窩坪) use guarded level-5
neighbourhood patches in the Overture division import, retaining their publisher
macrohood classifications in source provenance. Kau Pui Lung (靠背壟) uses a guarded
level-6 microhood patch, retaining its publisher neighbourhood classification. Wang Tau
Hom (橫頭磡) uses a guarded level-5 neighbourhood patch, retaining its publisher
macrohood classification in source provenance.

Chuk Yuen and Chuk Un, with the Traditional Chinese name 竹園, are retained as aliases
of Wong Tai Sin (黃大仙). The duplicate Chuk Yuen marker is excluded from curated
coverage through a guarded Overture source assertion.

Chuk Yuen United Village (竹園聯合村) is excluded from current curated coverage because
the settlement has been demolished; the guarded Overture assertion remains in source
provenance.

Ngau Chi Wan Village (牛池灣村) is excluded from current curated coverage through a
guarded Overture source assertion.

Nga Tsin Wai (衙前圍) uses Overture identity `ac162f33-9966-4d6e-9d53-8a6df575775f` with
the curated level-6 microhood classification and reviewed SaanSeoi geometry. Its LandsD
name identifier is retained, and its publisher classification remains in source
provenance.

Tung Tau (東頭) uses Overture identity `d1e1327a-28ff-4487-9103-df158b9c94a0` with the
curated level-6 microhood classification, reviewed SaanSeoi geometry and RVD list
membership. Its publisher classification is retained in source provenance.

Fung Wong New Village (鳳凰新村) uses a guarded level-6 microhood patch, retaining its
publisher neighbourhood classification in source provenance.

Ping Shek (坪石) uses a guarded level-6 microhood patch, retaining its publisher
macrohood classification in source provenance.

Kai Tak Grid Neighbourhood (啟德坊) uses a guarded level-6 microhood patch, retaining
its publisher neighbourhood classification in source provenance.

Sheung Yuen Leng (上元嶺) is a curated level-5 neighbourhood and Ha Yuen Leng (下元嶺)
is a curated level-6 microhood, both under Wong Tai Sin District. Their OSM locality
points are retained while their boundaries await local review.

The level-6 Tsim Sha Tsui (尖沙咀) microhood is excluded as a duplicate of the retained
level-4 Tsim Sha Tsui macrohood. The publisher assertion remains in source provenance.

Kau Pui Shek (靠背石) is excluded from current geographic coverage because it is a
historic locality. The guarded exclusion retains its publisher assertion in source
provenance.

Avenue of Comic Stars (香港漫畫星光大道), Sculpture Walk (雕塑廊), New Asia College Mall
(小百萬大道) and both source identities for The University Mall (百萬大道) are excluded
as visitor-attraction or campus-walkway POIs rather than geographic divisions. Publisher
assertions remain in source provenance.

## Curated SaanSeoi hierarchy and areas

The geographic composition uses the SaanSeoi Division and DivisionArea assembly for
curated L4/L5 hierarchy, drawings and island coverage. Drawings take precedence over
island inventory geometry and Overture fallback, with exact coordinates retained. See
[SaanSeoi curated DivisionArea](../sources/saanseoi/divisionArea.md) for local assembly,
cohort constraints, provenance, coverage limitations and geocoding examples.

Curated hierarchy ancestor entries include a geometry-derived `full_containment` flag
(`true`, `false`, or `null` for unknown). The editor generates whole-area coverage
evidence and assembly recomputes it against the final polygons. The geocoder can skip an
ancestor point check after a child spatial match only when the stored child and ancestor
geometry fingerprints match the loaded areas. Partial or unknown containment retains
point checks and ambiguous branches. See
[full ancestor containment](../sources/saanseoi/divisionArea.md#full-ancestor-containment).

The drawing fixture retains ineligible drawings as `withheld` review data with their
curation reasons. The editor applies this distinction to seed data, saved work and
imports. Only active `features` contribute to hierarchy generation and publication.

Active drawing features can retain a curator-selected `corePoint` inside their polygon.
This representative point replaces the publisher point for hierarchy derivation and the
assembled Division point geometry. The DivisionArea polygon is not changed when the
marker moves.

The local editor performs a reversible one-time cleanup of browser-saved multipart
drawings. It removes only detached locality components below one hectare and below one
per cent of the principal polygon; administrative coverage retains all components, and
an individual island retains only its principal land polygon. The preceding collection
is retained in Undo and backup history.

East Tsim Sha Tsui (尖沙咀東) uses neighbourhood level 5 in the curated geographic
hierarchy, inventory and curated assembly.

### Curated release cadence

The independent SaanSeoi Division and DivisionArea edition starts at `2026-09-01.0` with
an **as-needed** cadence. Edition metadata comes from `fixtures/meta/releases/` and
cadence from `fixtures/meta/datasets/`. The hierarchy and drawing fixtures retain the
selected Overture input cohort. Monthly source updates do not require redrawing
polygons. See [curated DivisionArea](../sources/saanseoi/divisionArea.md) for local
ingestion, retained geometry, exclusions and island coastline cleanup.

Clean Division initialisation selects the September and October editions explicitly. Its
source pins and API field mapping both retain the RVD Division ingredient before the
complete curated pair is reconciled.

Point-only island records with unknown land area retain `minor_island` until a measured
outline supports size classification; a stored zero area is not evidence that an island
is an islet.

Island assembly evaluates `division-exclusions.json` before creating divisions. Only
eligible canonical islands are emitted; excluded and no-geometry candidates remain
review evidence and do not create divisions or areas. Merged aliases resolve to their
canonical island in ancestry. Unresolved curation blocks assembly. Size classification
requires a finite, positive land area.

Curated island publication uses the curated polygon and its measured area for geometry
and island classification. Acceptance filtering alone is insufficient: geometry
corrections, including the separate Ap Lei Chau and Ap Lei Pai polygons, are applied
before Division and DivisionArea snapshots are assembled.

Lai Chi Kok Hill (荔枝角山) is excluded from current curated coverage through a guarded
Overture source assertion. Lai Wan (荔灣) remains a level-6 microhood, using its curated
English name while retaining the Overture source name in provenance.

Kowloon Bay Business Area (九龍灣商貿區) uses a guarded level-5 neighbourhood patch,
retaining its publisher microhood classification in source provenance.

Ngau Tau Kok Industrial Area (牛頭角工業區) is excluded from current curated coverage
through a guarded Overture source assertion.

Lower Ngau Tau Kok (牛頭角下) and Upper Ngau Tau Kok (牛頭角上) are housing estates, not
geographic divisions, and are excluded from current curated coverage through guarded
Overture source assertions.

Yue Man Square (裕民坊) and Lok Wah Shan (樂華山) are excluded from current curated
coverage as a square and housing estate respectively, through guarded Overture source
assertions. Cha Liu Au (茶寮坳) is a curated level-4 macrohood under Kwun Tong District,
and Ping Shan (平山) is a curated level-5 neighbourhood under the same district; their
representative points are sourced from OpenStreetMap. Jordan Valley (佐敦谷), Sai Tso
Wan (晒草灣), and Cha Kwo Ling (茶果嶺) are curated level-5 neighbourhoods; Crocodile
Hill (鱷魚山) is a curated level-6 microhood. Tai Chi Area (太極區) is a square and is
excluded from curated coverage. The eastern duplicate of Ma Wan Tsuen (馬環村) is
excluded; the western locality record remains canonical. Che Ting Tsuen (輋頂村) is
excluded because surrounding villages have subsumed it. Lei Yue Mun Villages (鯉魚門村)
is retained as an alias of Lei Yue Mun (鯉魚門), without its own marker.

Exclusion guards for Che Ting Tsuen, eastern Ma Wan Tsuen and Chuk Yuen United Village
require the publisher subtype `locality` and class `hamlet`. Ngau Chi Wan Village
requires subtype `locality` and class `village`. These expectations apply to the
retained Overture cohorts from September 2025 through August 2026.

Each applied exclusion retains an individual patch audit with its source identity,
curated names, reason and exact exclusion fixture.

Overture Division, DivisionArea and DivisionBoundary releases publish through the
compatible `0.1` composition while that API is current or deprecated. The same exact
publisher archives and snapshot identities are ingredients for curated `0.2` editions.
An archived or retired API cannot receive new release sets; native Overture snapshots
can still be retained independently for curated assembly.

Area selection excludes every identity in the curated Overture division-exclusion
fixture. The geometry exclusion policy retains these IDs explicitly so its audit
definition matches the selected rows. Original geometry remains in the retained
publisher archive.

Publishing a later native Overture division baseline supersedes earlier published
resource releases in that dataset. Retained snapshots and processing audits remain
available for history and safe initialiser continuation.

The Overture updater reuses a non-empty Hong Kong Parquet export already retained under
`data/overture/<release>/divisions/China/Hong Kong`; it downloads the requested file
only when that local export is absent.

Kellett Island (奇力島) is a level-6 microhood in Wan Chai District. Wah Fu (華富) is a
level-4 macrohood in Southern District. Both retain LandsD representative points and
curated boundaries. Stonecutters Island (昂船洲) is a level-4 macrohood with its curated
boundary and separate administrative paths through Sham Shui Po District in Kowloon and
Kwai Tsing District in the New Territories. These are locality identities, not island
landforms.

## Monthly curated inventory editions

Protomaps island and coastline geometry must come from the same calendar month as the
SaanSeoi edition, dated on or before its first-of-month cutoff. Assembly fails when no
eligible same-month extract is pinned; it never carries island geometry forward. Prepare
the extract from that month's retained basemap inputs, then add its exact archive key
and SHA-256 to `fixtures/meta/datasetInputs/saanseoi-division-release-inputs.json`. The
latest eligible extraction revision is selected. LandsD and RVD can carry forward;
Overture uses the latest eligible release on or before the edition date.

SaanSeoi Division and DivisionArea editions use `YYYY-MM-01.revision`, scheduled for the
first of each month in Hong Kong. The builder selects the latest retained publisher
release dated on or before the edition date, carrying forward slower sources. The source
pins in `fixtures/meta/datasetInputs/saanseoi-division-review.json` fix the editor's
reference cohort. Additional publication candidates in
`fixtures/meta/datasetInputs/saanseoi-division-release-inputs.json` retain exact release
identities, checksums and Overture inventory/area snapshots. Assembly selects the latest
eligible pin for each dataset. The September edition selects August Overture; the
October edition selects September Overture and carries forward slower sources. During
pre-release development, corrections edit the initial `2026-09-01.0` revision directly.
Assembly retains inputs and curation hashes in generated reports and archive manifests
without writing fixture files. Island extraction evidence must agree with the pinned
Protomaps version.

Local initialisation retains both pinned Protomaps archives (`2026-09-01.3` and
`2026-10-01.1`) before assembling the September and October SaanSeoi editions. Resuming
source-only Protomaps and RVD inputs verifies their ingestion audit, retained publisher
and resource archives, and source-row validity without requiring a canonical snapshot
for those inputs.

The Geographic composition selects Overture Division and DivisionArea companions with
`latest_at_or_before_cohort_per_dataset`. Curated uploads supply the exact snapshot IDs
selected by assembly; explicit references take precedence over cohort selection, and the
API release set freezes those IDs. Publication and draft reconciliation require the
companions' primary dataset and resource-release references to match the Overture inputs
retained by both curated snapshots. Missing or inconsistent build references block API
publication.

LandsD Settlement records are required ingredients. Native `GEO_NAME_ID` identifies each
source feature; input row positions are never identities. Curated identifiers or unique
matching English and Traditional Chinese primary names or aliases within 5,000 metres
establish positive membership. Ambiguous and unmatched records remain unresolved.
`sources` records the source reference, release and membership rule;
`identifiers.hkgovLandsd` retains `geoNameId`. Retaining an Overture GERS ID as the
canonical ID does not eliminate the corresponding release-specific `sources.overture`
membership evidence.

Protomaps preparation and native ingestion are separate dataops commands:
`protomaps-islands:prepare` and `protomaps-islands:ingest`. Source ingestion retains all
extracted island features, available locale-tagged names and coastline land components
without applying SaanSeoi review decisions. LandsD remains a separate full Place Names
source ledger, including terrain names outside its settlement projection.

`saanseoi-divisions:assemble` reads pinned source evidence and applies curated
crosswalks, names, hierarchy and geometry choices. It emits versioned Division and
DivisionArea archives for the ordinary uploader. Source counts are not canonical island
counts. Curated releases carry their own fixture changelog.

Explicit LandsD exclusions in
`fixtures/meta/curations/saanseoi-division/division-exclusions.json` use the native
`LANDSD:PLACE_NAME:<GEO_NAME_ID>` identity and a reason code, such as `DEMOLISHED` or
`INSUFFICIENT_EVIDENCE`. These exclusions take precedence over automatic and explicit
membership matching during SaanSeoi assembly; the native LandsD records are retained.

SaanSeoi administrative geometry uses pinned native Overture SAR and District
territorial polygons. Its three Area territories are unions of constituent districts.
Each territory also supplies a separate land-clipped record using the pinned Protomaps
coastline land mask. Administrative editor drawings do not override either record;
source record IDs and release identities remain attached to each derived geometry.
Disconnected territorial parts and islands are retained.

Protomaps island releases declare only the `divisionArea` resource. This resource
retains native geometry and naming evidence, including point labels; it does not publish
a canonical Division inventory. Parent source publication requires that resource to be
published. SaanSeoi assembly produces the resolved divisions.

## Curated island groups

The curated inventory contains five `landform / island_group` identities, all with
`level: null`. LandsD Place Names `2026-06-10.0` supplies official names and native
HK1980 points for Ninepin Group (果洲群島, `GEO_NAME_ID=3180`), Po Toi Islands
(蒲台群島, `3181`), Soko Islands (索罟群島, `3182`) and The Brothers (大小磨刀, `3183`).
Ninepin Group retains the English alias Kwo Chau Islands. Ung Kong Group (甕缸群島) uses
the curated OpenStreetMap archipelago entry `BASEMAP:ISLAND:00e285208161a7e1`; it is
absent from that LandsD release.

Po Toi and Soko retain GERS IDs `13363714-2649-4066-935d-c24757ff2a86` and
`15de4c83-f54a-4eaa-b002-c88de1f8c310`. Other group IDs derive from stable source keys.
Additions, class/name modifications and official identifier matches have separate
curation owners. `island-groups.json` contains seed member IDs and empty optional
membership overrides.

Group geometry is generated by taking the fixed bounding box of the seed-member union,
selecting all eligible islands wholly within it, and unioning their land polygons.
Boundary contact is included; crossing polygons are excluded. The bounding box does not
expand during selection. Group land geometry preserves sea gaps; each member keeps its
own polygon. Missing seed geometry blocks assembly. Derived membership and geometry are
frozen into the release archives. See the
[group geometry contract](../sources/saanseoi/divisionArea.md#island-group-geometry).

## SaanSeoi SOURCE retention

The curated ZIPs are publisher source archives. Ordinary ingestion retains Division
assertions in `ssDivision` and DivisionArea assertions in `ssDivisionArea` in the
release's SOURCE shard. Each table uses `(sourceRecordId, versionHash)` identity,
`resourceReleaseId`, release-validity bounds and `isCurrent`. `properties` retains the
archive attributes, including locale-keyed names, curated hierarchy and provenance;
`sourceGeometry` retains the archive geometry. Parquet transport fields and geometry
adapter aliases do not become source attributes.

Unchanged assertions retain their existing version. Changed and removed assertions close
the preceding version; changed assertions open a new one. HISTORY `sourceResolutions`
links each retained assertion to the canonical Division or DivisionArea it produced. The
SOURCE write must succeed before publication completes. Delivery cache inputs include
the curated-source retention policy so an earlier SQL plan without source writes cannot
satisfy this contract. Local SOURCE schema migration is additive; replaying existing
releases and resetting databases are separate operations.

Curated DivisionArea ingestion validates division references against SOURCE records
whose validity interval contains the primary Division release's source version.
Unchanged records retain their original release ID and remain valid in later editions;
retired and future records are excluded from the selected edition.

The SaanSeoi
[curated record and map display contract](../sources/saanseoi/divisionArea.md#curated-record-contract)
resolves correlated spatial branches across administrative boundaries, places landforms
under their administrative ancestors, and assigns classification-based cartographic
hints. Names in its source archive use structured arrays and omit null optional keys.
External dataset matches are identifiers, separate from contribution attribution.

## Curated short codes and list membership

Reviewed island codes share one collision-free namespace across major islands, minor
islands, islets and island groups. The assignments live in
`fixtures/meta/divisionCodes/geographic.json`; explicit naming choices live in
`scripts/divisions/island-code-choices.json`. The island code generator reserves
assigned codes before suggesting new ones. See the
[island code review](../internal/reviews/island-code-proposals.md) for the full
inventory.

Monthly editions sharing an effective date are ordered by their numeric edition revision
before their release-set revision. The newest edition is the catalogue default; older
editions remain discoverable.

Geographic division codes must be unique within `(domain, category)`: administrative,
hood, locality and landform. Classes within a category share the code namespace. Numeric
levels are not code namespaces. Codes such as `CW` may identify both a district and a
macrohood because these belong to different categories. Callers retain the category or
canonical Division ID.

`scripts/divisions/check-code-categories.py` checks explicit assignments together with
optional proposal and edited review files, without applying them. Its report identifies
the assignment or proposal status of each conflicting division.

`fixtures/meta/divisionCodes/geographic.json` declares `divisionCategory` and
`divisionClass` for each explicit assignment. Validation requires the category to match
the class taxonomy and enforces code uniqueness across the category. Assembly also
checks both values against the target division. SQL category indexes enforce the same
namespace across classes. Recommendations do not become assignments automatically.
Prefer recognisable word initials; expand a distinguishing word for initial collisions.
Use `X` for identical names, and insert it before the final `V` for villages and
hamlets. Those classes always end in `V`, including names ending in Tsuen or Village.
Repeated homonyms can require a district qualifier; these proposals require geographic
review.

The [RVD ingredient](../sources/hkgov-rvd/division.md) contributes historical list
membership. Its source release exposes the retained assertion schema and samples, plus
record counts by assertion kind and source changes. Membership is separate from
identifiers, current ancestry and record contributions. China bounds are a curated OSM
relation assertion in `division-geometry.json`; the bounding rectangle is not used as a
polygon or invented representative point. Geometry-less divisions retain null bounds
until evidence exists.

Reviewed division name aliases are defined in
`fixtures/meta/curations/saanseoi-division/division-names.json`. Its locale-keyed
decisions contain `aliases` additions and `removeAliases` exclusions; `nameAliasRules`
defines suffix-derived variants such as English `Tsuen` to `Village`. Curated assembly
applies these decisions after canonical name overrides and records the dedicated
curation in name provenance. Publisher aliases remain source evidence; island identity
merges belong to `division-identity-matches.json`.

Authored divisions without a source point derive an interior point from their active
curated polygon. An explicit polygon core point takes precedence; generated coordinates
are not copied into the identity additions fixture.

### Yim Tin Tsai geometry selection

The Sai Kung island `LANDSD:PLACE_NAME:2820` uses the named basemap polygon whose
coordinate centre lies within 500 metres of its LandsD point. Exactly one candidate must
satisfy this constraint. The same-named island near Tai Po is a separate geometry
candidate and must not supply this island outline. The constraint is stored in
`division-geometry-selections.json` and applies to assembly and the local review map.

### Detached island coverage

Waglan Island selects the complete named `OSM:a25867861` MultiPolygon, including its
southern component and detached rocks. The South Ninepin islets Tai Pai, Yi Pai and Sam
Pai retain separate identities backed by `OSM:a217838696`, `OSM:a217838700` and
`OSM:a217838710`. They are distinct from the same-named LandsD islands farther north. An
unnamed source islet east of South Ninepin remains outside the named inventory.

In the local editor, reviewed island outlines use saved geometry in preference to source
geometry. The Islands Custom and Proto controls determine which island outlines are
visible. Government district overlays have separate C&SD 2024 and HAD 2022 controls.

### Island-group peripheral membership

Group membership uses the fixed envelope of `island-groups.json` seed polygons, with
whole-island containment and explicit membership overrides. Ninepin seeds include Sai
Chau Mei, Tai Chau Mei, Hok Tsai Pai, Hok Tsai Chau, Fo Siu Pai and Wang Pai alongside
the three main islands. Soko seeds include Ma Chau, Cheung Muk Tau, Tau Lo Chau, Ko Pai,
Siu Ko Pai and Tsim Shek Pai alongside Tai A Chau and Siu A Chau. The pinned review
inputs derive 22 Ninepin and 14 Soko member records; these are identity counts, not
independent physical-island counts.

Ung Kong retains Basalt Island, Bluff Island and Wang Chau as its seed envelope.
Explicit members Kong Tau Pai
(`LANDSD:PLACE_NAME:732`), 四排尾 (`BASEMAP:ISLAND:20237d751b5fe16d`) and Kam Chung Ngam
(`BASEMAP:ISLAND:ad777e9a7bc9fd4c`) are supported by the retained Protomaps
`OSM:a31915135` archipelago MultiPolygon from `2026-09-01.1`. Their selected polygons
have more than 80% area overlap with that source geometry. Explicit membership keeps
nearby Town Island outside the group without enlarging the automatic envelope. The
resulting Ung Kong union has 14 member records. No source names, reviewed identities or
member polygons are merged or modified by these membership rules.

Research references, checked 30 September 2026:

- [Hong Kong UNESCO Global Geopark: Sai Kung boat tour](https://www.geopark.gov.hk/en/discover/attractions/sai-kung-boat-tour)
  identifies Ung Kong and Ninepin as separate geosite groups; its tourism description is
  not treated as an exhaustive list of small-islet membership.
- [Ninepin Group island list](https://en.wikipedia.org/wiki/Ninepin_Group) corroborates
  peripheral Sai Chau Mei, Hok Tsai Pai and Tai Chau Mei. Its aggregate island count is
  not a target for inventing unnamed identities.
- [Soko Islands island list](https://en.wikipedia.org/wiki/Soko_Islands) corroborates Ma
  Chau, Cheung Muk Tau, Ko Pai and Tau Lo Chau. Source polygons and retained identity
  records determine the geometry, rather than names alone.

### Government district review candidates

`prepare-review.ts` exposes separate government geometry candidates for all 18
districts: C&SD 2024 district extents, HAD 2022 native district extents, and detailed
C&SD 2021 census boundaries. `government-review.ts` verifies retained file hashes and
resolves publisher district identifiers through the reviewed identity bridge. Candidate
geometry is projected to WGS84 without simplification or clipping. Provenance includes
the source file, checksum, edition and area identifier.

Candidates appear in the local editor's geometry-source selector, independently of the
active reference collection. Previewing them does not change map coverage, hierarchy,
estimated areas or publication. Explicit copying retains their source provenance in the
editor project; administrative editor drawings remain review material. See the
[HAD comparison](../sources/hkgov-had/divisionArea.md#local-district-comparison) for
edition and coastline-detail differences.

HAD native district and LandsD native Place Name adapters use the shared HK1980 datum
transformation also used by C&SD GML. Source-grid coordinates are preserved separately
from WGS84 delivery coordinates. Native FGDB WKT identifies the projection but does not
supply the datum operation; inverse projection alone is insufficient. Regression
controls verify actual coordinates against independent PROJ results, in addition to
feature counts and topology.

## Processing policy ownership

Protomaps SOURCE retention stores each complete coastline polygon once, including
mainland. Island membership references detached components by source record ID and
component index; components sharing a line segment with the checksum-verified regional
land border have no island membership. Island assembly resolves those references, while
administrative land clipping uses the full coastline from the same pinned source
archive. Coordinates, holes and source identities remain exact; point contacts alone do
not exclude islands. The registered extraction policy lives in
`fixtures/meta/processing-rules/ingestion/protomaps-source-extraction.json`.

The local review editor loads the full Protomaps land mask for administrative
references, including mainland districts.

Ingestion policies retain publisher properties and native geometry in SOURCE. Division
snapshot recipes select classification, names, identities and hierarchy processing.
DivisionArea and DivisionBoundary recipes select their respective geometry executor,
including its shared exclusion dependency. SaanSeoi curated assembly belongs to the
SaanSeoi snapshot recipes; Protomaps source intake does not declare canonical assembly.

See the [processing policy contract](../pipeline.md#define-audit-processing-rules).

## Retained dataset archives

Original publisher inputs are managed assets with role `releaseSourceArchive`, owned by
a source release. Original Parquet and ZIP files retain their bytes; loose GeoJSON and
GML are losslessly packaged as ZIP. Original filenames and packaging details live in the
downloadable manifest.

Resource-specific source downloads use role `resourceSourceArchive`, are Parquet and are
owned by a resource release. The ordinary uploader retains its prepared Parquet input.
Native SQL intake exports its source tables with a `sourceTable` column and JSON strings
for complex source values. Processing scratch files are separate from retained assets;
release metadata does not store their file locations.

## Field lineage

Base index/detail lineage includes the native HMA and Lands Department domains, with
explicit archive joins, provider classification, geometry normalisation, translation
instructions and persisted version metadata.

## JSON field naming

Public API responses use camelCase field names recursively, including inherited source
references, cartographic hints, hierarchy entries and included resources. Examples are
`recordId`, `updateTime`, `minZoom`, `maxZoom` and `fullContainment`. Source references
under `sources.overture` follow this API contract too. Locale codes, provider
identifiers, external identifier keys, enum values and source-field paths retain their
exact values. Colliding field spellings are rejected rather than silently overwriting
either value.

SaanSeoi Division and DivisionArea archives and retained SOURCE properties use the same
field naming. Publication projects inherited objects before hashing the published
archive. Source-record JSON, NDJSON and schema descriptions follow that contract.
Publisher-owned Overture source records and archives retain their original field names.
Internal geometry processing has a separate storage contract; curated ingestion maps
published containment fields into that contract without discarding geometry evidence.

### Source change statistics

Overture division source releases persist churn from retained publisher records,
including records excluded by canonical curation. Baselines span retained annual source
shards. The calculation compares retained properties and geometry without observation
metadata and saves counts during ingestion, so source pages can read stable statistics
without recounting records. Canonical API release-set churn and quality statistics
retain their output-specific populations.

SaanSeoi Division source releases persist counts using the same public source-field
projection as the Changes endpoint. Internal containment evidence and name variants do
not contribute to displayed churn; names, classifications, public hierarchy entries,
containment flags and geometry do. Totals and change distributions by division class and
level share this comparison. District coverage counts distinct administrative
memberships, including each district itself; multi-district records contribute once to
each district. Source record and named locale counts complete the source statistics. See
[SaanSeoi Division statistics](../sources/saanseoi/division.md) for calculation and
local backfill details.

## Publisher update review

SaanSeoi preparation reconstructs the accepted inventory from the pinned review inputs
and editorial fixtures. The proposed edition is compared with that inventory before
uploadable archives are written. `division-update-policy.json` owns core-locale
protection, new-identity exclusion patterns and exact reviewed decisions.

New identities are included automatically unless their names match a coverage rule.
Existing identities absent from the candidate require individual `keep` or `delete`
decisions. A kept identity retains its accepted names, classification, point and
available reference geometry. Missing core-locale primary names retain the accepted
value. Non-empty replacements require `keep` or `accept` review. Each decision contains
the report fingerprint and a reason; changing the compared values invalidates approval.
The output directory contains `update-review.json`, including input pins, policy and all
decisions. Pending decisions block archive preparation. Advance the pinned review inputs
only after the edition and its editorial decisions have been accepted.

Simplified Chinese names are publisher-owned. Only explicit Overture `zh-Hans`, `zh-CN`
or `zh-SG` values qualify; curated overrides, authored translations and inferred
Traditional Chinese conversions cannot supply `zh-hans`. Previously accepted explicit
Overture names remain eligible for core-locale protection.

## Historical Division backfills

A published revision displaced from current storage is reconstructed from its exact
history journal and assigned shards. An incomplete existing receipt blocks processing.
Historical branches use a retained snapshot scope so newer divisions referenced by
addresses remain intact. History comparisons use the selected parent revision; current
writes compare against the actual destination scope. Re-uploading SaanSeoi Division and
DivisionArea resources creates a new API release-set revision, preserving published
release-set membership.

Reviewed upstream removals retained in SaanSeoi become SaanSeoi patches for identity,
names, classification, hierarchy and retained geometry. Protected name values are
SaanSeoi contributions to the affected locale fields. The patch uses the SaanSeoi record
identity; historical publisher evidence remains in the preparation audit.

### Internal source references

SaanSeoi-authored records reference contributing datasets with `dataset`, `recordId` and
`contributions`; editorial contributions also carry `curation`. Neither source
references nor collection memberships contain release codes or versions. Resolve exact
input versions from the owning release's `sourceReleases` manifest, including when
reading historical editions. Each dataset has one selected version across its resource
types. Duplicate resource pins, mixed versions, unpinned dataset references and embedded
reference versions fail archive validation. Native publisher attribution is preserved.

Record fingerprints include dataset attribution and editorial ownership, while release
pins remain outside record content. An upstream pin advance alone preserves the record
version. An editorial takeover creates one content change, then shares that assertion
across subsequent editions with the same content.

## Rural areas

`rural_area` is a level-4 locality: a named area that can contain villages and hamlets,
without asserting administrative authority. Rural areas have their own locality-code
namespace membership, cartography policy and editor layer. Hung Lung Hang, Tai Tam, Shek
O on Hong Kong Island and Lei Yue Mun in Kowloon use this class. The separate Shek O
hamlet in North District retains its classification. Geometry and reviewed ancestry, not
class alone, establish containment. Rural-area ancestors remain in both `locality` and
`full` paths when a more specific village or hamlet is present. Address and Place
membership retains rural areas separately from neighbourhoods through `ruralAreaId`.

The stored and public `full` hierarchy excludes every `city` entry and the Hong Kong
Island landform, regardless of which ancestors occur in a stored path. Other island
landforms remain visible. These exclusions do not remove entries from the separate
`locality` and `landform` hierarchies.

## Audit boundaries and source editions

Sources expose Raw → Preparation and Preparation → SOURCE audits. API releases expose
SOURCE → Canonical and Canonical → Release Set audits for their selected snapshots,
including lookup dependencies. Every audit declares its stage and output owner.
Canonical selection evidence can appear in several API releases when they reuse a
snapshot. Response serialisation is documented by the API contract.

Overture Division, DivisionArea and DivisionBoundary share one source edition. SaanSeoi
Division and DivisionArea also share one edition and revision. Publication requires all
expected children. Notes and Audit combine the resources; Schema, Samples and Changes
retain resource selection. Source cards include the Area capability. Overture Places is
a supplementary source for Addresses; configured eligibility is distinct from a
contribution retained by a published release.

SaanSeoi identity exclusions use one scoped fixture list for final identities and source
inputs. Additions and exclusions support inclusive `appliesFrom` and exclusive
`appliesUntil` release bounds; guard-triggered decisions in the same files additionally
bind the exact reviewed change. Preparation retains alias match/change counts and checks
for unique identities, at least one name per division, valid ancestor references, valid
active drawings and core-point containment. Historical rechecks are labelled as
reconstructed evidence.

SaanSeoi names, translations, classifications, exclusions, hierarchy decisions and
geometry construction execute in preparation. Its source archive freezes curation
definitions and executed preparation evidence for the Source Audit. Canonical processing
normalises the prepared schema. Overture keeps its publisher classifications with the
common API schema mapping and CN-GD geometry filtering, without SaanSeoi editorial
patches or configured Division ID exclusions.

### Recurring Overture geometry content

Overture area and boundary source history retains disjoint validity periods when a
record returns to an earlier content hash. Unchanged open periods continue across
releases; closed periods are never reopened. Release membership and the local repair
workflow are documented in
[Overture geometry ingestion](../sources/overture/divisionGeometry.md).

## Historical audit evidence

Recorded Guangdong geometry exclusions and source checks belong to ingestion. Historical
source revalidation and country-reference evidence checks carry their actual
revalidation date. They do not assert that those checks ran during the original import.
Extraction and clipping require their own retained execution evidence. Source records,
snapshots and API release membership remain unchanged.

### Inspecting Protomaps source releases

Protomaps source releases expose their retained schema, samples and record changes
through the Divisions source endpoints. Their SOURCE shard assignments and record
statistics are published during native ingestion, independently of canonical
DivisionArea snapshots. Statistics compare publisher properties and geometry across
release validity periods; unchanged records remain visible even when first imported by
an earlier release. Counts cover both OSM island features and full coastline records,
including mainland, so they are not counts of distinct islands. See
[Protomaps release inspection](../sources/openstreetmap/protomapsIsland.md#release-inspection-and-verification)
for import verification.

## Retained island aliases

`division-names.json` retains reviewed island aliases independently of upstream name
tags. The October 2026 Protomaps refresh drops alternative or local names for Tong Hau
Pai (Wok Tuk Pai), Pyramid Rock (Wei Sam Chau), Tuen Tau Chau (Tse Leung Chau), Magazine
Island (Chu Kwu Chau; 豬牯洲), Cha Kwo Chau (Yeung Chau; 洋洲) and Wong Mau Chau (South
Gau; Nam Kau; 南牛; 南滘). These aliases remain attached to the canonical island
identifiers; primary names are unchanged. Evidence is retained in Protomaps
`2026-09-01.3`, compared with `2026-10-01.1`.

Assembly applies the name inventory after island identities are materialised, including
islands without an Overture match. Alias patches populate alternate names, name variants
and name rules, and record a SaanSeoi `division-names` contribution on the division.

## Four Little Dragons source identity

Four Little Dragons (四小龍) enters the October edition from Overture `2026-09-23.0` as
GERS identity `15062812-a4d2-4d4a-b589-2f50bc31943f`. It is included as a level-6
`microhood`. `division-classifications.json` and `division-names.json` retain the
curated classification and bilingual names; its reviewed hierarchy, drawn boundary and
polygon core point remain in their dedicated fixtures. It is not an authored addition:
the curation applies to the source record and does not create it in earlier inventories.

The local editor selects the newest pinned release of each dataset across
`saanseoi-division-review.json` and `saanseoi-division-release-inputs.json` on every
input rebuild. Companion resources must all exist at that version; missing or ambiguous
pins fail preparation. Monthly publication retains its edition-date cutoff. Browser
drawings, undo and backups use a stable storage cohort. Restored and imported drawings
are validated against the current editor inventory regardless of their saved cohort, so
advancing source inputs does not create a separate browser workspace.

SaanSeoi area archives encode `isLand` and `isTerritorial` as JSON booleans. Null or
absent values mean unknown. Preparation converts internal SQLite `0`/`1` flags to
booleans before writing the archive. Ingestion rejects numeric, string and structured
flag values, including in retained source properties.

Preprocessing comparisons identify the same-ID Overture ingredient used for Before
fields and names, preserve its native publisher hierarchy, and list all contributing
source references separately. Outputs without that ingredient have no single-record
comparison baseline. These automatic audit records are not individual editorial reviews.

Rejected island source geometries require a boundary patch that resolves to an emitted,
non-empty, valid polygon for an output division. The `rejected-island-boundaries` guard
accepts drawings and explicit replacement-source corrections, using retained output
geometry and its patch provenance. A source selection or withheld drawing alone does not
satisfy the guard. Completed identity decisions to exclude, merge, reclassify or retain
no geometry are outside this shape-replacement check. The audit groups both patch kinds
under Boundaries and labels them Drawn geometry or Replacement source geometry; expanded
source patches show the resolved polygon.

The Division guard `prepared-island-group-members` requires every output island group to
have at least one resolved member. Members must be unique output islands, not missing
IDs, non-island divisions or the group itself. Preparation retains the resolved
membership used to construct group geometry; seed lists alone do not satisfy this check.

## Local representative-point repair

`scripts/backfill-division-points.ts OUTPUT CURRENT.sqlite HISTORY.sqlite...` plans a
repair of canonical polygon-bearing Division rows. `--apply` writes Points and point
bounding boxes, recomputes canonical history hashes, merges identical canonical results
and rewrites snapshot replay references. Publisher source rows and
DivisionArea/DivisionBoundary rows are excluded.

The output contains `plan.json`, `receipt.json`, `rollback.sqlite` and `rollback.sql`.
The rollback database stores every affected canonical row and replay reference,
including merged rows. Apply and rollback require no concurrent ingestion writers. Run
`rollback.sql` from an empty SQLite connection to restore the backed-up rows. A second
plan should report zero polygon-bearing Division rows to repair.

Planning Division source interpretations associate each retained publisher cell with
every primary, secondary, tertiary and subunit Division that lists that cell in its
prepared membership. The writer uses the complete inventory, including unchanged
Divisions, and retains explicit omissions for removed publisher assertions. Native New
Town assertions resolve their own canonical Division. Division identities remain Points;
companion DivisionAreas retain polygonal geometry.

Reconstructed city records retain their district ancestry in `hierarchies` and their
reconstruction reference in `sources`. Construction codes, district member lists and
geometry methods are not external identifiers.

## C&SD publisher feature storage

C&SD statistics and geography intake share `hkgovCenstatdFeatures`. Publisher features
retain explicit dataset ownership, native identities, complete properties, acquisition
locators and Brotli-compressed native geometry. Canonical statistics and DivisionAreas
are separate projections of that evidence.

Geometry reuse compares canonical materialisations within the same cohort, region and
variant. Simplified derivatives identify the dataset and exact input feature version.

## Source record identity contract

Dataset fixtures declare `sourceRecordIdentity`: the dataset-release uniqueness scope,
identity stability, ordered input components and duplicate policy. Source IDs omit
publisher and dataset prefixes because references carry the dataset and release.
`publisher` stability identifies a native publisher key; `release` stability makes no
cross-release continuity claim. Delivery ordinals are one-based and refer to the
original input order. Canonical Division IDs and publisher codes used for grouping are
separate from retained source record IDs.

`hkgovCenstatdFeatureReleases` records exact feature-version membership for each
resource release. Source samples and schema inventories use this membership rather than
treating independent census cohorts as one validity timeline. Payload reuse preserves
separate memberships for the statistics and geometry resources.
