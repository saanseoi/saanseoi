import { describe, expect, test } from 'bun:test'

import {
  createHkgovCenstatdNewTownResolution,
  resolveCenstatdDistrictBridgeCohort,
  resolveCenstatdNewTownBridgeCohort,
} from './censtatdDistrictBridge.ts'

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

  test('uses the reviewed 2021 New Town bridge only for the archived census cohort', () => {
    expect(
      resolveCenstatdNewTownBridgeCohort(
        'ds-hk-hkgov-censtatd-division-statistic-new-towns',
        '2021',
      ),
    ).toBe('2021')
    expect(() =>
      resolveCenstatdNewTownBridgeCohort(
        'ds-hk-hkgov-censtatd-division-statistic-new-towns',
        '2026',
      ),
    ).toThrow('has no reviewed New Town bridge')
    expect(
      resolveCenstatdDistrictBridgeCohort(
        'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-area-type',
        '2023-H2',
      ),
    ).toBeNull()
  })

  test('resolves all reviewed C&SD New Town codes without name matching', () => {
    const codes = [
      '13',
      '27',
      '28',
      '15',
      '17',
      '18',
      '20',
      '22',
      '24',
      '25',
      '11',
      '30',
      '32',
    ]
    const resolved = createHkgovCenstatdNewTownResolution(
      codes.map(code => ({
        canonicalId: `planning-${code}`,
        externalId: code,
      })),
      '2021',
    )

    expect(resolved.get('30')).toEqual({ divisionId: 'planning-30', newTownCode: '30' })
    expect(resolved).toHaveLength(13)
  })

  test('rejects incomplete or duplicate reviewed New Town mappings', () => {
    expect(() => createHkgovCenstatdNewTownResolution([], '2021')).toThrow(
      'Expected 13 reviewed C&SD New Town mappings',
    )
    const codes = [
      '13',
      '27',
      '28',
      '15',
      '17',
      '18',
      '20',
      '22',
      '24',
      '25',
      '11',
      '30',
      '32',
    ]
    expect(() =>
      createHkgovCenstatdNewTownResolution(
        [...codes, '30'].map(code => ({
          canonicalId: `planning-${code}`,
          externalId: code,
        })),
        '2021',
      ),
    ).toThrow('Duplicate C&SD New Town code=30')
  })
})
