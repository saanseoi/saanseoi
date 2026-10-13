import { describe, expect, test } from 'bun:test'

import {
  buildReleaseStatsMetaSqlBatches,
  buildStatisticSnapshotMetaSqlBatches,
  replayReleaseStatsMetaToRemote,
} from './releaseStatsMetaReplay.ts'

const resourceReleaseId = 'release-censtatd-2024'
const stats = [
  {
    apiReleaseSetId: null,
    createdAt: '2026-08-18T00:00:00.000Z',
    category: 'records',
    dimension: null,
    dimensionValue: null,
    id: 'b-stat',
    measure: 'count',
    unit: 'count',
    resourceReleaseId,

    updatedAt: '2026-08-18T00:00:00.000Z',
    value: 18,
  },
  {
    apiReleaseSetId: null,
    createdAt: '2026-08-18T00:00:00.000Z',
    category: 'records',
    dimension: 'sourceLayer',
    dimensionValue: 'Density_2024',
    id: 'a-stat',
    measure: 'count',
    unit: 'count',
    resourceReleaseId,

    updatedAt: '2026-08-18T00:00:00.000Z',
    value: 18,
  },
] as const

describe('release statistics metadata replay', () => {
  test('deletes only this release’s release facts and replays exact materialised rows', () => {
    const sql = buildReleaseStatsMetaSqlBatches(resourceReleaseId, stats).join('\n')

    expect(sql).toContain(
      `DELETE FROM "stats" WHERE "resourceReleaseId" = '${resourceReleaseId}' AND "category" != 'processing';`,
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
      resourceReleaseId,
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
        resourceReleaseId,
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
      releaseAssignments: [{ dataShardId: 'source-2021', resourceReleaseId }],
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
          anchorReleaseId: resourceReleaseId,
          createdAt: '2026-08-18T00:00:00.000Z',
          datasetId: 'dataset',
          role: 'primary',
          selectedByRule: 'assembly:division-statistic:reference-period-release:v1',
          selectionMode: 'exact_ref',
          snapshotId: 'snapshot',
          resourceReleaseId: resourceReleaseId,
        },
      ],
    }).join('\n')

    expect(sql).toContain('INSERT INTO "snapshotLineages"')
    expect(sql).toContain('INSERT INTO "snapshots"')
    expect(sql).toContain('INSERT INTO "snapshotResourceReleases"')
    expect(sql).toContain('INSERT INTO "releaseShardAssignments"')
    expect(sql).toContain('INSERT INTO "snapshotShardAssignments"')
    expect(sql).toContain("'snapshot'")
  })
})
