import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadMigrationSql } from '../../core/src/testing/metaFixtures'

const migrationRoot = resolve(import.meta.dir, '../migrations')
const sql = loadMigrationSql(migrationRoot, ['current'])
const drop = readFileSync(
  resolve(import.meta.dir, '../scripts/sql/drop-current-db.sql'),
  'utf8',
)
const families = [
  'address',
  'division',
  'place',
  'street',
  'divisionArea',
  'divisionBoundary',
]

test('fresh migration and reset create all publication receipts without certifying existing data', () => {
  const db = new Database(':memory:')
  try {
    db.exec(sql)
    for (const family of families) {
      const table = `${family}PublicationState`
      db.query(
        `INSERT INTO ${table} (scopeId, snapshotId) VALUES ('scope', 'snapshot')`,
      ).run()
      expect(
        db.query(`SELECT status, publicationToken, preparedAt FROM ${table}`).get(),
      ).toEqual({ status: 'publishing', publicationToken: '', preparedAt: null })
    }
    db.exec(drop)
    db.exec(sql)
    for (const family of families)
      expect(
        db.query(`SELECT count(*) AS count FROM ${family}PublicationState`).get(),
      ).toEqual({ count: 0 })
    expect(
      db
        .query(
          "SELECT name FROM sqlite_master WHERE name IN ('addressCurrentScopes', 'statsCurrentSelections')",
        )
        .all(),
    ).toEqual([])
    expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    db.close()
  }
})

test('reset also removes prior table names before replaying generated migrations', () => {
  const db = new Database(':memory:')
  try {
    db.exec(
      'CREATE TABLE addressCurrentScopes(scopeId TEXT PRIMARY KEY, snapshotId TEXT); CREATE TABLE statsCurrentSelections(datasetCode TEXT, referencePeriodCode TEXT);',
    )
    db.exec(drop)
    db.exec(sql)
    expect(
      db
        .query("SELECT name FROM sqlite_master WHERE name='addressPublicationState'")
        .get(),
    ).toEqual({ name: 'addressPublicationState' })
  } finally {
    db.close()
  }
})
