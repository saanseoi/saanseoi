# Planning Department TPU and subunit areas

This profile records the Planning Department source-specific adapter. The source-neutral
geometry contract remains in
[`spec/divisions-geometry.md`](../../../../spec/divisions-geometry.md).

## Catalogue and artifacts

The CSDI file API publishes the following polygonal GeoJSON artifacts. Their underlying
ArcGIS services advertise EPSG:2326; the CSDI GeoJSON delivery is EPSG:4326
longitude/latitude and is ingested as the API canonical CRS.

| Cohort | Catalogue code                  | Layer          | Source cells | TPU values |
| ------ | ------------------------------- | -------------- | -----------: | ---------: |
| 2001   | `pland_rcd_1636535158118_80594` | `TPUSBVC_2001` |        4,636 |        282 |
| 2006   | `pland_rcd_1636535383021_30595` | `TPUSBVC_2006` |        4,800 |        287 |
| 2011   | `pland_rcd_1634025118087_40967` | `TPUSBVC_2011` |        4,815 |        289 |
| 2016   | `pland_rcd_1634281887222_15002` | `TPUSBVC_2016` |        4,863 |        291 |
| 2021   | `pland_rcd_1634022783366_65050` | `TPUSU_2021`   |        4,916 |        292 |

The publisher is the Planning Department (`hkgov-pland`), not the CSDI host. The source
licence is the Hong Kong Government open-data licence. Releases use schema profile `1.0`
and source release codes `hkgov-pland-{year}-division-pu` and
`hkgov-pland-{year}-divisionArea-pu`.

## Identity and hierarchy

Every source cell has one PPU, SPU, TPU and subunit code. It becomes a planning
division, with PPU → SPU → TPU → subunit hierarchy edges carrying domain `planning`. The
provider codes are retained in `identifiers` as `PLAND:PPU`, `PLAND:SPU`, `PLAND:TPU`,
and `PLAND:SUBUNIT`; their canonical IDs are provider-scoped because they do not have
Overture GERS identities.

PPU, SPU and TPU areas are deterministic unions of their child cells. The raw cell
feature and its original geometry remain in `hkgovPlandPlanningCells`.

## Geometry policy

Only Polygon and MultiPolygon source geometry is accepted. The input artifacts have no
material same-TPU overlap. Six known source cells have ring self-intersections: two in
2006, one in 2011, one in 2016, and two in 2021. The approved adapter policy stores the
original source geometry unchanged and uses a `buffer(0)` topology repair solely for
canonical geometry and child-area unions. Each repaired record is identified in
`repairedSourceFeatureIds` and `wasGeometryRepaired`; all other invalid geometry is
rejected.

The source has no localized names. Canonical English, Traditional Chinese and Simplified
Chinese labels are explicitly inferred from published hierarchy codes and marked as
inferred.

## New Town boundaries

New Towns are a separate geographic provider variant, not planning divisions. They use
source profile/bridge authority `hkgov-pland-newtown`, while retaining the Planning
Department as publisher. The CSDI GeoJSON files are also EPSG:4326 deliveries of
EPSG:2326 catalogue services.

| Cohort | Catalogue code                  | Layer          | Features |
| ------ | ------------------------------- | -------------- | -------: |
| 2006   | `pland_rcd_1636535014241_1352`  | `NewTown_2006` |       12 |
| 2011   | `pland_rcd_1634024777903_55269` | `NewTown_2011` |       12 |
| 2016   | `pland_rcd_1634281414408_50485` | `NewTown_2016` |       12 |
| 2021   | `pland_rcd_1634023103904_16865` | `NewTown_2021` |       13 |

The layers publish only English, Traditional Chinese and Simplified Chinese names—no
stable feature code. The adapter derives a normalized English-name external identifier
within each cohort. It loads only when the corresponding reviewed `identifierBridges`
fixture maps every one of those IDs to an existing geographic canonical division. It
never creates a New Town canonical division or guesses a match from names or geometry.
This makes the variant selectable as `areas:hkgov-pland-newtown` after a bridge-backed
release is published.
