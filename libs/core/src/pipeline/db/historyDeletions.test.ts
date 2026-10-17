import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { currentSchema, getTableColumns } from '@repo/db'
import { createLocalHarbourDb } from '../../testing/localDb'
import { loadMigrationSql } from '../../testing/metaFixtures'
import { recordHistoryDeletions } from './historyDeletions'

test.each([
  ['divisionArea', 'divisionAreas'],
  ['divisionBoundary', 'divisionBoundaries'],
])('%s deletion events do not invent a geometry variant', async (recordType, table) => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../db/migrations'), [
        'history',
      ]),
    )
    const db = createLocalHarbourDb(sqlite)
    await recordHistoryDeletions(db, {
      snapshotId: 'pland-child',
      recordType,
      operation: 'delete',
      changes: Array.from({ length: 120 }, (_, index) => ({
        recordId: `removed-${index}`,
      })),
    })
    const rows = sqlite
      .query(`SELECT variant, operation, versionHash FROM ${table}`)
      .all()
    expect(rows).toHaveLength(120)
    expect(
      rows.every(
        row =>
          JSON.stringify(row) ===
          JSON.stringify({ variant: null, operation: 'delete', versionHash: null }),
      ),
    ).toBe(true)
    // The SQL default must also be absent for non-ORM writers.
    sqlite.exec(
      `INSERT INTO ${table}(id,snapshotId,operation) VALUES('raw','pland-child','delete')`,
    )
    expect(sqlite.query(`SELECT variant FROM ${table} WHERE id='raw'`).get()).toEqual({
      variant: null,
    })
    const ownership =
      table === 'divisionAreas' ? 'divisionId' : 'leftDivisionId,rightDivisionId'
    const owners = table === 'divisionAreas' ? "'d'" : "'left','right'"
    sqlite.exec(
      `INSERT INTO ${table}(id,snapshotId,versionHash,variant,type,${ownership}) VALUES('live','pland-child','hash','hkgov-pland-new-town','geometry',${owners})`,
    )
    expect(sqlite.query(`SELECT variant FROM ${table} WHERE id='live'`).get()).toEqual({
      variant: 'hkgov-pland-new-town',
    })
    expect(
      getTableColumns(currentSchema[table as 'divisionAreas' | 'divisionBoundaries'])
        .variant.default,
    ).toBe('overture')
  } finally {
    sqlite.close()
  }
})
