import { describe, expect, test } from 'bun:test'

import type { DatasetProcessingMessage } from '../../../types'

import {
  buildAddressHistoryApplySqlImportFile,
  buildAddressResolvedSqlImportFiles,
  buildAddressSourceSqlImportFiles,
  buildAddressSqlCleanupFile,
} from './sqlImport'
import { resolveAddressDivisionCohortKey } from './sqlStages'
import type { ResolvedAddressChunkArtefact } from './types'
import type { NormalisedAddressChunkArtefact } from './types'

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

const resolvedArtefact = {
  addedRows: 0,
  changedRows: 0,
  insertedVersions: 0,
  kind: 'address.resolved.v1',
  localisedRows: 0,
  processingRunStartedAt: '2026-07-03T00:00:00.000Z',
  releaseId: 'release-address',
  rowEnd: 0,
  rowStart: 0,
  rows: [],
  totalRows: 0,
  unchangedRows: 0,
} satisfies ResolvedAddressChunkArtefact

describe('address SQL import staging cleanup', () => {
  test('drops current resolved staging tables after current apply SQL', () => {
    const currentFile = buildAddressResolvedSqlImportFiles(
      message,
      resolvedArtefact,
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

  test('writes a history-apply cleanup artefact even when there are no changes', () => {
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

  test('drops resolved staging tables in cleanup artefacts', () => {
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

describe('HKGov ALS source SQL', () => {
  test('stores paired source addresses on the assertion without a source i18n table', () => {
    const sourceFile = buildAddressSourceSqlImportFiles(message, {
      kind: 'address.normalised.v1',
      processingRunStartedAt: '2026-07-18T00:00:00.000Z',
      releaseId: 'release-address',
      rowEnd: 0,
      rowStart: 0,
      rows: [],
      totalRows: 0,
    })[0]

    expect(sourceFile?.sql).toContain('addressEn, addressZhHant')
    expect(sourceFile?.sql).toContain("AND i.locale = 'en')")
    expect(sourceFile?.sql).toContain("AND i.locale = 'zh-hant')")
    expect(sourceFile?.sql).not.toContain('hkgovAlsAddress2dI18n')
  })

  test('keeps unchanged source records as compact release rows', () => {
    const sourceFile = buildAddressSourceSqlImportFiles(
      message,
      {
        kind: 'address.normalised.v1',
        processingRunStartedAt: '2026-07-18T00:00:00.000Z',
        releaseId: 'release-address',
        rowEnd: 2,
        rowStart: 0,
        rows: [
          {
            base: {},
            canonicalId: 'address-unchanged',
            i18n: [],
            matchKey: null,
            raw: { marker: 'unchanged-payload' },
            sourceId: 'source-unchanged',
            sourcePayloadHash: 'unchanged-hash',
          },
          {
            base: {},
            canonicalId: 'address-changed',
            i18n: [],
            matchKey: null,
            raw: { marker: 'changed-payload' },
            sourceId: 'source-changed',
            sourcePayloadHash: 'changed-hash',
          },
        ],
        totalRows: 2,
      } as unknown as NormalisedAddressChunkArtefact,
      {
        changedSourceRecordIds: new Set(['source-changed']),
        unchangedSourceRecordIds: new Set(['source-unchanged']),
      },
    )[0]

    expect(sourceFile?.sql).toContain('stagingAddresses2dReleaseRows')
    expect(sourceFile?.sql).toContain('source-unchanged')
    expect(sourceFile?.sql).toContain('source-changed')
    expect(sourceFile?.sql).not.toContain('unchanged-payload')
    expect(sourceFile?.sql).toContain('changed-payload')
    expect(sourceFile?.sql).toContain('FROM stagingAddresses2dReleaseRows releaseRow')
  })
})

describe('HKGov ALS identity alias SQL', () => {
  test('writes permanent ss-to-GERS aliases into meta', () => {
    const hkgovMessage = {
      ...message,
      datasetCode: 'ds-hk-hkgov-dpo-address',
      releaseCode: 'dr-hk-hkgov-dpo-address-2025-09-03.0',
      source: 'hkgov-dpo',
      sourceVersion: '2025-09-03.0',
    } satisfies DatasetProcessingMessage
    const artefact = {
      kind: 'address.normalised.v1',
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
    } as unknown as NormalisedAddressChunkArtefact

    const metaFile = buildAddressSourceSqlImportFiles(hkgovMessage, artefact).find(
      file => file.target === 'meta',
    )

    expect(metaFile?.sql).toContain('INSERT OR IGNORE INTO entityAliases')
    expect(metaFile?.sql).toContain('ss-aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa')
    expect(metaFile?.sql).toContain('04bb2336-9590-449b-b6dd-57e22a0462f1')
  })
})

describe('address SQL string literals', () => {
  test('represents NUL separators as SQLite expressions', () => {
    const artefact = {
      kind: 'address.normalised.v1',
      processingRunStartedAt: '2026-07-18T00:00:00.000Z',
      releaseId: 'release-address',
      rowEnd: 1,
      rowStart: 0,
      rows: [
        {
          base: {
            divisionSnapshotId: 'division-snapshot',
            streetSnapshotId: null,
            streetId: null,
            hamletId: null,
            microhoodId: null,
            villageId: null,
            neighbourhoodId: null,
            macrohoodId: null,
            townId: null,
            districtId: '8d17afe0-5631-49c5-b86d-d53c5d4b2f9d',
            areaId: null,
            countryId: null,
            geometry: null,
            identifiers: null,
            bbox: null,
            sources: null,
          },
          canonicalId: 'address-1',
          coverageComponents: [],
          i18n: [],
          matchKey: '8d17afe0-5631-49c5-b86d-d53c5d4b2f9d::GRAHAM STREET::46\0',
          raw: {},
          sourceId: 'source-1',
          sourcePayloadHash: 'hash',
        },
      ],
      totalRows: 1,
    } as unknown as NormalisedAddressChunkArtefact

    const sourceFile = buildAddressSourceSqlImportFiles(message, artefact)[0]

    expect(sourceFile?.sql).not.toContain('\0')
    expect(sourceFile?.sql).toContain(
      "'8d17afe0-5631-49c5-b86d-d53c5d4b2f9d::GRAHAM STREET::46' || char(0) || ''",
    )
  })
})

describe('HKGov ALS division cohort selection', () => {
  test('does not treat the DPO release sequence as an Overture cohort', () => {
    expect(
      resolveAddressDivisionCohortKey(
        {
          cohortKey: '2025-01-23.0',
          source: 'hkgov-dpo',
          sourceVersion: '2025-01-23.0',
        },
        ['2025-09-24.0'],
      ),
    ).toBe('2025-09-24.0')
  })

  test('uses the latest Overture cohort at or before an ALS release', () => {
    expect(
      resolveAddressDivisionCohortKey(
        {
          cohortKey: '2025-12-18.0',
          source: 'hkgov-dpo',
          sourceVersion: '2025-12-18.0',
        },
        ['2025-09-24.0', '2025-12-17.0', '2026-02-18.0'],
      ),
    ).toBe('2025-12-17.0')
  })

  test('uses the first later Overture cohort even when it is in another year', () => {
    expect(
      resolveAddressDivisionCohortKey(
        {
          cohortKey: '2025-12-18.0',
          source: 'hkgov-dpo',
          sourceVersion: '2025-12-18.0',
        },
        ['2026-02-18.0', '2026-05-20.0'],
      ),
    ).toBe('2026-02-18.0')
  })
})
