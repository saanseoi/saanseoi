import type { MultiPolygon, Polygon, Position } from 'geojson'

type Geometry = Polygon | MultiPolygon
type GeometryInput = { type: string; coordinates: unknown }

export type IslandInventoryRow = {
  id: string
  name: string
  zh?: string
  point: Position
  areaKm2: number
  geometry: GeometryInput | null
  coverage?: string
  source?: string
  sourceRelease?: string
  geometryOptions?: Array<{
    geometry: GeometryInput
    sourceTags?: Record<string, unknown>
  }>
}

type Action = {
  id: string
  action: string
  operation?: string
  reviewRequired?: boolean
  maxDistanceMetres?: number
  geometry?: GeometryInput
  reason?: string
}

type Review = {
  id: string
  name: string
  zh?: string
  decision: string
}

type ReviewFixture = {
  entries: Review[]
  curationPolicy?: {
    actions: Action[]
    aliasGroups: Array<{ canonicalId: string; aliasIds: string[] }>
  }
}

export type PublishedIslandRow = Omit<IslandInventoryRow, 'geometry'> & {
  geometry: Geometry
}

const polygon = (geometry: GeometryInput | null | undefined): geometry is Geometry =>
  geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon'

function distanceMetres(left: Position, right: Position) {
  const latitudeScale = 111_320
  const longitudeScale = latitudeScale * Math.cos((left[1]! * Math.PI) / 180)
  return Math.hypot(
    (right[0]! - left[0]!) * longitudeScale,
    (right[1]! - left[1]!) * latitudeScale,
  )
}

function coordinates(value: unknown, output: Position[]) {
  if (!Array.isArray(value)) return
  if (
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  ) {
    output.push([value[0], value[1]])
    return
  }
  for (const item of value) coordinates(item, output)
}

function centre(geometry: Geometry): Position {
  const points: Position[] = []
  coordinates(geometry.coordinates, points)
  return [
    points.reduce((sum, point) => sum + point[0]!, 0) / points.length,
    points.reduce((sum, point) => sum + point[1]!, 0) / points.length,
  ]
}

function selectedGeometry(
  row: IslandInventoryRow,
  action?: Action,
): Geometry | undefined {
  if (polygon(action?.geometry)) return action.geometry
  if (
    action?.action === 'geometry-correction' &&
    action.operation === 'use-named-basemap-geometry'
  ) {
    const options = (row.geometryOptions ?? []).filter(option =>
      polygon(option.geometry),
    ) as Array<{ geometry: Geometry; sourceTags?: Record<string, unknown> }>
    const candidates =
      action.maxDistanceMetres === undefined
        ? options
        : options.filter(
            option =>
              distanceMetres(row.point, centre(option.geometry)) <=
              action.maxDistanceMetres!,
          )
    if (action.maxDistanceMetres !== undefined && candidates.length !== 1)
      return undefined
    return (
      candidates.find(option => option.sourceTags?.place === 'island')?.geometry ??
      candidates[0]?.geometry
    )
  }
  return polygon(row.geometry) ? row.geometry : undefined
}

/** The review map's island layer must mirror the geometry candidates publication emits. */
export function publishedIslandRows(
  inventory: IslandInventoryRow[],
  review: ReviewFixture,
): PublishedIslandRow[] {
  const actions = new Map(
    (review.curationPolicy?.actions ?? []).map(action => [action.id, action]),
  )
  const aliases = new Set(
    (review.curationPolicy?.aliasGroups ?? []).flatMap(group => group.aliasIds),
  )
  const canonicalMerges = new Set(
    (review.curationPolicy?.aliasGroups ?? []).map(group => group.canonicalId),
  )
  const result: PublishedIslandRow[] = []
  for (const entry of review.entries) {
    if (aliases.has(entry.id)) continue
    const action = actions.get(entry.id)
    const source = inventory.find(row => row.id === entry.id)
    if (!source) {
      if (
        entry.decision === 'accepted' ||
        (canonicalMerges.has(entry.id) && action?.action === 'merge')
      )
        throw new Error(`Published island ${entry.id} is missing from the inventory.`)
      continue
    }
    const geometry = selectedGeometry(source, action)
    const emit =
      entry.decision === 'accepted' ||
      (canonicalMerges.has(entry.id) && action?.action === 'merge') ||
      (action?.action === 'geometry-correction' &&
        !action.reviewRequired &&
        polygon(geometry))
    if (
      !emit ||
      action?.reviewRequired ||
      ['exclude', 'reclassify', 'manual-review', 'no-geometry'].includes(
        action?.action ?? '',
      )
    )
      continue
    if (!geometry)
      throw new Error(`Published island ${entry.id} has no polygon geometry.`)
    result.push({ ...source, name: entry.name, zh: entry.zh ?? source.zh, geometry })
  }
  return result
}
