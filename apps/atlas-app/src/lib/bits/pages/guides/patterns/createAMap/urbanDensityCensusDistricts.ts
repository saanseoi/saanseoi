import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'

import cachedCensusDistricts from './urbanDensityCensusDistricts.json'

type CensusDistrictProperties = {
  area: string
  areaId: string
  divisionCode: string
}

export type DistrictGeometry = MultiPolygon | Polygon

export type CensusDistrictCollection = FeatureCollection<
  DistrictGeometry,
  CensusDistrictProperties
>

/**
 * Simplified 2021 land-clipped C&SD district boundaries for the guide preview.
 * Keeping this illustrative data in the client avoids a 15 MB Divisions API
 * response every time a short-lived preview map enters the viewport.
 */
export const urbanDensityCensusDistricts =
  cachedCensusDistricts as CensusDistrictCollection

export type DistrictLand = {
  excludedDistrictLand: Array<Feature<DistrictGeometry, CensusDistrictProperties>>
  liveableDistrictLand: Array<Feature<DistrictGeometry, CensusDistrictProperties>>
}
