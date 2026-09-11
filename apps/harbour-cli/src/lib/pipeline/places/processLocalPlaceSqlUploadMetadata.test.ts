import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'

import { metaSchema } from '@repo/db'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import { assignPlaceSourceShards } from './processLocalPlaceSqlUploadMetadata.ts'

test('Place releases retain every active source shard containing their assertions', async () => {
  const database = new Database(':memory:')
  try {
    database.exec(
      loadMigrationSql(join(import.meta.dir, '../../../../../../libs/db/migrations'), [
        'meta',
      ]),
    )
    database.exec(`
      PRAGMA foreign_keys = OFF;
      INSERT INTO dataShards
        (id, shardType, regionCode, year, environment, databaseName, databaseId,
         bindingName, status, versionHash)
      VALUES
        ('source-2025', 'source', 'hk', '2025', 'preview', 'source-2025',
         'source-2025', 'DB_SOURCE_HK_2025', 'active', 'hash-2025'),
        ('source-2026', 'source', 'hk', '2026', 'preview', 'source-2026',
         'source-2026', 'DB_SOURCE_HK_2026', 'active', 'hash-2026');
      INSERT INTO releases
        (id, sourceReleaseId, datasetId, code, resourceType, sourceVersion, status)
      VALUES
        ('place-release', 'source-release', 'place-dataset',
         'place-release', 'place', '2026-01-01.0', 'published');
    `)

    const metaDb = drizzle({ client: database, schema: metaSchema })
    await assignPlaceSourceShards(metaDb, 'place-release', 'preview', [
      'DB_SOURCE_HK_2025',
      'DB_SOURCE_HK_2026',
    ])

    expect(
      database
        .query(
          'SELECT dataShardId FROM releaseShardAssignments WHERE releaseId = ? ORDER BY dataShardId',
        )
        .all('place-release'),
    ).toEqual([{ dataShardId: 'source-2025' }, { dataShardId: 'source-2026' }])
  } finally {
    database.close()
  }
})
