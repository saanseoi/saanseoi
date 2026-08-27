import { describe, expect, test } from 'bun:test'

import {
  isCenstatdDistrictGeometryDataset,
  pendingCenstatdStatisticResourceTypes,
} from './hkgovCenstatdStatistics.ts'

describe('C&SD statistics ingestion idempotency', () => {
  test('uses the district parser for both the census and renamed annual datasets', () => {
    expect(
      isCenstatdDistrictGeometryDataset(
        'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district',
      ),
    ).toBe(true)
    expect(
      isCenstatdDistrictGeometryDataset(
        'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
      ),
    ).toBe(true)
  })

  test('skips only resource types already published for the requested source version', () => {
    expect(
      pendingCenstatdStatisticResourceTypes(
        [
          {
            sourceVersion: '2023-H2',
            status: 'published',
            type: 'divisionStatistic',
          },
          {
            sourceVersion: '2023-H2',
            status: 'published',
            type: 'divisionArea',
          },
          {
            sourceVersion: '2022',
            status: 'published',
            type: 'division',
          },
        ],
        '2023-H2',
        ['divisionStatistic', 'division', 'divisionArea'],
      ),
    ).toEqual(['division'])
  })

  test('does not treat a superseded resource as published', () => {
    expect(
      pendingCenstatdStatisticResourceTypes(
        [
          {
            sourceVersion: '2023-H2',
            status: 'superseded',
            type: 'divisionArea',
          },
        ],
        '2023-H2',
        ['divisionArea'],
      ),
    ).toEqual(['divisionArea'])
  })
})
