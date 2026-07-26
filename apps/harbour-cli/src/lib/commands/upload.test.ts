import { describe, expect, mock, test } from 'bun:test'

const cleanupMock = mock(() => undefined)
const resolveLocalAddressDbContextMock = mock(async () => ({
  cleanup: cleanupMock,
  metaDb: {},
}))
const resolveCohortSnapshotMock = mock(async () => null)
const resolveLatestSnapshotMock = mock(async () => ({
  id: 'snapshot-dr-hk-overture-division-2025-09-24.0',
  code: 'ss-hk-division-2025-09-24.0',
  resourceType: 'division',
  status: 'published',
}))
const metaRegistry = await import('@repo/core/db/metaRegistry')

mock.module('../addressSql/localDbCache.ts', () => ({
  resolveLocalAddressDbContext: resolveLocalAddressDbContextMock,
  withLocalMetaDb: mock(async (_target, work) => work({})),
}))

mock.module('../addressSql/processLocalAddressSqlUpload.ts', () => ({
  processLocalAddressSqlUpload: mock(async () => undefined),
}))

mock.module('../divisionSql/processLocalDivisionSqlUpload.ts', () => ({
  processLocalDivisionSqlUpload: mock(async () => undefined),
}))

mock.module('@repo/core/db/metaRegistry', () => ({
  ...metaRegistry,
  resolveLatestPublishedSnapshotForResourceTypeRegion: resolveLatestSnapshotMock,
  resolvePublishedSnapshotForResourceTypeRegionCohortKey: resolveCohortSnapshotMock,
}))

mock.module('@repo/core/uploadLocal', () => ({
  prepareUpload: mock(async () => {
    throw new Error('prepareUpload should not be called by this test.')
  }),
}))

mock.module('../cli/display.ts', () => ({
  describeTarget: mock(() => ({ label: 'preview' })),
  formatMutedValue: mock((value: string) => value),
  formatSchemaCheck: mock((value: string) => value),
  formatSummary: mock(() => []),
  formatUploadResult: mock(() => []),
}))

mock.module('../upload/overtureAssumptions.ts', () => ({
  checkOvertureUploadAssumptions: mock(async () => []),
}))

mock.module('../cli/options.ts', () => ({
  buildRegisterOptions: mock(() => ({})),
  getStringOption: mock(() => undefined),
}))

mock.module('../upload/parquetRepack.ts', () => ({
  prepareUploadFileForDispatch: mock(async () => null),
}))

mock.module('../upload/upload.ts', () => ({
  dispatchUpload: mock(async () => ({})),
  getUploadDispatchTimings: mock(() => null),
}))

const {
  assertAddressUploadPrerequisites,
  assertDivisionGeometryUploadPrerequisites,
  formatAddressApiReleaseSetReadiness,
  formatDivisionApiReleaseSetReadiness,
  parseDivisionReleaseSetCohortKey,
  rainbowWaveText,
} = await import('./upload.ts')

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
        cohortKey: '2025-09-24.0',
        regionCode: 'hk',
        type: 'address',
      }),
    )
    expect(resolveLocalAddressDbContextMock).not.toHaveBeenCalled()
    expect(resolveCohortSnapshotMock).not.toHaveBeenCalled()
    expect(resolveLatestSnapshotMock).not.toHaveBeenCalled()
    expect(cleanupMock).not.toHaveBeenCalled()
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
              domainCode: 'hkgov-had',
              optional: false,
              releaseCode: 'dr-hk-hkgov-had-division-area-district-2022',
              resourceType: 'divisionArea',
            },
            {
              cohortKey: '2016',
              datasetCode: 'ds-hk-hkgov-censtatd-division-area-district',
              domainCode: 'hkgov-censtatd',
              optional: true,
              releaseCode: 'dr-hk-hkgov-censtatd-division-area-district-2016',
              resourceType: 'divisionArea',
            },
            {
              cohortKey: '2021',
              datasetCode: 'ds-hk-hkgov-censtatd-division-area-district',
              domainCode: 'hkgov-censtatd',
              optional: true,
              releaseCode: 'dr-hk-hkgov-censtatd-division-area-district-2021',
              resourceType: 'divisionArea',
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
        'HK / hkgov-censtatd / 2016',
        '  \u001B[32m✓\u001B[39m \u001B[32mdivisionArea\u001B[39m  \u001B[32mavailable\u001B[39m',
        'HK / hkgov-censtatd / 2021',
        '  \u001B[32m✓\u001B[39m \u001B[32mdivisionArea\u001B[39m  \u001B[32mavailable\u001B[39m',
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
              domainCode: 'hkgov-had',
              optional: false,
              releaseCode: 'dr-hk-hkgov-had-division-area-district-2022',
              resourceType: 'divisionArea',
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
              domainCode: 'hkgov-censtatd',
              optional: false,
              releaseCode: null,
              resourceType: 'divisionArea',
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
              domainCode: 'hkgov-censtatd',
              optional: false,
              releaseCode: null,
              resourceType: 'divisionArea',
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
        'data-hk-addresses-2025-09-24.0--default',
        '2025-12-17.0',
      ),
    ).toBe(
      [
        'HK / default / 2025-09-24.0',
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
