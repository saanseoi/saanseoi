import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import { readGeometrySnapshot } from './readGeometrySnapshot'

test('geometry replay selects introducing snapshots across shards even when a sibling repeats the hash', async () => {
  const current = new Database(':memory:')
  const history = new Database(':memory:')
  const child = new Database(':memory:')
  const meta = new Database(':memory:')
  try {
    for (const db of [history, child])
      db.exec(
        loadMigrationSql(
          join(import.meta.dir, '../../../../../../libs/db/migrations'),
          ['history'],
        ),
      )
    current.exec(
      'CREATE TABLE divisionAreaPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt,createdAt,updatedAt)',
    )
    meta.exec(`CREATE TABLE snapshots(id,parentSnapshotId,status,snapshotLineageId); INSERT INTO snapshots VALUES('root',NULL,'published','lineage'),('child','root','published','lineage');
      CREATE TABLE snapshotLineages(id,resourceType); INSERT INTO snapshotLineages VALUES('lineage','divisionArea');
      CREATE TABLE dataShards(id,bindingName); INSERT INTO dataShards VALUES('old','old'),('new','new');
      CREATE TABLE snapshotShardAssignments(snapshotId,dataShardId); INSERT INTO snapshotShardAssignments VALUES('root','old'),('child','new');`)
    history.exec(
      `INSERT INTO divisionAreas(id,snapshotId,versionHash,sourceReleaseId,divisionId,variant,type) VALUES('area','root','same','release','division','default','Polygon'),('area','sibling','same','sibling-release','division','default','Polygon');`,
    )
    const rows = await readGeometrySnapshot(
      {
        currentDb: drizzle({ client: current }),
        metaDb: drizzle({ client: meta }),
        historyTargets: [
          { bindingName: 'old', db: drizzle({ client: history }) },
          { bindingName: 'new', db: drizzle({ client: child }) },
        ],
      } as never,
      'divisionArea',
      'child',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'area',
      snapshotId: 'root',
      sourceReleaseId: 'release',
    })
  } finally {
    current.close()
    history.close()
    child.close()
    meta.close()
  }
})
