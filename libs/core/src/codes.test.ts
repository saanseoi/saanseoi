import { describe, expect, test } from 'bun:test'

import {
  buildDatasetCode,
  buildDatasetReleaseCode,
  datasetVariantForSource,
  isDatasetReleaseCode,
  publisherCodeForSource,
  resourceTypeCodeSlug,
} from './codes'

describe('registry code construction', () => {
  test('converts camelCase resource enums to lowercase kebab-case slugs', () => {
    expect(resourceTypeCodeSlug('divisionArea')).toBe('division-area')
    expect(resourceTypeCodeSlug('divisionBoundary')).toBe('division-boundary')
    expect(resourceTypeCodeSlug('divisionStatistic')).toBe('division-statistic')
  })

  test('uses exact publisher, region, resource, and product segments', () => {
    expect(buildDatasetCode('hk', 'hkgov-had', 'divisionArea')).toBe(
      'ds-hk-hkgov-had-division-area-district',
    )
    expect(buildDatasetCode('hk', 'hkgov-censtatd', 'divisionArea')).toBe(
      'ds-hk-hkgov-censtatd-division-area-district',
    )
    expect(buildDatasetCode('hk', 'hkgov-pland-pu', 'division')).toBe(
      'ds-hk-hkgov-pland-division-pu',
    )
    expect(buildDatasetCode('hk', 'hkgov-pland-new-town', 'divisionArea')).toBe(
      'ds-hk-hkgov-pland-division-new-town',
    )
  })

  test('uses the same ordered segments for release codes', () => {
    expect(buildDatasetReleaseCode('hk', 'hkgov-had', '2022', 'divisionArea')).toBe(
      'dr-hk-hkgov-had-division-area-district-2022',
    )
    expect(
      buildDatasetReleaseCode('hk', 'hkgov-censtatd', '2021', 'divisionArea'),
    ).toBe('dr-hk-hkgov-censtatd-division-area-district-2021')
    expect(buildDatasetReleaseCode('hk', 'hkgov-pland-pu', '2006', 'division')).toBe(
      'dr-hk-hkgov-pland-division-pu-2006',
    )
  })

  test('recognises canonical release codes with dotted source versions', () => {
    expect(isDatasetReleaseCode('dr-hk-overture-division-2025-09-24.0')).toBeTrue()
    expect(
      isDatasetReleaseCode('dr-hk-hkgov-censtatd-division-area-district-2021'),
    ).toBeTrue()
    expect(isDatasetReleaseCode('dr-hk-overture-division-2025-09-24.')).toBeFalse()
    expect(isDatasetReleaseCode('dr-hk-overture-division-2025/09/24.0')).toBeFalse()
  })

  test('maps both Planning Department variants to their publisher code', () => {
    expect(publisherCodeForSource('hkgov-pland-pu')).toBe('hkgov-pland')
    expect(publisherCodeForSource('hkgov-pland-new-town')).toBe('hkgov-pland')
    expect(publisherCodeForSource('hkgov-censtatd-area')).toBe('hkgov-censtatd')
    expect(publisherCodeForSource('hkgov-censtatd-hma')).toBe('hkgov-censtatd')
  })

  test('derives variants from structured source metadata', () => {
    expect(
      datasetVariantForSource('division', 'hkgov-pland', {
        datasetCode: 'ds-hk-hkgov-pland-division-pu',
      }),
    ).toBe('hkgov-pland-pu')
    expect(
      datasetVariantForSource('divisionArea', 'hkgov-pland', {
        datasetCode: 'ds-hk-hkgov-pland-division-area-new-town',
      }),
    ).toBe('hkgov-pland-new-town')
    expect(datasetVariantForSource('division', 'hkgov-pland-new-town')).toBe(
      'hkgov-pland-new-town',
    )
    expect(datasetVariantForSource('address', 'hkgov-dpo')).toBe('default')
    expect(
      datasetVariantForSource('divisionStatistic', 'hkgov-censtatd', {
        datasetCode:
          'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
      }),
    ).toBe('ds-hk-hkgov-censtatd-division-statistic-population-households-district')
    expect(
      datasetVariantForSource('divisionArea', 'hkgov-censtatd', {
        cohortKey: '2016',
        sourceVersion: '2016',
      }),
    ).toBe('hkgov-censtatd:2016')
    expect(
      datasetVariantForSource('divisionArea', 'hkgov-censtatd', {
        cohortKey: '2016',
        sourceVersion: '2016',
        transform: 'simplified',
      }),
    ).toBe('hkgov-censtatd:2016:simplified')
    expect(
      datasetVariantForSource('divisionArea', 'hkgov-censtatd', {
        cohortKey: '2021',
        sourceVersion: '2021',
        transform: 'simplified',
      }),
    ).toBe('hkgov-censtatd:2021:simplified')
    expect(
      datasetVariantForSource('divisionArea', 'hkgov-censtatd', {
        cohortKey: '2021',
        sourceVariant: 'census',
      }),
    ).toBe('hkgov-censtatd:2021')
    expect(
      datasetVariantForSource('divisionArea', 'hkgov-censtatd', {
        cohortKey: '2021',
        sourceVariant: 'hkgov-censtatd-hma',
      }),
    ).toBe('hkgov-censtatd-hma')
  })

  test('rejects non-canonical owned code segments', () => {
    expect(() => buildDatasetCode('HK', 'overture', 'division')).toThrow(
      'Invalid region code slug="HK".',
    )
    expect(() => buildDatasetCode('hk', 'hkgovHad', 'divisionArea')).toThrow(
      'Invalid publisher code slug="hkgovHad".',
    )
  })
})
