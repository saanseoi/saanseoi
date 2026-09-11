# Planning Department TPU and subunit areas

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

Local retained inventories can backfill aggregate churn with
`apps/harbour-cli/scripts/backfillPlanningChurn.ts META.sqlite HISTORY.sqlite`. The
script validates complete inventories and defaults to a dry run; `--apply` replaces only
aggregate churn statistics in one transaction.

The processor registers `planning-division-normalisation.json` from
`fixtures/meta/processing-rules/`. Its frozen declaration is shared with the retained
processing audit; selected reviewed fixtures remain separate inputs.

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

Remote geometry replay includes version-qualified history closures referenced by the
snapshot change journal, without retransmitting historical geometry.

SQL generation uses the release-scoped planning mirror.
[Sealed delivery phases](../../sql-delivery.md) retain the generated payloads and replay
confirmed imports into the shared mirror before publication. Recovery targets that
shared mirror, not the disposable planning clone.

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
provider codes are retained in `identifiers` as `PLAND:PPU`, `PLAND:SPU`, `PLAND:TPU`,
and `PLAND:SUBUNIT`. Canonical IDs are deterministic UUIDv5 values derived from the
provider-scoped Planning Department identity and never reuse an Overture GERS ID.

The public `/v0.1/identityBridge` lookup derives mappings from the selected release
records. Namespaces are `PLAND:PPU`, `PLAND:SPU`, `PLAND:TPU` and `PLAND:SUBUNIT`;
subunit values use `<TPU>-<subunit>`. Only the record's own planning level contributes
an identity: inherited parent codes are excluded. The lookup does not require a
checked-in inventory of deterministic UUID mappings.

PPU, SPU and TPU areas are deterministic unions of their child cells. The raw cell
feature properties and original geometry remain in `hkgovPlandPlanningCells`; canonical
division IDs, hierarchy, aggregate geometry and canonical relationship rows do not enter
the source schema.

Planning-level codes and New Town labels remain only in `properties`; source tables
retain feature identity, release history, provenance and native geometry. Explicit
geometry-repair evidence is keyed to the source version independently of canonical
division fields.

## Geometry policy

Only Polygon and MultiPolygon source geometry is accepted. The input artefacts have no
material same-TPU overlap. Six known source cells have ring self-intersections: two in
2006, one in 2011, one in 2016, and two in 2021. The approved adapter policy stores the
original source geometry unchanged and uses a `buffer(0)` topology repair solely for
canonical geometry and child-area unions. Each repaired record is identified in
`repairedSourceFeatureIds` and `wasGeometryRepaired`; all other invalid geometry is
rejected. The source row retains a `repairedGeometry` only when it is the approved
`buffer(0)` transform of that row's exact publisher geometry version.

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
stats; the per-record JSON evidence is available through
`saanseoi reports:processing-actions --source hkgov-pland --resource-type division`.

The TPU/subunit source has no published names—only hierarchy codes. The adapter exposes
those codes in canonical `identifiers` and does not manufacture labels for TPU/subunit
canonical divisions.

The division import's reviewable locale-completion process does not translate these
codes: without a publisher name, there is no source text from which to create an API
name fixture.

## New Town boundaries

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
stable feature code. The adapter derives a normalised English-name identifier within
each cohort and creates a deterministic UUIDv5 canonical division from that cohort-
scoped Planning Department identity. A 2006, 2011, 2016, or 2021 New Town therefore
coexists with (and neither replaces nor is a geometry variant of) an Overture geographic
town. Renames and splits are intentionally separate cohort records, so no cross- cohort
or Overture bridge is inferred. This makes the geometry selectable as
`areas:hkgov-pland-new-town` for the corresponding planning division release.

For the 2021 cohort, the curated Planning-domain `divisionCode` is a URL-safe,
human-readable rendering of the publisher name, such as `tsuen-wan-tsing-yi-area`. It is
a SaanSeoi code for addressing the canonical Planning division, not a Planning
Department source identifier; C&SD's numeric New Town keys remain in their separately
reviewed identifier bridge.

New Town lookup identifiers are the importer's normalised English publisher names, not
publisher-issued codes or curated public Division codes. The selected API release set
determines the cohort and canonical UUIDs. Reviewed C&SD numeric New Town mappings
remain ingestion curations.

The trilingual publisher labels are retained verbatim on the native `hkgovPlandNewTowns`
source row as `nameEn`, `nameZhHant`, and `nameZhHans`, then normalised into the
associated canonical planning division's `divisionI18n` rows. No source-level locale
rows are created.

The downloaded New Town artefacts contain known invalid rings: Tseung Kwan O in 2006,
2011 and 2016; Tuen Mun and Tai Po in 2006; and Tung Chung in 2021. The reviewed
`buffer(0)` policy repairs only those invalid topology cases for canonical geometry. The
source layer includes the publisher feature and original geometry unchanged, records
`wasGeometryRepaired`, and stores a row-keyed `repairedGeometry` transform separately.
The CLI can also export a separately labelled `-repaired.geojson` diagnostic copy
without altering the publisher file.

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
