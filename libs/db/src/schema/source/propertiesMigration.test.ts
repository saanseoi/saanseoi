import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '../../../migrations/source')
const renameMigration = '20260911161401_smiling_living_tribunal'
const migrations = readdirSync(root, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort()

type Column = {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

const columns = (db: Database, table: string) =>
  db.query<Column, []>(`PRAGMA table_info("${table}")`).all()

test('source properties migration preserves every populated payload table and version interval', () => {
  const db = new Database(':memory:')
  try {
    const renameIndex = migrations.indexOf(renameMigration)
    expect(renameIndex).toBeGreaterThan(0)
    for (const migration of migrations.slice(0, renameIndex)) {
      db.exec(readFileSync(resolve(root, migration, 'migration.sql'), 'utf8'))
    }

    const tables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map(row => row.name)
      .filter(table =>
        columns(db, table).some(column => column.name === 'rawProperties'),
      )
    expect(tables).toHaveLength(18)

    const before = new Map(
      tables.map(table => {
        const schema = columns(db, table)
        for (const version of [1, 2]) {
          const values: Record<string, string | number | null> = {
            sourceRecordId: `${table}-publisher-id`,
            rawProperties: ` { "version": ${version}, "name": "原名", "sourceHash": "publisher-hash-${version}", "nested": [null, {"literal": true}] } `,
            sourceLocator: '{"sourceFile":"retained.geojson","featureIndex":17}',
            sources: '[{"dataset":"publisher","recordId":"original-id"}]',
            sourceGeometry: '{"type":"Point","coordinates":[114.1,22.3,4]}',
            versionHash: `unchanged-content-hash-${version}`,
            releaseId: `release-${version}`,
            validFromRelease: `2025-0${version}-01`,
            validToRelease: version === 1 ? '2025-02-01' : null,
            isCurrent: version === 2 ? 1 : 0,
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-03-01T00:00:00.000Z',
            placeNames: '[{"nameEn":"Original name","nameZhHant":"原名"}]',
            kind: 'full_time',
            censusYear: '2021',
            wasGeometryRepaired: 1,
            repairedGeometry: '{"type":"Point","coordinates":[114.1,22.3]}',
          }
          const fields = schema.map(column => column.name)
          for (const field of fields) expect(values).toHaveProperty(field)
          db.query(
            `INSERT INTO "${table}" (${fields.map(field => `"${field}"`).join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
          ).run(...fields.map(field => values[field]!))
        }
        return [
          table,
          {
            schema,
            rows: db
              .query<Record<string, unknown>, []>(
                `SELECT * FROM "${table}" ORDER BY versionHash`,
              )
              .all(),
            indexes: db
              .query(
                "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? ORDER BY name",
              )
              .all(table),
          },
        ] as const
      }),
    )

    db.exec(readFileSync(resolve(root, renameMigration, 'migration.sql'), 'utf8'))

    for (const [table, original] of before) {
      expect(columns(db, table)).toEqual(
        original.schema.map(column => ({
          ...column,
          name: column.name === 'rawProperties' ? 'properties' : column.name,
        })),
      )
      expect(columns(db, table).some(column => column.name === 'rawProperties')).toBe(
        false,
      )
      expect(db.query(`SELECT * FROM "${table}" ORDER BY versionHash`).all()).toEqual(
        original.rows.map(({ rawProperties, ...row }) => ({
          ...row,
          properties: rawProperties,
        })),
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
