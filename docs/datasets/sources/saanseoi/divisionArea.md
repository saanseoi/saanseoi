# SaanSeoi curated DivisionArea

Curated Division and DivisionArea assertions use the retained release archive and
publisher record identity; neither source table has a `sourceLocator` column. Native
geometry is optional on curated Division records and required on DivisionArea records.

The Hong Kong assembly combines purpose-specific curation files with immutable Overture,
Protomaps, LandsD and RVD source archives. It can build Division and DivisionArea ZIPs
without a populated database. Both curated resources use the `saanseoi` variant.
Division codes declare `divisionCategory` and `divisionClass`; assembly validates both
against the taxonomy. The geographic API composition selects the curated Division
primary and DivisionArea companion together.

The geographic Division initialiser assembles both curated archives from their pinned
source assets after the Overture and C&SD inputs are available. It uploads both releases
with API-set publication deferred, then reconciles the complete geographic composition.
It selects the initial `2026-09-01.0` edition. During pre-release development, curation
and release metadata are edited directly in this initial revision.

The source pins include the RVD Division archive. The API field mapping uses that
complete retained ingredient signature at the `2026-09-01.0` lineage anchor.

## Curation ownership

Every file in `fixtures/meta/curations/saanseoi-division/` has a root `purpose`.

| File                                | Authoritative content                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `division-additions.json`           | Stable local identities, authored names, initial points and classes            |
| `division-names.json`               | Canonical-name modifications, aliases and suffix rules                         |
| `division-classifications.json`     | Reviewed class overrides; category and level are derived                       |
| `division-identity-matches.json`    | Source identity matches, island selections and merges, and RVD list membership |
| `division-exclusions.json`          | Scoped exclusions and island acceptance decisions                              |
| `division-geometry.json`            | Authored boundaries, core points and unique editing inputs                     |
| `division-geometry-selections.json` | Retained source polygon references and source-selection rules                  |
| `division-point-overrides.json`     | Explicit representative-point corrections                                      |
| `division-bounds-overrides.json`    | Bounds unavailable from retained geometry, with source attribution             |
| `division-hierarchy.json`           | Reviewed ID-only ancestry where spatial evidence is incomplete                 |
| `island-groups.json`                | Seed member IDs and optional membership overrides                              |

Source labels, polygon coordinates and expanded hierarchy labels are generated from
pinned inputs. An unchanged selected source polygon is referenced by its source record
ID. Authored or modified coordinates, unique original drawings and pencil linework
remain in Git. Optional working baselines, cleanup results and recovery history live in
`.local/division-review/division-editor-project.json`, ignored by Git. The geometry file
evolves in place; its root does not pin a publication cohort. Each editor session
obtains its cohort from the input manifest. Explicit ancestry retains relationships such
as provisional parents without polygons; generated spatial paths and containment
annotations are not editorial fixtures. Island-group membership is owned solely by the
group seed/rule definitions.

For non-administrative divisions, geometry precedence is curated drawing, then curated
island polygon, then Overture area. Drawings replace source area parts for those
divisions. SAR, Area and District geometry follows the territorial policy below. Polygon
and MultiPolygon coordinates, holes and shared edges are retained exactly. No
simplification, rounding, snapping or buffering runs during assembly. Review-only
original drawings and working baselines are not published as geometry.

An active drawing may carry a `corePoint` coordinate in its GeoJSON properties. The
editor exposes the selected division's point as a draggable marker and saves a moved
marker with that polygon. The point must be finite and inside the curated geometry.
Hierarchy derivation and Division publication use it in place of the source point;
DivisionArea publication continues to retain the polygon unchanged. Drawings without a
curated core point keep their source point. When an identity has no point, the input
loader derives a label point at the centre of the largest inscribed circle in the
largest connected polygon part. Generated island points and editor label anchors use the
same rule; explicit point overrides and publisher points retain precedence. The search
tolerance is one ten-thousandth of the smaller bounding-box dimension, with a minimum of
one billionth of a degree. Derived coordinates are generated for the editor and
ingestion, rather than duplicated in additions.

