import { expect, test } from 'bun:test'
import { booleanValid } from '@turf/turf'

import {
  calculateUrbanDensityMetrics,
  calculateUrbanDensityLiveableMetrics,
  urbanDensityDivisionsResponse,
  urbanDensityStatsResponses,
} from './urbanDensityExampleData.ts'
import { urbanDensityCensusDistricts } from './urbanDensityCensusDistricts.ts'
import { decodeLandAnalysis } from './guideUrbanDensityLiveableMap.ts'

test('groups Kwai Tsing with the New Territories', () => {
  const kwaiTsing = urbanDensityDivisionsResponse.data.find(
    division => division.attributes.divisionCode === 'KC',
  )

  expect(kwaiTsing?.relationships.hierarchy.data).toContainEqual({
    type: 'divisions',
    id: '780c42b7-213b-5076-9d36-6ae0024e3bd3',
    meta: { subType: 'area', name: 'New Territories' },
  })

  const [population, landArea] = urbanDensityStatsResponses
  const metrics = calculateUrbanDensityMetrics(
    urbanDensityDivisionsResponse,
    population.values,
    landArea.values,
  )

  expect(metrics).toContainEqual({
    name: 'Kowloon',
    population: 2_241_400,
    landAreaSqKm: 46.94,
    peoplePerSqKm: 47_750.31955688113,
  })

  const liveableKowloon = calculateUrbanDensityLiveableMetrics().find(
    metric => metric.name === 'Kowloon',
  )
  expect(liveableKowloon).toMatchObject({
    landAreaSqKm: 28.984783689490598,
    liveablePercentage: 61.748580505945036,
    peoplePerSqKm: 77330.2303723141,
  })
})

test('ships the simplified land-clipped census districts used by the previews', () => {
  expect(urbanDensityCensusDistricts.features).toHaveLength(18)
  expect(
    urbanDensityCensusDistricts.features.map(
      feature => feature.properties.divisionCode,
    ),
  ).toContain('ILD')
  urbanDensityCensusDistricts.features.forEach(feature => {
    expect(booleanValid(feature)).toBeTrue()
  })
})

test('requires saved liveable and excluded District geometry', () => {
  const liveableDistrictLand = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { area: 'Kowloon', districtCode: 'KLC' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [114.18, 22.33],
              [114.19, 22.33],
              [114.19, 22.34],
              [114.18, 22.33],
            ],
          ],
        },
      },
    ],
  } as const

  expect(() => decodeLandAnalysis({ liveableDistrictLand })).toThrow(
    'Land-analysis JSON must include liveable and excluded District land.',
  )

  const land = decodeLandAnalysis({
    liveableDistrictLand,
    excludedDistrictLand: liveableDistrictLand,
  })

  expect(land.liveableDistrictLand[0]?.properties).toEqual({
    area: 'Kowloon',
    divisionCode: 'KLC',
  })
  expect(land.excludedDistrictLand[0]?.properties).toEqual({
    area: 'Kowloon',
    divisionCode: 'KLC',
  })
})
