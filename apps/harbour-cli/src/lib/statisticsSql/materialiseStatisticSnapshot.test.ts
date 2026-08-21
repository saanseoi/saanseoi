import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'

import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'

import { materialiseStatisticSnapshots } from './materialiseStatisticSnapshot'

const MIGRATIONS_DIR = resolve(import.meta.dir, '../../../../../libs/db/migrations')
const NOW = '2026-08-20T00:00:00.000Z'

test('assigns source delivery and canonical period snapshots to different shards', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(
    loadMigrationSql(MIGRATIONS_DIR, ['meta']).replaceAll(
      '--> statement-breakpoint',
      '',
    ),
  )
  sqlite.exec(`
    INSERT INTO publishers (id, code, versionHash, createdAt, updatedAt)
    VALUES ('publisher', 'hkgov-censtatd', 'publisher-hash', '${NOW}', '${NOW}');
    INSERT INTO datasets (
      id, publisherId, code, regionCode, releaseType, releaseFrequency,
      theme, sourceVariant, versionHash, createdAt, updatedAt
    ) VALUES (
      'dataset', 'publisher', 'dataset-statistics', 'hk', 'static', 'yearly',
      'stats', 'official-statistics', 'dataset-hash', '${NOW}', '${NOW}'
    );
    INSERT INTO releases (
      id, datasetId, resourceType, code, sourceVersion, cohortKey,
      status, ingestedAt, createdAt, updatedAt
    ) VALUES (
      'release', 'dataset', 'divisionStatistic', 'release-statistics-2026-q2',
      '2026-Q2', '2026-Q2', 'processing', '${NOW}', '${NOW}', '${NOW}'
    );
    INSERT INTO dataShards (
      id, shardType, regionCode, year, environment, databaseName, databaseId,
      bindingName, status, versionHash, createdAt, updatedAt
    ) VALUES
      (
        'source-2026', 'source', 'hk', '2026', 'preview', 'source-2026',
        'source-2026-db', 'DB_SOURCE_HK_2026', 'active', 'source-2026-hash',
        '${NOW}', '${NOW}'
      ),
      (
        'history-before', 'history', 'hk', NULL, 'preview', 'history-before',
        'history-before-db', 'DB_HISTORY_HK_BEFORE', 'active',
        'history-before-hash', '${NOW}', '${NOW}'
      ),
      (
        'history-2025', 'history', 'hk', '2025', 'preview', 'history-2025',
        'history-2025-db', 'DB_HISTORY_HK_2025', 'active', 'history-2025-hash',
        '${NOW}', '${NOW}'
      );
  `)
  const db = createLocalHarbourDb(sqlite)

  const snapshots = await materialiseStatisticSnapshots({
    datasetCode: 'dataset-statistics',
    metaDb: db,
    referencePeriods: [
      { code: '2016', endYear: '2016' },
      { code: '2024/25', endYear: '2025' },
    ],
    releaseId: 'release',
    target: { environment: 'dev', remote: false },
  })

  expect(snapshots.map(snapshot => snapshot.cohortKey)).toEqual(['2016', '2024/25'])
  expect(
    (
      sqlite
        .query(
          `SELECT ds.bindingName
           FROM releaseShardAssignments rsa
           INNER JOIN dataShards ds ON ds.id = rsa.dataShardId
           WHERE rsa.releaseId = 'release'
           ORDER BY ds.bindingName`,
        )
        .all() as Array<{ bindingName: string }>
    ).map(row => row.bindingName),
  ).toEqual(['DB_HISTORY_HK_2025', 'DB_HISTORY_HK_BEFORE', 'DB_SOURCE_HK_2026'])
  expect(
    sqlite
      .query(
        `SELECT s.cohortKey, ds.bindingName
         FROM snapshotShardAssignments ssa
         INNER JOIN snapshots s ON s.id = ssa.snapshotId
         INNER JOIN dataShards ds ON ds.id = ssa.dataShardId
         ORDER BY s.cohortKey`,
      )
      .all() as Array<{ bindingName: string; cohortKey: string }>,
  ).toEqual([
    { bindingName: 'DB_HISTORY_HK_BEFORE', cohortKey: '2016' },
    { bindingName: 'DB_HISTORY_HK_2025', cohortKey: '2024/25' },
  ])

  sqlite.close()
})
