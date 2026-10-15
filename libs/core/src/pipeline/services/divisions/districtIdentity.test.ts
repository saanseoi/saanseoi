import { expect, test } from 'bun:test'

import { createHkgovCenstatdDistrictResolution } from './districtIdentity'

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

test('resolves C&SD DC to canonical district identities', () => {
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

  expect(resolution).toEqual({ districtCode: 'CW', divisionId: 'division-0' })
})

test('rejects an incomplete curated district bridge', () => {
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
  ).toThrow('Expected 18 curated C&SD district mappings; found 17.')
})
