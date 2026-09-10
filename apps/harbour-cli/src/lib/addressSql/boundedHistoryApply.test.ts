import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { boundedHistoryApply } from './boundedHistoryApply.ts'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures.ts'
import { normaliseAddressRowForPipeline } from '../../../../../libs/core/src/pipeline/services/addressPipeline/normalisation.ts'
import {
  buildAddressResolvedSqlImportFiles,
  buildAddressHistoryApplySqlImportFile,
} from '../../../../../libs/core/src/pipeline/services/addressPipeline/sqlImport.ts'
import type { DatasetProcessingMessage } from '@repo/core'
import type { ResolvedAddressChunkArtefact } from '../../../../../libs/core/src/pipeline/services/addressPipeline/types.ts'

test('bounded history applies both sides of a range boundary and drops staging last', () => {
  const db = new Database(':memory:')
  try {
    db.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../../libs/db/migrations'), [
        'history',
      ]),
    )
    const message = {
      type: 'address',
      source: 'hkgov-dpo',
      regionCode: 'hk',
      releaseId: 'release',
      sourceVersion: '2024-07-25.0',
    } as DatasetProcessingMessage
    const base = normaliseAddressRowForPipeline({
      id: 'a',
      canonicalId: 'a',
      divisionSnapshotId: 'division',
      enFormattedAddress: 'Example',
    }).base
    const artefact = {
      kind: 'address.resolved.v1',
      releaseId: 'release',
      processingRunStartedAt: '2026-09-10T00:00:00Z',
      rowStart: 4095,
      rowEnd: 4097,
      totalRows: 4097,
      addedRows: 2,
      changedRows: 0,
      unchangedRows: 0,
      insertedVersions: 2,
      localisedRows: 0,
      rows: ['a', 'b'].map(id => ({
        addressId: id,
        sourceId: id,
        versionHash: id,
        changed: true,
        changedExistingId: null,
        coverageComponents: [],
        i18n: [],
        base: {
          ...base,
          id,
          snapshotId: 'snapshot',
          createdAt: '2026-09-10T00:00:00Z',
          updatedAt: '2026-09-10T00:00:00Z',
        },
      })),
    } as ResolvedAddressChunkArtefact
    for (const file of buildAddressResolvedSqlImportFiles(message, artefact))
      if (file.target === 'history') db.exec(file.sql)
    const original = buildAddressHistoryApplySqlImportFile(message, {
      hasChanges: true,
      snapshotId: 'snapshot',
    }).sql
    const parts = boundedHistoryApply(new TextEncoder().encode(original), 4097)
    expect(parts).toHaveLength(4)
    for (const part of parts) db.exec(new TextDecoder().decode(part))
    expect(db.query('SELECT id FROM address2d ORDER BY id').all()).toEqual([
      { id: 'a' },
      { id: 'b' },
    ])
    expect(
      db.query('SELECT recordId FROM snapshotVersionChanges ORDER BY recordId').all(),
    ).toEqual([{ recordId: 'a' }, { recordId: 'b' }])
    expect(
      db
        .query(
          "SELECT name FROM sqlite_master WHERE name='zzAddressImportResolvedRows'",
        )
        .all(),
    ).toEqual([])
  } finally {
    db.close()
  }
})
