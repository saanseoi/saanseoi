import { cleanEstimatedAreaGeometriesForLevel } from './geometryTools'
import type {
  ReviewInventory,
  SaanseoiEstimatedAreas,
} from '../../../../../libs/core/src/pipeline/services/divisions/geographicReview'

self.onmessage = async (
  event: MessageEvent<{ areas: SaanseoiEstimatedAreas; inventory: ReviewInventory }>,
) => {
  try {
    const response = await fetch('/__division-review/assets/coastline-land.geojson')
    if (!response.ok) throw Error('Coastline land data unavailable')
    const land = await response.json()
    const { areas, inventory } = event.data
    const features: SaanseoiEstimatedAreas['features'] = []
    for (const [index, feature] of areas.features.entries()) {
      self.postMessage({
        type: 'progress',
        completed: index,
        total: areas.features.length,
      })
      const result = cleanEstimatedAreaGeometriesForLevel(
        { ...areas, features: [feature] },
        inventory,
        land,
        null,
        undefined,
        undefined,
        new Set([feature.properties.divisionId]),
        true,
      )
      features.push(...result.estimatedAreas.features)
    }
    self.postMessage({ type: 'complete', features })
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