Island-group representative points may label the water between member islands. Assembly
preserves these points without requiring containment in the member-island geometry;
finite WGS 84 coordinates and valid canonical polygons remain mandatory. This exception
does not apply to individual islands or other division classes.

The editor applies a one-time cleanup to browser-saved multipart drawings. It removes a
detached locality polygon only when it is smaller than one hectare and less than one per
cent of the principal polygon. Administrative divisions retain every component. An
individual island retains its largest connected land polygon because detached polygons
represent separate islands. The complete preceding collection remains available through
Undo and the IndexedDB backup history.

Drawings for identities withheld by curation remain in `division-geometry.json` under
`withheld`, each with its original `feature` and a human-readable `reason`. The editor
reconciles the seed fixture, saved browser work, undo data and imports against current
curation decisions. Active `features` alone contribute to hierarchy generation and
publication; exports retain both collections. Imports replace matching drawings and
preserve unrelated active and withheld work. Unknown identities without a curation
decision and invalid polygons still block import. A withheld drawing becomes active only
when its identity is eligible in the review inventory and its curation hold has been
removed.

## Full ancestor containment

The editor and assembly generate complete ancestry from reference geometry, authored
drawings and explicit ID-only parent decisions. Ancestor labels and classes are resolved
from the current generated identity inventory. Assembly recomputes `full_containment`
against the final polygons before writing the immutable records:

- `true`: the ancestor covers the owning division's entire polygon area, including
  boundaries, holes and every disconnected part.
- `false`: both geometries are valid, but some of the division lies outside the
  ancestor.
- `null`: either geometry is missing, invalid or cannot be evaluated reliably.

The flag relates each ancestor directly to the division that owns the hierarchy, not to
the preceding entry in the path. The editor computes it for every category and full
path, including retained provisional ancestry. It does not infer full containment from a
label point, bounding box or vertex samples. Polygon coverage uses a topological
`covers` test over the union of each division's area parts.

`containment_geometry` records SHA-256 identities for the division and ancestor
geometries. Fingerprints retain exact coordinates and are independent of area-row order
and Polygon/MultiPolygon packaging. Assembly recomputes the flags and fingerprints after
identity remapping and all geometry replacements.

The geocoder checks children before ancestors. After a spatial child match, it can
inherit an ancestor's membership when `full_containment` is `true` and both fingerprints
match the loaded areas. It validates fingerprints lazily within the request-owned index.
Missing evidence, changed geometry and partial containment use ordinary point checks; a
name match alone cannot trigger inheritance. Multiple surviving paths remain ambiguous.
Containment evidence is internal to hierarchy resolution and does not change the
geocoding response shape.

A local comparison on the retained 2,088-division, 488-area assembly reduced polygon
checks from approximately 8.3 to 5 per sampled lookup and preserved results across 713
grid points. Repeated lookups were modestly faster, but constructing a fresh resolver
and validating fingerprints added approximately 0.7 ms to the sampled median. This
reduces polygon work; it is not evidence of an end-to-end HTTP latency improvement.

## Canonical assembly

Island review identifiers map to existing island identities when unambiguous, or stable
`ss-` UUIDs otherwise. Hierarchy references use those same canonical identifiers.
Missing ancestors, conflicting classes, ambiguous island identities and malformed rings
block assembly. Ma Shi Chau uses its retained named island polygon: the coastline
connected-component candidate includes mainland Hong Kong. Its explicit
`restrictHierarchyToGeometry` correction removes ancestry assertions whose curated point
lies outside that island. Both review editors and the island inventory generator read
the corrected upstream fixture. The hierarchy patch also excludes the incorrect mainland
ancestry so an editor export cannot reintroduce it. Other curated hierarchy paths are
retained.

## Archive building and ingestion

Edition codes use `YYYY-MM-01.revision`. Both datasets have a **monthly** cadence,
scheduled for the first of the month in Hong Kong. Publication time records the actual
publication event, independently of the edition date. Edition metadata lives in
`fixtures/meta/releases/`. The curated inventory supplies canonical identities, primary
names, classes and points; the hierarchy decisions supply curated ancestry. Drawings and
curated island polygons supply non-administrative geometry, with retained Overture areas
for divisions without selected drawings. Administrative geometry uses pinned native
Overture territorial assertions and the pinned Protomaps coastline land mask.

