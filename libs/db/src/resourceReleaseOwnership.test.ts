import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { seedFixtureCatalog } from '../../core/src/testing/metaFixtures'
import { createLocalHarbourDb } from '../../core/src/testing/localDb'
import { retainSourceReleaseMetadata } from '../../core/src/lib/db/sourceReleaseMetadata'

const migration = '20261013050154_outgoing_mac_gargan'
const directory = resolve(import.meta.dir, '../migrations/meta')
const sourceMetadata = {
  datasetId: 'overture-hk-division',
  sourceVersion: '2026-09-23.0',
  sourceSchemaVersion: '2.0.0',
  publicationDate: '2026-09-23',
  cohortKey: '2026-09-23.0',
  releaseNotesUrl: null,
}

function fixture() {
  const db = new Database(':memory:')
  for (const entry of readdirSync(directory)
    .filter(name => name < migration)
    .sort())
    db.exec(readFileSync(resolve(directory, entry, 'migration.sql'), 'utf8'))
  seedFixtureCatalog(db)
  db.exec(`
    INSERT INTO sourceReleases(id,datasetId,code,sourceVersion,sourceSchemaVersion,publicationDate,cohortKey,status)
    VALUES('source','overture-hk-division','source-code','2026-09-23.0','2.0.0','2026-09-23','2026-09-23.0','current');
    INSERT INTO resourceReleases(id,sourceReleaseId,datasetId,code,resourceType,sourceVersion,sourceSchemaVersion,publicationDate,cohortKey,status)
    VALUES('division','source','overture-hk-division','division-code','division','2026-09-23.0','2.0.0','2026-09-23','2026-09-23.0','current'),
          ('area','source','overture-hk-division','area-code','divisionArea','2026-09-23.0','2.0.0','2026-09-23','2026-09-23.0','processing');
  `)
  db.exec(readFileSync(resolve(directory, migration, 'migration.sql'), 'utf8'))
  db.exec('PRAGMA foreign_keys=ON')
  return db
}

test('migration retains resource identity and lifecycle while source metadata has one owner', () => {
  const db = fixture()
  try {
    const columns = db.query('PRAGMA table_info(resourceReleases)').all() as {
      name: string
    }[]
    for (const field of [
      'sourceVersion',
      'sourceSchemaVersion',
      'publicationDate',
      'cohortKey',
      'releaseNotesUrl',
    ])
      expect(columns.map(column => column.name)).not.toContain(field)
    expect(
      db.query('SELECT id,status FROM resourceReleases ORDER BY id').all(),
    ).toEqual([
      { id: 'area', status: 'processing' },
      { id: 'division', status: 'current' },
    ])
    expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
    db.exec(
      "UPDATE sourceReleases SET releaseNotesUrl='https://example.com/release' WHERE id='source'",
    )
    expect(
      db
        .query(
          'SELECT sourceVersion,sourceSchemaVersion,releaseNotesUrl FROM resourceReleaseDetails',
        )
        .all(),
    ).toEqual([
      {
        sourceVersion: '2026-09-23.0',
        sourceSchemaVersion: '2.0.0',
        releaseNotesUrl: 'https://example.com/release',
      },
      {
        sourceVersion: '2026-09-23.0',
        sourceSchemaVersion: '2.0.0',
        releaseNotesUrl: 'https://example.com/release',
      },
    ])
    expect(() =>
      db.exec("UPDATE resourceReleases SET sourceVersion='wrong' WHERE id='area'"),
    ).toThrow()
    expect(() =>
      db.exec(
        "UPDATE resourceReleaseDetails SET sourceVersion='wrong' WHERE id='area'",
      ),
    ).toThrow()
    expect(() =>
      db.exec(
        "UPDATE resourceReleases SET datasetId='overture-hk-divisionArea' WHERE id='area'",
      ),
    ).toThrow('FOREIGN KEY')
    expect(() =>
      db.exec("UPDATE resourceReleases SET resourceType='division' WHERE id='area'"),
    ).toThrow('UNIQUE')
  } finally {
    db.close()
  }
})

test('sibling registration rejects conflicting source assertions and fills only missing metadata', async () => {
  const sqlite = fixture()
  try {
    const db = createLocalHarbourDb(sqlite)
    await retainSourceReleaseMetadata(db, 'source', sourceMetadata)
    await retainSourceReleaseMetadata(db, 'source', {
      ...sourceMetadata,
      releaseNotesUrl: 'https://example.com/release',
    })
    for (const field of [
      'datasetId',
      'sourceVersion',
      'sourceSchemaVersion',
      'publicationDate',
      'cohortKey',
      'releaseNotesUrl',
    ] as const) {
      await expect(
        retainSourceReleaseMetadata(db, 'source', {
          ...sourceMetadata,
          [field]: 'conflicting',
        }),
      ).rejects.toThrow(`conflicting ${field}`)
    }
    await retainSourceReleaseMetadata(db, 'source', sourceMetadata)
    expect(sqlite.query('SELECT releaseNotesUrl FROM sourceReleases').get()).toEqual({
      releaseNotesUrl: 'https://example.com/release',
    })
  } finally {
    sqlite.close()
  }
})
