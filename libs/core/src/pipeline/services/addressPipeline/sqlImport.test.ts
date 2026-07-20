import { describe, expect, test } from 'bun:test'

import type { DatasetProcessingMessage } from '../../../types'

import {
  buildAddressHistoryApplySqlImportFile,
  buildAddressResolvedSqlImportFiles,
  buildAddressSourceSqlImportFiles,
  buildAddressSqlCleanupFile,
} from './sqlImport'
import { resolveAddressDivisionCohortKey } from './sqlStages'
import type { ResolvedAddressChunkArtifact } from './types'
import type { NormalizedAddressChunkArtifact } from './types'

const message = {
  cohortKey: '2025-09',
  datasetCode: 'ds-hk-hkgov-dpo-address',
  datasetId: 'dataset-address',
  rawObjectKey: 'hk/hkgov-dpo/2025-09/address.parquet',
  regionCode: 'hk',
  releaseCode: 'dr-hk-hkgov-dpo-address-2025-09.0',
  releaseId: 'release-address',
  shardYear: '2025',
  source: 'hkgov-dpo',
  sourceVersion: '2025-09.0',
  theme: 'addresses',
  type: 'address',
} satisfies DatasetProcessingMessage

const resolvedArtifact = {
  addedRows: 0,
  changedRows: 0,
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

describe('HKGov ALS identity alias SQL', () => {
  test('writes permanent ss-to-GERS aliases into meta', () => {
    const hkgovMessage = {
      ...message,
      datasetCode: 'ds-hk-hkgov-dpo-address',
      releaseCode: 'dr-hk-hkgov-dpo-address-2025-09-03.1043',
      source: 'hkgov-dpo',
      sourceVersion: '2025-09-03.1043',
    } satisfies DatasetProcessingMessage
    const artifact = {
      kind: 'address.normalized.v1',
      processingRunStartedAt: '2026-07-18T00:00:00.000Z',
      releaseId: 'release-address',
      rowEnd: 1,
      rowStart: 0,
      rows: [
        {
          base: {},
          canonicalId: '04bb2336-9590-449b-b6dd-57e22a0462f1',
          i18n: [],
          matchKey: null,
          raw: {
            canonicalId: '04bb2336-9590-449b-b6dd-57e22a0462f1',
            identityAlias: 'ss-aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa',
            identityMatchMethod: 'hkgov-als',
          },
          source: {},
          sourceId: 'ss-aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa',
          sourcePayloadHash: 'hash',
        },
      ],
      totalRows: 1,
    } as unknown as NormalizedAddressChunkArtifact

    const metaFile = buildAddressSourceSqlImportFiles(hkgovMessage, artifact).find(
      file => file.target === 'meta',
    )

    expect(metaFile?.sql).toContain('INSERT OR IGNORE INTO entityAliases')
    expect(metaFile?.sql).toContain('ss-aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa')
    expect(metaFile?.sql).toContain('04bb2336-9590-449b-b6dd-57e22a0462f1')
  })
})

describe('HKGov ALS division cohort selection', () => {
  test('does not treat the DPO release sequence as an Overture cohort', () => {
    expect(
      resolveAddressDivisionCohortKey(
        {
          cohortKey: '2025-01-23.1031',
          source: 'hkgov-dpo',
          sourceVersion: '2025-01-23.1031',
        },
        ['2025-09-24.0'],
      ),
    ).toBe('2025-09-24.0')
  })

  test('uses the latest Overture cohort at or before an ALS release', () => {
    expect(
      resolveAddressDivisionCohortKey(
        {
          cohortKey: '2025-12-18.1200',
          source: 'hkgov-dpo',
          sourceVersion: '2025-12-18.1200',
        },
        ['2025-09-24.0', '2025-12-17.0', '2026-02-18.0'],
      ),
    ).toBe('2025-12-17.0')
  })

  test('uses the first later Overture cohort even when it is in another year', () => {
    expect(
      resolveAddressDivisionCohortKey(
        {
          cohortKey: '2025-12-18.1200',
          source: 'hkgov-dpo',
          sourceVersion: '2025-12-18.1200',
        },
        ['2026-02-18.0', '2026-05-20.0'],
      ),
    ).toBe('2026-02-18.0')
  })
})
