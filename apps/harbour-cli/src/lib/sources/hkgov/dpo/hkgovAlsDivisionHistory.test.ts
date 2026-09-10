import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { historySchema, metaSchema } from '@repo/db'
import { loadAlsDivisionHistory } from './hkgovAlsDivisionHistory'

test('ALS lookup replays inherited names across shards and excludes deleted divisions without current rows', async () => {
  const meta = new Database(':memory:')
  const parent = new Database(':memory:')
  const child = new Database(':memory:')
  try {
    meta.exec(`
      CREATE TABLE snapshots (id TEXT, parentSnapshotId TEXT);
      CREATE TABLE snapshotShardAssignments (snapshotId TEXT, dataShardId TEXT);
      CREATE TABLE dataShards (id TEXT, bindingName TEXT);
      INSERT INTO snapshots VALUES ('parent', NULL), ('child', 'parent');
      INSERT INTO snapshotShardAssignments VALUES ('parent', 'old'), ('child', 'new');
      INSERT INTO dataShards VALUES ('old', 'old'), ('new', 'new');
    `)
    for (const db of [parent, child])
      db.exec(`
      CREATE TABLE snapshotVersionChanges (snapshotId TEXT, recordType TEXT, recordId TEXT,
        locale TEXT, versionHash TEXT, operation TEXT, sourceReleaseId TEXT);
      CREATE TABLE divisions (id TEXT, level INTEGER, type TEXT, versionHash TEXT);
      CREATE TABLE divisionsI18n (divisionId TEXT, locale TEXT, name TEXT, versionHash TEXT);
    `)
    const add = parent.prepare(
      'INSERT INTO snapshotVersionChanges VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    // More than one query batch, including content shared by different record IDs.
    for (let i = 0; i < 90; i++) {
      const id = `area-${i}`
      add.run('parent', 'division', id, '', 'shape', 'upsert', 'release')
      add.run('parent', 'divisionI18n', id, 'en', `name-${i}`, 'upsert', 'release')
      parent
        .prepare('INSERT INTO divisions VALUES (?, 1, ?, ?)')
        .run(id, 'area', 'shape')
      parent
        .prepare('INSERT INTO divisionsI18n VALUES (?, ?, ?, ?)')
        .run(id, 'en', id, `name-${i}`)
    }
    child.exec(`
      INSERT INTO snapshotVersionChanges VALUES
        ('child', 'division', 'area-0', '', NULL, 'delete', NULL),
        ('child', 'divisionI18n', 'area-1', 'en', 'renamed', 'upsert', 'release');
      INSERT INTO divisionsI18n VALUES ('area-1', 'en', 'Renamed area', 'renamed');
    `)
    const shards = new Map([
      [
        'old',
        {
          bindingName: 'old',
          db: drizzle({ client: parent, schema: historySchema }) as never,
        },
      ],
      [
        'new',
        {
          bindingName: 'new',
          db: drizzle({ client: child, schema: historySchema }) as never,
        },
      ],
    ])
    const rows = await loadAlsDivisionHistory(
      drizzle({ client: meta, schema: metaSchema }) as never,
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
