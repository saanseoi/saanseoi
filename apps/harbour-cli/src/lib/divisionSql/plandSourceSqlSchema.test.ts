import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures.ts'
import {
  buildPlandSourceSql,
  plandSourceSqlColumns,
} from './processLocalHkgovPlandDivisionSqlUploadSql.ts'
import { executeSqliteDump } from '../dbCache/sqliteDumpExecution.ts'

for (const source of ['hkgov-pland-pu', 'hkgov-pland-new-town'])
  test(`Planning source SQL follows the current source schema: ${source}`, async () => {
    const input = new Database(':memory:')
    const output = new Database(':memory:')
    const schema = loadMigrationSql(
      resolve(import.meta.dir, '../../../../../libs/db/migrations'),
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
          `INSERT INTO ${table} (sourceRecordId, rawProperties, versionHash, releaseId, validFromRelease, isCurrent, sourceGeometry) VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
      const sql = await buildPlandSourceSql(
        { sourceDb: createLocalHarbourDb(input) } as never,
        { source } as never,
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
