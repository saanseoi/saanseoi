import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

test('generated source migration preserves history and every Streets table', async () => {
  const root = resolve(import.meta.dir, '../../..', 'migrations/source')
  const migrations = (await readdir(root))
    .filter(name => name <= '20260910184445_typical_alex_power')
    .sort()
  const db = new Database(':memory:')
  try {
    for (const migration of migrations.slice(0, -1)) {
      db.exec(await readFile(resolve(root, migration, 'migration.sql'), 'utf8'))
    }
    const streetSchema = () =>
      db
        .query(
          "SELECT type,name,sql FROM sqlite_master WHERE name LIKE '%Street%' OR name LIKE '%RoadCentreline%' ORDER BY name",
        )
        .all()
    const before = streetSchema()
    db.exec(
      "INSERT INTO overturePlaces (sourceRecordId,versionHash,releaseId,validFromRelease,isCurrent,rawProperties,sources) VALUES ('publisher','hash','release','2025',0,'{\"name\":\"literal\"}','{\"sourceFile\":\"original\"}')",
    )
    db.exec(await readFile(resolve(root, migrations.at(-1)!, 'migration.sql'), 'utf8'))
    expect(streetSchema()).toEqual(before)
    expect(before.length).toBeGreaterThan(0)
    expect(
      db
        .query(
          'SELECT sourceRecordId,versionHash,validFromRelease,isCurrent,rawProperties,sourceLocator FROM overturePlaces',
        )
        .get(),
    ).toEqual({
      sourceRecordId: 'publisher',
      versionHash: 'hash',
      validFromRelease: '2025',
      isCurrent: 0,
      rawProperties: '{"name":"literal"}',
      sourceLocator: '{"sourceFile":"original"}',
    })
    expect(db.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
  } finally {
    db.close()
  }
})
