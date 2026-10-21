import type { MultiPolygon, Polygon, Position } from 'geojson'

export type Footprint = Polygon | MultiPolygon
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number }
const metresPerDegree = (Math.PI * 6371008.8) / 180

/** Conservative HK search envelope; the exact footprint-distance filter follows.
 * @param lng Longitude of the query point.
 * @param lat Latitude of the query point.
 * @param radiusMetres Requested radius, in metres.
 * @returns A bounding box padded for the local tangent-plane distance calculation.
 */
export function searchBounds(lng: number, lat: number, radiusMetres: number): Bounds {
  const dy = (radiusMetres / metresPerDegree) * 1.002
  const dx = dy / Math.cos(((lat + dy) * Math.PI) / 180)
  return { minX: lng - dx, maxX: lng + dx, minY: lat - dy, maxY: lat + dy }
}

/** Test whether a point lies within a closed ring, using even/odd crossings. */
function insideRing(lng: number, lat: number, ring: Position[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j]
    if (
      a[1] > lat !== b[1] > lat &&
      lng < ((b[0] - a[0]) * (lat - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside
  }
  return inside
}

/** Shortest distance to the filled footprint, including holes and multipolygons.
 * @param geometry Unmodified source polygon in WGS84.
 * @param lng Query longitude.
 * @param lat Query latitude.
 * @returns Metres in a query-centred local tangent plane; zero inside the footprint.
 * @remarks Intended for Hong Kong searches up to 1 km; not a walking distance or a geodesic survey measurement.
 */
export function footprintDistance(
  geometry: Footprint,
  lng: number,
  lat: number,
): number {
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  let shortest = Infinity
  const sx = metresPerDegree * Math.cos((lat * Math.PI) / 180)
  for (const rings of polygons) {
    if (!rings.length) continue
    if (
      insideRing(lng, lat, rings[0]) &&
      !rings.slice(1).some(ring => insideRing(lng, lat, ring))
    )
      return 0
    for (const ring of rings)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const ax = (ring[j][0] - lng) * sx,
          ay = (ring[j][1] - lat) * metresPerDegree
        const bx = (ring[i][0] - lng) * sx,
          by = (ring[i][1] - lat) * metresPerDegree
        const dx = bx - ax,
          dy = by - ay
        const length = dx * dx + dy * dy
        const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0
        shortest = Math.min(shortest, Math.hypot(ax + t * dx, ay + t * dy))
      }
  }
  return shortest
}

/** Validate the bounded public-data benchmark query.
 * @param url Incoming query URL.
 * @returns Validated inventory, engine and search coordinates.
 * @throws When the requested inventory, engine, point or radius is unsupported.
 */
export function parseSearch(url: URL) {
  const inventory = url.searchParams.get('inventory')
  const engine = url.searchParams.get('engine') ?? 'fgb'
  const lng = Number(url.searchParams.get('lng')),
    lat = Number(url.searchParams.get('lat'))
  const radius = Number(url.searchParams.get('radius') ?? 250)
  if (inventory !== 'landsd' && inventory !== 'overture')
    throw new Error('Choose one inventory: landsd or overture.')
  if (engine !== 'd1' && engine !== 'fgb') throw new Error('Unknown query engine.')
  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    lng < 113.8 ||
    lng > 114.5 ||
    lat < 22.1 ||
    lat > 22.6
  )
    throw new Error('Choose a point in Hong Kong.')
  if (!Number.isFinite(radius) || radius < 10 || radius > 1000)
    throw new Error('Radius must be between 10 and 1000 metres.')
  return { inventory, engine, lng, lat, radius } as const
}
