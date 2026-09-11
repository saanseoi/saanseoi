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

test('release statistics have one owner and use metric without kind', () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(loadMigrationSql(resolve(import.meta.dir, '../migrations'), ['meta']))
    sqlite.exec('PRAGMA foreign_keys = OFF')
    const columns = (
      sqlite.query('PRAGMA table_info(stats)').all() as Array<{ name: string }>
    ).map(row => row.name)
    expect(columns).not.toContain('kind')
    expect(columns).not.toContain('type')
    const insert = sqlite.query(
      "INSERT INTO stats (id, releaseId, apiReleaseSetId, dimension, metric, metricUnit, value) VALUES (?, ?, ?, 'rows', 'processing', 'count', 1)",
    )
    expect(() => insert.run('no-owner', null, null)).toThrow()
    expect(() => insert.run('two-owners', 'release', 'api')).toThrow()
    insert.run('release-owned', 'release', null)
    insert.run('api-owned', null, 'api')
    expect(sqlite.query('SELECT count(*) AS count FROM stats').get()).toEqual({
      count: 2,
    })
  } finally {
    sqlite.close()
  }
})

test('current and history share packed payloads and retain exact dictionary versions', () => {
  const current = new Database(':memory:')
  const history = new Database(':memory:')
  try {
    const migrations = resolve(import.meta.dir, '../migrations')
    current.exec(loadMigrationSql(migrations, ['current']))
    history.exec(loadMigrationSql(migrations, ['history']))
    const columns = (db: Database, table: string) =>
      db.query(`PRAGMA table_info("${table}")`).all() as Array<{
        name: string
        pk: number
      }>
    const currentColumns = columns(current, 'statsRecords').map(column => column.name)
    const historyColumns = columns(history, 'statsRecords').map(column => column.name)
    expect(currentColumns).not.toContain('dimensions')
    for (const column of [
      'values',
      'fieldSources',
      'fieldDefinitionHashes',
      'versionHash',
    ])
      expect(currentColumns).toContain(column)
    for (const column of currentColumns) expect(historyColumns).toContain(column)
    expect(
      columns(current, 'statsPublicationState')
        .filter(column => column.pk)
        .map(column => column.name),
    ).toEqual(['datasetCode', 'referencePeriodCode'])
    for (const db of [current, history]) {
      const keys = columns(db, 'statsFields')
        .filter(column => column.pk)
        .sort((a, b) => a.pk - b.pk)
        .map(column => column.name)
      expect(keys).toEqual(['datasetCode', 'fieldName', 'versionHash'])
      expect(columns(db, 'statsFields').map(column => column.name)).toContain(
        'measureVersionHash',
      )
    }
  } finally {
    current.close()
    history.close()
  }
})
