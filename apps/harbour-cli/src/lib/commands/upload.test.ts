import { describe, expect, mock, test } from 'bun:test'

import {
  assertAddressUploadPrerequisites,
  assertDivisionGeometryUploadPrerequisites,
  censtatdDistrictDatasetCode,
  formatAddressApiReleaseSetReadiness,
  formatDivisionApiReleaseSetReadiness,
  parseDivisionReleaseSetCohortKey,
  rainbowWaveText,
} from './upload.ts'

describe('upload command address prerequisites', () => {
  test('checks remote address prerequisites without refreshing the local D1 cache', async () => {
    const resolveRemotePublishedDivisionSnapshotMock = mock(async () => ({
      snapshotId: 'snapshot-dr-hk-overture-division-2025-09-24.0',
    }))

    await assertAddressUploadPrerequisites(
      {
        environment: 'preview',
        remote: true,
      },
      {
        cohortKey: '2025-09-24.0',
        datasetCode: 'ds-hk-hkgov-dpo-address',
        datasetId: 'dataset-hkgov-dpo-hk-address',
        filePath: '/tmp/address.parquet',
        fileName: 'address.parquet',
        inferredFrom: {
          cohortKey: 'path',
          regionCode: 'path',
          source: 'path',
          sourceVersion: 'cohortKey',
          theme: 'path',
          type: 'path',
        },
        originalFileName: 'address.parquet',
        regionCode: 'hk',
        releaseCode: 'dr-hk-hkgov-dpo-address-2025-09-24.0',
        rowCount: 182_155,
        schemaFingerprint: 'schema-fingerprint',
        source: 'hkgov-dpo',
        sourceVersion: '2025-09-24.0',
        supersedesDatasetId: null,
        theme: 'addresses',
        type: 'address',
      },
      {
        divisionCohortKey: '2025-09-10.0',
        resolveRemotePublishedDivisionSnapshot:
          resolveRemotePublishedDivisionSnapshotMock,
      },
    )

    expect(resolveRemotePublishedDivisionSnapshotMock).toHaveBeenCalledWith(
      {
        environment: 'preview',
        remote: true,
      },
      expect.objectContaining({
        cohortKey: '2025-09-10.0',
        regionCode: 'hk',
        type: 'address',
      }),
    )
  })
})

describe('division geometry upload prerequisites', () => {
  test('allows C&SD district areas with their reviewed district bridge', async () => {
    await expect(
      assertDivisionGeometryUploadPrerequisites(
        { environment: 'dev', remote: false },
        {
          cohortKey: '2016',
          datasetCode: 'ds-hk-hkgov-censtatd-division-area-district',
          datasetId: 'dataset-hkgov-censtatd-hk-division-area-district',
          fileName: 'district-council-districts-2016.gml',
          filePath: '/tmp/district-council-districts-2016.gml',
          inferredFrom: {
            cohortKey: 'path',
            regionCode: 'path',
            source: 'path',
            sourceVersion: 'cohortKey',
            theme: 'path',
            type: 'path',
          },
          originalFileName: 'district-council-districts-2016.gml',
          regionCode: 'hk',
          releaseCode: 'dr-hk-hkgov-censtatd-division-area-district-2016',
          rowCount: 18,
          schemaFingerprint: 'schema-fingerprint',
          source: 'hkgov-censtatd',
          sourceVersion: '2016',
          supersedesDatasetId: null,
          theme: 'divisions',
          type: 'divisionArea',
        },
      ),
    ).resolves.toBeUndefined()
  })
})

describe('C&SD District Council GML preparation', () => {
  test('retains the annual population-and-households dataset selection', () => {
    expect(
      censtatdDistrictDatasetCode(
        'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
      ),
    ).toBe('ds-hk-hkgov-censtatd-division-statistic-population-households-district')
  })
})

