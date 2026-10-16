# Census and Statistics Department District Council district areas

Canonical geometry has no `identifiers` field. Entity identifiers belong to `divisions`;
publisher feature IDs and native codes remain in retained source records and lineage.
Normalised geometry caches include the canonical schema contract, dataset, variant and
provider identity mapping; cached canonical rows must contain only persisted fields.

Canonical Division identities use representative Points. Canonicalisation preserves a
valid source point or derives an interior point from polygonal source geometry using JTS
`InteriorPoint`. The `division-representative-point` audit guard verifies point validity
and strict containment where canonical area evidence is available. Source polygons and
separate DivisionArea geometries retain their full extent. See the
[Division point contract](../../families/divisions.md#representative-points-and-separate-areas)
for null handling and area selection.

Canonical source references follow the
[source evidence contract](../../families/source-evidence.md). Original publisher
properties and file locators remain in retained source assertions.

Native geometry is content-addressed in `hkgovCenstatdGeometry` and shared within each
yearly SOURCE shard. Release-owned statistics reference its ID. Derivatives are
immutable and keyed by geometry ID, transform and a hash of settings, engine version and
coverage geometry IDs; statistics-only changes reuse them.

Housing Market Area API inventory counts, locale coverage and churn use the shared
[division API statistics calculation and backfill](../../families/divisions.md#api-release-statistics).
Comparisons stay within the HMA domain; geometry statistics remain source-owned.

Geometry processing retains a registered normalisation declaration, counts and selected
identity curation fixtures in the [R2 audit](../../processing-provenance.md). D1 holds
the manifest pointer and attempt status. Audit loads readable fixture contents on
demand; failed blocking guards prevent publication.

Housing Market Area division names retain each applied translation with its source text,
target locale, resulting text and selected fixture entry. Only fixture entries without a
captured application are reported as unused.

Translation context retains parent identity and multilingual `parentName.<locale>`
display names without changing the identity hash. Audit selects the UI locale, then
English, another retained name in locale order, and the parent ID.

Source storage uses `null` when no provenance references are supplied. A supplied
canonical division ID is not a publisher source reference. Publisher district codes,
classes and archive evidence remain valid provenance.

Geometry assembly records retain contributed and inherited source rules and selected
releases under the
[assembly provenance contract](../../pipeline.md#snapshot-assembly-provenance). Verified
identical reuse preserves the published snapshot's assembly evidence. The incoming
resource release receives its own ingestion audit; reuse creates no new assembly audit.

Geometry replay streams current, history and source rows into bounded SQL statements
when creating a delivery plan. Retained plans bypass replay-table reads and SQL packing;
normalisation and local materialisation remain separate workflow stages.

Local exact and simplified materialisation uses WAL-safe planning copies and native
delivery receipts. Each phase retains exact mutations, including source derivative
updates, and checksummed churn counts. Resume validates normalised inputs and replays
the retained plan before publication.

Exact and simplified geometry imports use distinct
[sealed delivery phases](../../sql-delivery.md). Each phase retains source-file and
snapshot identities and confirms remote imports before replaying the same SQL into the
mirror.

Ordinary metadata upserts for exact and simplified phases leave identical release
assignments, processing actions and statistics untouched. Changes to any replayed field,
including `null` transitions, still apply in statement order. The
[SQL delivery contract](../../sql-delivery.md) describes the oversized-row exception.

Remote replay selects immutable canonical content through exact record and
introducing-snapshot keys and records removals as inline deletion events. Source
closures use exact version keys. Simplified phases deliver immutable source-derivative
rows keyed by geometry ID, transform and transform-context hash.

Parented exact and simplified snapshots follow the
[geometry membership contract](../../families/divisions.md#publication-readiness):
validated identical parent members inherit without new component writes, while companion
contributions retain members outside their input. Independent census cohorts retain full
inline component events and their own current projections. Source assertions and audit
delivery remain separate from canonical membership.

## Source releases

The Census and Statistics Department (C&SD) publishes 18 District Council district
polygons alongside census, by-census and annual statistics. These are statistical
geographies: each geometry release is retained for its reference-year cohort and must
not be represented as an evergreen administrative boundary.

Each independently published geometry resource release retains its selected current
snapshot per cohort and variant. The 2016 and 2021 census releases share
`hkgov-censtatd-landclipped` and use distinct cohort keys; each also has a
`hkgov-censtatd-landclipped:simplified` materialisation. A correction within one cohort
can replace that cohort's selected snapshot without displacing the other census.
Retention follows the processed geometry resource release, independently of publication
of the source package's statistics output. Superseded snapshots remain reconstructable
from history.

| Cohort | Upstream publication series                                             | CSDI dataset                       | Native layer  | SaanSeoi source dataset                               |
| ------ | ----------------------------------------------------------------------- | ---------------------------------- | ------------- | ----------------------------------------------------- |
| 2016   | 2016 By-census subdivided units by District Council district            | `censtatd_rcd_1635932488538_10765` | `DC_16BC_SDU` | `ds-hk-hkgov-censtatd-subdivided-units-district`      |
| 2021   | 2021 Population Census subdivided units by District Council district    | `censtatd_rcd_1635933617052_68946` | `DC_21C_SDU`  | `ds-hk-hkgov-censtatd-subdivided-units-district`      |
| 2024   | Annual Population and Household Statistics by District Council district | `censtatd_rcd_1635934545173_69201` | `DC_GHS`      | `ds-hk-hkgov-censtatd-population-households-district` |

The 2016 and 2021 cohorts belong to the census/by-census subdivided-units series. The
2024 cohort belongs to the distinct annual population-and-household series. They share
the C&SD publisher and canonical district identities, but not an upstream dataset. Each
source fixture maps `versionPolicy.releaseField` to the configured release metadata's
`sourceVersion`; the CSDI catalogue `modified` date is a publisher revision signal, not
the reference-year release version. The updater mirrors every Archived Dataset slot's
native package and manifest; it does not use WFS or CSDI-converted GeoJSON as input.

The archive manifest records the exact native format for each slot, and the source CRS
is stored once in the dataset metadata record. Source processing retains the complete
publisher feature and projects only its accepted native geometry into the canonical
EPSG:4326 column. It does not simplify, clip or otherwise alter the exact-source
geometry. The uploader calculates the canonical WGS84 bbox from that geometry rather
than accepting an upstream bbox value, so source and canonical rows carry the same
geometry-derived extent.

To keep exact C&SD geometry available from the inline source-record API within D1's row
limit, the source shard stores the publisher geometry as a Brotli-compressed BLOB. The
API decompresses it before responding, so consumers receive the unchanged native GML
geometry and do not need to negotiate a separate download or decompression format. The
exact WGS84 variant is likewise compressed in the current and history shards, then
decompressed by the divisions API. The named `simplified` derivative remains ordinary
JSON for map reads.

Each fixture records the observed CSDI archive slots and publisher-object hashes that
are byte-identical within its own cohorts. The updater suppresses only those exact no-op
objects; it continues to inspect the archive catalogue, so a changed slot or object key
remains eligible for review.

The 2016, 2021 and 2024 cohorts use separate source releases and cohort-specific native
ZIP members. Each mirrored ZIP is shared only by that cohort's exact and simplified
materialisations, and is linked to those processed resource releases through its own
canonical source-release lineage.

During a target bootstrap, the release report is evaluated separately for each source
fixture and cohort. An absent cohort is rebuilt from its native CSDI archive group,
while a cohort already reported by the target remains current even if the operator's
local source checks differ.

These C&SD geometry companions may be materialised by the shared
`hkgov-censtatd:statistics` intake. That command includes available geography by
default; `--defer-stats-release-set` makes it Statistics-only unless
`--include-geography` is supplied, while `--geography-only` requests the geography
companions without the Statistics resource. Divisions release-set publication is a
separate concern and is deferred with `--defer-api-release-set`.

Some annual-statistics archives publish several reference-year district layers in one
publisher release. The intake registers that release once and materialises each year as
a separate cohort under the same `divisionArea` resource release. Publisher assertions
therefore remain in the source-version shard, while each cohort's geometry history uses
its reference-year shard. Publication is deferred until the last cohort so every exact
and simplified snapshot becomes available atomically.

## Source contract

Each release contains exactly 18 Polygon/MultiPolygon features. Required properties are:

- `dc`: C&SD numeric district code;
- `dc_class`: the stable A–T district class, omitting I and O;
- `dc_eng` and `dc_chi`: English and Traditional Chinese district names.

All publisher properties, including the subdivided-unit measures, remain in
`properties`; the geometry resource path does not publish them through the Division
Statistics family. The shared C&SD statistics intake can publish the corresponding
statistical records from the same archive. Publisher labels and district codes remain
only in `properties`, alongside source identity, release history, provenance and native
geometry. `dc_class` is bridged through a reviewed `hkgov-censtatd` identifier bridge
for each reference-year cohort; canonical `identifiers` expose the provider's `class`
and numeric `code`.

The reference-year cohort belongs to release and canonical snapshot identity. Native
source assertions use dataset ownership, publisher feature identity and a content hash.
Resource-release ownership selects the source input for each cohort. Geometry
derivatives reference the shared geometry ID and their complete transform context.

The source materialises into two C&SD companion families. The provider's census
subdivided-unit district geometry is land-clipped; annual district geometry and the
Permanent Living Quarters Area/type polygons are not. Every source-authorised cohort is
retained as an independent snapshot, even where its exact geometry is byte-identical to
an earlier cohort.

```text
dataset  ds-hk-hkgov-censtatd-subdivided-units-district
variant  hkgov-censtatd-landclipped  (2016 and 2021 census/by-census districts)
releases dr-hk-hkgov-censtatd-division-statistic-subdivided-units-district-2016
         dr-hk-hkgov-censtatd-division-statistic-subdivided-units-district-2021

dataset  ds-hk-hkgov-censtatd-population-households-district
variant  hkgov-censtatd              (annual districts and Area/type polygons)
release  dr-hk-hkgov-censtatd-division-statistic-population-households-district-2024
```

The publisher's 2021 `CENSTATD:T` feature has a self-intersecting ring. The C&SD adapter
retains that exact source geometry without a topology repair; full topology validation
is therefore not enabled for this provider profile. Structural validation, feature-count
checks and source-archive SHA-256 verification still apply. The same policy applies to
direct archive intake and `saanseoi update`.

## Display transformation

Each source geometry remains as published. For Hong Kong-wide preview maps, Saanseoi
exposes a named geometry transformation for each companion snapshot, without clipping,
unioning or otherwise changing its topology:

```text
datasets  ds-hk-hkgov-censtatd-subdivided-units-district
          ds-hk-hkgov-censtatd-population-households-district
transform simplified
applies   hkgov-censtatd-landclipped
          hkgov-censtatd
```

The derivation uses Shapely 2.1's GEOS-backed coverage simplifier at a 10-metre
tolerance. Its interface consumes and emits WGS84 GeoJSON; a temporary local metre plane
is used only to apply that tolerance. It simplifies shared coverage edges as one
operation, validates every resulting Polygon or MultiPolygon, and records the engine
version in derivation metadata. The exact source row retains the untouched C&SD geometry
and no derivation metadata; its derivative records the geometry ID, coverage inputs,
method, tolerance and `preservesLandClip: true`. The known invalid `CENSTATD:T` input is
repaired only in the helper's temporary display-processing copy with GEOS `make_valid`;
that derivative records `inputValidationRepair: make-valid`. The derived geometry is
materialised internally for fast map reads in a derivative row keyed to the exact source
geometry and transform-context hash; it remains a geometry transform rather than a
separate dataset, source record or API-composition member. The 2016 and 2021 derivatives
declare `preservesLandClip: true`; the 2024 derivative declares
`preservesPublisherGeometry: true`.

The completed simplified coverage is retained as content-addressed WGS84 GeoJSON in
`.local/dataops/simplified-coverage`. Its key binds the input geometry, tolerance and
simplification-contract version, so a re-upload with identical source geometry reuses
the derivative rather than repeating the GEOS simplification.

Each retained companion cohort and variant has its own current scope for qualified
Divisions API reads, whether or not it is an API-composition member. A revised scope
serves its selected version from current; older pinned revisions replay from immutable
history.

Use `include=areas:hkgov-censtatd-landclipped:simplified` or
`include=areas:hkgov-censtatd:simplified` for low-detail display maps; omit the
transformation for source precision, reference-year accuracy and geometry auditability.
When querying the Divisions API, append `@<cohort>` to retain the selected release set's
canonical identities while choosing a particular C&SD geometry companion, for example
`include=areas:hkgov-censtatd-landclipped@2021&transform=simplified`. The cohort applies
only to the included area geometry; it does not change the top-level division snapshot.
The transformation belongs to its exact C&SD source dataset and does not introduce a new
publisher or snapshot family. For C&SD district statistics, unqualified `include=areas`
selects the exact reviewed C&SD companion automatically: 2024 district statistics select
the `hkgov-censtatd` snapshot for cohort `2024`, not the Geographic domain's Overture
default. The response permalink records the resolved variant. The choice is declared by
each Statistics dataset's `areaCompanionByReferencePeriod` fixture as a domain, variant
and cohort, and is materialised into the canonical statistic record during ingestion,
rather than inferred from its source-release string at read time.

The Atlas source-release Stats choropleth uses the 2021 land-clipped simplified variant
(`hkgov-censtatd-landclipped:simplified`) from this dataset. It intentionally does not
fall back to Home Affairs Department boundaries or the unsimplified C&SD source
geometry.

## Statistical area companions

Geometry release churn counts incoming source rows. A merge carries absent parent
members into the resulting snapshot; those members are not removals and do not increase
the incoming record count. Snapshot membership can therefore exceed a source release's
record count.

The C&SD Permanent Living Quarters release supplies three regional polygons (`HK`,
`KLN`, and `NT`). They join the cohort-matched `hkgov-censtatd` companion rather than a
second division collection: each polygon is linked to the corresponding canonical
SaanSeoi division ID from the curated source edition. The companion belongs to the
SaanSeoi API composition and is not a requirement of the native Overture composition.
Request them with `include=areas:hkgov-censtatd`.

Regional identities use `HK` for Hong Kong Island, `KLN` for Kowloon and `NT` for New
Territories. The public identity lookup can extract these codes from the
`CENSTATD:area:<code>` IDs of area records belonging to the selected release set. It
returns their recorded `divisionId`, including Kowloon's retained Overture identity. The
mapping does not equate C&SD polygons with Overture geometry.

The companion snapshot preserves all its contributing C&SD source releases as
provenance. Required publication membership does not make geometry part of the default
response; clients still select it explicitly with `include`.

Each C&SD source release is retained as a `snapshotSource`. Before adding a second
source for the same companion cohort, ingestion compares its complete materialisation:
canonical record IDs, division references, land/territorial classification and exact
geometry hashes. When every incoming row is already present with the same materialised
geometry (the companion can also contain non-overlapping rows), the source attaches to
the existing snapshot with `selectionMode: verified_identical_geometry`; its archive and
raw source records remain available, but the canonical geometry rows are not written
again. A source that adds non-overlapping rows is marked `contributed_geometry`, and
inherited rows are marked `carried_forward_companion`. This records where geometry was
deliberately not republished because a second publisher release supplied the same
geometry. A differing overlapping geometry requires a different companion variant; the
census/by-census land-clipped geometry is the current example.

During ingestion, the three references are checked against the closest published
canonical SaanSeoi division snapshot: the latest cohort at or before the C&SD cohort is
used first; only an absent earlier cohort permits the earliest later SaanSeoi cohort.
The selection is retained as a snapshot lookup dependency. Permanent Living Quarters
must not create a second C&SD division snapshot merely to satisfy its geometry
validation. Reference validation opens all configured regional history shards so that a
later SaanSeoi snapshot can be replayed even when the C&SD source belongs to an earlier
shard year. The C&SD source and geometry retain their own shard assignment.

The 2021 Housing Market Areas and Building Groups release is different. Its 173 Housing
Market Area polygons have their own deterministic canonical division IDs and therefore
form the separate `hkgov-censtatd-hma` domain. Its native area variant is
`hkgov-censtatd-hma`; Building Groups remain source-only because their upstream geometry
is point-like. A Housing Market Area is not a District Council district. The source
supplies no district-parent field; inferred ancestry requires a separate assembly rule
and audit evidence (see the
[HMA hierarchy investigation](hma-hierarchy-investigation.md)). The source-release
fan-out publishes its HMA `division` snapshot before the companion `divisionArea`
snapshot; the latter validates against that exact HMA snapshot. For the source-release
Records by district map only, each HMA is spatially associated with every official exact
2021 C&SD district polygon with which it has a positive-area intersection. A
boundary-only touch does not count. Consequently, an HMA spanning a district boundary
increments each intersected district and the map total can exceed the number of HMA
records. The association does not alter HMA canonical division IDs and it does not emit
Geometry by District measurements: whole-HMA area or perimeter must never be attributed
to every district it crosses.

The source's `hma_eng` and `hma_chi` labels become the English and Traditional Chinese
HMA names. A missing Simplified Chinese name is created only by the reviewable
source-release fixture process described in the Divisions family document; it is marked
unverified until reviewed.

The generated HMA division rows include the shared Parquet hierarchy columns. Their
`class` is `housing-market-area`; `subtype` and `parent_division_id` are empty because
the source supplies no parent relationship. Their authoritative classification remains
the C&SD `canonical_type` of `housing-market-area`. The canonical `identifiers` object
contains only the publisher code, for example `{"CENSTATD:code":"HMA158"}`; the
geography type belongs to classification.

## Ingestion

The updater passes the locally prepared native CSDI ZIP to the district importer. It
requires the cohort-specific `DC_16BC_SDU.gml`, `DC_21C_SDU.gml`, or `DC_GHS.gml`
member. The `2026-Q2` `DC_GHS.gml` archive contains multiple publisher-labelled annual
cohorts; the importer filters and materialises each one independently. It verifies the
ZIP SHA-256 against its prepared manifest and keeps the managed archive key and hash in
source provenance. Converted CSDI GeoJSON and a separately downloaded GML are not
runtime inputs. Use `saanseoi update`, or invoke the importer with the prepared archive:

```bash
bun run dataops -- hkgov-censtatd:district-area ./data/.../source.zip \
  --target preview --dataset-code ds-hk-hkgov-censtatd-subdivided-units-district \
  --source-version 2021 --release-notes-url URL \
  --source-archive-key by-source/.../source.zip --source-archive-sha256 SHA256
```

Each C&SD upload materialises its `simplified` display transform from the same verified
source artefact, then publishes the exact and display snapshots together under the one
source release. The transform has no separate upload or release-notes URL; the source
release records the CSDI dataset URL instead.

The release Geometry statistics are calculated only from the exact canonical source
snapshot. Besides feature and Polygon/MultiPolygon-part counts, they record area,
boundary length, and non-zero boundary-segment count for every district. Segment count
describes the source geometry's complexity, not its accuracy, and is never recalculated
from or overwritten by the `simplified` display derivative.

Each C&SD reference-year cohort is a required Overture division-release input. The
selected source snapshots are carried forward at or before the Overture cohort, so their
stable source schema is always included in the release's API-field provenance. They are
independently selectable source variants with separate snapshot lineages; publishing the
2024 cohort never supersedes the 2016 or 2021 release or snapshot. Release churn is
measured only against the declared parent snapshot, so each initial cohort has an empty
baseline: its 18 district areas are additions, not removals from another cohort.

## Statistics reset dependencies

`reset:stats` retracts C&SD geometry contributed by Statistics datasets and dependent
geographic snapshots, including parent-derived and lookup-dependent geometry. Affected
Divisions API release sets and catalogue revisions are included in the confirmation
plan. Independent source releases, assertions and snapshots remain available.

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

## Artefact destination

Fresh local initialisation supports `--target local --r2 production`: immutable source
and provenance objects are retained in production R2, with registrations kept in local
D1. Follow the
[storage-target workflow](../../d1-bootstrap.md#ingest-locally-with-production-r2) when
selecting or continuing this mode.

## Published Division search

Housing Market Area Division search selects the latest published default in
`hkgov-censtatd-hma`. It indexes names, aliases and curated codes and participates in
the shared deferred, incremental search finalisation. District geometry variants do not
create duplicate search documents. See
[Division text search](../../families/divisions.md#text-search).

## Publication readiness

C&SD current area geometry uses one stable lineage/cohort scope for each provider
variant. A revision preserves unchanged geometry rows and timestamps and writes only
changed content or membership; a distinct cohort retains its own materialisation. The
local compiler transmits only final content differences. HMA and other canonical
Division outputs use their own lineage scopes.

Exact Division dependencies resolve through completed receipts or immutable history;
preparation does not restore older Division rows into serving current storage. Each
geometry write batch checks its sealed scope token. Complete validation records
preparation, and publication grants readiness, including for empty scopes. Pinned older
geometry revisions replay from immutable history once a ready replacement owns the
scope. See the [publication-state contract](../../publication-state-plan.md).

Identical-geometry reuse requires a completed receipt for the candidate snapshot as well
as matching canonical values. A completed local mirror remains eligible while
publication is deferred; an interrupted delivery cannot become a reuse baseline.

Area and HMA candidate preparation uses the shared final-difference compiler. A
contribution merges its supplied geometry into the exact cohort scope; it does not
remove independent cohorts or inherited companion members. Canonical equality can reuse
a complete snapshot while retaining the new publisher assertion separately.

Canonical areas and constructed statistical divisions use stable `ss-` UUIDs. Area
identifiers retain `CENSTATD:dcClass` and `CENSTATD:dcCode`; regional lookup codes are
explicit identifiers rather than part of the canonical ID.

## Local district comparison

The division editor exposes retained `Density_2024` district extents and detailed
`DC_21C_SDU` census boundaries as separate, unsimplified review candidates for all 18
districts. Source checksums, publisher district codes and layer editions are retained;
projection uses the existing EPSG:2326 GML adapter. The density file's `2021.0.gml`
filename is not its layer edition: its records identify 2024. The detailed census
polygons have substantially more coastline vertices, which does not establish greater
administrative currency. See the
[government district comparison](../hkgov-had/divisionArea.md#local-district-comparison).

## Processing policy ownership

Ingestion retains publisher properties and source geometry. Area snapshot recipes
capture geometry processing and any required district identity bridge. Statistic
field/measure processing belongs to the Statistic recipe rather than the Area policy.

The [processing policy contract](../../pipeline.md#define-audit-processing-rules)
separates captured ingestion and snapshot assembly definitions.

## Field lineage

The HMA lineage fixture traces HMA_21C native polygons and publisher names into Division
and DivisionArea resources. Government Area flags are both true, so the canonical
geometry type is mixed. Building Group centroids do not create DivisionArea members.

## C&SD publisher feature storage

C&SD statistics and geography intake retain release-owned rows in
`hkgovCenstatdStatistics`, with native identities, complete properties and acquisition
locators. `geometryId` references shared Brotli-compressed native geometry in
`hkgovCenstatdGeometry`. Canonical statistics and DivisionAreas are separate projections
of that evidence.

Geometry reuse compares canonical materialisations within the same cohort, region and
variant. Simplified derivatives identify shared geometry and the complete transform
context.

Local geometry conversion follows the table declarations in its generated SOURCE
migration. Its receipt remains authoritative across subsequent table renames. Conversion
retains every release assertion, shared native geometry and derivative output; missing
publisher references abort the transaction.

## Source record ID composition

Each C&SD dataset fixture declares its source record identity. Native feature attributes
are tried in order: `gml:id`, `id`, then `fid` (exposed to the composer as `gmlId`, `id`
and `fid`). A missing feature ID uses the one-based GML member ordinal. Repeated native
IDs receive `:<memberOrdinal>` on every colliding member; unambiguous IDs retain their
publisher value. The importer rejects any remaining collision.

Single-layer datasets use only the feature ID. The Housing Market Areas and Building
Groups dataset uses `<layerName>:<featureId>` because it retains two layers. Components
of composite IDs are percent-encoded independently before joining with `:`. No publisher
prefix is added. Acquisition locators retain the layer even where it is absent from the
ID. IDs with ordinal qualification are local to the delivery and cannot establish
cross-release continuity.

Derivatives reference shared `geometryId` values and a transform-context hash. The
context retains method, settings, engine version and coverage geometry IDs. Statistics
provenance uses `hkgov-censtatd/<datasetCode>/<sourceVersion>/<sourceRecordId>`. Source
samples select exact dataset and resource-release rows, then join shared geometry;
statistics and geometry resource children retain independent properties and locators.

## Canonical source attribution

Canonical geometry attribution requires the selected registered dataset code and native
source record IDs. A dataset code must be supplied by ingestion; the publisher name
alone cannot identify which C&SD dataset contributed the geometry.

## Housing market area cartography

Housing market area Division ingestion assigns `minZoom: 13`, `maxZoom: 18` and
`prominence: 60`. This neighbourhood-scale label policy does not assign a hierarchy
level: `housing-market-area` retains its null level. Values participate in canonical
content hashes and persist in CURRENT and HISTORY. The source audit shows the same
policy table used by ingestion in `libs/db/src/divisionCartography.ts`. Publisher
properties and native geometry remain SOURCE evidence.

### Published geographic crosswalks

Native polygon cohorts are paired with each published SaanSeoi geographic edition by
`saanseoi divisions:crosswalk`, which also runs at the end of `init:divisions`. The
crosswalk retains exact source/area snapshot pins, geometry hashes, overlap in square
metres, whole-source-area fraction and containment. It excludes boundary-only contacts
and numerical slivers, independently of the administrative hierarchy's 5% covered-area
selection rule. Missing source polygons block generation. Geographic identities without
polygons are reported and omitted from spatial membership.

Consumers can inspect the measurements through `GET /divisions/v0.2/crosswalk` with
explicit `sourceReleaseSet` and `geographicReleaseSet`, optionally narrowing by
`divisionId` or `geographicDivisionId`. Native-domain collection requests also support
geographic code filters through the same release-pinned memberships.

Canonical HISTORY events follow the shared
[producer ownership contract](../../families/source-evidence.md#history-producer-ownership).
The introducing snapshot retains its exact producing inputs; source attribution and
field-level evidence identify the contributing publisher records.

Combined C&SD geometry snapshots retain `producerDatasetCode` on HISTORY content events
to distinguish producing datasets. A snapshot cannot select competing releases of the
same dataset and resource type.
