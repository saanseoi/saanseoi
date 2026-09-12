import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { compressJsonBrotli } from '@repo/core/pipeline/services/storage/brotliJson.ts'
import { currentSchema, historySchema, metaSchema } from '@repo/db'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core'
import { readAuditGeometry } from './auditGeometry'

function createTables(sqlite: Database, tables: SQLiteTable[]) {
  for (const table of tables) {
    const config = getTableConfig(table)
    sqlite.exec(
      `CREATE TABLE "${config.name}" (${config.columns.map(column => `"${column.name}" ${column.getSQLType()}`).join(',')})`,
    )
  }
}

test('audit replays cleaned geometry by its exact content version and owning shard', async () => {
  const meta = new Database(':memory:')
  const current = new Database(':memory:')
  const before = new Database(':memory:')
  const after = new Database(':memory:')
  try {
    createTables(meta, [
      metaSchema.metaSnapshots,
      metaSchema.metaSnapshotSources,
      metaSchema.metaSnapshotShardAssignments,
      metaSchema.metaDataShards,
    ])
    createTables(current, [currentSchema.divisionAreas])
    for (const history of [before, after]) {
      createTables(history, [
        historySchema.divisionAreas,
        historySchema.snapshotVersionChanges,
      ])
    }
    meta.exec(`
      INSERT INTO snapshots (id,parentSnapshotId,resourceType) VALUES
        ('base',NULL,'divisionArea'),('old','base','divisionArea'),
        ('new','old','divisionArea');
      INSERT INTO snapshotSources (snapshotId,resourceReleaseId,role) VALUES
        ('old','old-release','primary'),('new','lookup-release','lookup');
      INSERT INTO dataShards (id,bindingName) VALUES
        ('before','DB_HISTORY_BEFORE'),('after','DB_HISTORY_AFTER');
      INSERT INTO snapshotShardAssignments (snapshotId,dataShardId) VALUES
        ('base','before'),('old','after'),('new','after');
    `)
    before.exec(`
      INSERT INTO snapshotVersionChanges
        (snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId)
      VALUES ('base','divisionArea','area','','v1','upsert','base-release');
    `)
    const geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [0, 1],
          [0, 0],
        ],
      ],
    }
    current
      .query(
        'INSERT INTO divisionAreas (id,snapshotId,divisionId,geometry) VALUES (?,?,?,?)',
      )
      .run('area', 'old', 'division', compressJsonBrotli(geometry))
    // A later import reuses this content and changes its cache ownership fields.
    before
      .query(
        'INSERT INTO divisionAreas (id,versionHash,snapshotId,sourceReleaseId,divisionId,geometry) VALUES (?,?,?,?,?,?)',
      )
      .run('area', 'v1', 'new', 'new-release', 'division', compressJsonBrotli(geometry))
    const wrongGeometry = JSON.stringify({ type: 'Polygon', coordinates: [] })
    before
      .query(
        'INSERT INTO divisionAreas (id,versionHash,snapshotId,sourceReleaseId,divisionId,geometry) VALUES (?,?,?,?,?,?)',
      )
      .run('area', 'v2', 'old', 'old-release', 'division', wrongGeometry)
    after
      .query(
        'INSERT INTO divisionAreas (id,versionHash,snapshotId,sourceReleaseId,divisionId,geometry) VALUES (?,?,?,?,?,?)',
      )
      .run('area', 'v1', 'old', 'old-release', 'division', wrongGeometry)
    const input = {
      releaseId: 'old-release',
      divisionId: 'division',
      metaDb: drizzle({ client: meta }) as never,
      currentDb: drizzle({ client: current }) as never,
      getHistoryDb: (bindingName: string) =>
        drizzle({
          client: bindingName === 'DB_HISTORY_BEFORE' ? before : after,
        }) as never,
    }
    expect(await readAuditGeometry(input)).toEqual(geometry)
    current.exec("DELETE FROM divisionAreas WHERE snapshotId = 'old'")
    expect(await readAuditGeometry(input)).toEqual(geometry)

    // Deletion in the selected branch must suppress the ancestor's geometry.
    after.exec(`
      INSERT INTO snapshotVersionChanges
        (snapshotId,recordType,recordId,locale,operation)
      VALUES ('old','divisionArea','area','','delete');
    `)
    expect(await readAuditGeometry(input)).toBeNull()
    expect(
      await readAuditGeometry({ ...input, releaseId: 'lookup-release' }),
    ).toBeNull()
  } finally {
    for (const sqlite of [meta, current, before, after]) sqlite.close()
  }
})
