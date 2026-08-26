import { area, difference, featureCollection, union } from '@turf/turf'
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

export function deriveLiveableDistricts(
  censusDistricts: CensusDistrictCollection,
  nonLiveableFeatures: Array<Feature<DistrictGeometry>>,
) {
  const excludedLand = nonLiveableFeatures.length
    ? union(featureCollection(nonLiveableFeatures))
    : undefined

  return censusDistricts.features.flatMap(district => {
    const geometry = excludedLand
      ? difference(featureCollection([district, excludedLand]))
      : district
    return geometry ? [{ ...geometry, properties: district.properties }] : []
  })
}

let cachedLiveableDistricts: ReturnType<typeof deriveLiveableDistricts> | undefined

/** Reuse the cached derived geometry across transient map mounts. */
export function getUrbanDensityLiveableDistricts(
  nonLiveableFeatures: Array<Feature<DistrictGeometry>>,
) {
  cachedLiveableDistricts ??= deriveLiveableDistricts(
    urbanDensityCensusDistricts,
    nonLiveableFeatures,
  )
  return cachedLiveableDistricts
}

export function calculateLiveableMetrics(
  districts: ReturnType<typeof deriveLiveableDistricts>,
  populationByDistrict: Record<string, string>,
  landAreaByDistrict: Record<string, string>,
) {
  const totals = districts.reduce(
    (values, district) => {
      const { area: name, areaId, divisionCode } = district.properties
      const population = Number(populationByDistrict[divisionCode])
      const districtLandAreaSqKm = Number(landAreaByDistrict[divisionCode])
      if (!Number.isFinite(population) || !Number.isFinite(districtLandAreaSqKm))
        throw new Error(`Missing statistics for ${divisionCode}`)

      const total = values.get(areaId) ?? {
        name,
        population: 0,
        landAreaSqKm: 0,
        districtLandAreaSqKm: 0,
      }
      total.population += population
      total.landAreaSqKm += area(district) / 1_000_000
      total.districtLandAreaSqKm += districtLandAreaSqKm
      values.set(areaId, total)
      return values
    },
    new Map<
      string,
      {
        name: string
        population: number
        landAreaSqKm: number
        districtLandAreaSqKm: number
      }
    >(),
  )

  return [...totals.values()].map(total => ({
    ...total,
    peoplePerSqKm: total.population / total.landAreaSqKm,
    liveablePercentage: (total.landAreaSqKm / total.districtLandAreaSqKm) * 100,
  }))
}
