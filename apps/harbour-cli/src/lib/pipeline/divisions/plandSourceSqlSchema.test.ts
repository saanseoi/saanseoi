import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { sourceSchema } from '@repo/db'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import {
  buildPlandSourceSql,
  plandSourceSqlColumns,
} from './processLocalHkgovPlandDivisionSqlUploadSql.ts'
import { executeSqliteDump } from '../../dbCache/sqliteDumpExecution.ts'
import {
  closeNativeSourceRows,
  insertSourceRows,
} from './processLocalHkgovPlandDivisionSqlUploadRows.ts'

for (const source of ['hkgov-pland-pu', 'hkgov-pland-new-town'])
  test(`Planning source SQL follows the current source schema: ${source}`, async () => {
    const input = new Database(':memory:')
    const output = new Database(':memory:')
    const schema = loadMigrationSql(
      resolve(import.meta.dir, '../../../../../../libs/db/migrations'),
      ['source'],
    )
    const table =
      source === 'hkgov-pland-pu' ? 'hkgovPlandPlanningCells' : 'hkgovPlandNewTowns'
    try {
      input.exec(schema)
      output.exec(schema)
      const geometry = JSON.stringify({
        type: 'Polygon',
        coordinates: ['x'.repeat(200_000)],
      })
      input
        .query(
          `INSERT INTO ${table} (sourceRecordId, properties, versionHash, releaseId, validFromRelease, isCurrent, sourceGeometry) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'record',
          '{"PPU":1,"name":"山水"}',
          'hash',
          'release',
          '2001',
          1,
          geometry,
        )
      expect(plandSourceSqlColumns(source)).toEqual(
        (
          input.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
        ).map(row => row.name),
      )
      expect(plandSourceSqlColumns(source)).not.toContain('repairedGeometry')
      expect(plandSourceSqlColumns(source)).not.toContain('wasGeometryRepaired')
      const sql = await buildPlandSourceSql(
        { sourceDb: createLocalHarbourDb(input) } as never,
        { source, sourceVersion: '2001' } as never,
        {
          changedNativeIds: ['record'],
          missingNativeIds: [],
          releaseCode: 'release',
        } as never,
      )
      executeSqliteDump(output, sql)
      expect(output.query(`SELECT * FROM ${table}`).all()).toEqual(
        input.query(`SELECT * FROM ${table}`).all(),
      )
    } finally {
      input.close()
      output.close()
    }
  })

for (const source of ['hkgov-pland-pu', 'hkgov-pland-new-town'] as const)
  test(`Planning source validity stores versions for inserts and closures: ${source}`, async () => {
    const input = new Database(':memory:')
    const output = new Database(':memory:')
    const schema = loadMigrationSql(
      resolve(import.meta.dir, '../../../../../../libs/db/migrations'),
      ['source'],
    )
    const table =
      source === 'hkgov-pland-pu' ? 'hkgovPlandPlanningCells' : 'hkgovPlandNewTowns'
    const sourceTable =
      source === 'hkgov-pland-pu'
        ? sourceSchema.sourceHkgovPlandPlanningCells
        : sourceSchema.sourceHkgovPlandNewTowns
    try {
      input.exec(schema)
      output.exec(schema)
      const db = createLocalHarbourDb(input)
      const record = {
        sourceRecordId: 'record',
        properties: { name: '山水' },
        sourceGeometry: {
          type: 'Polygon',
          coordinates: [
            [
              [114, 22],
              [115, 22],
              [115, 23],
              [114, 22],
            ],
          ],
        },
        wasGeometryRepaired: true,
      }
      await insertSourceRows(
        db as never,
        'release-2001',
        '2001',
        [record] as never,
        source,
        '2026-09-12T00:00:00.000Z',
        () => {},
      )
      const stored = input.query(`SELECT * FROM ${table}`).get()
      expect(stored).not.toHaveProperty('repairedGeometry')
      expect(stored).not.toHaveProperty('wasGeometryRepaired')
      expect(stored).toHaveProperty(
        'sourceGeometry',
        JSON.stringify(record.sourceGeometry),
      )
      await closeNativeSourceRows(
        db as never,
        sourceTable,
        ['record'],
        '2006',
        '2026-09-12T00:00:01.000Z',
      )
      expect(
        input
          .query(`SELECT validFromRelease, validToRelease, isCurrent FROM ${table}`)
          .get(),
      ).toEqual({ validFromRelease: '2001', validToRelease: '2006', isCurrent: 0 })

      const sql = await buildPlandSourceSql(
        { sourceDb: db } as never,
        { source, sourceVersion: '2006' } as never,
        {
          changedNativeIds: [],
          missingNativeIds: ['record'],
          releaseCode: `dr-hk-${source}-2006`,
        } as never,
      )
      expect(sql).toContain("validToRelease = '2006'")
      expect(sql).not.toContain('dr-hk-')
      executeSqliteDump(output, sql)
      expect(output.query(`SELECT * FROM ${table}`).all()).toEqual(
        input.query(`SELECT * FROM ${table}`).all(),
      )
    } finally {
      input.close()
      output.close()
    }
  })