`fixtures/meta/datasetInputs/saanseoi-division-review.json` pins exact source release
codes, archive keys and SHA-256 hashes. Refreshing source inputs is an explicit review
operation. Assembly reads these maintained pins directly; inputs must be dated on or
before the edition cutoff. It retains the exact inputs and curation hashes in generated
reports and archive manifests. Assembly does not write fixture files. A registered
source asset ID may accompany a pin for API downloads.

The shared loader first tries a configured asset API, then the exact local archive or
content-addressed cache, then a configured R2 archive origin. It verifies SHA-256 on
every path. API failure never selects a different local release. Corrupt or mismatched
bytes block loading. `.local/division-review/` is generated and ignored by Git; losing
it or resetting the database does not lose curation. Retained archives can regenerate
it.

The local editor selects the newest pinned release of each dataset across
`saanseoi-division-review.json` and `saanseoi-division-release-inputs.json` on every
input rebuild. Companion resources must all exist at that version; missing or ambiguous
pins fail preparation. Monthly publication retains its edition-date cutoff. Browser
drawings, undo and backups use a stable storage cohort. Restored and imported drawings
are validated against the current editor inventory regardless of their saved cohort, so
advancing source inputs does not create a separate browser workspace.

Build the pair of archives without publishing or writing canonical database rows:

```sh
bun apps/harbour-dataops/src/cli.ts saanseoi-divisions:assemble --target local --out-dir .local/curated-release
```

Then upload Division before DivisionArea using the ordinary uploader:

```sh
./bin/saanseoi upload .local/curated-release/dr-hk-saanseoi-division-2026-09-01.0.zip --source saanseoi --target local --yes
./bin/saanseoi upload .local/curated-release/dr-hk-saanseoi-division-area-2026-09-01.0.zip --source saanseoi --target local --yes
```

The same archives support preview and production targets. Archive decoding prepares
canonical records for the standard SQL delivery, history, publication and replay
pipeline. Ingestion validates the curated taxonomy and geometry and retains the
archive's names and ancestry. It does not apply Overture editorial rules or generate
translations. Upstream uploads and the Overture initialiser do not publish a synthetic
edition automatically.

Each immutable ZIP contains:

- `records.json`: canonical rows, with Division names keyed by locale. Snapshot
  placement, history hashes, validity markers and ingestion timestamps are excluded.
  Polygon coordinates retain their full precision.
- `manifest.json`: edition metadata, curation content hashes, derived group membership,
  and `sourceReleases` identifying every contributing dataset, resource release,
  publisher version, archive key, SHA-256 hash and release-notes URL.

The uploader retains the ZIP as the synthetic release's source archive. Upstream
resource releases remain linked to their own source releases and release notes; snapshot
membership records them as enrichment inputs anchored to the synthetic resource release.
The imported manifest must match the retained upstream archive hashes before
publication. A release identity cannot be reused for different archive bytes.

The source registry's SaanSeoi Division and DivisionArea cards expose their dataset
inputs through accessible icon toggles. Division uses Overture Divisions, Protomaps
Islands and LandsD settlement names; DivisionArea uses Overture Division Areas and
Protomaps Islands. Expanded input cards are inset 48px, with arrows from each input's
left centre into the parent card's bottom-left. Dataset relationships live in
`fixtures/meta/datasetInputs/`; exact versions belong to the archive manifest. Adding a
future LandsD Settlement Names input does not require another card implementation.

The exclusions in `fixtures/meta/curations/saanseoi-division/division-exclusions.json`
remove rejected duplicate and unsupported identities from curated coverage. Withheld
drawings remain review evidence and do not enter the archive. The editor's
coast-clipping tools, undo history and fixture export preserve the distinction between
review work and published editions.

Monthly assembly selects the latest exact publisher pin on or before the edition date
from the editorial review pins and
`fixtures/meta/datasetInputs/saanseoi-division-release-inputs.json`. The September
SaanSeoi edition uses August Overture; October uses September Overture. Slower sources
carry forward, and the archive manifest records the selected hashes and snapshots. The
editor's reference cohort does not advance implicitly with publication.

