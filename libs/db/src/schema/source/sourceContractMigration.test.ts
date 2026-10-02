import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('fresh source migration chain creates every Streets table and source payload contract', () => {
  const root = resolve(import.meta.dir, '../../..', 'migrations/source')
  const migrations = readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
  if (migrations.length === 0)
    throw new Error('The source baseline migration is missing.')

  const db = new Database(':memory:')
  try {
    for (const migration of migrations) {
      db.exec(readFileSync(resolve(root, migration, 'migration.sql'), 'utf8'))
    }
    const streetSchema = () =>
      db
        .query(
          "SELECT type,name,sql FROM sqlite_master WHERE name LIKE '%Street%' OR name LIKE '%RoadCentreline%' ORDER BY name",
        )
        .all()
    db.exec(
      "INSERT INTO overturePlaces (sourceRecordId,versionHash,resourceReleaseId,validFromRelease,isCurrent,properties) VALUES ('publisher','hash','release','2025',0,'{\"name\":\"literal\"}')",
    )
    expect(streetSchema().length).toBeGreaterThan(0)
    expect(
      db
        .query(
          'SELECT sourceRecordId,versionHash,validFromRelease,isCurrent,properties FROM overturePlaces',
        )
        .get(),
    ).toEqual({
      sourceRecordId: 'publisher',
      versionHash: 'hash',
      validFromRelease: '2025',
      isCurrent: 0,
      properties: '{"name":"literal"}',
    })
    db.exec(
      "INSERT INTO ssDivision (sourceRecordId,versionHash,resourceReleaseId,validFromRelease,isCurrent) VALUES ('curated','hash','release','2026',1)",
    )
    expect(db.query('SELECT sourceGeometry FROM ssDivision').get()).toEqual({
      sourceGeometry: null,
    })
    expect(() =>
      db.exec(
        "INSERT INTO ssDivisionArea (sourceRecordId,versionHash,resourceReleaseId,validFromRelease,isCurrent) VALUES ('curated','hash','release','2026',1)",
      ),
    ).toThrow('NOT NULL constraint failed: ssDivisionArea.sourceGeometry')
    expect(db.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
  } finally {
    db.close()
  }
})
