import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { bbox, booleanValid } from '@turf/turf'
import type { Feature } from 'geojson'

import {
  calculateUrbanDensityMetrics,
  calculateUrbanDensityLiveableMetrics,
  urbanDensityDivisionsResponse,
  urbanDensityStatsResponses,
} from './urbanDensityExampleData.ts'
import { urbanDensityCensusDistricts } from './urbanDensityCensusDistricts.ts'

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
    landAreaSqKm: 28.94632692899873,
    liveablePercentage: 61.66665302300539,
    peoplePerSqKm: 77432.96776471291,
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

test('includes the excluded western Lantau geometry', async () => {
  const cache = JSON.parse(
    await readFile(
      resolve(
        import.meta.dir,
        '../../../../../../../static/guides/urban-density-excluded-districts.geojson',
      ),
      'utf8',
    ),
  ) as { features: Array<Feature> }
  const islands = cache.features.find(
    feature => feature.properties?.divisionCode === 'ILD',
  )

  expect(islands).toBeDefined()
  if (!islands) throw new Error('Missing Islands District exclusion geometry')
  expect(bbox(islands)[0]).toBeLessThan(113.84)
})
