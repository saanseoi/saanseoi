# Overture Buildings

Tracking: [Buildings #68](https://github.com/saanseoi/saanseoi/issues/68). Follow the
[Buildings family contract](../../families/buildings.md): Overture and LandsD are
strictly separate inventories, including geometry and release history. Cross-source
comparison never replaces or merges their source IDs.

The review pins **2026-09-23.1**, the latest published Buildings release found in the
[Overture STAC catalogue](https://stac.overturemaps.org/catalog.json) on 21 October 2026.
A scheduled October release must not be treated as an available extract. The retained
Hong Kong clipSmart scope has **204,207** building records; strict district-union
intersection would omit 27 of these boundary records.

## Schema and provenance

The
[Building schema](https://docs.overturemaps.org/schema/reference/buildings/building/)
provides GERS IDs, polygon/multipolygon geometry, names, class/subtype, height, floors,
roof and facade attributes where available, and source assertions. The
[BuildingPart schema](https://docs.overturemaps.org/schema/reference/buildings/building_part/)
links constituent geometry to parent buildings. Parts are not a unit/shop inventory and
must not be treated as additional complete buildings. The reviewed parts belong to 1,254
parent buildings. The building payload does not supply structured frontage addresses or
establishment membership.

The retained Hong Kong building `sources` identify **118,834 OpenStreetMap records**
(58.19%) and **85,373 records** (41.81%) from `doi:10.5281/zenodo.8174931`, the East
Asian building-footprint research dataset. Retain source assertions and observe the
[Overture attribution requirements](https://docs.overturemaps.org/attribution/),
including OpenStreetMap's ODbL and the research dataset's CC BY 4.0 attribution. The
overlap review is a comparison with LandsD, not evidence that LandsD supplied these
Overture footprints.

Original geometry and GERS IDs are retained in the independent scratch inventory. A
LandsD relationship points to this GERS ID and release as evidence; partial containment
must not become an identity alias. No GERS IDs are assigned by the review application.

See the Buildings family document for overlap statistics, preparation, local review,
preview benchmark methodology and the outstanding production ingestion lifecycle.
