# Basemap tiles

SaanSeoi's regional PMTiles archives are a generated base-geography family, separate
from the API resource families. Their input and publication process is documented in
[basemap tiles](../../tiles.md).

## Schema contract

The vector-layer schema is versioned as `protomaps-v2.N`: it starts from Protomaps
Basemaps v2, while `N` is incremented whenever SaanSeoi changes its published layers or
properties. The current contract is `protomaps-v4.0`. In addition to the inherited
Protomaps layers, it defines SaanSeoi's exact regional boundary, coastline, earth and
water additions described below. Each release manifest records the schema version it was
built against.

## Geography contract

The build filters the exact regional OpenStreetMap PBF used by Planetiler for
`natural=coastline` ways. It uses the resolved regional footprint only as temporary
construction geometry to close faces, derives complementary water, and emits the
following generated vector layers before tile clipping:

| Layer        | Geometry | Semantics                                                  |
| ------------ | -------- | ---------------------------------------------------------- |
| `earth`      | polygon  | Regional land coverage                                     |
| `water`      | polygon  | Regional water coverage                                    |
| `water`      | line     | Original coastline linework (`kind: "coastline"`)          |
| `boundaries` | line     | Landward regional outline (`saanseoi:region_border: true`) |

The coastline and boundary features exclude construction edges and enclosed inland-water
boundaries. Together they are the styling contract for a complete regional outline, so
consumers must not derive it from polygon edges. All generated base features expose
`saanseoi:base: true`.

The same exact clip applies to labels and all ordinary source geometry. A published
regional PMTiles archive is therefore self-contained: viewers render it from one tile
source and use the published boundary GeoJSON only for the outside-region mask.

Historic source-backed releases are regenerated from their matching archived GeoFabrik
Guangdong PBF. The source is retained privately in R2 and supplies the locally resolved
GBA, Hong Kong, and Macao clipping boundaries. A history rewrite fails before
publication when an archived input is unavailable, except that an old GBA extract may
reuse its hash-verified published boundary when its relation members cannot be resolved.
Imported PMTiles archives are retained instead: the generic import operation does not
embed this generated geography, so an import needs a matching boundary and a
source-aware build with its matching historic PBF before it can carry the same coastline
contract.
