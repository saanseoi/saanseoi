import { describe, expect, test } from 'bun:test'

import {
  buildReleaseProcessingActionsMetaSqlBatches,
  buildReleaseStatsMetaSqlBatches,
  buildStatisticSnapshotMetaSqlBatches,
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

  test('replays statistic snapshot metadata before publication', () => {
    const sql = buildStatisticSnapshotMetaSqlBatches({
      lineages: [
        {
          code: 'division-statistic/hk/dataset-statistics',
          createdAt: '2026-08-18T00:00:00.000Z',
          id: 'lineage',
          identityMode: 'persistent',
          primaryDatasetId: 'dataset',
          regionCode: 'hk',
          resourceType: 'divisionStatistic',
          updatedAt: '2026-08-18T00:00:00.000Z',
          variant: 'dataset-statistics',
          versionHash: 'lineage-hash',
        },
      ],
      releaseAssignments: [{ dataShardId: 'source-2021', releaseId }],
      snapshotAssignments: [{ dataShardId: 'history-2021', snapshotId: 'snapshot' }],
      snapshots: [
        {
          code: 'division-statistic/hk/2021/dataset-statistics',
          cohortKey: '2021',
          createdAt: '2026-08-18T00:00:00.000Z',
          id: 'snapshot',
          notes: null,
          parentSnapshotId: null,
          publishedAt: null,
          resourceType: 'divisionStatistic',
          revision: 0,
          snapshotLineageId: 'lineage',
          status: 'draft',
          updatedAt: '2026-08-18T00:00:00.000Z',
          validFrom: null,
          validTo: null,
        },
      ],
      sources: [
        {
          anchorReleaseId: releaseId,
          createdAt: '2026-08-18T00:00:00.000Z',
          datasetId: 'dataset',
          role: 'primary',
          selectedByRule: 'stats-reference-period-exact-release-v1',
          selectionMode: 'exact_ref',
          snapshotId: 'snapshot',
          sourceCohortKey: '2021',
          sourceReleaseId: releaseId,
        },
      ],
    }).join('\n')

    expect(sql).toContain('INSERT INTO "snapshotLineages"')
    expect(sql).toContain('INSERT INTO "snapshots"')
    expect(sql).toContain('INSERT INTO "snapshotSources"')
    expect(sql).toContain('INSERT INTO "releaseShardAssignments"')
    expect(sql).toContain('INSERT INTO "snapshotShardAssignments"')
    expect(sql).toContain("'snapshot'")
  })
})
