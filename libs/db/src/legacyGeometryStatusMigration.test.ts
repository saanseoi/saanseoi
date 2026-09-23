import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '../migrations/meta')
const migration = '20260923060226_gray_black_cat'

test('legacy geometry drop preserves active status and dependent records', async () => {
  const db = new Database(':memory:')
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE sourceReleases (id TEXT PRIMARY KEY, legacyGeometryStatus TEXT NOT NULL DEFAULT 'authoritative');
      CREATE TABLE releases (id TEXT PRIMARY KEY, sourceReleaseId TEXT REFERENCES sourceReleases(id) ON DELETE CASCADE, legacyGeometryStatus TEXT NOT NULL DEFAULT 'authoritative', geometryStatus TEXT);
      CREATE TABLE snapshots (id TEXT PRIMARY KEY, releaseId TEXT REFERENCES releases(id) ON DELETE CASCADE, legacyGeometryStatus TEXT NOT NULL DEFAULT 'authoritative', geometryStatus TEXT);
      INSERT INTO sourceReleases VALUES ('source','authoritative');
      INSERT INTO releases VALUES ('geometry','source','fallback','fallback'), ('statistics','source','authoritative',NULL);
      INSERT INTO snapshots VALUES ('snapshot','geometry','fallback','fallback');`)
    await db.exec(await readFile(resolve(root, migration, 'migration.sql'), 'utf8'))
    expect(db.query('SELECT * FROM sourceReleases').all()).toEqual([{ id: 'source' }])
    expect(db.query('SELECT * FROM releases ORDER BY id').all()).toEqual([
      { id: 'geometry', sourceReleaseId: 'source', geometryStatus: 'fallback' },
      { id: 'statistics', sourceReleaseId: 'source', geometryStatus: null },
    ])
    expect(db.query('SELECT * FROM snapshots').all()).toEqual([
      { id: 'snapshot', releaseId: 'geometry', geometryStatus: 'fallback' },
    ])
    expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    db.close()
  }
})

test('the complete Meta migration chain removes legacy columns on fresh databases', async () => {
  const db = new Database(':memory:')
  try {
    for (const directory of (await readdir(root)).sort()) {
      if (directory > migration) break
      db.exec(await readFile(resolve(root, directory, 'migration.sql'), 'utf8'))
    }
    for (const table of ['sourceReleases', 'releases', 'snapshots']) {
      const columns = db.query(`PRAGMA table_info(${table})`).all() as {
        name: string
      }[]
      expect(columns.some(column => column.name === 'legacyGeometryStatus')).toBe(false)
      expect(columns.some(column => column.name === 'geometryStatus')).toBe(
        table !== 'sourceReleases',
      )
    }
  } finally {
    db.close()
  }
})
