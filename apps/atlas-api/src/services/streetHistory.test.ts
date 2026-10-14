import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadMigrationSql } from '../../../../libs/core/src/testing/metaFixtures.ts'
import { getStreetHistory } from './streets'

test('Street versions retain deletion details and inherited names from inline tombstones', async () => {
  const meta = new Database(':memory:')
  const history = new Database(':memory:')
  try {
    history.exec(
      loadMigrationSql(join(import.meta.dir, '../../../../libs/db/migrations'), [
        'history',
      ]),
    )
    meta.exec(`CREATE TABLE snapshots(id,parentSnapshotId); INSERT INTO snapshots VALUES('base',NULL),('deleted','base'),('sibling','base');
      CREATE TABLE dataShards(id,bindingName); INSERT INTO dataShards VALUES('h','history');
      CREATE TABLE snapshotShardAssignments(snapshotId,dataShardId); INSERT INTO snapshotShardAssignments VALUES('base','h'),('deleted','h'),('sibling','h');`)
    history.exec(`INSERT INTO streets(id,snapshotId,versionHash,sourceReleaseId,status,version,districtIds) VALUES('road','base','v1','release','active',1,'[]');
      INSERT INTO streetsI18n(streetId,snapshotId,locale,versionHash,sourceReleaseId,name) VALUES('road','base','en','name','release','Example Road');
      INSERT INTO streets(id,snapshotId,operation,version,status,deletedAt,gazetteDate,districtIds) VALUES('road','deleted','delete',4,'deleted','2026-01-02','2026-01-01','[]');
      INSERT INTO streetsI18n(streetId,snapshotId,locale,operation,name) VALUES('road','deleted','en','delete','Example Road');
      INSERT INTO streetChangelog(streetId,recordKey,snapshotId,versionHash,sourceReleaseId,kind,isPartialNameChange,effectiveDate,gazetteDate) VALUES('road','notice','deleted','notice','release','deleted',0,'2026-01-02','2026-01-01');`)
    const db = drizzle({ client: history }) as never
    const metaDb = drizzle({ client: meta }) as never
    const deleted = await getStreetHistory({ history: db }, 'road', metaDb, 'deleted')
    expect(deleted.map(row => [row.version, row.status])).toEqual([
      [1, 'active'],
      [4, 'deleted'],
    ])
    expect(deleted[1]).toMatchObject({
      deletedAt: '2026-01-02',
      i18n: [
        {
          meta: { isLocaleInferred: false },
          locale: 'en',
          name: 'Example Road',
          description: null,
        },
      ],
    })
    expect(
      (await getStreetHistory({ history: db }, 'road', metaDb, 'sibling')).map(
        row => row.status,
      ),
    ).toEqual(['active'])
    expect(history.query('SELECT count(*) AS n FROM streetsI18n').get()).toEqual({
      n: 2,
    })
  } finally {
    meta.close()
    history.close()
  }
})
