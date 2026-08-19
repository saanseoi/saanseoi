import { describe, expect, test } from 'bun:test'

import { resolveCenstatdDistrictBridgeCohort } from './censtatdDistrictBridge.ts'

describe('C&SD statistic district bridge selection', () => {
  test('uses the release-specific census bridge for subdivided units', () => {
    const datasetCode =
      'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district'

    expect(resolveCenstatdDistrictBridgeCohort(datasetCode, '2016')).toBe('2016')
    expect(resolveCenstatdDistrictBridgeCohort(datasetCode, '2021')).toBe('2021')
  })

  test('uses the reviewed 2021 bridge for the other district datasets', () => {
    expect(
      resolveCenstatdDistrictBridgeCohort(
        'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
        '2024',
      ),
    ).toBe('2021')
    expect(
      resolveCenstatdDistrictBridgeCohort(
        'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district',
        '2023-H2',
      ),
    ).toBe('2021')
    expect(
      resolveCenstatdDistrictBridgeCohort(
        'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
        '2021',
      ),
    ).toBe('2021')
  })

  test('does not fabricate district IDs for unmatched statistical geographies', () => {
    expect(
      resolveCenstatdDistrictBridgeCohort(
        'ds-hk-hkgov-censtatd-division-statistic-new-towns',
        '2021',
      ),
    ).toBeNull()
    expect(
      resolveCenstatdDistrictBridgeCohort(
        'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-area-type',
        '2023-H2',
      ),
    ).toBeNull()
  })
})
