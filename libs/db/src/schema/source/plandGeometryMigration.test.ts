import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '../../../migrations/source')
const repairMigration = '20260911192204_chief_victor_mancha'

test('Planning repair-column removal preserves publisher geometry, versions and indexes', () => {
  const db = new Database(':memory:')
  try {
    const migrations = readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
    const migrationIndex = migrations.indexOf(repairMigration)
    expect(migrationIndex).toBeGreaterThan(0)
    for (const migration of migrations.slice(0, migrationIndex)) {
      db.exec(readFileSync(resolve(root, migration, 'migration.sql'), 'utf8'))
    }
    const tables = ['hkgovPlandNewTowns', 'hkgovPlandPlanningCells']
    const before = new Map(
      tables.map(table => {
        for (const version of [1, 2]) {
          db.query(
            `INSERT INTO ${table} (sourceRecordId, sourceLocator, properties, sourceGeometry, versionHash, releaseId, validFromRelease, validToRelease, isCurrent, wasGeometryRepaired, repairedGeometry)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            'publisher-record',
            '{"layer":"publisher-layer"}',
            ` { "version": ${version}, "name": "原名" } `,
            '{"type":"Polygon","coordinates":[[[114,22],[115,23],[115,22],[114,23],[114,22]]]}',
            `hash-${version}`,
            `release-${version}`,
            version === 1 ? '2006' : '2011',
            version === 1 ? '2011' : null,
            version === 2 ? 1 : 0,
            1,
            '{"type":"Polygon","coordinates":[[[114.5,22.5],[115,23],[115,22],[114.5,22.5]]]}',
          )
        }
        return [
          table,
          {
            rows: db
              .query<Record<string, unknown>, []>(
                `SELECT * FROM ${table} ORDER BY versionHash`,
              )
              .all()
              .map(
                ({ repairedGeometry: _geometry, wasGeometryRepaired: _flag, ...row }) =>
                  row,
              ),
            indexes: db
              .query(
                "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? ORDER BY name",
              )
              .all(table),
          },
        ] as const
      }),
    )
    db.exec(readFileSync(resolve(root, repairMigration, 'migration.sql'), 'utf8'))
    for (const [table, original] of before) {
      // A fresh statement avoids Bun's cached pre-migration column metadata.
      expect(db.prepare(`SELECT * FROM ${table} ORDER BY versionHash`).all()).toEqual(
        original.rows,
      )
      expect(
        db
          .query(
            "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? ORDER BY name",
          )
          .all(table),
      ).toEqual(original.indexes)
    }
    expect(db.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
  } finally {
    db.close()
  }
})
