import { Database } from 'bun:sqlite'
import { afterAll, beforeEach, expect, mock, test } from 'bun:test'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures'

const sqlite = new Database(':memory:')
sqlite.exec(
  loadMigrationSql(resolve(import.meta.dir, '../../../../../libs/db/migrations'), [
    'history',
  ]),
)
const queries: string[] = []
const history = drizzle({
  client: sqlite,
  logger: {
    logQuery: (query: string) => {
      queries.push(query)
    },
  },
})
let snapshotStatus = 'published'
let resourceType = 'address'
const meta = {
  select: () => ({
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          get: async () => ({ status: snapshotStatus, resourceType }),
        }),
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
    {
      snapshotId: id,
      resourceReleaseId: 'source',
      parentSnapshotId: null,
      shards: [{ bindingName: 'DB_HISTORY_HK_2026', dataShardId: '2026' }],
    },
  ],
}))
afterAll(() => {
  mock.restore()
  sqlite.close()
})
beforeEach(() => {
  for (const table of ['address2d', 'address2dI18n', 'places', 'placesI18n'])
    sqlite.exec(`delete from ${table}`)
  queries.length = 0
  resourceType = 'address'
})
const { getApiSnapshotChanges } = await import('./apiSnapshotChanges.remote')
function address(id: string, snapshot: string, hash = snapshot, formatted = snapshot) {
  sqlite
    .query(
      'insert into address2d(id,snapshotId,versionHash,granularity) values (?,?,?,?)',
    )
    .run(id, snapshot, hash, 'building')
  sqlite
    .query(
      'insert into address2dI18n(addressId,snapshotId,versionHash,locale,formattedAddress) values (?,?,?,?,?)',
    )
    .run(id, snapshot, hash, 'en', formatted)
}

test('address snapshots include locale-only changes', async () => {
  address('a', 'old', 'same', 'Old address')
  address('a', 'new', 'same', 'New address')
  sqlite
    .query("update address2dI18n set versionHash='new-locale' where snapshotId='new'")
    .run()
  const result = await getApiSnapshotChanges({
    fromSnapshot: 'old',
    toSnapshot: 'new',
    offset: 0,
  })
  expect(result.counts).toEqual({ added: 0, changed: 1, removed: 0, unchanged: 0 })
  expect(result.records[0]?.fields).toContainEqual({
    path: ['translations', 'en', 'formattedAddress'],
    beforeExists: true,
    afterExists: true,
    before: 'Old address',
    after: 'New address',
  })
})

test('large revisions retain exact counts and filtered pagination across payload batches', async () => {
  for (let i = 0; i < 2026; i++) {
    const id = `address-${String(i).padStart(4, '0')}`
    address(id, 'old')
    address(id, 'new')
  }
  address('unchanged', 'old', 'same', 'same')
  address('unchanged', 'new', 'same', 'same')
  address('removed', 'old')
  address('added', 'new')
  address('metadata-only', 'old', 'old-hash', 'same')
  address('metadata-only', 'new', 'new-hash', 'same')
  const result = await getApiSnapshotChanges({
    fromSnapshot: 'old',
    toSnapshot: 'new',
    offset: 2000,
    type: 'changed',
  })
  expect(result.counts).toEqual({ added: 1, changed: 2026, removed: 1, unchanged: 2 })
  expect(result.total).toBe(2029)
  expect(result.records.map(record => record.id)).toEqual(
    Array.from({ length: 25 }, (_, i) => `address-${2000 + i}`),
  )
  expect(result.nextOffset).toBe(2025)
  const last = await getApiSnapshotChanges({
    fromSnapshot: 'old',
    toSnapshot: 'new',
    offset: 2025,
    type: 'changed',
  })
  expect(last.records.map(record => record.id)).toEqual(['address-2025'])
  expect(last.nextOffset).toBeNull()
  const added = await getApiSnapshotChanges({
    fromSnapshot: 'old',
    toSnapshot: 'new',
    offset: 0,
    type: 'added',
  })
  expect(added.records.map(record => record.id)).toEqual(['added'])
})

test('shared address snapshots count once without reading locales or payloads', async () => {
  address('retained', 'shared')
  for (const type of [undefined, 'added', 'changed', 'removed'] as const) {
    const result = await getApiSnapshotChanges({
      fromSnapshot: 'shared',
      toSnapshot: 'shared',
      offset: 25,
      type,
    })
    expect(result).toEqual({
      counts: { added: 0, changed: 0, removed: 0, unchanged: 1 },
      total: 1,
      records: [],
      nextOffset: null,
    })
  }
  expect(queries).toHaveLength(4)
  expect(
    queries.every(
      query => !query.includes('versionHash') && !query.includes('address2dI18n'),
    ),
  ).toBe(true)
})

function place(snapshot: string) {
  sqlite
    .query(
      'insert into places(id,snapshotId,versionHash,resourceReleaseId,geometry,firstSeenMonth,lastSeenMonth) values (?,?,?,?,?,?,?)',
    )
    .run('place', snapshot, 'same', 'source', '{}', '2026-01', '2026-01')
  sqlite
    .query(
      'insert into placesI18n(placeId,snapshotId,versionHash,locale,name) values (?,?,?,?,?)',
    )
    .run('place', snapshot, snapshot, 'en', snapshot)
}

test('Places shared snapshots use the same shortcut', async () => {
  resourceType = 'place'
  place('shared')
  const result = await getApiSnapshotChanges({
    fromSnapshot: 'shared',
    toSnapshot: 'shared',
    offset: 0,
  })
  expect(result).toEqual({
    counts: { added: 0, changed: 0, removed: 0, unchanged: 1 },
    total: 1,
    records: [],
    nextOffset: null,
  })
  expect(queries).toHaveLength(1)
  expect(queries[0]).not.toContain('placesI18n')
})

test('distinct Places snapshots compare translations and ignore unrelated branches', async () => {
  resourceType = 'place'
  for (const snapshot of ['old', 'new', 'other']) place(snapshot)
  const result = await getApiSnapshotChanges({
    fromSnapshot: 'old',
    toSnapshot: 'new',
    offset: 0,
  })
  expect(result.counts).toEqual({ added: 0, changed: 1, removed: 0, unchanged: 0 })
  expect(result.records[0]?.fields).toContainEqual({
    path: ['translations', 'en', 'name'],
    beforeExists: true,
    afterExists: true,
    before: 'old',
    after: 'new',
  })
})

test('an identical snapshot must still be published', async () => {
  snapshotStatus = 'draft'
  try {
    await expect(
      getApiSnapshotChanges({
        fromSnapshot: 'shared',
        toSnapshot: 'shared',
        offset: 0,
      }),
    ).rejects.toMatchObject({ status: 404 })
  } finally {
    snapshotStatus = 'published'
  }
})
