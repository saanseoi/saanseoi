import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { seedFixtureCatalog } from '../../core/src/testing/metaFixtures'

const directory = resolve(import.meta.dir, '../migrations/meta')

test('META memberships derive dataset ownership through restricted foreign keys', () => {
  const db = new Database(':memory:')
  const migrations = readdirSync(directory).sort()
  const apply = (name: string) =>
    db.exec(readFileSync(resolve(directory, name, 'migration.sql'), 'utf8'))
  try {
    for (const name of migrations) apply(name)
    seedFixtureCatalog(db)
    db.exec(`
      INSERT INTO sourceReleases(id,datasetId,code,sourceVersion,cohortKey,status)
      VALUES('source','overture-hk-division','source','2026-09-23.0','2026-09-23.0','current');
      INSERT INTO resourceReleases(id,sourceReleaseId,code,resourceType,status)
      VALUES('resource','source','resource','division','current');
      INSERT INTO snapshotLineages(id,code,regionCode,resourceType,identityMode,versionHash)
      VALUES('lineage','lineage','hk','division','persistent','hash');
      INSERT INTO snapshots(id,snapshotLineageId,code,cohortKey,status)
      VALUES('snapshot','lineage','snapshot','2026-09-23.0','published');
      INSERT INTO snapshotResourceReleases(snapshotId,resourceReleaseId,role,selectedByRule,selectionMode,anchorReleaseId)
      VALUES('snapshot','resource','primary','assembly-rule','exact_ref','resource');
    `)
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
