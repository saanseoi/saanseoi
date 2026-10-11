import { expect, test } from 'bun:test'
import { planningSourceResolutions } from '../../../harbour-cli/src/lib/pipeline/divisions/planningSourceResolutions'
import type { PreparedDivision } from '../../../harbour-cli/src/lib/pipeline/divisions/processLocalHkgovPlandDivisionSqlUploadTypes'

const record = (id: string, cells: PreparedDivision['cells'] = []): PreparedDivision =>
  ({
    base: { id },
    cells,
    newTown: null,
    sourceCellIds: ['PLAND:111:1'],
  }) as PreparedDivision
const cell = {
  sourceRecordId: 'PLAND:111:1:feature',
  tpuCode: '111',
  subunitCode: '1',
  ppuCode: '1',
  spuCode: '11',
  properties: { ppu: 1, spu: 11, tpu: 111, sbVc: 1 },
  sourceGeometry: { type: 'Polygon', coordinates: [] },
  wasGeometryRepaired: false,
}

test('delivered Planning assertions hydrate aggregate evidence without resurrecting omissions', async () => {
  const { Database } = await import('bun:sqlite')
  const { drizzle } = await import('drizzle-orm/bun-sqlite')
  const { sourceResolutionSql } = await import(
    '@repo/core/pipeline/db/sourceResolutions.ts'
  )
  const { hydrateCanonicalSourceReferences } = await import(
    './canonicalSourceReferences'
  )
  const sqlite = new Database(':memory:')
  sqlite.exec(
    'CREATE TABLE sourceResolutions(scopeId TEXT,snapshotId TEXT,sourceReleaseId TEXT,sourceRecordId TEXT,sourceVersionHash TEXT,resolutions TEXT,PRIMARY KEY(scopeId,sourceReleaseId,sourceRecordId,sourceVersionHash))',
  )
  const db = drizzle({ client: sqlite })
  const records = [
    record('ppu'),
    record('spu'),
    record('tpu'),
    record('subunit', [cell]),
  ]
  try {
    for (const row of await planningSourceResolutions('parent', 'old', records))
      sqlite.exec(sourceResolutionSql(row))
    for (const row of await planningSourceResolutions(
      'child',
      'new',
      [],
      [{ sourceRecordId: cell.sourceRecordId, versionHash: 'removed' }],
    ))
      sqlite.exec(sourceResolutionSql(row))
    const expand = (snapshotId: string) =>
      hydrateCanonicalSourceReferences({
        metaDb: {} as never,
        historyDbsByBinding: { history: db } as never,
        resourceType: 'division',
        records: [
          { id: 'ppu', snapshotId, sources: { evidence: [{ record_id: 'ppu' }] } },
        ],
        resolvePlan: async () => [
          {
            snapshotId: 'parent',
            parentSnapshotId: null,
            shards: [{ bindingName: 'history', dataShardId: 'history' }],
          },
          ...(snapshotId === 'child'
            ? [
                {
                  snapshotId: 'child',
                  parentSnapshotId: 'parent',
                  shards: [{ bindingName: 'history', dataShardId: 'history' }],
                },
              ]
            : []),
        ],
      })
    await expand('parent')
    await expect(expand('child')).rejects.toThrow('Missing selected division evidence')
  } finally {
    sqlite.close()
  }
})
