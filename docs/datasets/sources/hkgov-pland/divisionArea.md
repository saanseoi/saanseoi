# Planning Department TPU and subunit areas

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
members; converted CSDI GeoJSON is not a runtime input. Historical TPU packages contain
repeated planning-cell keys (and the 2001 package contains one all-zero sentinel). The
adapter rejects incomplete keys, discards only that sentinel, and retains repeated cells
for canonical union. Feature-key coverage is regression-tested against the checked-in
historical GeoJSON baseline before either the division or area release is published.

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

PPU, SPU and TPU areas are deterministic unions of their child cells. The raw cell
feature properties and original geometry remain in `hkgovPlandPlanningCells`; canonical
division IDs, hierarchy, aggregate geometry and canonical relationship rows do not enter
the source schema.

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

Each approved geometry repair is also recorded as a release processing action with the
canonical division and source-cell reference. Aggregate repair counts remain in release
stats; the per-record JSON evidence is available through
`saanseoi reports:processing-actions --source hkgov-pland --type division`.

The TPU/subunit source has no published names—only hierarchy codes. The adapter exposes
those codes in canonical `identifiers` and does not manufacture labels for TPU/subunit
canonical divisions.

## New Town boundaries

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
town. Renames and splits are intentionally separate cohort assertions, so no cross-
cohort or Overture bridge is inferred. This makes the geometry selectable as
`areas:hkgov-pland-new-town` for the corresponding planning division release.

For the 2021 cohort, the curated Planning-domain `divisionCode` is a URL-safe,
human-readable rendering of the publisher name, such as `tsuen-wan-tsing-yi-area`. It is
a SaanSeoi code for addressing the canonical Planning division, not a Planning
Department source identifier; C&SD's numeric New Town keys remain in their separately
reviewed identifier bridge.

The trilingual publisher labels are retained verbatim on the native `hkgovPlandNewTowns`
source row as `nameEn`, `nameZhHant`, and `nameZhHans`, then normalised into the
associated canonical planning division's `divisionI18n` rows. No source-level locale
rows are created.

The downloaded New Town artefacts contain known invalid rings: Tseung Kwan O in 2006,
2011 and 2016; Tuen Mun and Tai Po in 2006; and Tung Chung in 2021. The reviewed
`buffer(0)` policy repairs only those invalid topology cases for canonical geometry. The
source layer retains the publisher feature and original geometry unchanged, records
`wasGeometryRepaired`, and stores a row-keyed `repairedGeometry` transform separately.
The CLI can also export a separately labelled `-repaired.geojson` diagnostic copy
without altering the publisher file.

Its `sourceSchemaVersion` `1.0` is likewise an observed artefact profile for the stable
`NewTown_en`, `NewTown_Tc`, and `NewTown_Sc` fields, rather than a version declared by
the catalogue.

## Backfill commands

The CLI owns the checked-in cohort list, mirrored native archive paths and catalogue
provenance URLs. It prepares each local SHP ZIP artefact in a temporary directory,
uploads the canonical division release first, then its exact-cohort area variant, and
removes the temporary Parquet files afterwards. Snapshot cleanup is deferred for the
interim division upload, so its canonical IDs remain materialised for the companion area
validation; normal cleanup resumes when the area release is published.

The TPU artefacts use GeoParquet WKB geometry. Their optional Parquet column statistics
are disabled because the local upload inspector cannot read the GeoParquet statistics
metadata emitted by the current writer; this does not alter the geometry or records.

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
