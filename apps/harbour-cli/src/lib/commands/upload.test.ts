import { describe, expect, mock, test } from 'bun:test'

import {
  assertAddressUploadPrerequisites,
  assertDivisionGeometryUploadPrerequisites,
  censtatdDistrictDatasetCode,
  formatAddressApiReleaseSetReadiness,
  formatDivisionApiReleaseSetReadiness,
  parseDivisionReleaseSetCohortKey,
  rainbowWaveText,
  resolveDivisionDomainCode,
  selectPublishedApiReleaseSetPublications,
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

  test('renders the required members from the active API composition', () => {
    expect(
      formatDivisionApiReleaseSetReadiness(
        {
          cohortKey: '2025-09-24.0',
          regionCode: 'hk',
        },
        {
          domainCode: 'geographic',
          members: [
            {
              cohortKeys: ['2025-09-24.0'],
              cohortMatchingMode: 'exact_ref',
              isRequired: true,
              releaseCode: 'ss-hk-division-2025-09-24.0',
              resourceType: 'division',
              variant: 'overture',
            },
            {
              cohortKeys: ['2022'],
              cohortMatchingMode: 'latest_at_or_before_cohort_per_dataset',
              isRequired: true,
              releaseCode: 'ss-hk-division-area-2022',
              resourceType: 'divisionArea',
              variant: 'hkgov-censtatd',
            },
          ],
          ready: false,
        },
      ),
    ).toBe(
      [
        '# REQUIRED MEMBERS',
        'HK / geographic / 2025-09-24.0',
        '  \u001B[32m✓\u001B[39m \u001B[32mdivision    \u001B[39m  \u001B[90m(overture; exact ref: 2025-09-24.0)\u001B[39m  \u001B[32mavailable\u001B[39m',
        '  \u001B[32m✓\u001B[39m \u001B[32mdivisionArea\u001B[39m  \u001B[90m(hkgov-censtatd; latest at or before cohort per dataset: 2022)\u001B[39m  \u001B[32mavailable\u001B[39m',
      ].join('\n'),
    )
  })

  test('reports LandsD as its own domain', () => {
    expect(resolveDivisionDomainCode('hkgov-landsd')).toBe('hkgov-landsd')
    expect(
      formatDivisionApiReleaseSetReadiness(
        {
          cohortKey: '2026-06-10.0',
          regionCode: 'hk',
          source: 'hkgov-landsd',
        },
        {
          domainCode: 'hkgov-landsd',
          members: [
            {
              cohortKeys: ['2026-06-10.0'],
              cohortMatchingMode: 'exact_ref',
              isRequired: true,
              releaseCode: 'ss-hk-division-2026-06-10.0',
              resourceType: 'division',
              variant: 'hkgov-landsd',
            },
          ],
          ready: true,
        },
      ),
    ).toContain('HK / hkgov-landsd / 2026-06-10.0')
  })
})

describe('API release-set publication display', () => {
  test('deduplicates the selected current release set from publication results', () => {
    expect(
      selectPublishedApiReleaseSetPublications({
        apiCatalogRevisionCode: 'catalog-hk-divisions-v0.1-2026-08-27.0',
        apiReleaseSetCode: 'data-hk-divisions-2026-06-10.0--hkgov-landsd',
        apiReleaseSetStatus: 'current',
        apiReleaseSetPublications: [
          {
            apiCatalogRevisionCode: 'catalog-hk-divisions-v0.1-2026-08-27.0',
            apiReleaseSetCode: 'data-hk-divisions-2026-06-10.0--hkgov-landsd',
          },
        ],
      }),
    ).toEqual([
      {
        apiCatalogRevisionCode: 'catalog-hk-divisions-v0.1-2026-08-27.0',
        apiReleaseSetCode: 'data-hk-divisions-2026-06-10.0--hkgov-landsd',
      },
    ])
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
