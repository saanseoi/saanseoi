type Position = readonly [number, number]
type Polygon = Position[][]

export type RegionBoundary = {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry:
    | { type: 'Polygon'; coordinates: Polygon }
    | { type: 'MultiPolygon'; coordinates: Polygon[] }
}

type TilePoint = { x: number; y: number }

type VectorTileFeature = {
  id?: number
  type: number
  extent: number
  properties: Record<string, unknown>
  loadGeometry(): TilePoint[][]
}

type VectorTileLayer = {
  name: string
  version: number
  extent: number
  length: number
  feature(index: number): VectorTileFeature
}

type VectorTile = {
  layers: Record<string, VectorTileLayer>
}

type VectorTileConstructor = new (pbf: unknown) => VectorTile
type PbfConstructor = new (buffer: ArrayBuffer | Uint8Array) => unknown
type EncodeVectorTile = (tile: {
  layers: Record<string, VectorTileLayer>
}) => Uint8Array

const LABEL_LAYERS = new Set(['buildings', 'earth', 'pois', 'places', 'roads', 'water'])
const INSIDE_REGION_PROPERTY = 'saanseoi:inside_region'

function pointInRing(point: Position, ring: readonly Position[]): boolean {
  let inside = false
  for (
    let current = 0, previous = ring.length - 1;
    current < ring.length;
    previous = current++
  ) {
    const currentPoint = ring[current]
    const previousPoint = ring[previous]
    if (!currentPoint || !previousPoint) continue
    const [currentX, currentY] = currentPoint
    const [previousX, previousY] = previousPoint
    const crosses = currentY > point[1] !== previousY > point[1]
    if (
      crosses &&
      point[0] <
        ((previousX - currentX) * (point[1] - currentY)) / (previousY - currentY) +
          currentX
    ) {
      inside = !inside
    }
  }
  return inside
}

/** Whether a label anchor lies inside the release's exact clipping boundary. */
export function isPointInRegion(boundary: RegionBoundary, point: Position): boolean {
  const polygons =
    boundary.geometry.type === 'Polygon'
      ? [boundary.geometry.coordinates]
      : boundary.geometry.coordinates
  return polygons.some(polygon => {
    const outerRing = polygon[0]
    return (
      outerRing !== undefined &&
      pointInRing(point, outerRing) &&
      !polygon.slice(1).some(hole => pointInRing(point, hole))
    )
  })
}

function tilePointToLngLat(
  point: TilePoint,
  extent: number,
  z: number,
  x: number,
  y: number,
): Position {
  const scale = extent * 2 ** z
  const worldX = (x * extent + point.x) / scale
  const worldY = (y * extent + point.y) / scale
  return [
    worldX * 360 - 180,
    (Math.atan(Math.sinh(Math.PI * (1 - 2 * worldY))) * 180) / Math.PI,
  ]
}

function labelAnchor(feature: VectorTileFeature): TilePoint | null {
  const geometry = feature.loadGeometry()
  const points = geometry.flat()
  if (points.length === 0) return null

  const firstPoint = points[0]
  if (!firstPoint) return null
  if (feature.type === 1) return firstPoint

  // Basemap line labels use the centre of their tile-local line geometry. This
  // matches MapLibre's placement closely enough to prevent nearby external
  // road names without discarding names for a line that enters the region.
  if (feature.type === 2) {
    let totalLength = 0
    for (const line of geometry) {
      for (let index = 1; index < line.length; index++) {
        const start = line[index - 1]
        const end = line[index]
        if (!start || !end) continue
        totalLength += Math.hypot(end.x - start.x, end.y - start.y)
      }
    }
    if (totalLength === 0) return firstPoint
    let travelled = 0
    for (const line of geometry) {
      for (let index = 1; index < line.length; index++) {
        const start = line[index - 1]
        const end = line[index]
        if (!start || !end) continue
        const length = Math.hypot(end.x - start.x, end.y - start.y)
        if (travelled + length >= totalLength / 2) {
          const fraction = (totalLength / 2 - travelled) / length
          return {
            x: start.x + (end.x - start.x) * fraction,
            y: start.y + (end.y - start.y) * fraction,
          }
        }
        travelled += length
      }
    }
  }

  // Point-on-surface labels in the Protomaps schema are normally points. For
  // the remaining polygon-backed symbols, their tile-local centroid is a
  // stable approximation of the rendered anchor.
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  }
}

function featureBelongsToRegion(
  feature: VectorTileFeature,
  boundary: RegionBoundary,
  z: number,
  x: number,
  y: number,
): boolean {
  const anchor = labelAnchor(feature)
  return (
    anchor !== null &&
    isPointInRegion(boundary, tilePointToLngLat(anchor, feature.extent, z, x, y))
  )
}

/**
 * Produces a vector tile containing only symbols whose label anchor belongs to
 * a requested region. The original PMTiles tile is never modified.
 */
export function filterInsideRegionLabels(
  data: ArrayBuffer,
  boundary: RegionBoundary,
  z: number,
  x: number,
  y: number,
  VectorTileReader: VectorTileConstructor,
  PbfReader: PbfConstructor,
  encodeVectorTile: EncodeVectorTile,
): ArrayBuffer {
  const tile = new VectorTileReader(new PbfReader(data))
  const layers: Record<string, VectorTileLayer> = {}

  for (const [name, layer] of Object.entries(tile.layers)) {
    if (!LABEL_LAYERS.has(name)) continue
    const features: VectorTileFeature[] = []
    for (let index = 0; index < layer.length; index++) {
      const feature = layer.feature(index)
      // The label-only source must not duplicate generated earth/water fills:
      // they have no label attributes, but can be large polygons for a regional
      // tileset and otherwise make MapLibre decode them a second time.
      if (feature.properties['saanseoi:base'] === true) continue
      if (!featureBelongsToRegion(feature, boundary, z, x, y)) continue
      feature.properties = {
        ...feature.properties,
        [INSIDE_REGION_PROPERTY]: true,
      }
      features.push(feature)
    }
    if (features.length === 0) continue
    layers[name] = {
      name: layer.name,
      version: layer.version,
      extent: layer.extent,
      length: features.length,
      feature: index => {
        const feature = features[index]
        if (!feature) throw new RangeError(`No feature at index ${index}.`)
        return feature
      },
    }
  }

  const encoded = encodeVectorTile({ layers })
  const result = new ArrayBuffer(encoded.byteLength)
  new Uint8Array(result).set(encoded)
  return result
}