## Geocoding and coverage

`/divisions/v1/geocode` reads the selected published SaanSeoi area snapshot, with
Overture fallback for releases without one. It does not read the drawing fixture at
request time. `geometry=area` includes the selected polygons. Bounding boxes reject
irrelevant polygons before exact point-in-polygon tests. Points on a shared edge retain
both memberships rather than falling into a numerical gap.

Assembly reports record the division and area counts for each edition. Coverage is
partial: many named divisions have no polygon. Full-profile `meta.datasetCoverage`
reports this separately from the lookup. A fully evidenced lookup is `resolved`;
competing hierarchy paths remain `ambiguous`. For example, Prince Edward and Mong Kok
both contain the tested point but the curated hierarchy does not make one the ancestor
of the other. The resolver preserves both paths.

Ingestion validates every assembled polygon. Exact preservation introduces no new seams,
but does not repair gaps or overlaps in the inputs. The curated L5 drawings include an
approximately 113 m² overlap between Kowloon Tsai and Kowloon Tong. Administrative and
locality categories can intentionally overlap.

On the local development machine, a 3,000-lookup benchmark over Austin, Prince Edward
and San Po Kong measured approximately 0.10 ms median and 0.15 ms p95 in the resolver,
with an 8 ms index build over 125,695 vertices. HTTP requests, including loading and
parsing the release, took roughly 200–300 ms. These are development measurements, not
production throughput guarantees. Retaining exact geometry is appropriate; optimise
release-scoped loading before reducing geometric precision. Any future simplified
derivative must simplify shared topology once for the complete coverage, then validate
gaps, overlaps, holes and point classifications against the detailed version.
Independently simplifying each polygon is unsuitable.

Local examples:

