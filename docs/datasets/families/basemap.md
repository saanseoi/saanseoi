# Basemap tiles

SaanSeoi's regional PMTiles archives are a generated base-geography family, separate
from the API resource families. Their input and publication process is documented in
[basemap tiles](../../tiles.md).

## Geography contract

The build filters the exact regional OpenStreetMap PBF used by Planetiler for
`natural=coastline` ways. It uses the resolved regional footprint only as temporary
construction geometry to close faces, derives complementary water, and emits the
following generated vector layers before tile clipping:

| Layer       | Geometry | Semantics                                                |
| ----------- | -------- | -------------------------------------------------------- |
| `earth`     | polygon  | Regional land coverage                                   |
| `water`     | polygon  | Regional water coverage                                  |
| `coastline` | line     | Original OSM sea, harbour, and island coastline linework |

`coastline` excludes construction edges and enclosed inland-water boundaries. It is the
sole styling contract for an earth/sea outline, so consumers must not derive that
outline from polygon edges. All generated base features expose `saanseoi:base: true`;
coastline features also expose `kind: "coastline"`.

The same exact clip applies to labels and all ordinary source geometry. A published
regional PMTiles archive is therefore self-contained: viewers render it from one tile
source and use the published boundary GeoJSON only for the outside-region mask.

Historic source-backed releases are regenerated only from their matching archived
GeoFabrik PBF. A history rewrite fails before publication when an archived regional
input is unavailable. Imported PMTiles archives are retained instead: the generic import
operation does not embed this generated geography, so an import needs a source-aware
build with its matching historic PBF before it can carry the same coastline contract.
