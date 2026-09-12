import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { createLocalHarbourDb } from '../../../../../../libs/core/src/testing/localDb'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import { buildPlandMetaSql } from './processLocalHkgovPlandDivisionSqlUploadMetadata'
import { buildDivisionMetaSqlFile } from './processLocalDivisionSqlUploadMetadata'

test('division metadata replays current-schema statistics without duplicating processing rows', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(
        resolve(import.meta.dir, '../../../../../../libs/db/migrations'),
        ['meta'],
      ),
    )
    sqlite.exec(`PRAGMA foreign_keys = OFF;
      INSERT INTO snapshotLineages (id, code, regionCode, resourceType, identityMode, versionHash)
      VALUES ('lineage', 'lineage', 'hk', 'division', 'source', 'hash');
      INSERT INTO snapshots (id, snapshotLineageId, resourceType, code, cohortKey, status)
      VALUES ('snapshot', 'lineage', 'division', 'snapshot', '2025', 'draft');
      INSERT INTO snapshotAssembly (id, code, resourceType, version, status, versionHash) VALUES ('assembly', 'assembly', 'division', 1, 'active', 'hash');
      INSERT INTO snapshotAssemblyRuns (id, snapshotId, snapshotAssemblyId, status) VALUES ('run', 'snapshot', 'assembly', 'completed');
      INSERT INTO snapshotSources (snapshotId, datasetId, resourceReleaseId, role) VALUES ('snapshot', 'dataset', 'release', 'primary');
      INSERT INTO releaseShardAssignments VALUES ('release', 'shard');
      INSERT INTO snapshotShardAssignments VALUES ('snapshot', 'shard');
      INSERT INTO stats (id, releaseId, dimension, metric, metricUnit, value) VALUES
      ('processing', 'release', 'rows', 'processing', 'count', 7),
      ('stale', 'release', 'rows', 'total', 'count', 99),
      ('other', 'other-release', 'rows', 'total', 'count', 42);`)
    const db = createLocalHarbourDb(sqlite)
    const statsRows = [
      { dimension: 'rows', metric: 'total', metricUnit: 'count', value: 3 },
      { dimension: 'rows', metric: 'processing', metricUnit: 'count', value: 100 },
    ]
    for (const row of statsRows)
      Object.assign(row, {
        createdAt: '2026-09-11T00:00:00Z',
        updatedAt: '2026-09-11T00:00:00Z',
      })
    const result = await buildDivisionMetaSqlFile(
      db as never,
      {
        releaseId: 'release',
        datasetId: 'release',
        source: 'overture',
        sourceVersion: '2025-09-24.0',
      } as never,
      { snapshotId: 'snapshot', statsRows } as never,
      async () => {},
    )
    sqlite.exec(result.sql)
    sqlite.exec(result.sql)
    const planningSql = await buildPlandMetaSql(
      { metaDb: db } as never,
      { snapshotId: 'snapshot', releaseId: 'release' } as never,
    )
    sqlite.exec(planningSql)
    sqlite.exec(planningSql)
    expect(
      sqlite
        .query('SELECT releaseId, metric, value FROM stats ORDER BY releaseId, metric')
        .all(),
    ).toEqual([
      { releaseId: 'other-release', metric: 'total', value: 42 },
      { releaseId: 'release', metric: 'processing', value: 7 },
      { releaseId: 'release', metric: 'total', value: 3 },
    ])
  } finally {
    sqlite.close()
  }
})
