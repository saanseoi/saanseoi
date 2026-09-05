import { expect, test } from 'bun:test'

import {
  buildHkgovCenstatdDistrictStatisticHistoryRecord,
  createHkgovCenstatdDistrictResolution,
} from './divisionStatistics'

const districtCodes = [
  'CW',
  'EST',
  'ILD',
  'KLC',
  'KC',
  'KT',
  'NTH',
  'SK',
  'ST',
  'SSP',
  'STH',
  'TP',
  'TW',
  'TM',
  'WC',
  'WTS',
  'YTM',
  'YL',
] as const

test('resolves C&SD DC only while creating the history observation', () => {
  const resolutions = createHkgovCenstatdDistrictResolution(
    districtCodes.map((_, index) => ({
      canonicalId: `division-${index}`,
      externalCode: String(index + 1),
    })),
    districtCodes.map((districtCode, index) => ({
      canonicalId: `division-${index}`,
      externalCode: districtCode,
    })),
  )
  const sourceDistrictCode = 1
  const resolution = resolutions.get(sourceDistrictCode)
  if (!resolution) throw new Error('Expected C&SD source district code 1.')

  expect(
    buildHkgovCenstatdDistrictStatisticHistoryRecord(
      {
        districtCode: sourceDistrictCode,
        id: 'CENSTATD:DENSITY:1',
        landAreaSqKm: 1.5,
        midYearPopulation: 2_500,
        midYearPopulationDensityPerSqKm: 3,
        nameEn: 'Central and Western',
        nameZhHant: '中西區',
        referenceYear: '2022',
        sources: [{ dataset: 'hkgov-censtatd' }],
      },
      resolution,
    ),
  ).toMatchObject({
    districtCode: 'CW',
    divisionId: 'division-0',
    midYearPopulation: 2_500,
  })
})

test('rejects an incomplete reviewed district bridge', () => {
  expect(() =>
    createHkgovCenstatdDistrictResolution(
      districtCodes.slice(0, -1).map((_, index) => ({
        canonicalId: `division-${index}`,
        externalCode: String(index + 1),
      })),
      districtCodes.slice(0, -1).map((districtCode, index) => ({
        canonicalId: `division-${index}`,
        externalCode: districtCode,
      })),
    ),
  ).toThrow('Expected 18 reviewed C&SD district mappings; found 17.')
})
