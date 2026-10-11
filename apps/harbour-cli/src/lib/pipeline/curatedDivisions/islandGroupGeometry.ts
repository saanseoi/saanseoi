import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import UnaryUnionOp from 'jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'
import { reviewAreaBounds } from '@repo/core/pipeline/services/divisions/geographicReview'
import type { Polygon, MultiPolygon } from 'geojson'

export type IslandGroupDefinition = {
  divisionId: string
  seedMemberIds: string[]
  include: string[]
  exclude: string[]
}
type Shape = Polygon | MultiPolygon
type Island = { id: string; class: string; geometry: Shape }

/** The seed envelope is fixed. Membership requires the whole island, not its label point. */
export function deriveIslandGroupGeometry(
  definitions: IslandGroupDefinition[],
  islands: Island[],
  resolveId: (id: string) => string = id => id,
) {
  const reader = new GeoJSONReader(new GeometryFactory())
  const writer = new GeoJSONWriter()
  const eligible = new Map(
    islands
      .filter(row => ['major_island', 'minor_island', 'islet'].includes(row.class))
      .map(row => [row.id, row]),
  )
  if (new Set(definitions.map(row => row.divisionId)).size !== definitions.length)
    throw Error('Duplicate island-group definition.')
  return definitions.map(definition => {
    const requireIsland = (id: string) => {
      const island = eligible.get(resolveId(id))
      if (!island) throw Error(`Missing island-group member geometry: ${id}`)
      return island
    }
    if (!definition.seedMemberIds.length)
      throw Error(`Missing island-group seeds: ${definition.divisionId}`)
    const seeds = definition.seedMemberIds.map(requireIsland)
    const seedBounds = seeds.map(row => reviewAreaBounds(row.geometry))
    const bbox = [
      Math.min(...seedBounds.map(b => b[0])),
      Math.min(...seedBounds.map(b => b[1])),
      Math.max(...seedBounds.map(b => b[2])),
      Math.max(...seedBounds.map(b => b[3])),
    ] as [number, number, number, number]
    const included = definition.include.map(requireIsland)
    const excluded = new Set(definition.exclude.map(id => requireIsland(id).id))
    if (included.some(row => excluded.has(row.id)))
      throw Error('Conflicting island-group overrides.')
    const members = [
      ...new Map(
        [
          ...[...eligible.values()].filter(row => {
            const b = reviewAreaBounds(row.geometry)
            return (
              b[0] >= bbox[0] && b[1] >= bbox[1] && b[2] <= bbox[2] && b[3] <= bbox[3]
            )
          }),
          ...included,
        ]
          .filter(row => !excluded.has(row.id))
          .map(row => [row.id, row]),
      ).values(),
    ].sort((a, b) => a.id.localeCompare(b.id))
    if (!members.length) throw Error(`Empty island group: ${definition.divisionId}`)
    const shapes = members.map(row => {
      const shape = reader.read(row.geometry)
      if (!IsValidOp.isValid(shape))
        throw Error(`Invalid island-group member geometry: ${row.id}`)
      return row.geometry
    })
    const union = UnaryUnionOp.union(
      reader.read({ type: 'GeometryCollection', geometries: shapes }),
    )
    const geometry = writer.write(union) as Shape
    if (
      !['Polygon', 'MultiPolygon'].includes(geometry.type) ||
      !IsValidOp.isValid(union)
    )
      throw Error(`Invalid island-group union: ${definition.divisionId}`)
    return {
      divisionId: definition.divisionId,
      seedBounds: bbox,
      memberIds: members.map(row => row.id),
      geometry,
    }
  })
}