describe('division API release set readiness display', () => {
  test('resolves the cohort from an initial variant API release-set code', () => {
    expect(
      parseDivisionReleaseSetCohortKey('data-hk-divisions-2025-09-24.0--overture'),
    ).toBe('2025-09-24.0')
  })

  test('renders a release set code as a rainbow wave', () => {
    expect(rainbowWaveText('set')).toBe(
      '\u001B[38;5;196ms\u001B[38;5;202me\u001B[38;5;226mt\u001B[39m',
    )
  })

  test('reports an Overture area as unavailable when only the HAD area is present', () => {
    expect(
      formatDivisionApiReleaseSetReadiness(
        {
          cohortKey: '2025-09-24.0',
          regionCode: 'hk',
        },
        {
          areaAvailable: false,
          boundaryAvailable: false,
          cohortIndependentReleases: [
            {
              cohortKey: '2022',
              datasetCode: 'ds-hk-hkgov-had-division-area-district',
              optional: false,
              releaseCode: 'dr-hk-hkgov-had-division-area-district-2022',
              resourceType: 'divisionArea',
              variant: 'hkgov-had',
            },
            {
              cohortKey: '2016',
              datasetCode: 'ds-hk-hkgov-censtatd-division-area-district',
              optional: true,
              releaseCode: 'dr-hk-hkgov-censtatd-division-area-district-2016',
              resourceType: 'divisionArea',
              variant: 'hkgov-censtatd-landclipped',
            },
            {
              cohortKey: '2021',
              datasetCode: 'ds-hk-hkgov-censtatd-division-area-district',
              optional: true,
              releaseCode: 'dr-hk-hkgov-censtatd-division-area-district-2021',
              resourceType: 'divisionArea',
              variant: 'hkgov-censtatd-landclipped',
            },
            {
              cohortKey: null,
              datasetCode:
                'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters',
              optional: false,
              releaseCode: null,
              resourceType: 'divisionArea',
              variant: 'hkgov-censtatd',
            },
          ],
          divisionAvailable: true,
          ready: false,
        },
      ),
    ).toBe(
      [
        '# EXACT REF',
        'HK / overture / 2025-09-24.0',
        '  \u001B[32m✓\u001B[39m \u001B[32mdivision        \u001B[39m  \u001B[32mavailable\u001B[39m',
        '  \u001B[31m○\u001B[39m \u001B[32mdivisionArea    \u001B[39m  \u001B[31munavailable\u001B[39m',
        '  \u001B[31m○\u001B[39m \u001B[32mdivisionBoundary\u001B[39m  \u001B[31munavailable\u001B[39m',
        '',
        '# AT OR BEFORE',
        'HK / hkgov-had / 2022',
        '  \u001B[32m✓\u001B[39m \u001B[32mdivisionArea\u001B[39m  \u001B[32mavailable\u001B[39m',
        'HK / hkgov-censtatd-landclipped / 2016',
        '  \u001B[32m✓\u001B[39m \u001B[32mdivisionArea\u001B[39m  \u001B[32mavailable\u001B[39m',
        'HK / hkgov-censtatd-landclipped / 2021',
        '  \u001B[32m✓\u001B[39m \u001B[32mdivisionArea\u001B[39m  \u001B[32mavailable\u001B[39m',
        'HK / hkgov-censtatd',
        '  \u001B[31m○\u001B[39m \u001B[32mdivisionArea\u001B[39m  \u001B[31munavailable\u001B[39m',
      ].join('\n'),
    )
  })

  test('reports the selected release-set cohort and provider release as available', () => {
    expect(
      formatDivisionApiReleaseSetReadiness(
        {
          cohortKey: '2025-09-24.0',
          regionCode: 'hk',
        },
        {
          areaAvailable: true,
          boundaryAvailable: true,
          cohortIndependentReleases: [
            {
              cohortKey: '2022',
              datasetCode: 'ds-hk-hkgov-had-division-area-district',
              optional: false,
              releaseCode: 'dr-hk-hkgov-had-division-area-district-2022',
              resourceType: 'divisionArea',
              variant: 'hkgov-had',
            },
          ],
          divisionAvailable: true,
          ready: true,
        },
      ),
    ).toBe(
      [
        '# EXACT REF',
        'HK / overture / 2025-09-24.0',
        '  \u001B[32m✓\u001B[39m \u001B[32mdivision        \u001B[39m  \u001B[32mavailable\u001B[39m',
        '  \u001B[32m✓\u001B[39m \u001B[32mdivisionArea    \u001B[39m  \u001B[32mavailable\u001B[39m',
        '  \u001B[32m✓\u001B[39m \u001B[32mdivisionBoundary\u001B[39m  \u001B[32mavailable\u001B[39m',
        '',
        '# AT OR BEFORE',
        'HK / hkgov-had / 2022',
        '  \u001B[32m✓\u001B[39m \u001B[32mdivisionArea\u001B[39m  \u001B[32mavailable\u001B[39m',
      ].join('\n'),
    )
  })

  test('labels an unavailable C&SD release as required', () => {
    expect(
      formatDivisionApiReleaseSetReadiness(
        { cohortKey: '2025-09-24.0', regionCode: 'hk' },
        {
          areaAvailable: true,
          boundaryAvailable: true,
          cohortIndependentReleases: [
            {
              cohortKey: null,
              datasetCode: 'ds-hk-hkgov-censtatd-division-area-district',
              optional: false,
              releaseCode: null,
              resourceType: 'divisionArea',
              variant: 'hkgov-censtatd',
            },
          ],
          divisionAvailable: true,
          ready: false,
        },
      ),
    ).toContain(
      '  \u001B[31m○\u001B[39m \u001B[32mdivisionArea\u001B[39m  \u001B[31munavailable\u001B[39m',
    )
    expect(
      formatDivisionApiReleaseSetReadiness(
        { cohortKey: '2025-09-24.0', regionCode: 'hk' },
        {
          areaAvailable: true,
          boundaryAvailable: true,
          cohortIndependentReleases: [
            {
              cohortKey: null,
              datasetCode: 'ds-hk-hkgov-censtatd-division-area-district',
              optional: false,
              releaseCode: null,
              resourceType: 'divisionArea',
              variant: 'hkgov-censtatd',
            },
          ],
          divisionAvailable: true,
          ready: false,
        },
      ),
    ).toContain('HK / hkgov-censtatd\n')
  })

  test('reports planning domains independently from Overture requirements', () => {
    expect(
      formatDivisionApiReleaseSetReadiness(
        {
          cohortKey: '2006',
          regionCode: 'hk',
          source: 'hkgov-pland-pu',
        },
        {
          areaAvailable: true,
          boundaryAvailable: false,
          cohortIndependentReleases: [],
          divisionAvailable: true,
          ready: true,
        },
      ),
    ).toBe(
      [
        '# EXACT REF',
        'HK / hkgov-pland-pu / 2006',
        '  \u001B[32m✓\u001B[39m \u001B[32mdivision    \u001B[39m  \u001B[32mavailable\u001B[39m',
        '  \u001B[32m✓\u001B[39m \u001B[32mdivisionArea\u001B[39m  \u001B[32mavailable\u001B[39m',
      ].join('\n'),
    )
  })
})

