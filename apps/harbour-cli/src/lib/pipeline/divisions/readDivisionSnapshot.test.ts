import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { currentSchema, historySchema, metaSchema } from '@repo/db'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import { readDivisionSnapshot } from './readDivisionSnapshot'

test('geometry dependency reads use current scope or replay old Division membership without current writes', async () => {
  const current = new Database(':memory:')
  const history = new Database(':memory:')
  const meta = new Database(':memory:')
  for (const [db, family] of [
    [current, 'current'],
    [history, 'history'],
  ] as const)
    db.exec(
      loadMigrationSql(join(import.meta.dir, '../../../../../../libs/db/migrations'), [
        family,
      ]),
    )
  meta.exec(`CREATE TABLE snapshots(id PRIMARY KEY,parentSnapshotId); INSERT INTO snapshots VALUES('parent',NULL),('old','parent'),('latest','old');
    CREATE TABLE snapshotShardAssignments(snapshotId,dataShardId); INSERT INTO snapshotShardAssignments VALUES('parent','history'),('old','history');
    CREATE TABLE dataShards(id PRIMARY KEY,bindingName); INSERT INTO dataShards VALUES('history','DB_HISTORY');`)
  current.exec(`INSERT INTO divisionPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt) VALUES('lineage','latest','current','token','ready');
    INSERT INTO divisions(snapshotId,id,class,hierarchies) VALUES('lineage','latest-only','district','{"full":[],"administrative":[],"locality":[]}');`)
  history.exec(`INSERT INTO divisions(id,versionHash,snapshotId,sourceReleaseId,isCurrent,class,hierarchies) VALUES
    ('inherited','v1','parent','r1',0,'district','{"full":[],"administrative":[],"locality":[]}'),
    ('revised','v1','parent','r1',0,'district','{"full":[],"administrative":[],"locality":[]}'),
    ('revised','v2','old','r2',0,'city','{"full":[],"administrative":[],"locality":[]}'),
    ('removed','v1','parent','r1',0,'district','{"full":[],"administrative":[],"locality":[]}');
    INSERT INTO snapshotVersionChanges(snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId) VALUES
    ('parent','division','inherited','','v1','upsert','r1'),('parent','division','revised','','v1','upsert','r1'),('parent','division','removed','','v1','upsert','r1'),
    ('old','division','revised','','v2','upsert','r2'),('old','division','removed','',NULL,'delete','r2');`)
  const args = [
    drizzle({ client: current, schema: currentSchema }) as never,
    drizzle({ client: meta, schema: metaSchema }) as never,
  ] as const
  try {
    const before = current.query('SELECT total_changes() AS n').get()
    expect(
      (await readDivisionSnapshot(...args, 'latest')).divisions.map(row => row.id),
    ).toEqual(['latest-only'])
    const result = await readDivisionSnapshot(...args, 'old', [
      {
        bindingName: 'DB_HISTORY',
        db: drizzle({ client: history, schema: historySchema }) as never,
      },
    ])
    expect(
      result.divisions
        .map(row => ({ id: row.id, class: row.class }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual([
      { id: 'inherited', class: 'district' },
      { id: 'revised', class: 'city' },
    ])
    expect(current.query('SELECT total_changes() AS n').get()).toEqual(before)
    expect(current.query('SELECT snapshotId,id FROM divisions').all()).toEqual([
      { snapshotId: 'lineage', id: 'latest-only' },
    ])
  } finally {
    current.close()
    history.close()
    meta.close()
  }
})
