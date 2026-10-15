import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getTableColumns, getTableName, is } from 'drizzle-orm'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'
import * as meta from './schema/meta'
import * as current from './schema/current/migrationSchema'
import * as history from './schema/history'
import * as source from './schema/source'

for (const [family, schema] of Object.entries({ meta, current, history, source })) {
  test(`${family} migrations create the declared tables and column contracts`, () => {
    const db = new Database(':memory:')
    try {
      const root = resolve(import.meta.dir, '../migrations', family)
      const migrations = readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort()
      expect(migrations.length).toBeGreaterThan(0)
      let previousSnapshotId: string | undefined
      for (const migration of migrations) {
        const snapshot = JSON.parse(
          readFileSync(resolve(root, migration, 'snapshot.json'), 'utf8'),
        ) as { id: string; prevIds: string[] }
        if (previousSnapshotId)
          // Drizzle can retain additional parents when merging snapshots.
          expect(snapshot.prevIds, `${family}/${migration}`).toContain(
            previousSnapshotId,
          )
        expect(new Set(snapshot.prevIds).size, `${family}/${migration}`).toBe(
          snapshot.prevIds.length,
        )
        expect(snapshot.prevIds, `${family}/${migration}`).not.toContain(snapshot.id)
        previousSnapshotId = snapshot.id
        db.exec(readFileSync(resolve(root, migration, 'migration.sql'), 'utf8'))
      }
      const tables = Object.values(schema).filter(table => is(table, SQLiteTable))
      const created = db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all()
        .map(row => row.name)
      expect(created).toEqual(tables.map(getTableName).sort())
      for (const table of tables) {
        const columns = Object.values(getTableColumns(table))
        const actual = db
          .query<{ name: string; type: string; notnull: number }, []>(
            `PRAGMA table_info("${getTableName(table)}")`,
          )
          .all()
        expect(
          actual
            .map(({ name, type, notnull }) => ({ name, type, notnull }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ).toEqual(
          columns
            .map(column => ({
              name: column.name,
              type: column.getSQLType().toUpperCase(),
              // Drizzle emits column-level primary keys without explicit NOT NULL.
              notnull: Number(column.notNull && !column.primary),
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
        if (family === 'source') {
          expect(actual.some(column => column.name === 'sourceLocator')).toBe(
            [
              'hkgovAlsAddresses2d',
              'hkgovAlsAddresses3d',
              'hkgovCenstatdStatistics',
            ].includes(getTableName(table)),
          )
          if (
            !['hkgovCenstatdGeometry', 'hkgovCenstatdGeometryDerivatives'].includes(
              getTableName(table),
            )
          )
            expect(actual.slice(-2).map(column => column.name)).toEqual([
              'createdAt',
              'updatedAt',
            ])
        }
      }
      expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(db.query('PRAGMA integrity_check').get()).toEqual({
        integrity_check: 'ok',
      })
    } finally {
      db.close()
    }
  })
}
