# OpenStreetMap basemap statistics

Basemap statistics use the checksum-verified archived Guangdong PBF and each release's
published boundary. The regional extract uses Osmium's `complete_ways` strategy. The
method identifier is `osm-source-objects-v1`.

| Category                      | Objects counted                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Buildings                     | Ways and relations with `building`, excluding `building=no`                                                |
| Roads and paths               | Ways with `highway`, excluding `highway=no`                                                                |
| Railways                      | Ways with `railway`, excluding `railway=no`                                                                |
| Points of interest            | Nodes, ways or relations with any non-empty, non-`no` `amenity`, `shop`, `tourism` or `leisure` tag        |
| Land use and natural features | Objects with `landuse`, or `natural` other than `coastline` or `water`; empty and `no` values are excluded |
| Waterways                     | Objects with `waterway`, excluding empty and `no` values                                                   |
| Places                        | Objects with `place`, excluding empty and `no` values                                                      |

An object is counted once within each category. Categories are not mutually exclusive. A
road way is a source segment, and a building relation can coexist with tagged member
ways. These counts are not unique physical buildings, rendered labels or tile-feature
counts. Complete ways retain connected geometry outside the regional footprint.

The [basemap family](../../families/basemap.md#release-statistics-and-usage) documents
backfill commands, META persistence and archive identity checks.
