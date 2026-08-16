import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'

import {
  buildStatisticSqlBatches,
  replayStatisticSqlBatches,
} from './statisticSqlReplay.ts'

const releaseId = 'release-2022'
const releaseCode = 'dr-hk-hkgov-censtatd-division-statistic-2022'

function sourceRow(sourceRecordId: string) {
  return {
    createdAt: '2026-08-16T00:00:00.000Z',
    isCurrent: true,
    rawProperties: { district: sourceRecordId },
    releaseId,
    sourceGeometry: { type: 'Point', coordinates: [114, 22] },
    sourceRecordId,
    sources: [{ dataset: 'C&SD' }],
    updatedAt: '2026-08-16T00:00:00.000Z',
    validFromRelease: releaseCode,
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
    sourceKeys: { sourceRecordId: 'district-1' },
    sourceReleaseId: releaseId,
    sources: [{ dataset: 'C&SD' }],
    updatedAt: '2026-08-16T00:00:00.000Z',
    versionHash: `history-${id}`,
  }
}

describe('buildStatisticSqlBatches', () => {
  test('creates deterministic source/history upserts that restore a failed release safely', () => {
    const batches = buildStatisticSqlBatches({
      history: {
        rows: [historyRow('stat-2'), historyRow('stat-1')],
        table: 'divisionStatistics',
      },
      releaseCode,
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
        releaseCode,
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
      releaseCode,
      releaseId,
      source: {
        rows: [sourceRow('district-1')],
        table: 'hkgovCenstatdDistrictLandAreaPopulationDensities',
      },
    })
    const sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE hkgovCenstatdDistrictLandAreaPopulationDensities (
        createdAt TEXT, isCurrent INTEGER, rawProperties TEXT, releaseId TEXT,
        sourceGeometry TEXT, sourceRecordId TEXT, sources TEXT, updatedAt TEXT,
        validFromRelease TEXT, validToRelease TEXT, version INTEGER, versionHash TEXT,
        PRIMARY KEY (sourceRecordId, versionHash)
      );
      CREATE TABLE divisionStatistics (
        createdAt TEXT, districtCode TEXT, divisionId TEXT, id TEXT, isCurrent INTEGER,
        landAreaSqKm REAL, midYearPopulation INTEGER,
        midYearPopulationDensityPerSqKm INTEGER, referenceYear TEXT, sourceKeys TEXT,
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
  test('replays a source-only statistic without requiring a history shard', async () => {
    const batches = buildStatisticSqlBatches({
      releaseCode,
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
      releaseCode,
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
  })

  test('stops before history import when remote source replay fails', async () => {
    const batches = buildStatisticSqlBatches({
      history: { rows: [historyRow('stat-1')], table: 'divisionStatistics' },
      releaseCode,
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
