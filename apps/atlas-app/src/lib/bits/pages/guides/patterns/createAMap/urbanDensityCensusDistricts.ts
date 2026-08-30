import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'

import cachedCensusDistricts from './urbanDensityCensusDistricts.json'

type CensusDistrictProperties = {
  area: string
  areaId: string
  divisionCode: string
}

export type DistrictLandProperties = Pick<
  CensusDistrictProperties,
  'area' | 'divisionCode'
>

export const districtNameByCode: Record<string, string> = {
  CW: 'Central and Western',
  WC: 'Wan Chai',
  EST: 'Eastern',
  STH: 'Southern',
  YTM: 'Yau Tsim Mong',
  SSP: 'Sham Shui Po',
  KLC: 'Kowloon City',
  WTS: 'Wong Tai Sin',
  KT: 'Kwun Tong',
  KC: 'Kwai Tsing',
  KTS: 'Kwai Tsing',
  TW: 'Tsuen Wan',
  TM: 'Tuen Mun',
  YL: 'Yuen Long',
  NTH: 'North',
  TP: 'Tai Po',
  ST: 'Sha Tin',
  SK: 'Sai Kung',
  ILD: 'Islands',
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
  excludedDistrictLand: Array<Feature<DistrictGeometry, DistrictLandProperties>>
  liveableDistrictLand: Array<Feature<DistrictGeometry, DistrictLandProperties>>
}
