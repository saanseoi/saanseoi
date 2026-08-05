# OpenStreetMap regional coastline

## Purpose

The regional basemap generator derives `earth`, `water`, and `coastline` from the same
GeoFabrik OpenStreetMap PBF that Planetiler uses for the PMTiles archive. This keeps the
base geography tied to the release input rather than to a separately updated global
land-polygon download.

Hong Kong and Macao use their respective GeoFabrik regional extracts. The Greater Bay
Area first extracts its administrative footprint from the Guangdong PBF with Osmium's
`complete_ways` strategy, then uses that resulting PBF for both Planetiler and coastline
processing. The prepared GBA PBF also provides Macao's administrative-boundary context:
Macao's own extract excludes some adjoining Zhuhai ways referenced by relation
`1867188`. The generator resolves that complete relation graph from the GBA export, then
intersects the linework with the Macao footprint before publication.

When rebuilding a historic source-backed release, the generator uses only its
date-matched archived GeoFabrik PBF. It refuses to substitute a current extract for a
missing historic input. A prebuilt imported PMTiles archive is retained by a history
rewrite; importing it alone cannot add these layers, because the source PBF is still
needed to construct them.

## Regional processing

The generator filters `natural=coastline` ways from the local PBF and clips those source
lines to the resolved OSM administrative footprint. It adds the footprint boundary only
while polygonising local faces, then unary-unions the combined linework so every
crossing is noded and the footprint's outer face is preserved. OSM's directed coastline
convention identifies land as the face to the left of each line; the remaining footprint
faces are water.

The temporary closure boundary is never published. The `coastline` vector layer contains
only source coastline lines, so it excludes vector-tile edges and enclosed inland-water
boundaries. Generated `earth`, `water`, and `coastline` features carry
`saanseoi:base: true`; coastline features also expose `kind: "coastline"`. See the
[basemap family contract](../../families/basemap.md).

The optional `regional_border` layer is emitted only when the dated PBF includes the
administrative relation members needed to distinguish landward from maritime boundary
segments. Its absence never changes the generated earth, water, or coastline geometry.
Historic Macao processing uses the date-matched archived GBA PBF for the same relation
context; it does not substitute a current source.
