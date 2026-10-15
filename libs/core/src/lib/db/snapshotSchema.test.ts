import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { collectSqlFiles } from '../../testing/metaFixtures'

const migrations = collectSqlFiles(
  resolve(import.meta.dir, '../../../../db/migrations/meta'),
).sort()

function createDatabase() {
  const db = new Database(':memory:')
  for (const file of migrations) db.exec(readFileSync(file, 'utf8'))
  db.exec(`
    PRAGMA foreign_keys = ON;
    INSERT INTO snapshotLineages (id,code,regionCode,resourceType,variant,identityMode,versionHash)
    VALUES ('division','division','hk','division','overture','persistent','fixture'),
           ('place','place','hk','place','overture','persistent','fixture');
    INSERT INTO snapshots (id,snapshotLineageId,code,cohortKey,revision,status)
    VALUES ('snapshot','division','ss-hk-division-2026-r0','2026',0,'published');
    CREATE TABLE snapshotReferences (snapshotId TEXT REFERENCES snapshots(id) ON DELETE CASCADE);
    INSERT INTO snapshotReferences VALUES ('snapshot');
  `)
  return db
}

test('generated snapshot schema derives resource type from the lineage and enforces references and uniqueness', () => {
  const db = createDatabase()
  try {
    expect(
      db
        .query('PRAGMA table_info(snapshots)')
        .all()
        .map(row => (row as { name: string }).name),
    ).not.toContain('resourceType')
    expect(
      db
        .query(`SELECT s.id, s.snapshotLineageId, s.code, s.cohortKey, s.revision, s.status, l.resourceType
      FROM snapshots s JOIN snapshotLineages l ON l.id=s.snapshotLineageId`)
        .get(),
    ).toEqual({
      id: 'snapshot',
      snapshotLineageId: 'division',
      code: 'ss-hk-division-2026-r0',
      cohortKey: '2026',
      revision: 0,
      status: 'published',
      resourceType: 'division',
    })
    expect(db.query('SELECT snapshotId FROM snapshotReferences').all()).toEqual([
      { snapshotId: 'snapshot' },
    ])
    expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
    const insert = db.query(
      `INSERT INTO snapshots (id,snapshotLineageId,code,cohortKey,revision,status) VALUES (?, ?, ?, '2026', ?, 'draft')`,
    )
    expect(() => insert.run('missing', null, 'missing', 1)).toThrow('NOT NULL')
    expect(() => insert.run('orphan', 'unknown', 'orphan', 1)).toThrow('FOREIGN KEY')
    expect(() => insert.run('duplicate', 'place', 'ss-hk-division-2026-r0', 0)).toThrow(
      'UNIQUE',
    )
    expect(() =>
      insert.run('duplicate-revision', 'division', 'different-code', 0),
    ).toThrow('UNIQUE')
    expect(() =>
      db.query("DELETE FROM snapshotLineages WHERE id='division'").run(),
    ).toThrow('FOREIGN KEY')
  } finally {
    db.close()
  }
})

test('generated snapshot schema rejects removing a lineage from an existing snapshot', () => {
  const db = createDatabase()
  try {
    expect(() =>
      db.exec("UPDATE snapshots SET snapshotLineageId = NULL WHERE id='snapshot'"),
    ).toThrow('NOT NULL')
    expect(
      db.query("SELECT id, snapshotLineageId FROM snapshots WHERE id='snapshot'").get(),
    ).toEqual({ id: 'snapshot', snapshotLineageId: 'division' })
  } finally {
    db.close()
  }
})
