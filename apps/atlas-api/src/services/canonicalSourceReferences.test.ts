import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { expect, test } from 'bun:test'
import { hydrateCanonicalSourceReferences } from './canonicalSourceReferences'

test('full evidence reads preserve inherited versions and omissions with bounded queries', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(
    `CREATE TABLE sourceResolutions(scopeId TEXT,snapshotId TEXT,sourceReleaseId TEXT,sourceRecordId TEXT,sourceVersionHash TEXT,resolutions TEXT)`,
  )
  const counts: number[] = []
  const db = drizzle({
    client: sqlite,
    logger: {
      logQuery(_sql, params) {
        counts.push(params.length)
      },
    },
  })
  const write = (snapshot: string, source: string, ids: string[], hash = 'original') =>
    sqlite.query('INSERT INTO sourceResolutions VALUES(?,?,?,?,?,?)').run(
      `snapshot:${snapshot}`,
      snapshot,
      `release-${snapshot}`,
      source,
      hash,
      JSON.stringify({
        entities: ids.length ? { division: ids } : {},
        ...(ids.length ? {} : { decisions: [{ type: 'source_omission' }] }),
      }),
    )
  const records = Array.from({ length: 205 }, (_, index) => ({
    id: `division-${index}`,
    snapshotId: 'child',
    sources: { evidence: [{ record_id: `division-${index}` }] } as unknown,
  }))
  try {
    for (const record of records) write('parent', record.id, [record.id])
    write('parent', 'removed', ['division-0'])
    write('child', 'removed', [])
    write('child', 'division-1', ['division-1'], 'revised')
    write('unrelated', 'division-0', ['division-0'], 'wrong-branch')
    await hydrateCanonicalSourceReferences({
      metaDb: {} as never,
      historyDbsByBinding: { history: db } as never,
      resourceType: 'division',
      records,
      resolvePlan: async () => [
        {
          snapshotId: 'parent',
          parentSnapshotId: null,
          shards: [{ bindingName: 'history', dataShardId: 'history' }],
        },
        {
          snapshotId: 'child',
          parentSnapshotId: 'parent',
          shards: [{ bindingName: 'history', dataShardId: 'history' }],
        },
      ],
    })
    expect(records[0]!.sources).toEqual({
      evidence: [
        {
          record_id: 'division-0',
          versionHash: 'original',
          resourceReleaseId: 'release-parent',
          snapshotId: 'parent',
        },
      ],
    })
    expect(records[1]!.sources).toEqual({
      evidence: [
        {
          record_id: 'division-1',
          versionHash: 'revised',
          resourceReleaseId: 'release-child',
          snapshotId: 'child',
        },
      ],
    })
    expect(Math.max(...counts)).toBeLessThanOrEqual(100)
    expect(counts.length).toBeLessThan(10)
  } finally {
    sqlite.close()
  }
})
