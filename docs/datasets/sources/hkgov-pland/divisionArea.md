# Planning Department TPU and subunit areas

Canonical geometry has no `identifiers` field. Entity identifiers belong to `divisions`;
publisher feature IDs and native codes remain in retained source records and lineage.

Prepared-artefact cache contract `5` requires the complete PPU → SPU → TPU ancestry
prefix for each child. Cached immediate-parent-only paths must be regenerated from the
retained native archive before ingestion.

Planning assembly converts native `PLAND:*` identifiers to grouped `hkgov-pland` codes
before ancestor validation and canonical content hashing. Source evidence retains the
native archive representation. Each cohort replaces current Division and localisation
membership within its publication scope. Independent cohorts use that current membership
to remove omitted identities; their parentless HISTORY checkpoints retain their complete
historical membership.

Retained source assertions use
[distinct validity periods for recurring content](../../families/source-evidence.md#recurring-source-validity-periods).
An unchanged open occurrence continues; returning content starts a new occurrence.

Canonical Division identities use representative Points. Canonicalisation preserves a
valid source point or derives an interior point from polygonal source geometry using JTS
`InteriorPoint`. The `division-representative-point` audit guard verifies point validity
and strict containment where canonical area evidence is available. Source polygons and
separate DivisionArea geometries retain their full extent. See the
[Division point contract](../../families/divisions.md#representative-points-and-separate-areas)
for null handling and area selection.

Planning Cell and New Town assertions omit `sourceLocator`: neither has a row-specific
acquisition coordinate. The `TPUSU` layer is shared by all Planning Cells and belongs to
release-level source evidence.

Canonical Division and geometry references follow the
[source evidence contract](../../families/source-evidence.md). Planning classification
is read from canonical fields rather than duplicated source metadata.

Record-content hashes exclude observation timestamps and publisher version labels,
including nested attribution metadata. Effective dates, statistical periods and content
dependency hashes remain significant. Retained source payloads preserve the original
metadata. File checksums and processing-cache identities retain their complete inputs.

Planning Cell and New Town source validity stores the source version in
`validFromRelease` and `validToRelease`, for example `2001` and `2006`. Native source
inserts and closures use the selected release's `sourceVersion`; full dataset release
codes remain in release metadata.

Shared native source SQL preserves unchanged open versions and closes only omitted or
superseded assertions. Multiple incoming assertions for one publisher ID are compared
together before any version is closed.

[Minimal initialisation](../../minimal-initialisation.md) selects PU 2001/2006 and New
Town 2006/2011, retaining both Division and Division Area resources per version.

Planning Unit and New Town API release statistics use the shared
[division API backfill](../../families/divisions.md#api-release-statistics), including
historical cohorts. API churn compares canonical identities across cohorts even when
each cohort has an independent snapshot root. New Town cohort-specific IDs therefore
count as removals and additions; names are not used to merge identities.

Division release churn compares canonical IDs and division attributes with the preceding
Planning inventory. Source feature counts count importer input cells; division totals
exclude geometry and release provenance from their churn comparison. Geometry churn
belongs to the companion Areas release. Unit Distribution counts each planning level.
Division totals include the primary, secondary, tertiary and subunit hierarchy. Geometry
repair counts count affected output divisions and appear under Quality Checks.

The processor registers `planning-division-normalisation.json` from
`fixtures/meta/processing-rules/assembly/`. Its frozen declaration is shared with the
retained processing audit; selected reviewed fixtures remain separate inputs.

Division geometry source storage uses `null` when no provenance references are supplied;
it does not generate a self-reference from the source-record ID. Supplied publisher and
ingestion references are retained.

PLAND metadata delivery includes assembly recipes, input rules and selected-release runs
under the
[assembly provenance contract](../../pipeline.md#snapshot-assembly-provenance).

Processing audits retain the registered Planning normalisation declaration, counts and
source repair counters in R2. Coverage, identity and hierarchy guards expose their
outcomes and block ingestion on failure. D1 registers the manifest and attempt status;
the release Audit view reads the [audit](../../processing-provenance.md).

Local SQL artefact imports use native delivery receipts with named current, history,
source and metadata bindings. The release can resume retained payloads after
interruption; publication follows successful local delivery and releases database
ownership.

Planning Division delivery validates canonical and localisation counts before completing
its publication receipt. The Area companion completes its separate receipt after
geometry delivery. Native planning retains each ownership check beside the mutations it
guards; publication alone grants permission to serve either snapshot.

Planning Unit and New Town source SQL derives its columns from the source schema.
Publisher codes and names remain in `properties`; delivery preserves the complete source
geometry and does not synthesise redundant source columns. Planning canonical and
simplified geometry is stored as Brotli JSON so large cells remain within D1 row limits;
decompression restores the same geometry value.

Planning Division normalisation, comparison and materialisation run inside delivery-plan
preparation. Retained local and remote plans skip those stages and reuse sealed payloads
and completion counts. Local preparation uses disposable WAL-safe database copies;
remote preparation uses its isolated release mirror. Completion is reported after
delivery, before publication. Retained-plan ownership is checked in the shared target
mirror even when preparation uses a per-release cache; exact-owner continuation
preserves processing metadata.

Local geometry materialisation uses WAL-safe SQLite planning copies to retain exact
mutations and churn outputs. Native receipts protect interrupted replay; the existing
geometry writer supplies the SQL and runs only when preparing a new plan.

Planning Area history retains immutable record/snapshot events. Snapshot events define
membership from the selected parent's replay state, including its recorded annual
shards; a root cohort starts with empty membership. Exact and simplified variants and
other providers retain their versions independently. Remote replay inserts content by
exact event keys without closing or rewriting existing geometry or its provenance. The
stored history `isCurrent` field does not define Area membership. Current projection
receipts and publication checks apply independently to every selected scope.

SQL generation uses the release-scoped planning mirror.
[Sealed delivery phases](../../sql-delivery.md) retain the generated payloads and replay
confirmed imports into the shared mirror before publication. Recovery targets that
shared mirror, not the disposable planning clone.

Ordinary geometry metadata upserts leave identical rows untouched, including release
assignments, processing actions and statistics shared by exact and simplified phases.
Changed lifecycle, provenance and statistics fields still apply in statement order; see
[SQL delivery](../../sql-delivery.md) for the oversized-row exception.

This profile records the Planning Department source-specific adapter. The source-neutral
geometry contract remains in
[`spec/divisions-geometry.md`](../../../../spec/divisions-geometry.md).

## Catalogue and artefacts

The CSDI Archived Dataset catalogue publishes native publisher packages for the
following polygonal layers. The updater mirrors every available archive slot and its
manifest; it does not use CSDI's converted GeoJSON file API. The source CRS is retained
once in dataset metadata before accepted geometry is normalised into the API canonical
CRS.

| Cohort | Catalogue code                                                                                                           | Layer          | Source cells | TPU values |
| ------ | ------------------------------------------------------------------------------------------------------------------------ | -------------- | -----------: | ---------: |
| 2001   | [`pland_rcd_1636535158118_80594`](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1636535158118_80594) | `TPUSBVC_2001` |        4,636 |        282 |
| 2006   | [`pland_rcd_1636535383021_30595`](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1636535383021_30595) | `TPUSBVC_2006` |        4,800 |        287 |
| 2011   | [`pland_rcd_1634025118087_40967`](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1634025118087_40967) | `TPUSBVC_2011` |        4,815 |        289 |
| 2016   | [`pland_rcd_1634281887222_15002`](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1634281887222_15002) | `TPUSBVC_2016` |        4,863 |        291 |
| 2021   | [`pland_rcd_1634022783366_65050`](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1634022783366_65050) | `TPUSU_2021`   |        4,916 |        292 |

The publisher is the Planning Department (`hkgov-pland`), not the CSDI host. The source
licence is the Hong Kong Government open-data licence. `sourceSchemaVersion` is our
observed artefact-shape profile, not an upstream CSDI version: `1.0` covers the
2001–2016 `PPU`/`SPU`/`TPU`/`SB_VC` columns, while `2.0` covers the 2021 replacement of
`SB_VC` with `Subunit`. Releases use provider variant `hkgov-pland-pu` and source
release codes `dr-hk-hkgov-pland-division-pu-{year}` and
`dr-hk-hkgov-pland-division-area-pu-{year}`. The source dataset is
`ds-hk-hkgov-pland-division-pu`; it declares both `division` and `divisionArea` resource
types, which are materialised as separate resource releases from the same upstream
layer.

The backfill reads the mirrored publisher SHP ZIP directly with its `.dbf` and `.prj`
members; converted CSDI GeoJSON is not a runtime input. The original historical TPU
packages contain repeated planning-cell keys (and the 2001 package contains one all-zero
sentinel); later CSDI repackages omit those rows. The adapter accepts either observed
package shape, rejects incomplete keys, discards the original sentinel, and retains
repeated cells for canonical union. Feature-key coverage is regression-tested against
the checked-in historical GeoJSON baseline before either the division or area release is
published.

The backfill validates finite coordinates, ring closure, non-zero area, and ring
self-intersections before materialising a geometry release. The self-intersection check
uses a spatial candidate index, so the detailed Planning Department polygons do not
require an all-pairs segment comparison.

## Identity and hierarchy

Every source cell has one PPU, SPU, TPU and subunit code. It becomes a planning
division, with PPU → SPU → TPU → subunit hierarchy edges carrying domain `planning`. The
provider codes are retained in `identifiers` as `hkgov-pland.ppu`, `hkgov-pland.spu`,
`hkgov-pland.tpu`, and `hkgov-pland.subunit`. Canonical IDs are deterministic UUIDv5
values derived from the provider-scoped Planning Department identity and never reuse an
Overture GERS ID.

Planning Cell source record keys use `PLAND:<TPU>:<subunit>:<row ordinal>`, for example
`PLAND:111:10:4385`. The TPU code already includes the PPU and SPU prefixes; all four
publisher codes remain in `properties`. The one-based delivery row ordinal distinguishes
repeated cell assertions. Prepared cell-group references use `PLAND:<TPU>:<subunit>`.

The public `/v0.1/identityBridge` lookup derives mappings from the selected release
records. Namespaces are `hkgov-pland.ppu`, `hkgov-pland.spu`, `hkgov-pland.tpu` and
`hkgov-pland.subunit`; subunit values use `<TPU>-<subunit>`. Only the record's own
planning level contributes an identity: inherited parent codes are excluded. The lookup
does not require a checked-in inventory of deterministic UUID mappings.

PPU, SPU and TPU areas are deterministic unions of their child cells. The raw cell
feature properties and original geometry remain in `hkgovPlandPlanningCells`; canonical
division IDs, hierarchy, aggregate geometry and canonical relationship rows do not enter
the source schema.

Planning-level codes and New Town labels remain only in `properties`; source tables
retain feature identity, release history, provenance and native geometry. Explicit
geometry-repair evidence is keyed to the source version independently of canonical
division fields and retained in release processing actions.

## Geometry policy

Planning Unit preparation derives and validates an interior Point for each Division
before writing its Parquet archive. The Division archive's `geometry` and `bbox`
describe that Point. DivisionArea archives retain the corresponding polygons and polygon
bounds. Native cell properties and original publisher geometries are carried once in the
Division hand-off for source-table ingestion. DivisionArea archives retain
`source_cell_ids` for attribution and do not duplicate `source_properties`.

Only Polygon and MultiPolygon source geometry is accepted. The input artefacts have no
material same-TPU overlap. Six known source cells have ring self-intersections: two in
2006, one in 2011, one in 2016, and two in 2021. The approved adapter policy stores the
original source geometry unchanged and uses a `buffer(0)` topology repair solely for
canonical geometry and child-area unions. Each repaired record is identified in the
prepared `repairedSourceFeatureIds` and `wasGeometryRepaired` evidence, then retained in
release processing actions with its source key and canonical division. All other invalid
geometry is rejected. The source table stores only original publisher geometry;
canonical `geometry` stores the accepted repair or aggregate. Repair flags and repaired
geometry copies are not source columns.

The aggregate union step also removes zero-area interior rings. These can be emitted by
otherwise valid unions, but are not valid canonical area geometry; source-cell geometry
and non-degenerate rings remain unchanged.

Canonical Planning Unit area geometry is stored with maximum-quality Brotli compression
in the current and history tables, then decompressed before API responses. This keeps
detailed 2001 unions within D1's row and SQL-statement limits without changing their
geometry.

The native 2021 TPU archive repeats 49 provider cell keys across 172 extra geometry
fragments and also has coincident boundaries between some adjacent cells. JSTS pairwise
overlay cannot node that topology, so the adapter canonicalises every 2021 aggregate
geometry collection with `buffer(0)`. The transform is limited to canonical geometry—
every publisher source cell remains unchanged in source evidence.

The shared 10-metre display derivative uses Shapely 2.1's GEOS-backed coverage
simplifier across the completed Planning areas. Its helper accepts and emits WGS84
GeoJSON, using a temporary local metre plane only to apply the tolerance. It validates
each output Polygon or MultiPolygon and records its engine version and any temporary
`make_valid` input repair in derivation metadata. This never alters exact canonical
geometry or publisher evidence.

The completed WGS84 coverage is cached under `.local/dataops/simplified-coverage` by its
content, tolerance and simplification-contract version, so re-uploading unchanged
Planning geometry reuses the simplified GeoJSON rather than running GEOS again.

Each approved geometry repair is also recorded as a release processing action with the
canonical division and source-cell reference. Aggregate repair counts remain in release
stats; the per-record JSON evidence is available through the release Audit view.

The TPU/subunit source has no published names—only hierarchy codes. The adapter exposes
those codes in canonical `identifiers` and does not manufacture labels for TPU/subunit
canonical divisions.

The division import's reviewable locale-completion process does not translate these
codes: without a publisher name, there is no source text from which to create an API
name fixture.

## New Town boundaries

New Town canonical Divisions receive inferred administrative ancestry limited to
`HKSAR → Area → District`. Each district intersecting at least 5% of the New Town's area
inside the district union contributes a separate path. Selection uses unrounded
EPSG:2326 area measurements and excludes uncovered territory from its denominator. It
uses the prepared polygon, including its declared canonical geometry repairs, rather
than the Division's label point. Boundary contact alone contributes no polygon area.

`native-division-administrative-hierarchy.json` pins canonical ancestor identities and
territorial source geometry. Area geometry is the union of its district territories. The
assembly audit retains the inference policy, input pins, geometry hashes, selected and
rejected overlaps, uncovered area and strict containment. `apiField` provenance explains
this spatial fill separately from the publisher's empty native Planning hierarchy.
Inference occurs before canonical content hashing; native source properties and
attribution remain the Planning Department's. The 2021 local geometry check matches all
13 records, with two receiving multiple district paths.

Curated New Town Division codes use `SCREAMING_SNAKE_CASE`, such as `TSEUNG_KWAN_O` and
`TSUEN_WAN_KWAI_CHUNG_AREA`. These public codes are assigned through the metadata
registry independently of the source name identifiers and canonical UUIDs.

New Towns are a separate Planning Department planning-domain resource and provider
variant, not geographic/Overture divisions. They use source profile authority
`hkgov-pland-new-town`, while retaining the Planning Department as publisher. Their
native CSDI archive package is retained alongside its CRS and package manifest. Its
source dataset is `ds-hk-hkgov-pland-division-new-town`, which declares both `division`
and `divisionArea` resource types. The shared source release is processed into one
resource release for each type.

| Cohort | Catalogue code                                                                                                           | Layer          | Features |
| ------ | ------------------------------------------------------------------------------------------------------------------------ | -------------- | -------: |
| 2006   | [`pland_rcd_1636535014241_1352`](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1636535014241_1352)   | `NewTown_2006` |       12 |
| 2011   | [`pland_rcd_1634024777903_55269`](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1634024777903_55269) | `NewTown_2011` |       12 |
| 2016   | [`pland_rcd_1634281414408_50485`](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1634281414408_50485) | `NewTown_2016` |       12 |
| 2021   | [`pland_rcd_1634023103904_16865`](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1634023103904_16865) | `NewTown_2021` |       13 |

The layers publish only English, Traditional Chinese and Simplified Chinese names—no
stable feature code. The adapter derives lowercase English-name slugs for
`hkgovPlandNewTowns.sourceRecordId` and `hkgov-pland.newTownId` lookup identifiers.
Spaces, slashes and punctuation collapse to single hyphens, with no leading or trailing
hyphens: `Fanling/Sheung Shui` becomes `fanling-sheung-shui` and
`Sha Tin - Ma On Shan area` becomes `sha-tin-ma-on-shan-area`. Empty slugs and duplicate
slugs within a cohort are rejected. The prepared division and area artefacts use the
same slug in their `newtown_id` and source references.

Canonical UUIDv5 values derive independently from the cohort and normalised English
publisher name: lowercase, trimmed, repeated whitespace collapsed to one space, and
spaces around hyphens removed. A 2006, 2011, 2016, or 2021 New Town therefore coexists
with (and neither replaces nor is a geometry variant of) an Overture geographic town.
Renames and splits are intentionally separate cohort records, so no cross- cohort or
Overture bridge is inferred. This makes the geometry selectable as
`areas:hkgov-pland-new-town` for the corresponding planning division release.

For the 2021 cohort, the curated Planning-domain `divisionCode` is a URL-safe,
human-readable rendering of the publisher name, such as `TSUEN_WAN_TSING_YI_AREA`. It is
a SaanSeoi code for addressing the canonical Planning division, not a Planning
Department source identifier; C&SD's numeric New Town keys remain in their separately
reviewed identifier bridge.

New Town lookup identifiers are the importer's English-name slugs, not publisher-issued
codes or curated public Division codes. The selected API release set determines the
cohort and canonical UUIDs. Reviewed C&SD numeric New Town mappings remain ingestion
curations.

The trilingual publisher labels are retained verbatim in the native `hkgovPlandNewTowns`
source row's `properties.NewTown_en`, `properties.NewTown_Tc`, and
`properties.NewTown_Sc`, then normalised into the associated canonical planning
division's `divisionI18n` rows. No source-level locale rows are created.

The downloaded New Town artefacts contain known invalid rings: Tseung Kwan O in 2006,
2011 and 2016; Tuen Mun and Tai Po in 2006; and Tung Chung in 2021. The reviewed
`buffer(0)` policy repairs only those invalid topology cases for canonical geometry. The
source layer includes the publisher feature and original geometry unchanged, records the
repair in source-keyed release processing actions, and stores the repaired result in
canonical `geometry`. The CLI can also export a separately labelled `-repaired.geojson`
diagnostic copy without altering the publisher file.

The native SHP decoder adds an embedded GeoJSON `bbox` by projecting the source extent's
corners. That extent can exclude vertices of the projected polygon. Canonical area
geometry omits the embedded `bbox` and stores the extent calculated from every WGS84
coordinate in the separate `bbox` column. Native source geometry retains the decoder's
metadata unchanged.

Its `sourceSchemaVersion` `1.0` is likewise an observed artefact profile for the stable
`NewTown_en`, `NewTown_Tc`, and `NewTown_Sc` fields, rather than a version declared by
the catalogue.

## Backfill commands

The CLI owns the checked-in cohort list, mirrored native archive paths and catalogue
provenance URLs. It prepares each local SHP ZIP artefact as a verified local cache
entry, uploads the canonical division release first, then its exact-cohort area variant.
The cache is outside source and release state at `.local/dataops/prepared-artefacts`;
its key includes the source ZIP SHA-256, source cohort, resource type and
native-preparation contract. A sidecar manifest verifies the generated Parquet digest
before it is reused, so retries do not repeat source geometry reconstruction. Snapshot
cleanup is deferred for the interim division upload, so its canonical IDs remain
materialised for the companion area validation; normal cleanup resumes when the area
release is published.

Backfill reconciles its deferred division release sets after all selected cohorts have
been delivered. Reconciliation then schedules cleanup for archived cohorts: completed
`publishing` receipts and their obsolete current geometry are removed together. The
selected cohort remains ready, and archived cohorts retain their immutable history.

The TPU artefacts use GeoParquet WKB geometry. Their optional Parquet column statistics
are disabled because the local upload inspector cannot read the GeoParquet statistics
metadata emitted by the current writer; this does not alter the geometry or records.
Exact canonical Planning geometry is Brotli-materialised once and reused by the current
and immutable history writes. This preserves the same decoded geometry and version hash
while avoiding a second maximum-quality compression pass.

```sh
bun run dataops -- hkgov-pland:backfill --kind pu --target preview
bun run dataops -- hkgov-pland:backfill --kind new-town --target preview
bun run dataops -- hkgov-pland:ingest --kind pu <mirrored-source.zip> --target preview --source-version 2021 --release-notes-url https://portal.csdi.gov.hk/geoportal/ --source-archive-key by-source/.../source.zip --source-archive-sha256 SHA256
```

`backfill` accepts no data-path, source-version or confirmation options; use `local`,
`preview`, or `production` as the target. `ingest` is the updater hand-off: it accepts
only the source ZIP that was just mirrored, requires its managed archive key and
SHA-256, validates the local ZIP against that digest, records both provenance values,
and publishes its division before the companion area.

## Publication lineage

Planning Unit and New Town data publish as independent division domains. Historical
cohorts do not require a matching Overture release. Planning Units use persistent
identity; New Town identity is cohort-scoped. Enriching an already published historical
cohort creates the next immutable domain-release revision and a new catalogue
checkpoint.

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

## Registry metadata

New Town and Planning Unit dataset metadata declares the registered geography identity
bridge and planning division normalisation. Releases retain the resolved policy at
creation. Source geometry uses EPSG:4326.

## Retained fields and provenance

Retained Planning properties use camelCase names without changing source values.
Provenance cites original planning-cell codes or New Town name fields and records
normalisation, geometry processing and canonical identity derivation. Prepared fields
such as `planning_level`, `i18n` and `hierarchy` are intermediate inputs, not publisher
properties. New Town localisations cover English, Traditional and Simplified Chinese.

Source storage and public records use `properties` for retained attributes. API-field
inputs reference this path through the shared dataset-scoped `publisherFields` mapping.
Processing-rule definitions remain in their registered fixtures and are pinned by the
selected release.

Retained locale-bearing labels use `En`, `ZhHant` and `ZhHans` suffixes, for example
`buildingNameEn` and `dcZhHant`. Publisher mappings place these labels after other
properties. Original publisher paths and language dictionary identifiers retain their
spelling; demographic measures about language are not locale-bearing labels.

Planning Unit releases select `rs-division-hkgov-pland-pu-merge-v1`; New Town releases
select `rs-division-hkgov-pland-new-town-merge-v1`. Both rulesets reference the shared
geography identity, Planning normalisation and area geometry processing definitions.

## Published Division search

Planning Unit and New Town Division search selects the latest published default within
each domain. Names, aliases and curated codes are searchable alongside geographic
divisions, or independently with a domain filter. Division publication participates in
the shared deferred, incremental search finalisation; area geometry is not indexed. See
[Division text search](../../families/divisions.md#text-search).

## Publication readiness

Planning Unit and New Town canonical Division rows use their registered lineage scopes;
area geometry uses lineage/cohort scopes. Current rows and localisations retain their
physical keys when the logical snapshot advances. The local compiler transmits only
changed content, and complete replacement membership removes absent components within
the owned scope.

Preparation resolves exact Division dependencies through completed receipts or immutable
history; it does not restore old Division versions into serving current tables. Each
write batch checks the sealed scope token. Complete delivery, including an empty result,
records preparation; publication then grants readiness. See the
[publication-state contract](../../publication-state-plan.md).

Planning Division delivery prepares the complete replacement on isolated local
candidates. The shared compiler sends only final keyed changes to current, history and
source tables. The stable lineage retains unchanged base records and translations;
removed members retire within that lineage. Publication claims and completion remain
separate from the content difference.

Canonical base and individual locale history versions inherit independently. Identical
definitions reuse their owning history shard and original provenance even when an input
hash also contains another component or a publication version. Real component changes
close only the previous owning version. Repeated source interpretations inherit through
snapshot ancestry, and explicit omissions override that inheritance.

Planning divisions and areas use stable `ss-` UUIDs. Subunit ancestry includes PPU, SPU
and TPU; canonical identifiers use the `hkgov-pland` publisher object and preserve
native code values.

Preparation requires the complete PPU → SPU → TPU ancestor path for each subunit, PPU →
SPU for each TPU, and PPU for each SPU. Ancestor identifiers must match the child's
publisher codes. Incomplete prepared artefacts fail with a request to prepare the
release again.

## Division name completion

Division name completion targets English and Traditional Chinese. Publisher Simplified
Chinese names may be retained, but missing Simplified Chinese names are not generated. A
missing English name requires a source-release fixture entry with public source URLs in
`references` establishing the local spelling; Azure English translation is disabled. New
Town preparation permits an absent Simplified Chinese name.

## Geographic membership crosswalk

TPUs use a separate versioned many-to-many spatial crosswalk to SaanSeoi geographic
divisions. It preserves PPU/SPU ancestry. Intersections retain every material overlap
and record full containment, overlap square metres, source fraction, both geometry
fingerprints and exact source/geographic Division and DivisionArea snapshots. The
[shared filter contract](../../internal/geographic-code-filters.md#crosswalk-preparation)
documents preparation, tolerances and atomic delivery. A new geometry release requires a
new crosswalk selection. Boundary contact and sub-square-metre slivers do not imply
membership; overlap fractions are not population weights.

`saanseoi init:divisions` prepares and delivers the current-release crosswalk after
publishing the complete geographic and planning release sets. The standalone
`saanseoi divisions:crosswalk --target local|preview|production` command uses the same
path for backfills. Selection uses the published v0.2 catalogue and exact CURRENT
publication receipts. Polygon intersections and containment use geographic coordinates;
Hong Kong grid coordinates provide metric overlap areas. Preparation reports geographic
identities without polygons and requires every selected TPU to have a polygon.

## Processing policy ownership

Native ingestion retains Planning Department properties and native source geometry.
Planning Division normalisation and Area geometry processing are selected by their
respective snapshot recipes. Ingestion definitions do not claim canonical field writes.

The [processing policy contract](../../pipeline.md#define-audit-processing-rules)
separates captured ingestion and snapshot assembly definitions.

## Archive ownership

Publisher inputs use `releaseSourceArchive` assets owned by their source release.
Resource-specific source downloads use Parquet `resourceSourceArchive` assets owned by
their resource release. Both have independently downloadable manifests.

## Publication dates

Release fixtures retain verified CSDI publication days separately from reference
cohorts. The [publication-date evidence](../../source-publication-dates.md) records the
upstream field, verified dates and unresolved rolling compilations.

Planning Division source interpretations associate each retained publisher cell with
every primary, secondary, tertiary and subunit Division that lists that cell in its
prepared membership. The writer uses the complete inventory, including unchanged
Divisions, and retains explicit omissions for removed publisher assertions. Native New
Town assertions resolve their own canonical Division. Division identities remain Points;
companion DivisionAreas retain polygonal geometry.

## Source record identity declarations

Planning cell deliveries contain repeated TPU/subunit codes and no native feature ID.
The dataset fixture declares the one-based delivery feature ordinal as `sourceRecordId`,
with dataset-release scope and release-local stability. For example, feature 1040 has ID
`1040`; its TPU and subunit remain publisher properties used for grouping. A row ordinal
cannot establish continuity across deliveries.

New Town deliveries use a name-derived source key. Their fixture declares `NewTown_en`
with `name-slug` normalisation: lowercase ASCII letters and digits, non-alphanumeric
runs replaced with `-`, and leading/trailing hyphens removed. Empty or duplicate keys
block intake. These keys have release-local stability; canonical cohort-scoped Division
IDs remain independent.

Planning Unit area imports require a non-empty `source_cell_ids` array. Canonical
Divisions and areas retain contributing publisher record IDs as flat `sources`
attribution entries. Missing cell membership rejects the import.

## Canonical source attribution

Canonical Planning Division and Area attribution lists `hkgov-pland`, the registered
Planning dataset code and every contributing native cell or New Town record ID. It
excludes assembly pointers and publication identifiers.

### Snapshot event storage

Canonical HISTORY stores a changed component once, with its introducing `snapshotId`,
`operation`, content hash and payload in the same row. Unchanged components inherit the
selected parent. Deletions append identity-only tombstones, and ancestor rows remain
immutable. Reversions and independent branch changes have distinct introducing events.
Area deletion events have a null `variant`; live geometry upserts retain their PlanD
publisher variant. The read-only `historyEvents` view stores no additional membership
rows. Snapshot reads resolve ancestry before filtering and use the exact introducing
snapshot to fetch content. SOURCE release validity and interpretation evidence remain
separate.

## Division label cartography

Planning Division ingestion materialises label settings from `planning_level` before
content hashing. The tuple below is `(minZoom, maxZoom, prominence)`:

- New town: `(10, 15, 80)`.
- Primary planning unit (`ppu`): `(10, 15, 75)`.
- Secondary planning unit (`spu`): `(12, 16, 65)`.
- Tertiary planning unit (`tpu`): `(14, 18, 55)`.
- Subunit: `(16, 19, 40)`.

The ranges overlap while progressively finer units appear at closer zooms. These
settings belong to the Division point, independently of the companion Area geometry.
Native classes and levels remain intact. CURRENT, HISTORY and the source audit's
cartography table use the policy in `libs/db/src/divisionCartography.ts`.

## Canonical localisation metadata

Canonical locale rows store metadata in `meta`. See the shared
[localisation metadata contract](../../i18n-metadata.md) for field origins, locale
inference and verification. Source evidence remains separate from the canonical metadata
projection.

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

New Town backfill and fresh initialisation cover 2006, 2011, 2016 and 2021. Each cohort
passes through canonical hierarchy inference before hashing and is included in crosswalk
generation. The pinned administrative geometry is a common reference for spatial
comparison; it does not assert historical district boundaries.

Canonical HISTORY events follow the shared
[producer ownership contract](../../families/source-evidence.md#history-producer-ownership).
The introducing snapshot retains its exact producing inputs; source attribution and
field-level evidence identify the contributing publisher records.
