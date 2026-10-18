import { canonicalDivisionPoint } from '@repo/core/pipeline/services/divisions/divisionPoint'
import type { GeoJsonGeometry } from '@repo/core/pipeline/geojson'

/** Validate the polygon and derive the identity point before retaining its archive. */
export function planningArchivePoint(id: string, area: GeoJsonGeometry) {
  const point = canonicalDivisionPoint(area, { id })
  if (!point) throw new Error(`Planning division ${id} has no representative point.`)
  return point
}
