import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { captureSqlDeliveryBatches } from '../local/sqlDeliveryBatchCapture.ts'

import {
  buildStatisticSqlBatches,
  replayStatisticSqlBatches,
} from './statisticSqlReplay.ts'

const releaseId = 'release-2022'
const sourceVersion = '2022'

function sourceRow(sourceRecordId: string) {
  return {
    createdAt: '2026-08-16T00:00:00.000Z',
    isCurrent: true,
    properties: { district: sourceRecordId },
    releaseId,
    sourceGeometry: { type: 'Point', coordinates: [114, 22] },
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
    sourceReleaseId: releaseId,
    sources: [{ dataset: 'C&SD' }],
    updatedAt: '2026-08-16T00:00:00.000Z',
    versionHash: `history-${id}`,
  }
}

describe('buildStatisticSqlBatches', () => {
  for (const table of [
    'hkgovCenstatdDistrictLandAreaPopulationDensities',
    'hkgovCenstatdStatistics',
  ] as const)
    test(`retains version-only validity across source revisions: ${table}`, () => {
      const sqlite = new Database(':memory:')
      try {
        sqlite.exec(`CREATE TABLE ${table} (
          createdAt TEXT, isCurrent INTEGER, properties TEXT, releaseId TEXT,
          sourceGeometry TEXT, sourceRecordId TEXT, sources TEXT, updatedAt TEXT,
          validFromRelease TEXT, validToRelease TEXT, version INTEGER, versionHash TEXT,
          PRIMARY KEY (sourceRecordId, versionHash)
        )`)
        const replay = (version: string, hash: string) => {
          const batches = buildStatisticSqlBatches({
            sourceVersion: version,
            releaseId: `release-${version}`,
            source: {
              table,
              rows: [
                {
                  ...sourceRow('district-1'),
                  releaseId: `release-${version}`,
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
          { validFromRelease: '2023-H2', validToRelease: null, isCurrent: 1 },
        ])
      } finally {
        sqlite.close()
      }
    })

  test('rejects one publisher row that exceeds the D1 statement limit', () => {
    expect(() =>
      buildStatisticSqlBatches({
        sourceVersion,
        releaseId,
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

  test('replays an oversized source geometry through bounded append statements', () => {
    const sourceGeometry = { value: 'x'.repeat(100_000) }
    const batches = buildStatisticSqlBatches({
      sourceVersion,
      releaseId,
      source: {
        rows: [{ ...sourceRow('district-large'), sourceGeometry }],
        table: 'hkgovCenstatdStatistics',
      },
    })
    const [sourceSql] = batches.source
    if (!sourceSql) throw new Error('Expected source replay SQL.')

    const statements = sourceSql
      .split(/(?<=;)\n/)
      .map(statement => statement.trim())
      .filter(Boolean)
    expect(statements.length).toBeGreaterThan(2)
    expect(
      statements.every(statement => Buffer.byteLength(statement) <= 96 * 1024),
    ).toBe(true)

    const sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE hkgovCenstatdStatistics (
        createdAt TEXT, datasetCode TEXT, featureId TEXT, isCurrent INTEGER,
        layerName TEXT, properties TEXT, referencePeriodCode TEXT,
        referencePeriodEnd TEXT, referencePeriodEndYear TEXT,
        referencePeriodGranularity TEXT, referencePeriodStart TEXT,
        releaseId TEXT, sourceGeometry TEXT, sourceRecordId TEXT, sources TEXT,
        updatedAt TEXT, validFromRelease TEXT, validToRelease TEXT, version INTEGER,
        versionHash TEXT, PRIMARY KEY (sourceRecordId, versionHash)
      );
    `)
    sqlite.exec(sourceSql)
    sqlite.exec(sourceSql)
    const stored = sqlite
      .query(
        'SELECT sourceGeometry FROM hkgovCenstatdStatistics WHERE sourceRecordId = ?',
      )
      .get('district-large') as { sourceGeometry: string }
    expect(JSON.parse(stored.sourceGeometry)).toEqual(sourceGeometry)
    sqlite.close()
  })

  test('replays a large Brotli source geometry as bounded BLOB statements', () => {
    const sourceGeometry = Uint8Array.from(
      { length: 100_000 },
      (_, index) => index % 251,
    )
    const batches = buildStatisticSqlBatches({
      sourceVersion,
      releaseId,
      source: {
        rows: [
          {
            ...sourceRow('district-large'),
            censusYear: '2021',
            sourceGeometry,
          },
        ],
        table: 'hkgovCenstatdDivisionAreas',
      },
    })
    const [sourceSql] = batches.source
    if (!sourceSql) throw new Error('Expected source replay SQL.')
    const statements = sourceSql
      .split(/(?<=;)\n/)
      .map(statement => statement.trim())
      .filter(Boolean)
    expect(statements.length).toBeGreaterThan(2)
    expect(
      statements.every(statement => Buffer.byteLength(statement) <= 96 * 1024),
    ).toBe(true)

    const sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE hkgovCenstatdDivisionAreas (
        censusYear TEXT, createdAt TEXT, isCurrent INTEGER, properties TEXT,
        releaseId TEXT, sourceGeometry BLOB NOT NULL, sourceLocator TEXT,
        sourceRecordId TEXT, sources TEXT, updatedAt TEXT, validFromRelease TEXT,
        validToRelease TEXT, version INTEGER, versionHash TEXT,
        PRIMARY KEY (sourceRecordId, versionHash)
      );
    `)
    sqlite.exec(sourceSql)
    sqlite.exec(sourceSql)
    const stored = sqlite
      .query(
        'SELECT sourceGeometry FROM hkgovCenstatdDivisionAreas WHERE sourceRecordId = ?',
      )
      .get('district-large') as { sourceGeometry: Uint8Array }
    expect(stored.sourceGeometry).toEqual(Buffer.from(sourceGeometry))
    sqlite.close()
  })

  test('creates deterministic source/history upserts that restore a failed release safely', () => {
    const batches = buildStatisticSqlBatches({
      history: {
        rows: [historyRow('stat-2'), historyRow('stat-1')],
        table: 'divisionStatistics',
      },
      sourceVersion,
      releaseId,
      source: {
        rows: [sourceRow('district-2'), sourceRow('district-1')],
        table: 'hkgovCenstatdDistrictLandAreaPopulationDensities',
      },
    })

    expect(batches.source).toHaveLength(1)
    expect(batches.history).toHaveLength(1)
    const [sourceSql] = batches.source
    const [historySql] = batches.history
    if (!sourceSql || !historySql) throw new Error('Expected replay SQL batches.')
    expect(sourceSql).toContain(
      'UPDATE "hkgovCenstatdDistrictLandAreaPopulationDensities" SET "isCurrent" = 0',
    )
    expect(sourceSql).toContain(
      'ON CONFLICT ("sourceRecordId", "versionHash") DO UPDATE SET',
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
        releaseId,
        source: {
          rows: [sourceRow('district-1'), sourceRow('district-2')],
          table: 'hkgovCenstatdDistrictLandAreaPopulationDensities',
        },
      }),
    ).toEqual(batches)
  })

  test('can be applied again after a failed release without duplicating versions', () => {
    const batches = buildStatisticSqlBatches({
      history: { rows: [historyRow('stat-1')], table: 'divisionStatistics' },
      sourceVersion,
      releaseId,
      source: {
        rows: [sourceRow('district-1')],
        table: 'hkgovCenstatdDistrictLandAreaPopulationDensities',
      },
    })
    const sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE hkgovCenstatdDistrictLandAreaPopulationDensities (
        createdAt TEXT, isCurrent INTEGER, properties TEXT, releaseId TEXT,
        sourceGeometry TEXT, sourceRecordId TEXT, sources TEXT, updatedAt TEXT,
        validFromRelease TEXT, validToRelease TEXT, version INTEGER, versionHash TEXT,
        PRIMARY KEY (sourceRecordId, versionHash)
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
          'SELECT COUNT(*) AS count FROM hkgovCenstatdDistrictLandAreaPopulationDensities WHERE isCurrent = 1',
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
      releaseId,
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
      releaseId,
      source: {
        rows: [sourceRow('district-1')],
        table: 'hkgovCenstatdDistrictLandAreaPopulationDensities',
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
      releaseId,
      source: {
        rows: [sourceRow('district-1')],
        table: 'hkgovCenstatdDistrictLandAreaPopulationDensities',
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
