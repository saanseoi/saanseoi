import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import type { DatasetProcessingMessage } from '@repo/core'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import {
  buildDivisionHistorySqlFile,
  buildDivisionSourceSqlFile,
} from './processLocalDivisionSqlUploadRows'
import type { DivisionSqlState } from './processLocalDivisionSqlUploadTypes'

test('division SQL retains publisher assertions and excludes supplemental snapshot rows', async () => {
  const db = new Database(':memory:')
  try {
    db.exec(
      loadMigrationSql(
        resolve(import.meta.dir, '../../../../../../libs/db/migrations'),
        ['source', 'history'],
      ),
    )
    db.exec(
      `INSERT INTO overtureDivisions (sourceRecordId,versionHash,releaseId,validFromRelease,isCurrent,rawProperties) VALUES ('supplement','old-hash','old-release','2020-01-01.0',1,'{"processed":true}');`,
    )
    const message = {
      source: 'overture',
      regionCode: 'hk',
      resourceType: 'division',
      sourceVersion: '2026-08-19.0',
      releaseId: 'release',
      datasetId: 'dataset',
    } as DatasetProcessingMessage
    const state = {
      snapshotId: 'snapshot',
      currentRows: new Map(),
      currentSourceRows: new Map([['supplement', { sourcePayloadHash: 'old-hash' }]]),
      seenIds: new Set(['publisher', 'supplement']),
      records: [
        {
          id: 'publisher',
          sourceChanged: true,
          currentChanged: false,
          sourcePayloadHash: 'native-hash',
          raw: {
            id: 'publisher',
            geometry: { type: 'Point', coordinates: [114, 22] },
            sources: [{ dataset: 'upstream' }],
            names: { primary: ' Native ' },
          },
        },
        {
          id: 'supplement',
          isSupplemental: true,
          sourceChanged: true,
          currentChanged: false,
          sourcePayloadHash: 'synthetic-hash',
          raw: { id: 'supplement', processed: true },
        },
      ],
    } as unknown as DivisionSqlState
    const source = await buildDivisionSourceSqlFile(message, state, async () => {})
    const history = await buildDivisionHistorySqlFile(message, state, async () => {})
    db.exec(source.sql)
    db.exec(history.sql)
    expect(
      db
        .query(
          'SELECT sourceRecordId, rawProperties, sourceGeometry FROM overtureDivisions WHERE isCurrent = 1',
        )
        .all(),
    ).toEqual([
      {
        sourceRecordId: 'publisher',
        rawProperties:
          '{"sources":[{"dataset":"upstream"}],"names":{"primary":" Native "}}',
        sourceGeometry: '{"type":"Point","coordinates":[114,22]}',
      },
    ])
    expect(
      db
        .query(
          "SELECT isCurrent,validToRelease FROM overtureDivisions WHERE sourceRecordId='supplement'",
        )
        .get(),
    ).toEqual({ isCurrent: 0, validToRelease: message.sourceVersion })
    expect(
      db.query('SELECT sourceRecordId,resolutions FROM sourceResolutions').all(),
    ).toEqual([
      {
        sourceRecordId: 'publisher',
        resolutions: '{"entities":{"division":["publisher"]}}',
      },
    ])
  } finally {
    db.close()
  }
})
