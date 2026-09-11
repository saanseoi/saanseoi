import { expect, test } from 'bun:test'
import {
  buildFinalImportMessage,
  shouldIncludePreviousShardYears,
} from './processLocalAddressSqlUploadImport'

test('includes previous history shards for every date-based address cohort', () => {
  expect(shouldIncludePreviousShardYears('2025-01-23.0')).toBe(true)
  expect(shouldIncludePreviousShardYears('2025-02-25.0')).toBe(true)
  expect(shouldIncludePreviousShardYears('2026-08-19.0')).toBe(true)
})

test('an empty Address import keeps its release-level Division selection without chunk messages', () => {
  const result = buildFinalImportMessage(
    {
      datasetId: 'dataset',
      datasetCode: 'ds-hk-hkgov-dpo-address',
      releaseId: 'release',
      source: 'hkgov-dpo',
      resourceType: 'address',
      regionCode: 'hk',
      cohortKey: '2025',
      theme: 'addresses',
      sourceVersion: '2025',
      rawObjectKey: 'prepared',
      addressDivisionSnapshotId: 'exact-division',
    },
    '2026-09-01',
    [],
    0,
  )
  expect(result.addressDivisionSnapshotId).toBe('exact-division')
  expect(result.totalRows).toBe(0)
})
