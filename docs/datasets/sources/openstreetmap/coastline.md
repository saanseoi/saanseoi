# OpenStreetMap regional coastline

## Purpose

The regional basemap generator derives `earth`, `water`, and `coastline` from the same
GeoFabrik OpenStreetMap PBF that Planetiler uses for the PMTiles archive. This keeps the
base geography tied to the release input rather than to a separately updated global
land-polygon download.

The generator downloads and archives one GeoFabrik Guangdong PBF for each release date.
It resolves every GBA, Hong Kong, and Macao administrative relation directly from that
same PBF, then uses Osmium's `complete_ways` strategy to prepare each regional input for
Planetiler and coastline processing. The complete source also provides Macao's
administrative-boundary context, including adjoining Zhuhai ways referenced by relation
`1867188`, before that linework is intersected with the Macao footprint.

When rebuilding a historic source-backed release, the generator uses only its
date-matched archived GeoFabrik Guangdong PBF from the private `ss-basemap-sources` R2
bucket. It refuses to substitute a current extract for a missing historic input. A
prebuilt imported PMTiles archive is retained by a history rewrite; importing it alone
cannot add these layers, because the source PBF is still needed to construct them.

## Regional processing

The generator filters `natural=coastline` ways from the local PBF and clips those source
lines to the resolved OSM administrative footprint. It adds the footprint boundary only
while polygonising local faces, then unary-unions the combined linework so every
crossing is noded and the footprint's outer face is preserved. OSM's directed coastline
convention identifies land as the face to the left of each line; the remaining footprint
faces are water.

The temporary closure boundary is never published. Source coastline lines are emitted in
the standard `water` vector layer as `kind: "coastline"`, so they exclude vector-tile
edges and enclosed inland-water boundaries. Generated features carry
`saanseoi:base: true`. See the [basemap family contract](../../families/basemap.md).

When the dated PBF includes the administrative relation members needed to distinguish
landward from maritime segments, the landward segments are emitted in the standard
`boundaries` layer as `kind: "region"`, `kind_detail: 4`, and
`saanseoi:region_border: true`. Consumers can combine them with `water/kind=coastline`
to identify a region's complete outline. Their absence never changes generated earth,
water, or coastline geometry. Historic Macao processing uses the date-matched archived
GBA PBF for the same relation context; it does not substitute a current source.
