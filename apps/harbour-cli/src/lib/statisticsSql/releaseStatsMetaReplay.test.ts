import { describe, expect, test } from 'bun:test'

import {
  buildReleaseProcessingActionsMetaSqlBatches,
  buildReleaseStatsMetaSqlBatches,
  replayReleaseStatsMetaToRemote,
} from './releaseStatsMetaReplay.ts'

const releaseId = 'release-censtatd-2024'
const stats = [
  {
    apiReleaseSetId: null,
    createdAt: '2026-08-18T00:00:00.000Z',
    dimension: 'records',
    groupBy: null,
    groupValue: null,
    id: 'b-stat',
    metric: 'count',
    metricUnit: 'count',
    releaseId,
    snapshotId: null,
    type: 'release',
    updatedAt: '2026-08-18T00:00:00.000Z',
    value: 18,
  },
  {
    apiReleaseSetId: null,
    createdAt: '2026-08-18T00:00:00.000Z',
    dimension: 'records',
    groupBy: 'sourceLayer',
    groupValue: 'Density_2024',
    id: 'a-stat',
    metric: 'count',
    metricUnit: 'count',
    releaseId,
    snapshotId: null,
    type: 'release',
    updatedAt: '2026-08-18T00:00:00.000Z',
    value: 18,
  },
] as const

describe('release statistics metadata replay', () => {
  test('deletes only this release’s release facts and replays exact materialised rows', () => {
    const sql = buildReleaseStatsMetaSqlBatches(releaseId, stats).join('\n')

    expect(sql).toContain(
      `DELETE FROM "stats" WHERE "releaseId" = '${releaseId}' AND "type" = 'release';`,
    )
    expect(sql).not.toContain('apiReleaseSetId =')
    expect(sql.indexOf("'a-stat'")).toBeLessThan(sql.indexOf("'b-stat'"))
    expect(sql).toContain("'2026-08-18T00:00:00.000Z'")
  })

  test('replays to DB_META before a caller can publish', async () => {
    const calls: string[] = []
    await replayReleaseStatsMetaToRemote(
      { environment: 'preview', remote: true },
      { state: { bindings: { DB_META: { databaseId: 'meta-d1' } } } },
      releaseId,
      stats,
      {
        executeSql: async (target, sql, options) => {
          expect(target).toMatchObject({ databaseId: 'meta-d1', name: 'meta' })
          expect(options).toMatchObject({
            accountId: 'account',
            apiToken: 'token',
            isLocal: false,
          })
          calls.push(sql)
          return 0
        },
        importOptions: { accountId: 'account', apiToken: 'token' },
      },
    )

    expect(calls.join('\n')).toContain("'a-stat'")
  })

  test('surfaces metadata replay failure before a caller can publish', async () => {
    await expect(
      replayReleaseStatsMetaToRemote(
        { environment: 'production', remote: true },
        { state: { bindings: { DB_META: { databaseId: 'meta-d1' } } } },
        releaseId,
        stats,
        {
          executeSql: async () => {
            throw new Error('D1 import failed')
          },
          importOptions: { accountId: 'account', apiToken: 'token' },
        },
      ),
    ).rejects.toThrow('D1 import failed')
  })

  test('replaces audit actions and only their processing stats', () => {
    const sql = buildReleaseProcessingActionsMetaSqlBatches(releaseId, {
      actions: [
        {
          action: 'map_censtatd_district_code_to_canonical_division',
          affectedRecordCount: 18,
          createdAt: '2026-08-18T00:00:00.000Z',
          evidence: { cohortKey: '2021' },
          id: 'audit-1',
          mode: 'automatic',
          releaseId,
          summary: 'Mapped C&SD districts.',
          updatedAt: '2026-08-18T00:00:00.000Z',
        },
      ],
      stats: [
        {
          ...stats[0],
          dimension: 'processing',
          groupBy: 'action',
          groupValue: 'automatic:map_censtatd_district_code_to_canonical_division',
          id: 'processing-1',
          metric: 'processing',
          type: 'processing',
        },
      ],
    }).join('\n')

    expect(sql).toContain('DELETE FROM "releaseProcessingActions"')
    expect(sql).toContain(`AND "type" = 'processing';`)
    expect(sql).toContain("'audit-1'")
    expect(sql).toContain("'processing-1'")
  })
})
