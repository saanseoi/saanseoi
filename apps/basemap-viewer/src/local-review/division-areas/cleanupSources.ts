import { adoptCurrentGeometryBaseline } from './geometryBaseline'
import type { Polygon, MultiPolygon } from 'geojson'
import type {
  ReviewArea,
  ReviewInventory,
  SaanseoiEstimatedAreas,
} from '../../../../../libs/core/src/pipeline/services/divisions/geographicReview'
import { TOWN_GEOMETRY_CLEANUP_VERSION, type CleanupLevel } from './geometryTools'

/** Prefer a verified retained original; otherwise use the saved drawing itself. */
export function restoreUnsimplifiedCleanupSources(
  estimatedAreas: SaanseoiEstimatedAreas,
  inventory: ReviewInventory,
  _sources: ReviewArea[],
  level: CleanupLevel,
): SaanseoiEstimatedAreas {
  const divisions = new Map(inventory.divisions.map(d => [d.id, d]))
  return {
    ...estimatedAreas,
    features: estimatedAreas.features.map(feature => {
      const division = divisions.get(feature.properties.divisionId)
      if (
        division?.level !== level ||
        !feature.properties.geometryCleanup ||
        feature.properties.geometryCleanup === TOWN_GEOMETRY_CLEANUP_VERSION
      )
        return feature
      // A hand-drawn area has no publisher source ID. Prefer its own retained input.
      const original = feature.properties.geometryOriginalDrawing as
        | Polygon
        | MultiPolygon
        | undefined
      const current = feature.properties.geometrySimplification
        ? feature.properties.geometrySimplificationResult ===
          JSON.stringify(feature.geometry)
          ? feature.properties.geometryUnsimplifiedSource
          : undefined
        : feature.geometry
      if (
        original &&
        current &&
        feature.properties.geometryCleanupResult === JSON.stringify(current)
      ) {
        const properties = Object.fromEntries(
          Object.entries(feature.properties).filter(
            ([key]) =>
              !key.startsWith('geometryCleanup') &&
              !key.startsWith('geometrySimplification') &&
              key !== 'geometryUnsimplifiedSource',
          ),
        )
        return {
          ...feature,
          geometry: structuredClone(original),
          properties: {
            ...properties,
            divisionId: division.id,
            variant: feature.properties.variant,
          },
        }
      }
      return adoptCurrentGeometryBaseline(feature)
    }),
  }
}
