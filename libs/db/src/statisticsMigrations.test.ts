import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { loadMigrationSql } from '../../core/src/testing/metaFixtures'

test('Statistics migrations retain publisher payloads and canonical reference periods', () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../migrations'), [
        'source',
        'history',
      ]),
    )
    const periodColumns = [
      'referencePeriodCode',
      'referencePeriodStart',
      'referencePeriodEnd',
      'referencePeriodGranularity',
      'referencePeriodEndYear',
    ]
    for (const table of [
      'hkgovCenstatdDistrictLandAreaPopulationDensities',
      'hkgovCenstatdStatistics',
    ]) {
      const columns = (
        sqlite.query(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>
      ).map(column => column.name)
      expect(columns).toContain('rawProperties')
      expect(columns).toContain('sourceGeometry')
      for (const column of periodColumns) expect(columns).not.toContain(column)
      const payload = JSON.stringify({
        Year: '2021',
        referencePeriodCode: 'publisher-literal',
        Population: 123,
      })
      sqlite
        .query(`INSERT INTO "${table}" (sourceRecordId, versionHash, releaseId, validFromRelease, isCurrent, rawProperties, sourceGeometry)
        VALUES ('record', 'hash', 'release', '2021', 1, ?, 'null')`)
        .run(payload)
      expect(sqlite.query(`SELECT rawProperties FROM "${table}"`).get()).toEqual({
        rawProperties: payload,
      })
    }
    const canonicalColumns = (
      sqlite.query('PRAGMA table_info(statsRecords)').all() as Array<{ name: string }>
    ).map(column => column.name)
    for (const column of periodColumns) expect(canonicalColumns).toContain(column)
  } finally {
    sqlite.close()
  }
})
