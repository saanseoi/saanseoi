import { cleanEstimatedAreaGeometriesForLevel } from './geometryTools'
import type {
  ReviewInventory,
  ReviewArea,
  SaanseoiEstimatedAreas,
} from '../../../../../libs/core/src/pipeline/services/divisions/geographicReview'
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson'

/** Clip islands independently: a tied island must not acquire a neighbour's land. */
export function cleanIslandGeometries(
  estimatedAreas: SaanseoiEstimatedAreas,
  inventory: ReviewInventory,
  references: ReviewArea[],
  land: FeatureCollection<Polygon | MultiPolygon, Record<string, unknown>>,
  selectedIds: ReadonlySet<string>,
) {
  let result = structuredClone(estimatedAreas)
  let count = 0
  for (const division of inventory.divisions.filter(
    d =>
      selectedIds.has(d.id) &&
      ['major_island', 'minor_island', 'islet'].includes(d.class),
  )) {
    const source =
      result.features.find(f => f.properties.divisionId === division.id) ??
      references.find(f => f.properties.divisionId === division.id)
    if (!source)
      throw Error(`No polygon available for ${division.id}; draw an outline first.`)
    const feature = {
      ...structuredClone(source),
      id: `saanseoi:${division.id}`,
      properties: { ...source.properties, variant: 'saanseoi' as const },
    }
    const working = {
      ...result,
      features: [
        ...result.features.filter(f => f.properties.divisionId !== division.id),
        feature,
      ],
    }
    // Reuse the proven single-polygon coastline operation, without changing the island's classification.
    const workInventory = { ...inventory, divisions: [{ ...division, level: 3 }] }
    result = cleanEstimatedAreaGeometriesForLevel(
      working,
      workInventory,
      land,
      3,
      undefined,
      undefined,
      new Set([division.id]),
    ).estimatedAreas
    const clipped = result.features.find(f => f.properties.divisionId === division.id)!
    delete clipped.properties.geometryCleanupLevel
    count++
  }
  return { estimatedAreas: result, count }
}
