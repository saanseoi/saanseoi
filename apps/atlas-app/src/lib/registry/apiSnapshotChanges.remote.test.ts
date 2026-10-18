import { afterAll, expect, mock, test } from 'bun:test'
import { historySchema } from '@repo/db'

const replay = await import('@repo/core/pipeline/db/snapshotReplay.ts')
const requestedTypes: string[][] = []
const reads: unknown[] = []
let recordIds = ['address']
const batchSizes: number[] = []
const meta = {
  select: () => ({
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          get: async () => ({ status: 'published', resourceType: 'address' }),
        }),
      }),
    }),
  }),
}
const history = {
  select: () => ({
    from: (table: unknown) => ({
      where: (batch: { recordId: string; versionHash: string }[]) => ({
        all: async () => {
          reads.push(table)
          batchSizes.push(batch.length)
          return batch.map(version => {
            const changed = version.versionHash === 'new'
            return table === historySchema.address2d
              ? { id: version.recordId, versionHash: version.versionHash, latitude: 22 }
              : {
                  addressId: version.recordId,
                  locale: 'en',
                  formattedAddress: changed ? 'New address' : 'Old address',
                }
          })
        },
      }),
    }),
  }),
}
mock.module('$app/server', () => ({
  query: (_schema: unknown, handler: unknown) => handler,
}))
mock.module('./server', () => ({ getMetaDb: () => meta, getHistoryDb: () => history }))
mock.module('@repo/core/db/metaRegistry', () => ({
  getRegistryApi: async () => null,
  resolveSnapshotReplayPlan: async (_db: unknown, id: string) => [
    { snapshotId: id, shards: [{ bindingName: 'DB_HISTORY_HK_2026' }] },
  ],
}))
mock.module('@repo/core/pipeline/db/snapshotReplay.ts', () => ({
  ...replay,
  historyVersionSelection: (_table: unknown, batch: unknown) => batch,
  resolveSnapshotVersionState: async (
    plan: { snapshotId: string }[],
    shards: Map<string, unknown>,
    types: string[],
  ) => {
    requestedTypes.push(types)
    return new Map(
      recordIds.flatMap(recordId =>
        ['address2d', 'address2dI18n'].map(recordType => [
          `${recordId}:${recordType}`,
          {
            recordType,
            recordId,
            locale: recordType.endsWith('I18n') ? 'en' : '',
            versionHash: recordId === 'unchanged' ? 'same' : plan[0]?.snapshotId,
            shard: shards.get('DB_HISTORY_HK_2026'),
          },
        ]),
      ),
    )
  },
}))
afterAll(() => mock.restore())
const { getApiSnapshotChanges } = await import('./apiSnapshotChanges.remote')

test('address resource snapshots replay Address2D history and locale content', async () => {
  const result = await getApiSnapshotChanges({
    fromSnapshot: 'old',
    toSnapshot: 'new',
    offset: 0,
  })
  expect(requestedTypes).toEqual([
    ['address2d', 'address2dI18n'],
    ['address2d', 'address2dI18n'],
  ])
  expect(reads).toContain(historySchema.address2d)
  expect(reads).toContain(historySchema.address2dI18n)
  expect(result.counts).toEqual({ added: 0, changed: 1, removed: 0, unchanged: 0 })
  expect(result.records[0]?.fields).toContainEqual({
    path: ['translations', 'en', 'formattedAddress'],
    beforeExists: true,
    afterExists: true,
    before: 'Old address',
    after: 'New address',
  })
})

test('large revisions keep exact counts and paginate across comparison batches', async () => {
  recordIds = [
    ...Array.from({ length: 1026 }, (_, i) => `address-${String(i).padStart(4, '0')}`),
    'unchanged',
  ]
  batchSizes.length = 0
  try {
    const result = await getApiSnapshotChanges({
      fromSnapshot: 'old',
      toSnapshot: 'new',
      offset: 1000,
      type: 'changed',
    })
    expect(result.counts).toEqual({ added: 0, changed: 1026, removed: 0, unchanged: 1 })
    expect(result.total).toBe(1027)
    expect(result.records).toHaveLength(25)
    expect(result.records[0]?.id).toBe('address-1000')
    expect(result.records[24]?.id).toBe('address-1024')
    expect(result.nextOffset).toBe(1025)
    expect(Math.max(...batchSizes)).toBeLessThanOrEqual(1000)
    const last = await getApiSnapshotChanges({
      fromSnapshot: 'old',
      toSnapshot: 'new',
      offset: 1025,
      type: 'changed',
    })
    expect(last.records.map(record => record.id)).toEqual(['address-1025'])
    expect(last.nextOffset).toBeNull()
  } finally {
    recordIds = ['address']
  }
})
