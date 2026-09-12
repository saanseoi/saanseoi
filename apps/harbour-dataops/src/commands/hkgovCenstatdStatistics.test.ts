import { describe, expect, test } from 'bun:test'

import {
  formatCompletedCenstatdStatisticReleases,
  formatSkippedCenstatdResource,
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
            resourceType: 'divisionStatistic',
          },
          {
            sourceVersion: '2023-H2',
            status: 'published',
            resourceType: 'divisionArea',
          },
          {
            sourceVersion: '2022',
            status: 'published',
            resourceType: 'division',
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
            resourceType: 'divisionArea',
          },
        ],
        '2023-H2',
        ['divisionArea'],
      ),
    ).toEqual(['divisionArea'])
  })

  test('uses one standard source-grid row when every requested resource is complete', async () => {
    const output = await formatCompletedCenstatdStatisticReleases(
      { environment: 'dev', remote: false },
      'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters',
    )

    expect(output).toHaveLength(1)
    expect(output[0]).toContain('SKIPPED: no updates')
    expect(output[0]).toContain('Permanent Living Quarters')
    expect(output[0]).not.toContain('published or superseded')
  })

  test('uses the source-grid renderer for a completed member of a partial release', async () => {
    const output = await formatSkippedCenstatdResource(
      'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters',
      'divisionArea',
    )

    expect(output).toContain('DivisionArea')
    expect(output).toContain('Permanent Living Quarters')
    expect(output).toContain('SKIPPED: no updates')
  })
})
