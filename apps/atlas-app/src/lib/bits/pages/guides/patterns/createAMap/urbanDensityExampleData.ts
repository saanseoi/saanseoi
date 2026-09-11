import type { DivisionHierarchies } from '@repo/db'
import type { MultiPolygon, Polygon } from 'geojson'

import { urbanDensityCensusDistricts } from './urbanDensityCensusDistricts.ts'

type DivisionAttributes = {
  level: number
  class: 'district'
  category: 'administrative'
  hierarchies: DivisionHierarchies
  divisionCode: string
  i18n: { en: { name: string } }
}

type Division = {
  id: string
  attributes: DivisionAttributes
}

type IncludedDivision = {
  type: 'divisions'
  id: string
  attributes: {
    level: number
    class: 'sar' | 'area'
    category: 'administrative'
    hierarchies: DivisionHierarchies
    divisionCode?: string
    i18n: { en: { name: string } }
  }
}

type IncludedDivisionArea = {
  type: 'division-areas'
  id: string
  attributes: {
    divisionId: string
    divisionCode: string
    geometry: Polygon | MultiPolygon
  }
}

type IncludedResource = IncludedDivision | IncludedDivisionArea

type DivisionsResponse = { data: Division[]; included: IncludedResource[] }

const areas = {
  'Hong Kong Island': {
    codes: ['CW', 'WC', 'EST', 'STH'],
    id: '25cec859-44f3-5e1d-a72b-952f804e56ab',
  },
  Kowloon: {
    codes: ['YTM', 'SSP', 'KLC', 'WTS', 'KT'],
    id: '17009785-57fd-4e5b-af86-2d27352e4718',
  },
  'New Territories': {
    codes: ['KC', 'TW', 'TM', 'YL', 'NTH', 'TP', 'ST', 'SK', 'ILD'],
    id: '780c42b7-213b-5076-9d36-6ae0024e3bd3',
  },
} as const

const districtNameByCode = {
  CW: 'Central and Western District',
  WC: 'Wan Chai District',
  EST: 'Eastern District',
  STH: 'Southern District',
  YTM: 'Yau Tsim Mong District',
  SSP: 'Sham Shui Po District',
  KLC: 'Kowloon City District',
  WTS: 'Wong Tai Sin District',
  KT: 'Kwun Tong District',
  KC: 'Kwai Tsing District',
  KTS: 'Kwai Tsing District',
  TW: 'Tsuen Wan District',
  TM: 'Tuen Mun District',
  YL: 'Yuen Long District',
  NTH: 'North District',
  TP: 'Tai Po District',
  ST: 'Sha Tin District',
  SK: 'Sai Kung District',
  ILD: 'Islands District',
} as const

const hongKongId = 'b4f09a9f-4cba-4a7c-bf58-2e63bc2e913d'

export const urbanDensityDivisionsResponse: DivisionsResponse = {
  data: Object.entries(areas).flatMap(([name, area]) =>
    area.codes.map(divisionCode => ({
      id: `${area.id}-${divisionCode}`,
      attributes: {
        level: 2,
        class: 'district',
        category: 'administrative',
        hierarchies: {
          administrative: [
            [
              { id: hongKongId, name: 'Hong Kong SAR', class: 'sar' },
              { id: area.id, name, class: 'area' },
            ],
          ],
          locality: [],
          full: [
            [
              { id: hongKongId, name: 'Hong Kong SAR', class: 'sar' },
              { id: area.id, name, class: 'area' },
            ],
          ],
        },
        divisionCode,
        i18n: { en: { name: districtNameByCode[divisionCode] } },
      },
    })),
  ),
  included: [
    {
      type: 'divisions',
      id: hongKongId,
      attributes: {
        level: 0,
        class: 'sar',
        category: 'administrative',
        hierarchies: { administrative: [], locality: [], full: [] },
        i18n: { en: { name: 'Hong Kong' } },
      },
    },
    ...Object.entries(areas).map(([name, area]) => ({
      type: 'divisions' as const,
      id: area.id,
      attributes: {
        level: 1,
        class: 'area' as const,
        category: 'administrative' as const,
        hierarchies: {
          administrative: [[{ id: hongKongId, name: 'Hong Kong SAR', class: 'sar' }]],
          locality: [],
          full: [[{ id: hongKongId, name: 'Hong Kong SAR', class: 'sar' }]],
        },
        divisionCode:
          name === 'Hong Kong Island' ? 'HK' : name === 'Kowloon' ? 'KL' : 'NT',
        i18n: { en: { name } },
      },
    })),
    ...Object.entries(areas).flatMap(([, area]) =>
      area.codes.map(divisionCode => {
        const feature = urbanDensityCensusDistricts.features.find(
          item =>
            item.properties.divisionCode === divisionCode ||
            (divisionCode === 'KC' && item.properties.divisionCode === 'KTS'),
        )

        if (!feature) throw new Error(`No preview geometry for ${divisionCode}`)

        const divisionId = `${area.id}-${divisionCode}`
        return {
          type: 'division-areas' as const,
          id: `${divisionId}-geometry`,
          attributes: {
            divisionId,
            divisionCode,
            geometry: feature.geometry,
          },
        }
      }),
    ),
  ],
}