describe('address API release set readiness display', () => {
  test('reports the published address release set', () => {
    expect(
      formatAddressApiReleaseSetReadiness(
        { cohortKey: '2025-09-24.0', regionCode: 'hk' },
        true,
        'data-hk-addresses-2025-09-24.0--official',
        '2025-12-17.0',
      ),
    ).toBe(
      [
        'HK / official / 2025-09-24.0',
        '  \u001B[32m✓\u001B[39m address  available',
        '',
        'Out of Cohort',
        '  \u001B[32m✓\u001B[39m division (overture)  2025-12-17.0',
      ].join('\n'),
    )
  })
})

describe('Home Affairs Department geometry prerequisites', () => {
  test('does not require an exact-cohort division snapshot for an independently bridged area variant', async () => {
    const resolveRemotePublishedDivisionSnapshotMock = mock(async () => null)

    await assertDivisionGeometryUploadPrerequisites(
      {
        environment: 'preview',
        remote: true,
      },
      {
        source: 'hkgov-had',
        theme: 'divisions',
        type: 'divisionArea',
      } as never,
      {
        resolveRemotePublishedDivisionSnapshot:
          resolveRemotePublishedDivisionSnapshotMock,
      },
    )

    expect(resolveRemotePublishedDivisionSnapshotMock).not.toHaveBeenCalled()
  })
})

describe('C&SD geometry prerequisites', () => {
  test('requires the published HMA division snapshot before its companion area', async () => {
    const resolveRemotePublishedDivisionSnapshotMock = mock(async () => ({
      snapshotId: 'snapshot-hkgov-censtatd-hma-2021',
    }))

    await assertDivisionGeometryUploadPrerequisites(
      {
        environment: 'preview',
        remote: true,
      },
      {
        cohortKey: '2021',
        datasetCode:
          'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups',
        regionCode: 'hk',
        source: 'hkgov-censtatd',
        sourceVersion: '2021',
        theme: 'divisions',
        type: 'divisionArea',
      } as never,
      {
        resolveRemotePublishedDivisionSnapshot:
          resolveRemotePublishedDivisionSnapshotMock,
      },
    )

    expect(resolveRemotePublishedDivisionSnapshotMock).toHaveBeenCalledTimes(1)
  })

  test('keeps independently bridged C&SD district areas exempt', async () => {
    const resolveRemotePublishedDivisionSnapshotMock = mock(async () => null)

    await assertDivisionGeometryUploadPrerequisites(
      {
        environment: 'preview',
        remote: true,
      },
      {
        datasetCode:
          'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district',
        source: 'hkgov-censtatd',
        theme: 'divisions',
        type: 'divisionArea',
      } as never,
      {
        resolveRemotePublishedDivisionSnapshot:
          resolveRemotePublishedDivisionSnapshotMock,
      },
    )

    expect(resolveRemotePublishedDivisionSnapshotMock).not.toHaveBeenCalled()
  })
})

describe('Planning Department geometry prerequisites', () => {
  test('reports the exact missing cohort without referring to an address shard', async () => {
    await expect(
      assertDivisionGeometryUploadPrerequisites(
        {
          environment: 'production',
          remote: true,
        },
        {
          cohortKey: '2001',
          regionCode: 'hk',
          source: 'hkgov-pland-pu',
          sourceVersion: '2001',
          theme: 'divisions',
          type: 'divisionArea',
        } as never,
        {
          resolveRemotePublishedDivisionSnapshot: async () => null,
        },
      ),
    ).rejects.toThrow('No published division snapshot was found for the 2001 cohort.')
  })
})
