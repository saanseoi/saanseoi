import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { captureSqlDeliveryBatches } from '../local/sqlDeliveryBatchCapture.ts'

import {
  buildStatisticSqlBatches,
  buildCenstatdGeometryStatements,
  replayStatisticSqlBatches,
} from './statisticSqlReplay.ts'

const resourceReleaseId = 'release-2022'
const sourceVersion = '2022'

function replayDatabase() {
  const db = new Database(':memory:')
  db.exec(
    'CREATE TABLE hkgovCenstatdStatisticsGeometry(id PRIMARY KEY, sourceGeometry BLOB NOT NULL)',
  )
  return db
}

function sourceRow(sourceRecordId: string) {
  return {
    datasetCode: 'dataset',
    createdAt: '2026-08-16T00:00:00.000Z',
    isCurrent: true,
    properties: { district: sourceRecordId },
    resourceReleaseId,
    geometryId: 'geometry',
    sourceRecordId,
    sources: [{ dataset: 'C&SD' }],
    updatedAt: '2026-08-16T00:00:00.000Z',
    validFromRelease: sourceVersion,
    validToRelease: null,
    version: 1,
    versionHash: `source-${sourceRecordId}`,
  }
}

function historyRow(id: string) {
  return {
    createdAt: '2026-08-16T00:00:00.000Z',
    districtCode: '1',
    divisionId: 'district-1',
    id,
    isCurrent: true,
    landAreaSqKm: 1,
    midYearPopulation: 1,
    midYearPopulationDensityPerSqKm: 1,
    referenceYear: '2022',
    sourceReleaseId: resourceReleaseId,
    sources: [{ dataset: 'C&SD' }],
    updatedAt: '2026-08-16T00:00:00.000Z',
    versionHash: `history-${id}`,
  }
}