export const urbanDensityStatsResponses = [
  {
    field: 'populationMidYear',
    values: {
      CW: '232200',
      WC: '164200',
      EST: '519200',
      STH: '262400',
      YTM: '304100',
      SSP: '439700',
      KLC: '418600',
      WTS: '410600',
      KT: '668400',
      KC: '500600',
      TW: '310000',
      TM: '540000',
      YL: '676800',
      NTH: '342600',
      TP: '331100',
      ST: '703800',
      SK: '501100',
      ILD: '197800',
    },
  },
  {
    field: 'landArea',
    values: {
      CW: '12.55',
      WC: '10.56',
      EST: '17.99',
      STH: '38.84',
      YTM: '6.99',
      SSP: '9.36',
      KLC: '10.01',
      WTS: '9.3',
      KT: '11.28',
      KC: '23.34',
      TW: '61.92',
      TM: '85.85',
      YL: '138.48',
      NTH: '136.46',
      TP: '136.13',
      ST: '68.72',
      SK: '129.68',
      ILD: '182.29',
    },
  },
] as const

export function calculateUrbanDensityMetrics(
  response: DivisionsResponse,
  populationByDistrict: Record<string, string>,
  landAreaByDistrict: Record<string, string>,
) {
  const districts = response.data.map(division => {
    const code = division.attributes.divisionCode
    const area = division.attributes.hierarchies.administrative
      .flat()
      .find(item => item.class === 'area')

    if (!area) throw new Error(`No Area ancestor for ${code}`)
    return {
      code,
      area: area.name!,
      population: Number(populationByDistrict[code]),
      landAreaSqKm: Number(landAreaByDistrict[code]),
    }
  })

  const totalsByArea = districts.reduce((totals, district) => {
    const total = totals.get(district.area) ?? {
      name: district.area,
      population: 0,
      landAreaSqKm: 0,
    }
    total.population += district.population
    total.landAreaSqKm += district.landAreaSqKm
    totals.set(district.area, total)
    return totals
  }, new Map<string, { name: string; population: number; landAreaSqKm: number }>())

  return [...totalsByArea.values()]
    .map(total => ({
      ...total,
      peoplePerSqKm: total.population / total.landAreaSqKm,
    }))
    .sort((first, second) => first.name.localeCompare(second.name))
}

export const urbanDensityLiveableLandAreas = {
  'Hong Kong Island': 23.785863281767654,
  Kowloon: 28.984783689490598,
  'New Territories': 195.20912462313322,
} as const

export const calculateUrbanDensityLiveableMetrics = () => {
  const [populationResponse] = urbanDensityStatsResponses
  const baselineMetrics = calculateUrbanDensityMetrics(
    urbanDensityDivisionsResponse,
    populationResponse.values,
    urbanDensityStatsResponses[1].values,
  )

  return baselineMetrics.map(metric => ({
    ...metric,
    districtLandAreaSqKm: metric.landAreaSqKm,
    landAreaSqKm:
      urbanDensityLiveableLandAreas[
        metric.name as keyof typeof urbanDensityLiveableLandAreas
      ],
    liveablePercentage:
      (urbanDensityLiveableLandAreas[
        metric.name as keyof typeof urbanDensityLiveableLandAreas
      ] /
        metric.landAreaSqKm) *
      100,
    peoplePerSqKm:
      metric.population /
      urbanDensityLiveableLandAreas[
        metric.name as keyof typeof urbanDensityLiveableLandAreas
      ],
  }))
}
