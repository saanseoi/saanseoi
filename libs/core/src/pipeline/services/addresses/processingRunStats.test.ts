import { expect, test } from 'bun:test'
import type { DatasetProcessingMessage } from '../../../types'
import { publishImportedAddressSqlRelease } from './sqlImportStages'

test('address extraction and dataset summary report actual churn and source counts', async () => {
  const reports = new Map<string, Record<string, unknown> | undefined>()
  const message: DatasetProcessingMessage = {
    datasetId: 'dataset',
    resourceReleaseId: 'release',
    rawObjectKey: 'address.parquet',
    regionCode: 'hk',
    cohortKey: '2026-09',
    source: 'hkgov-dpo',
    sourceVersion: '2026-09',
    theme: 'addresses',
    resourceType: 'address',
    totalRows: 12,
    addressSqlArtefactKeys: ['source.sql', 'current.sql'],
    addressStats: {
      deletedRows: 3,
      insertedVersions: 4,
      localisedRows: 18,
      processedRows: 9,
      unchangedRows: 5,
    },
  }
  await publishImportedAddressSqlRelease(
    {
      async publishDataset() {},
      async stageRunning() {},
      async stageFailed() {},
      async stageCompleted(_releaseId, phase, stats) {
        reports.set(phase, stats)
      },
    },
    message,
  )
  expect(reports.get('extractAddresses')).toEqual({
    deletedRows: 3,
    insertedVersions: 4,
    processedRows: 9,
    unchangedRows: 5,
    sqlArtefactCount: 2,
  })
  expect(reports.get('processDataset')).toEqual({
    ...reports.get('extractAddresses'),
    resourceType: 'address',
    sourceRows: 12,
    localisedRows: 18,
  })
})

test('an unknown accepted Address count is not inferred from the input count', async () => {
  const reports = new Map<string, Record<string, unknown> | undefined>()
  await publishImportedAddressSqlRelease(
    {
      async publishDataset() {},
      async stageRunning() {},
      async stageFailed() {},
      async stageCompleted(_releaseId, phase, stats) {
        reports.set(phase, stats)
      },
    },
    {
      datasetId: 'dataset',
      rawObjectKey: 'address.parquet',
      regionCode: 'hk',
      cohortKey: '2026-09',
      source: 'hkgov-dpo',
      sourceVersion: '2026-09',
      theme: 'addresses',
      resourceType: 'address',
      totalRows: 12,
    },
  )
  expect(reports.get('processDataset')).toMatchObject({
    sourceRows: 12,
    processedRows: null,
  })
  expect(reports.get('extractAddresses')).toMatchObject({ processedRows: null })
})
