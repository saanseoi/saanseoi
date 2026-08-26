import { PUBLIC_ATLAS_API_BASE_URL } from '$app/env/public'
import { area, difference, featureCollection, union } from '@turf/turf'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'

type CensusDistrictProperties = {
  area: string
  areaId: string
  divisionCode: string
}

type DivisionResource = {
  attributes?: { divisionCode?: unknown }
  id?: unknown
  relationships?: {
    hierarchy?: {
      data?: Array<{
        id?: unknown
        meta?: { name?: unknown; subType?: unknown }
      }>
    }
  }
}

type DivisionAreaResource = {
  attributes?: {
    divisionId?: unknown
    geometry?: unknown
    isLand?: unknown
  }
  type?: unknown
}

type DivisionResponse = {
  data?: DivisionResource[]
  included?: DivisionAreaResource[]
}

export type DistrictGeometry = MultiPolygon | Polygon

export type CensusDistrictCollection = FeatureCollection<
  DistrictGeometry,
  CensusDistrictProperties
>

const atlasApiBaseUrl = () =>
  (
    PUBLIC_ATLAS_API_BASE_URL ||
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1'
      ? 'http://localhost:8787'
      : 'https://api.saanseoi.hk')
  ).replace(/\/+$/, '')

const isGeometry = (value: unknown): value is DistrictGeometry =>
  value !== null &&
  typeof value === 'object' &&
  'type' in value &&
  (value.type === 'Polygon' || value.type === 'MultiPolygon') &&
  'coordinates' in value

export async function loadCensusDistricts(
  fetcher: typeof fetch = fetch,
): Promise<CensusDistrictCollection> {
  const url = new URL('/divisions/v0', atlasApiBaseUrl())
  url.searchParams.set('filter[level]', '2')
  url.searchParams.set('include', 'hierarchy,areas:hkgov-censtatd:2021')

  const response = await fetcher(url)
  if (!response.ok)
    throw new Error(`Census divisions request failed: ${response.status}`)

  const body = (await response.json()) as DivisionResponse
  const geometryByDivisionId = Object.fromEntries(
    (body.included ?? []).flatMap(item => {
      const attributes = item.type === 'division-areas' ? item.attributes : undefined
      return attributes?.isLand &&
        typeof attributes.divisionId === 'string' &&
        isGeometry(attributes.geometry)
        ? [[attributes.divisionId, attributes.geometry]]
        : []
    }),
  )

  const features: Array<Feature<DistrictGeometry, CensusDistrictProperties>> = []
  for (const division of body.data ?? []) {
    const divisionCode = division.attributes?.divisionCode
    const area = division.relationships?.hierarchy?.data?.find(
      item => item.meta?.subType === 'area',
    )
    const areaName = area?.meta?.name
    const areaId = area?.id
    const geometry =
      typeof division.id === 'string' ? geometryByDivisionId[division.id] : undefined

    if (
      typeof divisionCode === 'string' &&
      typeof areaName === 'string' &&
      typeof areaId === 'string' &&
      geometry
    ) {
      features.push({
        type: 'Feature',
        properties: { divisionCode, area: areaName, areaId },
        geometry,
      })
    }
  }

  return { type: 'FeatureCollection', features }
}

async function getDistrictField(fetcher: typeof fetch, field: string) {
  const url = new URL('/stats/v0.1/geographies', atlasApiBaseUrl())
  url.searchParams.set('cohort', '2024')
  url.searchParams.set(
    'filter[dataset]',
    'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
  )
  url.searchParams.set('filter[field]', field)
  url.searchParams.set('filter[referencePeriod]', '2024')

  const response = await fetcher(url)
  if (!response.ok) throw new Error(`Statistics request failed: ${response.status}`)

  const body = (await response.json()) as { values?: Record<string, unknown> }
  return Object.fromEntries(
    Object.entries(body.values ?? []).flatMap(([code, value]) =>
      typeof value === 'string' ? [[code, value]] : [],
    ),
  )
}

export async function loadUrbanDensityData(fetcher: typeof fetch = fetch) {
  const [censusDistricts, populationByDistrict, landAreaByDistrict] = await Promise.all(
    [
      loadCensusDistricts(fetcher),
      getDistrictField(fetcher, 'populationMidYear'),
      getDistrictField(fetcher, 'landArea'),
    ],
  )

  return { censusDistricts, populationByDistrict, landAreaByDistrict }
}

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
