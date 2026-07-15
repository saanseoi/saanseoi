import { describe, expect, mock, test } from 'bun:test'

const cleanupMock = mock(() => undefined)
const resolveLocalAddressDbContextMock = mock(async () => ({
  cleanup: cleanupMock,
  metaDb: {},
}))
const resolveCohortSnapshotMock = mock(async () => null)
const resolveLatestSnapshotMock = mock(async () => ({
  id: 'snapshot-overture-hk-2025-09-24.0-division',
  code: 'ss-hk-division-2025-09-24.0',
  resourceType: 'division',
  status: 'published',
}))
const metaRegistry = await import('@repo/core/db/metaRegistry')

mock.module('../addressSql/localDbCache.ts', () => ({
  resolveLocalAddressDbContext: resolveLocalAddressDbContextMock,
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

mock.module('../display.ts', () => ({
  describeTarget: mock(() => ({ label: 'preview' })),
  formatMutedValue: mock((value: string) => value),
  formatSchemaCheck: mock((value: string) => value),
  formatSummary: mock(() => []),
  formatUploadResult: mock(() => []),
}))

mock.module('../overtureAssumptions.ts', () => ({
  checkOvertureUploadAssumptions: mock(async () => []),
}))

mock.module('../options.ts', () => ({
  buildRegisterOptions: mock(() => ({})),
  getStringOption: mock(() => undefined),
}))

mock.module('../parquetRepack.ts', () => ({
  prepareUploadFileForDispatch: mock(async () => null),
}))

mock.module('../schema/overture.ts', () => ({
  validateOvertureSchema: mock(() => ({ schema: { id: 'schema-version' } })),
}))

mock.module('../upload.ts', () => ({
  dispatchUpload: mock(async () => ({})),
  getUploadDispatchTimings: mock(() => null),
}))

const {
  assertAddressUploadPrerequisites,
  assertDivisionGeometryUploadPrerequisites,
  formatDivisionApiReleaseSetReadiness,
} = await import('./upload.ts')

describe('upload command address prerequisites', () => {
  test('checks remote address prerequisites without refreshing the local D1 cache', async () => {
    const resolveRemotePublishedDivisionSnapshotMock = mock(async () => ({
      snapshotId: 'snapshot-overture-hk-2025-09-24.0-division',
    }))

    await assertAddressUploadPrerequisites(
      {
        environment: 'preview',
        remote: true,
      },
      {
        cohortKey: '2025-09-24.0',
        datasetCode: 'ds-hk-overture-address',
        datasetId: 'dataset-overture-hk-address',
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
        releaseCode: 'overture-hk-2025-09-24.0-address',
        rowCount: 182_155,
        schemaFingerprint: 'schema-fingerprint',
        source: 'overture',
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
  test('treats an eligible provider area release as satisfying the area requirement', () => {
    expect(
      formatDivisionApiReleaseSetReadiness(
        {
          cohortKey: '2025-09-24.0',
          regionCode: 'hk',
        },
        {
          areaAvailable: true,
          boundaryAvailable: false,
          cohortIndependentReleases: [
            {
              datasetCode: 'ds-hk-hkgov-had-district',
              releaseCode: 'hkgov-had-hk-2022-district',
            },
          ],
          divisionAvailable: true,
          ready: false,
        },
      ),
    ).toBe(
      [
        'HK / 2025-09-24.0',
        '  \u001B[32m✓\u001B[39m division          available',
        '  \u001B[32m✓\u001B[39m divisionArea      available',
        '  \u001B[33m○\u001B[39m divisionBoundary  unavailable',
        '',
        'At or Before Cohort',
        '  \u001B[32m✓\u001B[39m hkgov-had-hk-2022-district  available',
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