describe('buildStatisticSqlBatches', () => {
  for (const table of ['hkgovCenstatdStatistics'] as const)
    test(`retains version-only validity across source revisions: ${table}`, () => {
      const sqlite = replayDatabase()
      try {
        sqlite.exec(`CREATE TABLE ${table} (
          datasetCode TEXT, createdAt TEXT, isCurrent INTEGER, properties TEXT, resourceReleaseId TEXT,
          geometryId TEXT, sourceRecordId TEXT, sources TEXT, updatedAt TEXT,
          validFromRelease TEXT, validToRelease TEXT, version INTEGER, versionHash TEXT,
          PRIMARY KEY (datasetCode, resourceReleaseId, sourceRecordId, versionHash)
        )`)
        const replay = (version: string, hash: string) => {
          const batches = buildStatisticSqlBatches({
            sourceVersion: version,
            resourceReleaseId: `release-${version}`,
            source: {
              table,
              rows: [
                {
                  ...sourceRow('district-1'),
                  resourceReleaseId: `release-${version}`,
                  validFromRelease: version,
                  versionHash: hash,
                },
              ],
            },
          })
          for (const sql of batches.source) sqlite.exec(sql)
        }
        replay('2023-H1', 'first-hash')
        replay('2023-H2', 'second-hash')
        replay('2024-H1', 'second-hash')
        expect(
          sqlite
            .query(`SELECT validFromRelease, validToRelease, isCurrent
          FROM ${table} ORDER BY validFromRelease`)
            .all(),
        ).toEqual([
          { validFromRelease: '2023-H1', validToRelease: '2023-H2', isCurrent: 0 },
          { validFromRelease: '2023-H2', validToRelease: '2024-H1', isCurrent: 0 },
          { validFromRelease: '2024-H1', validToRelease: null, isCurrent: 1 },
        ])
      } finally {
        sqlite.close()
      }
    })

  test('rejects one publisher row that exceeds the D1 statement limit', () => {
    expect(() =>
      buildStatisticSqlBatches({
        sourceVersion,
        resourceReleaseId,
        source: {
          rows: [
            {
              ...sourceRow('district-large'),
              properties: { value: 'x'.repeat(100_000) },
            },
          ],
          table: 'hkgovCenstatdStatistics',
        },
      }),
    ).toThrow('A statistic SQL statement exceeds the D1 limit')
  })

  test('resumes large shared geometry writes and never appends to a complete row', () => {
    const sourceGeometry = Uint8Array.from({ length: 250_000 }, (_, i) => i % 251)
    const statements = buildCenstatdGeometryStatements([
      { id: 'geometry', sourceGeometry },
    ])
    expect(statements.every(sql => Buffer.byteLength(sql) <= 96 * 1024)).toBeTrue()
    const db = replayDatabase()
    try {
      // Interrupt after two appends, then replay the complete delivery twice.
      for (const sql of statements.slice(0, 3)) db.exec(sql)
      for (let attempt = 0; attempt < 2; attempt++)
        for (const sql of statements) db.exec(sql)
      expect(
        db.query('SELECT sourceGeometry FROM hkgovCenstatdStatisticsGeometry').get(),
      ).toEqual({ sourceGeometry: Buffer.from(sourceGeometry) })
    } finally {
      db.close()
    }
  })

  test('creates deterministic source/history upserts that restore a failed release safely', () => {
    const batches = buildStatisticSqlBatches({
      history: {
        rows: [historyRow('stat-2'), historyRow('stat-1')],
        table: 'divisionStatistics',
      },
      sourceVersion,
      resourceReleaseId,
      source: {
        rows: [sourceRow('district-2'), sourceRow('district-1')],
        table: 'hkgovCenstatdStatistics',
      },
    })

    expect(batches.source).toHaveLength(1)
    expect(batches.history).toHaveLength(1)
    const [sourceSql] = batches.source
    const [historySql] = batches.history
    if (!sourceSql || !historySql) throw new Error('Expected replay SQL batches.')
    expect(sourceSql).toContain('UPDATE "hkgovCenstatdStatistics" SET "isCurrent" = 0')
    expect(sourceSql).toContain(
      'ON CONFLICT ("datasetCode", "resourceReleaseId", "sourceRecordId", "versionHash") DO UPDATE SET',
    )
    expect(historySql).toContain('ON CONFLICT ("id", "versionHash") DO UPDATE SET')
    expect(sourceSql.indexOf("'district-1'")).toBeLessThan(
      sourceSql.indexOf("'district-2'"),
    )
    expect(
      buildStatisticSqlBatches({
        history: {
          rows: [historyRow('stat-1'), historyRow('stat-2')],
          table: 'divisionStatistics',
        },
        sourceVersion,
        resourceReleaseId,
        source: {
          rows: [sourceRow('district-1'), sourceRow('district-2')],
          table: 'hkgovCenstatdStatistics',
        },
      }),
    ).toEqual(batches)
  })

  test('can be applied again after a failed release without duplicating versions', () => {
    const batches = buildStatisticSqlBatches({
      history: { rows: [historyRow('stat-1')], table: 'divisionStatistics' },
      sourceVersion,
      resourceReleaseId,
      source: {
        rows: [sourceRow('district-1')],
        table: 'hkgovCenstatdStatistics',
      },
    })
    const sqlite = replayDatabase()
    sqlite.exec(`
      CREATE TABLE hkgovCenstatdStatistics (
        datasetCode TEXT, createdAt TEXT, isCurrent INTEGER, properties TEXT, resourceReleaseId TEXT,
        geometryId TEXT, sourceRecordId TEXT, sources TEXT, updatedAt TEXT,
        validFromRelease TEXT, validToRelease TEXT, version INTEGER, versionHash TEXT,
        PRIMARY KEY (datasetCode, resourceReleaseId, sourceRecordId, versionHash)
      );
      CREATE TABLE divisionStatistics (
        createdAt TEXT, districtCode TEXT, divisionId TEXT, id TEXT, isCurrent INTEGER,
        landAreaSqKm REAL, midYearPopulation INTEGER,
        midYearPopulationDensityPerSqKm INTEGER, referenceYear TEXT,
        sourceReleaseId TEXT, sources TEXT, updatedAt TEXT, versionHash TEXT,
        PRIMARY KEY (id, versionHash)
      );
    `)

    for (const sql of [...batches.source, ...batches.history]) sqlite.exec(sql)
    for (const sql of [...batches.source, ...batches.history]) sqlite.exec(sql)

    expect(
      sqlite
        .query(
          'SELECT COUNT(*) AS count FROM hkgovCenstatdStatistics WHERE isCurrent = 1',
        )
        .get(),
    ).toEqual({ count: 1 })
    expect(
      sqlite
        .query('SELECT COUNT(*) AS count FROM divisionStatistics WHERE isCurrent = 1')
        .get(),
    ).toEqual({ count: 1 })
    sqlite.close()
  })
})