- [Austin, L5](http://localhost:8787/divisions/v1/geocode?lat=22.3036669&lng=114.1658961)
- [San Po Kong, L5](http://localhost:8787/divisions/v1/geocode?lat=22.3359905&lng=114.1989697)
- [Lamma Island](http://localhost:8787/divisions/v1/geocode?lat=22.2094533&lng=114.1497273)

## Island size classification

Individual islands use land area: `islet` below 10,000 m² (1 hectare), `minor_island`
from 10,000 m² inclusive to 10 km² exclusive, and `major_island` from 10 km² inclusive.
All use category `landform` and `level: null`. `island_group` is independent of area.
Assembly preserves matched island identities and uses the canonical island class in
stored ancestor entries.

Point-only island records with unknown land area retain `minor_island` until a measured
outline supports size classification; a stored zero area is not evidence that an island
is an islet.

Island assembly evaluates `division-exclusions.json` before creating divisions. Only
eligible canonical islands are emitted; excluded and no-geometry candidates remain
review evidence and do not create divisions or areas. Merged aliases resolve to their
canonical island in ancestry. Unresolved curation blocks assembly. Size classification
requires a finite, positive land area.

Island assembly carries the geometry and measured area selected by the island review.
Named-geometry corrections for Ap Lei Chau and Ap Lei Pai publish separate polygons; the
uncorrected inventory polygon is retained only as review evidence.

The curated locality fixtures include Kellett Island (奇力島), a level-6 microhood, and
Wah Fu (華富), a level-4 macrohood, with representative points from the LandsD Place
Name source in EPSG:2326 transformed to WGS84. Their curated boundaries are retained in
`division-geometry.json`. Stonecutters Island (昂船洲) retains its Overture identity and
curated drawing as a level-4 macrohood. Its administrative ancestry contains separate
Sham Shui Po and Kwai Tsing paths; neither district is asserted to contain the entire
macrohood.

## Native naming and geometry inputs

Assembly reads the full pinned LandsD Place Names ledger, including topographic
features. It does not use the settlement-only canonical inventory as its naming
universe. curated LandsD feature identities take precedence; otherwise a unique
bilingual name or alias match within 5,000 metres can establish membership.

Protomaps retains its own native locale-tagged names and unnamed geometry. Exact
polygon-coordinate matches add release-specific geometry references to assembled areas;
curated drawings retain their curation references. Ring direction and starting vertex do
not affect coordinate equivalence. No proximity-only naming or identity merge runs
during native ingestion.

## Assembly policy and official releases

Version-controlled fixtures define SaanSeoi's patches, selections, exclusions and
explicit additions over pinned upstream inputs. Git records fixture edits; no separate
per-edit audit or fixture publication lifecycle is required. Monthly versioned archives
are the official SaanSeoi source artefacts consumed by ordinary ingestion.

LandsD membership matching does not itself add missing settlements. Unmatched names
remain review candidates until an assembly selection or addition includes them. Native
LandsD points do not imply government-supplied polygon boundaries.

## Administrative territorial and land geometry

SAR and District territorial polygons come from the pinned Overture DivisionArea source
assertions with `isTerritorial=true`. The three Areas are unions of the constituent
Overture district territories; missing districts block assembly. C&SD outlines and
administrative editor drawings do not replace these geometries.

Each administrative division has two independently identified geometry representations
within the `saanseoi` inventory: territorial and land-clipped. Territorial records
retain Overture's land flag (or the conjunction of constituent flags for Area unions).
The land-clipped record has `isLand=true` and `isTerritorial=false`; it is the
intersection of the territory with the pinned Protomaps `coastline-land` components.
Territorial geometry is identified by `isTerritorial=true`, regardless of whether the
publisher also marks it as land. Both forms retain their exact source record IDs and
releases. Territorial geometry is the administrative reference; land-clipped geometry
supports land coverage calculations. All disconnected territorial components and islands
remain.

An exclave is a curated jurisdictional distinction, not every disconnected polygon. No
largest-component filter or automatic exclave removal is applied. An eventual
component-selection option must identify the specific territorial parts to omit and must
preserve ordinary islands. Missing land masks or invalid polygons block assembly.

Large derived administrative MultiPolygons are partitioned along existing polygon
components into multiple area records to respect D1 row limits. Coordinates, holes and
all islands are preserved without simplification. `geometryPartition` identifiers record
the original geometry identity, part number and part count. Consumers collect all
records for the requested representation; a polygon count is not a division count.

## Island-group geometry

Ninepin Group, Po Toi Islands, Soko Islands, The Brothers and Ung Kong Group use
`island_group`, category `landform` and null level. `island-groups.json` retains their
known seed member IDs. Assembly resolves those IDs to selected island polygons and
calculates one fixed bounding box of the seed union. Every eligible island whose whole
polygon lies within that box, including its boundary, joins the group. Label-point
containment and mere polygon intersection do not establish membership.

Optional `include` and `exclude` arrays modify membership; all five definitions have
empty overrides. An included outlier does not expand the seed box. Missing seed
geometry, conflicting overrides and invalid polygons block assembly. The output geometry
is the union of member land polygons, preserving sea gaps and holes. It is not the
bounding rectangle. Individual islands retain their own identities and polygons. Area
identifiers and the archive manifest retain derived member IDs, seed bounds and the
derivation method.

## Replay and evolving drawings

Keep one evolving set of curation and editor-project files in Git. Publish immutable
Division **and** DivisionArea ZIPs through ordinary ingestion. Retain their registered
release metadata and every referenced upstream archive/hash. A DivisionArea ZIP alone
does not preserve division names, identities or ancestry, and an unregistered R2 object
does not establish the publication contract.

Reingestion reads materialised archive records without consulting current drawings or
reapplying current editorial decisions. Matching ingestion code and schema are needed to
reproduce processing behaviour. Database history/journals remain the contract for
replaying historical publication and rollback state, rather than reproducing timestamps
from source archives.

## Publisher record ledger

Both curated resources retain their own SOURCE assertions: `ssDivision` for identities
and `ssDivisionArea` for polygons. The ZIP remains the immutable source archive; its
records are also stored with publisher attributes in `properties`, geometry in
`sourceGeometry`, and version identity and release-validity metadata. The tables do not
reuse Overture's SOURCE ledger. Canonical HISTORY records retain source-resolution links
to the SaanSeoi assertions as well as the archive's upstream contribution evidence.

Area ingestion uses archive field names for SOURCE retention and maps geometry adapter
fields only into canonical processing. A division can have multiple source area records,
including separate territorial and land-clipped coverage. Each keeps its archive record
ID and source version. Failed source delivery leaves publication incomplete; replay and
rollback use the same versioned source ledger.

Curated DivisionArea ingestion validates division references against SOURCE records
whose validity interval contains the primary Division release's source version.
Unchanged records retain their original release ID and remain valid in later editions;
retired and future records are excluded from the selected edition.

## Curated record contract

Division ancestry is resolved from the final published polygons. Every positive-area
intersection contributes a branch; a shared edge alone does not. Each branch must have a
common intersecting part of the child across its ancestors, so unrelated district and
neighbourhood branches are not combined. Point-only divisions use their point. Explicit
ancestry without available geometry remains curation evidence.

Landforms, including island groups, resolve administrative ancestors at District, Area
and SAR level. The Hong Kong Island landform stops at Area level. Individual islands can
additionally belong to island groups; landforms keep a null geographic level.
Containment hashes bind each assertion to both polygon sets and protect the geocoder's
request-time shortcut. Assertions are recalculated during assembly.

Curated additions identify SaanSeoi as their publisher and describe the contributed
identity, names, classification and hierarchy. `evidence` is not a publisher. A match in
an ingredient dataset supplies an external identifier; it does not by itself assert a
naming or geometry contribution. Geometry attribution identifies the actual inputs.

`wikidata` is explicitly null when unavailable. Names are locale-keyed objects with null
fields omitted; `nameVariant` is an array and `nameRules` an array of rule objects.
Bounding boxes are derived from the available Division geometry, including degenerate
point bounds, or from its published areas when no Division geometry exists. Records
without either geometry cannot supply a bounding box. Geographic division codes come
from `fixtures/meta/divisionCodes/geographic.json`; codes in other inventories retain
their own domain.

## Map display policy

`cartography` uses `minZoom`, `maxZoom` and `prominence`. Labels become eligible at the
minimum zoom and remain eligible through zoom 24. Larger prominence values win label
collisions; map clients retain collision detection rather than displaying every eligible
label. Landform labels use the island classification, not an artificial level. These are
display hints, not changes to geometry or identity.

| Classification | Minimum zoom | Prominence |
| -------------- | -----------: | ---------: |
| Country        |            2 |        100 |
| SAR            |            5 |         95 |
| Area / City    |            8 |         90 |
| District       |           10 |         85 |
| Town           |           10 |         80 |
| Macrohood      |           12 |         70 |
| Neighbourhood  |           14 |         60 |
| Microhood      |           16 |         45 |
| Village        |           13 |         55 |
| Hamlet         |           15 |         40 |
| Major island   |            9 |         80 |
| Minor island   |           12 |         60 |
| Islet          |           15 |         35 |
| Island group   |           11 |         65 |

## Processing policy ownership

SaanSeoi ingestion retains reviewed publisher records in `ssDivisionArea` and
`ssDivision`. Curated assembly, identities, names and canonical geometry processing are
selected by the resource-specific snapshot recipes. These recipes retain exact assembly
declarations independently of the ingestion policy.

The [processing policy contract](../../pipeline.md#define-audit-processing-rules)
separates captured ingestion and snapshot assembly definitions.

## Published JSON keys

SaanSeoi archives and retained source properties use camelCase for structural fields,
including inherited nested objects and array entries. Source references use `recordId`
and `updateTime`; cartography uses `minZoom` and `maxZoom`; published hierarchy entries
use `fullContainment`. Internal containment evidence is named `containmentGeometry` in
archives and omitted from public source samples and API responses.

The archive writer projects keys before calculating the archive hash. SOURCE retention
applies the same projection before content hashing. DivisionArea source properties
follow the same rule. Existing immutable releases are not edited in place; corrected
archive content requires a new reviewed publication. Public SaanSeoi source JSON and
NDJSON use the naming contract when projecting retained records.

Provider keys, locale keys, external identifier names and source-path values are data
and retain their spelling. Structural name collisions fail publication instead of
dropping a value. Raw Overture archives and retained publisher records remain
publisher-owned.
