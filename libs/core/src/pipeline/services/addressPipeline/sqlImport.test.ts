import { describe, expect, test } from 'bun:test'

import type { DatasetProcessingMessage } from '../../../types'

import {
  buildAddressHistoryApplySqlImportFile,
  buildAddressResolvedSqlImportFiles,
  buildAddressSqlCleanupFile,
} from './sqlImport'
import type { ResolvedAddressChunkArtifact } from './types'

const message = {
  cohortKey: '2025-09-24.0',
  datasetCode: 'ds-hk-overture-address',
  datasetId: 'dataset-address',
  rawObjectKey: 'hk/overture/2025-09-24.0/address.parquet',
  regionCode: 'hk',
  releaseCode: 'overture-hk-2025-09-24.0-address',
  releaseId: 'release-address',
  shardYear: '2025',
  source: 'overture',
  sourceVersion: '2025-09-24.0',
  theme: 'addresses',
  type: 'address',
} satisfies DatasetProcessingMessage

const resolvedArtifact = {
  insertedVersions: 0,
  kind: 'address.resolved.v1',
  localizedRows: 0,
  processingRunStartedAt: '2026-07-03T00:00:00.000Z',
  releaseId: 'release-address',
  rowEnd: 0,
  rowStart: 0,
  rows: [],
  totalRows: 0,
  unchangedRows: 0,
} satisfies ResolvedAddressChunkArtifact

describe('address SQL import staging cleanup', () => {
  test('drops current resolved staging tables after current apply SQL', () => {
    const currentFile = buildAddressResolvedSqlImportFiles(
      message,
      resolvedArtifact,
    ).find(file => file.target === 'current')

    expect(currentFile?.sql).toContain(
      'DROP TABLE IF EXISTS zzAddressImportResolvedI18n;',
    )
    expect(currentFile?.sql).toContain(
      'DROP TABLE IF EXISTS zzAddressImportResolvedRows;',
    )
    expect(currentFile?.sql.indexOf('DROP TABLE IF EXISTS')).toBeGreaterThan(
      currentFile?.sql.indexOf('UPDATE address2d') ?? -1,
    )
  })

  test('writes a history-apply cleanup artifact even when there are no changes', () => {
    const historyApplyFile = buildAddressHistoryApplySqlImportFile(message, {
      hasChanges: false,
      snapshotId: 'snapshot-address',
    })

    expect(historyApplyFile.target).toBe('history-apply')
    expect(historyApplyFile.sql).toContain(
      'DROP TABLE IF EXISTS zzAddressImportResolvedI18n;',
    )
    expect(historyApplyFile.sql).toContain(
      'DROP TABLE IF EXISTS zzAddressImportResolvedRows;',
    )
    expect(historyApplyFile.sql).not.toContain('INSERT INTO address2d')
  })

  test('drops resolved staging tables in cleanup artifacts', () => {
    const cleanupFile = buildAddressSqlCleanupFile(message, 'history')

    expect(cleanupFile.sql).toContain(
      'DROP TABLE IF EXISTS zzAddressImportResolvedI18n;',
    )
    expect(cleanupFile.sql).toContain(
      'DROP TABLE IF EXISTS zzAddressImportResolvedRows;',
    )
    expect(cleanupFile.sql).not.toContain('DELETE FROM zzAddressImportResolvedRows')
  })
})
