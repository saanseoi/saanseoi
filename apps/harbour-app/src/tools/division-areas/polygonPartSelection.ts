import type { MultiPolygon, Polygon, Position } from 'geojson'
import { containsReviewPoint } from '../../../../../libs/core/src/pipeline/services/divisions/geographicReview'

/** Resolve against the full geometry, never MapLibre's clipped tile geometry. */
export function polygonPartForEdit(
  geometry: Polygon | MultiPolygon,
  point: Position | null,
) {
  if (geometry.type === 'Polygon') return 0
  const parts = geometry.coordinates
  if (point) {
    const containing = parts.findIndex(coordinates =>
      containsReviewPoint(point, { type: 'Polygon', coordinates }),
    )
    if (containing >= 0) return containing
    // Labels and outline clicks can fall just outside the polygon.
    const distance = (rings: Polygon['coordinates']) =>
      rings
        .flatMap(ring =>
          ring.slice(1).map((b, i) => {
            const a = ring[i]!
            const scale = Math.cos((point[1]! * Math.PI) / 180)
            const dx = (b[0]! - a[0]!) * scale,
              dy = b[1]! - a[1]!
            const x = (point[0]! - a[0]!) * scale,
              y = point[1]! - a[1]!
            const length = dx * dx + dy * dy
            const t = length ? Math.max(0, Math.min(1, (x * dx + y * dy) / length)) : 0
            return Math.hypot(x - t * dx, y - t * dy)
          }),
        )
        .reduce((best, value) => Math.min(best, value), Infinity)
    return parts.reduce(
      (best, rings, i) => (distance(rings) < distance(parts[best]!) ? i : best),
      0,
    )
  }
  const area = (rings: Polygon['coordinates']) =>
    Math.abs(
      rings[0]!.slice(1).reduce((sum, b, i) => {
        const a = rings[0]![i]!
        return sum + a[0]! * b[1]! - b[0]! * a[1]!
      }, 0),
    )
  return parts.reduce(
    (best, rings, i) => (area(rings) > area(parts[best]!) ? i : best),
    0,
  )
}

export function replaceEditedRing(
  geometry: Polygon | MultiPolygon,
  part: number,
  ring: Position[],
): Polygon | MultiPolygon {
  const next = structuredClone(geometry)
  if (next.type === 'Polygon') next.coordinates[0] = ring
  else next.coordinates[part]![0] = ring
  return next
}
