import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js'
import UnaryUnionOp from 'jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import { polygonLabelPoint } from './polygonLabelPoint'
import type { Polygon, MultiPolygon } from 'geojson'
import RelateOp from 'jsts/org/locationtech/jts/operation/relate/RelateOp.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'
import { guardSession } from '../../../provenance/guards'
import type { GeoJsonGeometry, GeoJsonPosition } from '../../geojson'

export type DivisionPoint = { type: 'Point'; coordinates: GeoJsonPosition }
export const divisionPointGuardDefinition = {
  id: 'division-representative-point',
  summary:
    'Require a finite WGS 84 Point inside its canonical area when area evidence is available, except island-group labels; derive an interior point from polygonal input.',
  consequence: 'block-ingestion' as const,
}
export const createDivisionPointGuard = () =>
  guardSession([divisionPointGuardDefinition])
type PointGuard = ReturnType<typeof createDivisionPointGuard>

/** Canonical identities carry points; publisher polygons remain in DivisionAreas. */
export function canonicalDivisionPoint(
  geometry: GeoJsonGeometry | null,
  options: {
    id: string
    class?: string | null
    area?: GeoJsonGeometry | null
    guard?: PointGuard
  },
): DivisionPoint | null {
  return (options.guard ?? createDivisionPointGuard()).check(
    divisionPointGuardDefinition.id,
    () => {
      const area =
        options.area ??
        (geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon'
          ? geometry
          : null)
      // No coordinates can be inferred without either a source point or an area.
      if (!geometry && !area) return null
      if (geometry && !['Point', 'Polygon', 'MultiPolygon'].includes(geometry.type))
        throw new Error(
          `Division ${options.id} requires a Point or polygonal source geometry.`,
        )
      const reader = new GeoJSONReader(new GeometryFactory())
      if (area && area.type !== 'Polygon' && area.type !== 'MultiPolygon')
        throw new Error(`Division ${options.id} requires polygonal area evidence.`)
      const polygon = area ? reader.read(area) : null
      if (polygon && (polygon.isEmpty() || !new IsValidOp(polygon).isValid()))
        throw new Error(`Division ${options.id} has invalid or empty area geometry.`)
      let point: DivisionPoint
      if (geometry?.type === 'Point')
        point = { type: 'Point', coordinates: geometry.coordinates }
      else {
        const interior = area && polygonLabelPoint(area as Polygon | MultiPolygon)
        if (!interior)
          throw new Error(`Cannot derive an interior point for division ${options.id}.`)
        point = { type: 'Point', coordinates: interior }
      }
      const [longitude, latitude] = point.coordinates
      if (
        point.coordinates.length < 2 ||
        point.coordinates.length > 3 ||
        !point.coordinates.every(Number.isFinite) ||
        Math.abs(longitude) > 180 ||
        Math.abs(latitude) > 90
      )
        throw new Error(`Division ${options.id} has invalid WGS 84 point coordinates.`)
      // Island-group labels may sit between their disconnected member islands.
      // Other divisions exclude holes and polygon boundaries deliberately.
      if (
        polygon &&
        options.class !== 'island_group' &&
        !RelateOp.contains(polygon, reader.read(point))
      )
        throw new Error(
          `Division ${options.id} point lies outside the interior of its canonical area.`,
        )
      return point
    },
  )
}

/** Combine the selected canonical area parts, including overlapping land/maritime parts. */
export function divisionAreaUnion(areas: GeoJsonGeometry[]): GeoJsonGeometry | null {
  if (!areas.length) return null
  if (areas.length === 1) return areas[0]!
  const reader = new GeoJSONReader(new GeometryFactory())
  const combined = UnaryUnionOp.union(
    reader.read({ type: 'GeometryCollection', geometries: areas }),
  )
  return new GeoJSONWriter().write(combined) as GeoJsonGeometry
}
