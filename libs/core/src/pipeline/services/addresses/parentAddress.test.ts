import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { loadMigrationSql } from '../../../testing/metaFixtures'
import type { DatasetProcessingMessage } from '../../../types'
import { normaliseAddressRowForPipeline } from './normalisation'
import {
  buildAddressHistoryApplySqlImportFile,
  buildAddressResolvedSqlImportFiles,
} from './sqlImport'
import type { ResolvedAddressChunkArtefact } from './types'

test('SQL imports retain and clear parent links in current and versioned history', () => {
  const current = new Database(':memory:')
  const history = new Database(':memory:')
  const snapshotId = 'address-snapshot'
  const timestamp = '2026-09-06T00:00:00Z'
  const message = {
    resourceType: 'address',
    source: 'hkgov-dpo',
    regionCode: 'hk',
    releaseId: 'address-release',
    sourceVersion: '2026-09-06.0',
  } as DatasetProcessingMessage
  try {
    for (const [db, family] of [
      [current, 'current'],
      [history, 'history'],
    ] as const) {
      db.exec(
        loadMigrationSql(resolve(import.meta.dir, '../../../../../db/migrations'), [
          family,
        ]),
      )
    }
    const normalised = normaliseAddressRowForPipeline({
      id: 'child',
      canonicalId: 'child',
      divisionSnapshotId: 'division-snapshot',
      enFormattedAddress: 'Block A, Example Estate',
      enBlockDescriptor: 'BLOCK',
      enBlockNumber: 'A',
      enEstateName: 'Example Estate',
    })
    expect(normalised.base.parentAddressId).toBeNull()
    for (const [versionHash, parentAddressId] of [
      ['v1', 'estate'],
      ['v2', null],
    ] as const) {
      const artefact: ResolvedAddressChunkArtefact = {
        kind: 'address.resolved.v1',
        releaseId: 'address-release',
        processingRunStartedAt: timestamp,
        rowStart: 0,
        rowEnd: 1,
        totalRows: 1,
        addedRows: 1,
        changedRows: 0,
        unchangedRows: 0,
        insertedVersions: 1,
        localisedRows: 0,
        rows: [
          {
            addressId: 'child',
            sourceId: 'child',
            versionHash,
            changed: true,
            changedExistingId: versionHash === 'v2' ? 'child' : null,
            coverageComponents: [],
            i18n: [],
            base: {
              ...normalised.base,
              id: 'child',
              snapshotId,
              parentAddressId,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          },
        ],
      }
      for (const file of buildAddressResolvedSqlImportFiles(message, artefact)) {
        ;(file.target === 'current' ? current : history).exec(file.sql)
      }
      history.exec(
        buildAddressHistoryApplySqlImportFile(message, { hasChanges: true, snapshotId })
          .sql,
      )
      expect(
        current
          .query('SELECT parentAddressId FROM address2d WHERE id = ?')
          .get('child'),
      ).toEqual({ parentAddressId })
      expect(
        current.query('SELECT granularity FROM address2d WHERE id = ?').get('child'),
      ).toEqual({ granularity: 'building' })
    }
    expect(
      history
        .query(
          'SELECT versionHash, parentAddressId FROM address2d ORDER BY versionHash',
        )
        .all(),
    ).toEqual([
      { versionHash: 'v1', parentAddressId: 'estate' },
      { versionHash: 'v2', parentAddressId: null },
    ])
    expect(history.query('SELECT DISTINCT granularity FROM address2d').all()).toEqual([
      { granularity: 'building' },
    ])
    for (const db of [current, history]) {
      expect(db.query('PRAGMA table_info(address2d)').all()).not.toContainEqual(
        expect.objectContaining({ name: 'granularityProvenance' }),
      )
    }
  } finally {
    current.close()
    history.close()
  }
})
