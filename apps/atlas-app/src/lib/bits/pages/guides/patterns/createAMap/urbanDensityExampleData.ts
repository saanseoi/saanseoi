type Division = {
  attributes: { divisionCode: string }
  relationships: {
    hierarchy: {
      data: Array<{
        id: string
        meta: { name: string; subType: string }
        type: string
      }>
    }
  }
}

type DivisionsResponse = { data: Division[] }

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

export const urbanDensityDivisionsResponse: DivisionsResponse = {
  data: Object.entries(areas).flatMap(([name, area]) =>
    area.codes.map(divisionCode => ({
      attributes: { divisionCode },
      relationships: {
        hierarchy: {
          data: [
            {
              type: 'divisions',
              id: area.id,
              meta: { subType: 'area', name },
            },
          ],
        },
      },
    })),
  ),
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
  const byDivisionCode = Object.fromEntries(
    response.data.flatMap(division => {
      const code = division.attributes.divisionCode
      const area = division.relationships.hierarchy.data.find(
        item => item.meta.subType === 'area',
      )

      return code && area ? [[code, { id: area.id, name: area.meta.name }]] : []
    }),
  )

  const totalsByArea = Object.entries(populationByDistrict).reduce(
    (totals, [divisionCode, population]) => {
      const area = byDivisionCode[divisionCode]
      if (!area) throw new Error(`No Area ancestor for ${divisionCode}`)

      const total = totals.get(area.id) ?? {
        name: area.name,
        population: 0,
        landAreaSqKm: 0,
      }
      total.population += Number(population)
      total.landAreaSqKm += Number(landAreaByDistrict[divisionCode] ?? 0)
      totals.set(area.id, total)
      return totals
    },
    new Map<string, { name: string; population: number; landAreaSqKm: number }>(),
  )

  return [...totalsByArea.values()].map(total => ({
    ...total,
    peoplePerSqKm: total.population / total.landAreaSqKm,
  }))
}

export const urbanDensityLiveableLandAreas = {
  'Hong Kong Island': 42.1,
  Kowloon: 37.6,
  'New Territories': 479.8,
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
