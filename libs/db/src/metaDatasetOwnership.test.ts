import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { seedFixtureCatalog } from '../../core/src/testing/metaFixtures'

const directory = resolve(import.meta.dir, '../migrations/meta')
const firstMigration = '20261013053216_nifty_colossus'

test('META normalisation preserves memberships and derives dataset ownership through restricted foreign keys', () => {
  const db = new Database(':memory:')
  const migrations = readdirSync(directory).sort()
  const apply = (name: string) =>
    db.exec(readFileSync(resolve(directory, name, 'migration.sql'), 'utf8'))
  try {
    for (const name of migrations.filter(name => name < firstMigration)) apply(name)
    seedFixtureCatalog(db)
    db.exec(`
      INSERT INTO sourceReleases(id,datasetId,code,sourceVersion,cohortKey,status)
      VALUES('source','overture-hk-division','source','2026-09-23.0','2026-09-23.0','current');
      INSERT INTO resourceReleases(id,sourceReleaseId,datasetId,code,resourceType,status)
      VALUES('resource','source','overture-hk-division','resource','division','current');
      INSERT INTO snapshotLineages(id,code,regionCode,resourceType,identityMode,versionHash)
      VALUES('lineage','lineage','hk','division','persistent','hash');
      INSERT INTO snapshots(id,snapshotLineageId,code,cohortKey,status)
      VALUES('snapshot','lineage','snapshot','2026-09-23.0','published');
      INSERT INTO snapshotResourceReleases(snapshotId,datasetId,resourceReleaseId,role,sourceCohortKey,selectedByRule,selectionMode,anchorReleaseId)
      VALUES('snapshot','overture-hk-division','resource','primary','2026-09-23.0','assembly-rule','exact_ref','resource');
    `)
    const before = db.prepare('SELECT * FROM snapshotResourceReleases').get() as Record<
      string,
      unknown
    >
    delete before.datasetId
    delete before.sourceCohortKey
    for (const name of migrations.filter(name => name >= firstMigration)) apply(name)
    expect(db.prepare('SELECT * FROM snapshotResourceReleases').get()).toEqual(before)
    for (const table of ['resourceReleases', 'snapshotResourceReleases']) {
      const columns = db.query(`PRAGMA table_info(${table})`).all() as {
        name: string
      }[]
      expect(columns.map(column => column.name)).not.toContain('datasetId')
      expect(columns.map(column => column.name)).not.toContain('sourceCohortKey')
    }
    expect(db.query('SELECT datasetId FROM resourceReleaseDetails').all()).toEqual([
      { datasetId: 'overture-hk-division' },
    ])
    expect(
      db.query('SELECT datasetId FROM snapshotResourceReleaseDetails').all(),
    ).toEqual([{ datasetId: 'overture-hk-division' }])
    expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
    db.exec('PRAGMA foreign_keys=ON')
    expect(() =>
      db.exec("UPDATE resourceReleases SET sourceReleaseId='missing'"),
    ).toThrow()
    expect(() =>
      db.exec("UPDATE snapshotResourceReleases SET resourceReleaseId='missing'"),
    ).toThrow()
    expect(() => db.exec("DELETE FROM sourceReleases WHERE id='source'")).toThrow()
    expect(() => db.exec("DELETE FROM resourceReleases WHERE id='resource'")).toThrow()
    db.exec("DELETE FROM snapshots WHERE id='snapshot'")
    expect(db.prepare('SELECT * FROM snapshotResourceReleases').all()).toEqual([])
    expect(db.query('SELECT id FROM resourceReleases').all()).toEqual([
      { id: 'resource' },
    ])
  } finally {
    db.close()
  }
})
