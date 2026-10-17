import type { SaanseoiEstimatedAreas } from '../../../../../libs/core/src/pipeline/services/divisions/geographicReview'
import { mergeReviewEstimatedAreas } from '../../../../../libs/core/src/pipeline/services/divisions/reviewEstimatedAreaCuration'

export const CITY_BOUNDARY_REVISION = 'city-land-extents-2026-10-17'
export const KOWLOON_RURAL_REVISION = 'kowloon-exclude-rural-2026-10-17'
export const HONG_KONG_COLLINSON_GAP_REVISION =
  'hong-kong-exclude-collinson-gap-2026-10-17'
export const HONG_KONG_TAI_LONG_WAN_REVISION =
  'hong-kong-exclude-tai-long-wan-2026-10-17'
export const CITY_BOUNDARY_IDS = [
  '17009785-57fd-4e5b-af86-2d27352e4718',
  '7f99b544-4e68-4574-98d8-ca4de48a0607',
] as const

/** Apply the requested city revision without importing unrelated fixture drawings. */
export function revisedCityBoundaries(
  current: SaanseoiEstimatedAreas,
  seed: SaanseoiEstimatedAreas,
  ids: readonly string[] = CITY_BOUNDARY_IDS,
): SaanseoiEstimatedAreas {
  const features = ids
    .map(id => {
      const feature = seed.features.find(f => f.properties.divisionId === id)
      if (!feature) throw new Error(`Missing revised city boundary: ${id}`)
      return feature
    })
    .filter(feature => {
      const saved = current.features.find(
        f => f.properties.divisionId === feature.properties.divisionId,
      )
      return JSON.stringify(saved?.geometry) !== JSON.stringify(feature.geometry)
    })
  if (!features.length) return current
  return mergeReviewEstimatedAreas(current, {
    ...seed,
    features: structuredClone(features),
    withheld: [],
  })
}
