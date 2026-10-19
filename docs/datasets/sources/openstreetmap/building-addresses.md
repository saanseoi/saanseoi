# OpenStreetMap building addresses

The regional basemap build reads address tags from the same retained OSM PBF as building
footprints. `protomaps-building-address.patch` retains source identity, number, street,
full address and English/Chinese street and building names on z15 polygons. The build
fingerprint includes both the regional-coastline and building-address patches.

`source_id` is `osm:` followed by the type-encoded Protomaps feature ID, represented as
a string. It is an OSM feature identity, not a SaanSeoi Address ID. The tile `id`
retains the same encoded numeric identity. Ways and relations remain distinct. Tile
clipping can split one source building into several features; consumers group fragments
by source and identity. Overlapping independent buildings are ambiguous.

Tags are source assertions, without inferred street names or expanded house-number
ranges. A complete `addr_full`, or a number plus street, can supply a selected
building's address directly. Native language fields are preferred where present; missing
translations retain source text. A building name alone is not a complete street address.

For buildings lacking address tags, the address geocoder accepts a caller-supplied
`footprint` constraint. It finds ALS address points inside that footprint, excluding
hole interiors, and reports `within_footprint` evidence. This spatial evidence is not a
curated OSM-to-ALS identity link. Multiple contained addresses remain ambiguous; no
contained address returns no match. Nearest-point lookup is reserved for pins without a
selected building and must be presented as approximate.
