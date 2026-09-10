import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { HarbourWritableDb } from '../../lib/db/types'
import { loadMigrationSql } from '../../testing/metaFixtures'
import { recordSourceResolutions, sourceResolutionSql } from './sourceResolutions'

test('source interpretations are independently scoped, retryable and bounded', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../db/migrations'), [
        'history',
      ]),
    )
    const parameterCounts: number[] = []
    const db = drizzle({
      client: sqlite,
      logger: {
        logQuery(_query, params) {
          parameterCounts.push(params.length)
        },
      },
    }) as unknown as HarbourWritableDb
    const input = Array.from({ length: 150 }, (_, index) => ({
      snapshotId: 'snapshot-a',
      sourceReleaseId: 'release',
      sourceRecordId: `source-${index}`,
      sourceVersionHash: 'unchanged-upstream',
      resolutions: { entities: { division: ['first-match'] } },
    }))
    await recordSourceResolutions(db, input)
    await recordSourceResolutions(db, input)
    expect(sqlite.query('SELECT count(*) AS n FROM sourceResolutions').get()).toEqual({
      n: 150,
    })
    expect(Math.max(...parameterCounts)).toBeLessThanOrEqual(100)
    const original = input[0]!
    sqlite.exec(
      sourceResolutionSql({
        ...original,
        snapshotId: 'snapshot-b',
        resolutions: { entities: { division: ["second'match"] } },
      }),
    )
    sqlite.exec(
      sourceResolutionSql({
        ...original,
        snapshotId: null,
        resolutions: { entities: { statistic: ['observation'] } },
      }),
    )
    sqlite.exec(
      sourceResolutionSql({
        ...original,
        snapshotId: null,
        resolutions: { entities: { statistic: ['observation'] } },
      }),
    )
    expect(
      sqlite
        .query(
          "SELECT scopeId, snapshotId, resolutions FROM sourceResolutions WHERE sourceRecordId = 'source-0' ORDER BY scopeId",
        )
        .all(),
    ).toEqual([
      {
        scopeId: 'release:release',
        snapshotId: null,
        resolutions: JSON.stringify({ entities: { statistic: ['observation'] } }),
      },
      {
        scopeId: 'snapshot:snapshot-a',
        snapshotId: 'snapshot-a',
        resolutions: JSON.stringify({ entities: { division: ['first-match'] } }),
      },
      {
        scopeId: 'snapshot:snapshot-b',
        snapshotId: 'snapshot-b',
        resolutions: JSON.stringify({ entities: { division: ["second'match"] } }),
      },
    ])
  } finally {
    sqlite.close()
  }
})
