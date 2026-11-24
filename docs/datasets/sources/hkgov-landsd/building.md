# LandsD Buildings

Tracking: [Buildings #68](https://github.com/saanseoi/saanseoi/issues/68). The
[Buildings family contract](../../families/buildings.md) keeps this inventory strictly
separate from Overture. Original BuildingCSUID identity and source geometry are
retained. OBJECTID is a delivery row identifier and does not replace BuildingCSUID.

## Published history

Checked on 21 October 2026, the
[CSDI archive catalogue](https://portal.csdi.gov.hk/csdi-webpage/archivedDatasetFileList/landsd_rcd_1637211194312_35158)
lists **12 quarterly slots, Q4 2023 through Q3 2026**. The
[dataset metadata](https://portal.csdi.gov.hk/csdi-webpage/metadata/landsd_rcd_1637211194312_35158/html)
states creation on **1 March 2022**, monthly update frequency and a current revision of
**21 September 2026**. Creation is not evidence of downloadable archives back to 2022.
The published quarterly history does not provide every monthly version. For monthly
change history, retain future monthly acquisitions ourselves. Archive slot identity and
actual payload date must be recorded separately; the Q2 2026 payload reviewed is dated
22 June 2026.

The provisional review uses the complete current WGS84 GeoJSON file with 342,195
records. It measures footprints, not a claimed count of unique physical structures or
occupied premises. Names are optional; missing names display as unnamed buildings. 83
invalid geometries are repaired only in the overlap-analysis copy.

## Geometry relationships

A directional >99% coverage result identifies geometric containment. Only a mutual,
unique, unambiguous result is a strong geometry-based identity candidate, and it still
requires an explicit identity policy or review. Partial links retain both publisher IDs
and must be labelled partial; assigning the same canonical identity from containment
alone would conflate structures with different extents.

`BaseHeight` and `TopHeight` are elevations above Hong Kong Principal Datum. Preserve
the vertical datum; do not interpret `TopHeight` directly as physical height. Original
source assertions, including names, storeys, geometry and elevations, remain
source-specific.

Preparation, query benchmark and Harbour comparison instructions are in the Buildings
family document. Production source registration, monthly change ingestion and versioned
geometry retention remain future work under #68.
