import { expect, test } from 'bun:test'

import {
  calculateUrbanDensityMetrics,
  calculateUrbanDensityLiveableMetrics,
  urbanDensityDivisionsResponse,
  urbanDensityStatsResponses,
} from './urbanDensityExampleData.ts'

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
    landAreaSqKm: 37.35185709476874,
    liveablePercentage: 79.5736197161669,
    peoplePerSqKm: 60007.72583577688,
  })
})
