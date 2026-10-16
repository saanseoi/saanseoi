import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js'
import BufferOp from 'jsts/org/locationtech/jts/operation/buffer/BufferOp.js'
import type { Feature, Polygon, MultiPolygon, Position } from 'geojson'
type Building = Feature<Polygon | MultiPolygon, { point: number[] }>

export async function suggestBuiltExtent(seed: Position, gap: number, radius: number) {
  const buildings: Building[] = await fetch(
    '/__division-review/assets/buildings.json',
  ).then(r => r.json())
  const sx = 111320 * Math.cos((seed[1]! * Math.PI) / 180),
    sy = 110574
  const candidates = buildings
    .map(b => ({
      b,
      x: (b.properties.point[0]! - seed[0]!) * sx,
      y: (b.properties.point[1]! - seed[1]!) * sy,
    }))
    .filter(b => Math.hypot(b.x, b.y) <= radius)
    .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))
  if (
    !candidates.length ||
    Math.hypot(candidates[0]!.x, candidates[0]!.y) > Math.min(radius, 500)
  )
    throw Error(
      'No building seed within 500 m. Select another division or increase the radius.',
    )
  const reached = new Set([0]),
    queue = [0]
  for (let q = 0; q < queue.length; q++) {
    const a = candidates[queue[q]!]!
    for (let i = 0; i < candidates.length; i++)
      if (!reached.has(i)) {
        const b = candidates[i]!
        if (Math.hypot(a.x - b.x, a.y - b.y) <= gap) {
          reached.add(i)
          queue.push(i)
        }
      }
    if (reached.size > 5000)
      throw Error('Expansion exceeds 5,000 buildings. Reduce radius or gap.')
  }
  const project = (coords: unknown, inverse = false): unknown => {
    const a = coords as number[]
    if (typeof a[0] === 'number')
      return inverse
        ? [a[0]! / sx + seed[0]!, a[1]! / sy + seed[1]!]
        : [(a[0]! - seed[0]!) * sx, (a[1]! - seed[1]!) * sy]
    return (coords as unknown[]).map(c => project(c, inverse))
  }
  const reader = new GeoJSONReader(new GeometryFactory()),
    writer = new GeoJSONWriter()
  const collection = reader.read({
    type: 'GeometryCollection',
    geometries: [...reached].map(i => {
      const g = candidates[i]!.b.geometry
      return { ...g, coordinates: project(g.coordinates) }
    }),
  })
  // Dilate and erode the reached footprints to bridge small built-up gaps.
  const expanded = BufferOp.bufferOp(collection, gap / 2)
  const outline = writer.write(BufferOp.bufferOp(expanded, -gap / 2 + 5)) as
    | Polygon
    | MultiPolygon
  if (!['Polygon', 'MultiPolygon'].includes(outline.type))
    throw Error('No polygon produced. Adjust the gap.')
  outline.coordinates = project(outline.coordinates, true) as typeof outline.coordinates
  return {
    type: 'Feature',
    geometry: outline,
    properties: {
      variant: 'built-area-suggestion',
      sourceDomain: 'osm-buildings',
      sourceCohort: '2026-09-01',
      method: 'building-centroid-region-growing-buffer-close-v1',
      gapMetres: gap,
      radiusMetres: radius,
      seed,
      buildingCount: reached.size,
    },
  } as Feature<Polygon | MultiPolygon>
}
