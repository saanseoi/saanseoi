import { defineRelations } from 'drizzle-orm'
import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { historySchema, metaSchema } from '@repo/db'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadAlsDivisionHistory } from './hkgovAlsDivisionHistory'

test('ALS lookup replays inherited names across shards and excludes deleted divisions without current rows', async () => {
  const meta = new Database(':memory:')
  const parent = new Database(':memory:')
  const child = new Database(':memory:')
  try {
    meta.exec(`
      CREATE TABLE snapshots (id TEXT, parentSnapshotId TEXT); CREATE TABLE snapshotResourceReleases(snapshotId,resourceReleaseId,role); CREATE TRIGGER fixtureProducer AFTER INSERT ON snapshots BEGIN INSERT INTO snapshotResourceReleases VALUES(NEW.id,'release','primary'); END;
      CREATE TABLE snapshotShardAssignments (snapshotId TEXT, dataShardId TEXT);
      CREATE TABLE dataShards (id TEXT, bindingName TEXT);
      INSERT INTO snapshots VALUES ('parent', NULL), ('child', 'parent');
      INSERT INTO snapshotShardAssignments VALUES ('parent', 'old'), ('child', 'new');
      INSERT INTO dataShards VALUES ('old', 'old'), ('new', 'new');
    `)
    for (const db of [parent, child])
      db.exec(`
      CREATE TABLE divisions (id TEXT, level INTEGER, category TEXT, class TEXT, hierarchies TEXT, versionHash TEXT, snapshotId TEXT DEFAULT 'parent', operation TEXT DEFAULT 'upsert');
      CREATE TABLE divisionsI18n (divisionId TEXT, locale TEXT, name TEXT, versionHash TEXT, snapshotId TEXT DEFAULT 'parent', operation TEXT DEFAULT 'upsert');
      CREATE VIEW historyEvents AS SELECT snapshotId,'division' AS recordType,id AS recordId,'' AS locale,versionHash,operation,NULL AS producerDatasetCode FROM divisions UNION ALL SELECT snapshotId,'divisionI18n',divisionId,locale,versionHash,operation,NULL AS producerDatasetCode FROM divisionsI18n;
    `)
    // More than one query batch, including content shared by different record IDs.
    for (let i = 0; i < 90; i++) {
      const id = `area-${i}`
      parent
        .prepare(
          'INSERT INTO divisions(id,level,category,class,hierarchies,versionHash) VALUES (?, 1, ?, ?, ?, ?)',
        )
        .run(id, 'area', 'area', '{}', 'shape')
      parent
        .prepare(
          'INSERT INTO divisionsI18n(divisionId,locale,name,versionHash) VALUES (?, ?, ?, ?)',
        )
        .run(id, 'en', id, `name-${i}`)
    }
    child.exec(`
      INSERT INTO divisions(id,snapshotId,operation) VALUES('area-0','child','delete');
      INSERT INTO divisionsI18n(divisionId,locale,name,versionHash,snapshotId) VALUES ('area-1', 'en', 'Renamed area', 'renamed','child');
    `)
    const shards = new Map([
      [
        'old',
        {
          bindingName: 'old',
          db: drizzle({
            client: parent,
            relations: defineRelations(historySchema),
          }) as never,
        },
      ],
      [
        'new',
        {
          bindingName: 'new',
          db: drizzle({
            client: child,
            relations: defineRelations(historySchema),
          }) as never,
        },
      ],
    ])
    const rows = await loadAlsDivisionHistory(
      drizzle({ client: meta, relations: defineRelations(metaSchema) }) as never,
      'child',
      shards,
    )
    expect(rows).toHaveLength(89)
    expect(rows.some(row => row.id === 'area-0')).toBe(false)
    expect(rows.find(row => row.id === 'area-1')?.name).toBe('Renamed area')
    expect(rows.find(row => row.id === 'area-89')?.name).toBe('area-89')
    expect(rows.every(row => row.snapshotId === 'child')).toBe(true)
  } finally {
    meta.close()
    parent.close()
    child.close()
  }
})