describe('replayStatisticSqlBatches', () => {
  test('the real replay adapter captures only remote copies before touching the mirror', async () => {
    const captured: Array<{ databaseId: string | null; sql: string }> = []
    const binding = {
      prepare() {
        throw new Error('Mirror write during capture')
      },
    }
    const context = {
      sourceBinding: binding,
      historyBinding: binding,
      sourceTargets: [
        { bindingName: 'DB_SOURCE_HK_BEFORE', databaseId: 'source-d1', year: 'BEFORE' },
      ],
      historyTargets: [
        {
          bindingName: 'DB_HISTORY_HK_BEFORE',
          databaseId: 'history-d1',
          year: 'BEFORE',
        },
      ],
    } as unknown as Parameters<typeof replayStatisticSqlBatches>[1]
    await captureSqlDeliveryBatches(
      async (target, bytes) => {
        captured.push({
          databaseId: target.databaseId,
          sql: new TextDecoder().decode(bytes),
        })
      },
      () =>
        replayStatisticSqlBatches(
          { remote: true, environment: 'production' },
          context,
          '2022',
          { source: ['SELECT 1;', 'SELECT 2;'], history: ['SELECT 3;'] },
          { importOptions: { accountId: 'fixture', apiToken: 'fixture' } },
        ),
    )
    expect(captured).toEqual([
      { databaseId: 'source-d1', sql: 'SELECT 1;\nSELECT 2;\n' },
      { databaseId: 'history-d1', sql: 'SELECT 3;\n' },
    ])
  })
  test('checks remote prerequisites before mutating the local cache', async () => {
    const calls: string[] = []
    await expect(
      replayStatisticSqlBatches(
        { environment: 'preview', remote: true },
        { historyTargets: [], sourceTargets: [] } as never,
        '2022',
        { history: [], source: ['SELECT 1;'] },
        {
          executeSql: async target => {
            calls.push(target.name)
            return 0
          },
          importOptions: { accountId: 'account', apiToken: 'token' },
        },
      ),
    ).rejects.toThrow('source.databaseId')
    expect(calls).toEqual([])
  })

  test('replays a source-only statistic without requiring a history shard', async () => {
    const batches = buildStatisticSqlBatches({
      sourceVersion,
      resourceReleaseId,
      source: { rows: [sourceRow('district-1')], table: 'hkgovCenstatdStatistics' },
    })
    const calls: Array<[boolean, string]> = []

    await replayStatisticSqlBatches(
      { environment: 'preview', remote: true },
      {
        historyTargets: [],
        sourceTargets: [
          {
            bindingName: 'DB_SOURCE_HK_BEFORE',
            databaseId: 'source-d1',
            year: 'BEFORE',
          },
        ],
      } as never,
      '2022',
      batches,
      {
        executeSql: async (target, _sql, options) => {
          calls.push([options.isLocal, target.name])
          return 0
        },
        importOptions: { accountId: 'account', apiToken: 'token' },
      },
    )

    expect(calls).toEqual([
      [true, 'source'],
      [false, 'source'],
    ])
  })

  test('replays identical batches locally before source then history D1 imports', async () => {
    const batches = buildStatisticSqlBatches({
      history: { rows: [historyRow('stat-1')], table: 'divisionStatistics' },
      sourceVersion,
      resourceReleaseId,
      source: {
        rows: [sourceRow('district-1')],
        table: 'hkgovCenstatdStatistics',
      },
    })
    const calls: Array<{
      databaseId: string | null
      isLocal: boolean
      name: string
      sql: string
    }> = []
    const progress: string[] = []

    await replayStatisticSqlBatches(
      { environment: 'preview', remote: true },
      {
        historyTargets: [
          {
            bindingName: 'DB_HISTORY_HK_BEFORE',
            databaseId: 'history-d1',
            year: 'BEFORE',
          },
        ],
        sourceTargets: [
          {
            bindingName: 'DB_SOURCE_HK_BEFORE',
            databaseId: 'source-d1',
            year: 'BEFORE',
          },
        ],
      } as never,
      '2022',
      batches,
      {
        executeSql: async (target, sql, options) => {
          calls.push({
            databaseId: target.databaseId,
            isLocal: options.isLocal,
            name: target.name,
            sql,
          })
          return 0
        },
        importOptions: { accountId: 'account', apiToken: 'token' },
        onProgress(event) {
          progress.push(
            `${event.phase}:${event.completedBatches}/${event.totalBatches}`,
          )
        },
      },
    )

    expect(calls.map(call => [call.isLocal, call.name, call.databaseId])).toEqual([
      [true, 'source', null],
      [true, 'history', null],
      [false, 'source', 'source-d1'],
      [false, 'history', 'history-d1'],
    ])
    expect(calls[0]?.sql).toBe(calls[2]?.sql)
    expect(calls[1]?.sql).toBe(calls[3]?.sql)
    expect(progress).toEqual([
      'local-replay:0/4',
      'local-replay:1/4',
      'local-replay:1/4',
      'local-replay:2/4',
      'remote-source-replay:2/4',
      'remote-source-replay:3/4',
      'remote-history-replay:3/4',
      'remote-history-replay:4/4',
    ])
  })

  test('stops before history import when remote source replay fails', async () => {
    const batches = buildStatisticSqlBatches({
      history: { rows: [historyRow('stat-1')], table: 'divisionStatistics' },
      sourceVersion,
      resourceReleaseId,
      source: {
        rows: [sourceRow('district-1')],
        table: 'hkgovCenstatdStatistics',
      },
    })
    const calls: string[] = []

    await expect(
      replayStatisticSqlBatches(
        { environment: 'production', remote: true },
        {
          historyTargets: [
            {
              bindingName: 'DB_HISTORY_HK_BEFORE',
              databaseId: 'history-d1',
              year: 'BEFORE',
            },
          ],
          sourceTargets: [
            {
              bindingName: 'DB_SOURCE_HK_BEFORE',
              databaseId: 'source-d1',
              year: 'BEFORE',
            },
          ],
        } as never,
        '2022',
        batches,
        {
          executeSql: async (target, _sql, options) => {
            calls.push(`${options.isLocal ? 'local' : 'remote'}:${target.name}`)
            if (!options.isLocal && target.name === 'source') {
              throw new Error('remote source import failed')
            }
            return 0
          },
          importOptions: { accountId: 'account', apiToken: 'token' },
        },
      ),
    ).rejects.toThrow('remote source import failed')

    expect(calls).toEqual(['local:source', 'local:history', 'remote:source'])
  })
})
