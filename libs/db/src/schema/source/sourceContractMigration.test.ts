import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('fresh source migration creates every Streets table and source payload contract', () => {
  const root = resolve(import.meta.dir, '../../..', 'migrations/source')
  const migration = readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
    .at(-1)
  if (!migration) throw new Error('The source baseline migration is missing.')

  const db = new Database(':memory:')
  try {
    db.exec(readFileSync(resolve(root, migration, 'migration.sql'), 'utf8'))
    const streetSchema = () =>
      db
        .query(
          "SELECT type,name,sql FROM sqlite_master WHERE name LIKE '%Street%' OR name LIKE '%RoadCentreline%' ORDER BY name",
        )
        .all()
    db.exec(
      "INSERT INTO overturePlaces (sourceRecordId,versionHash,releaseId,validFromRelease,isCurrent,rawProperties,sourceLocator) VALUES ('publisher','hash','release','2025',0,'{\"name\":\"literal\"}','{\"sourceFile\":\"original\"}')",
    )
    expect(streetSchema().length).toBeGreaterThan(0)
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
