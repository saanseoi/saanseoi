import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { listSourceChanges } from './sourceChanges'
import { SourceChangesQuerySchema } from '../schema/sourceChanges'

function fixture() {
  const db = new Database(':memory:')
  db.exec(
    'CREATE TABLE overtureDivisions(sourceRecordId TEXT, versionHash TEXT, properties TEXT, sourceGeometry TEXT, validFromRelease TEXT, validToRelease TEXT)',
  )
  const insert = (
    id: string,
    hash: string,
    from: string,
    to: string | null,
    properties: unknown,
    geometry: unknown = null,
  ) =>
    db
      .query('INSERT INTO overtureDivisions VALUES(?,?,?,?,?,?)')
      .run(id, hash, JSON.stringify(properties), JSON.stringify(geometry), from, to)
  const source = {
    prepare: (sql: string) => ({
      bind: (...values: unknown[]) => ({
        all: async () => ({ results: db.query(sql).all(...(values as string[])) }),
      }),
    }),
  }
  const releases = {
    old: { resourceReleaseId: 'old', sourceVersion: '2026-08', datasetId: 'dataset' },
    current: {
      resourceReleaseId: 'current',
      sourceVersion: '2026-09',
      datasetId: 'dataset',
    },
    other: { resourceReleaseId: 'other', sourceVersion: '2026-09', datasetId: 'other' },
  }
  const metaDb = {
    $client: {
      prepare: () => ({
        bind: (selector: keyof typeof releases) => ({
          all: async () => ({
            results: releases[selector]
              ? [
                  {
                    ...releases[selector],
                    sourceReleaseCode: selector,
                    datasetCode: 'ds-hk-overture-division',
                    resourceType: 'division',
                    publisherCode: 'overture',
                    bindingName: 'DB_SOURCE_HK_2026',
                  },
                ]
              : [],
          }),
        }),
      }),
    },
  }
  return {
    db,
    insert,
    request: (query: Record<string, unknown> = {}) =>
      listSourceChanges({
        env: { DB_SOURCE_HK_2026: source } as never,
        metaDb: metaDb as never,
        family: 'divisions',
        query: SourceChangesQuerySchema.parse({
          fromRelease: 'old',
          toRelease: 'current',
          ...query,
        }),
      }),
  }
}

test('resource comparison returns before/after and changed leaves with exact filters', async () => {
  const f = fixture()
  try {
    f.insert('added', 'a', '2026-09', null, { name: 'New' })
    f.insert('changed', 'old', '2026-08', '2026-09', { name: 'Old', stable: 1 })
    f.insert('changed', 'new', '2026-09', null, { name: 'New', stable: 1 })
    f.insert('removed', 'r', '2026-08', '2026-09', { name: 'Gone' })
    f.insert('same', 's', '2026-08', null, { name: 'Same' })
    const result = await f.request()
    expect(result.records.map(row => row.type)).toEqual(['added', 'changed', 'removed'])
    expect(result.records[1]!.fields.map(field => field.path)).toEqual([
      ['properties', 'name'],
    ])
    expect(result.records[2]!.before?.properties?.name).toBe('Gone')
    expect(result.records[2]!.after).toBeNull()
    expect(
      (await f.request({ type: 'removed' })).records.map(row => row.sourceRecordId),
    ).toEqual(['removed'])
    expect(result.nextCursor).toBeNull()
  } finally {
    f.db.close()
  }
})

test('pagination crosses scan boundaries without losing additions or removals', async () => {
  const f = fixture()
  try {
    for (let i = 0; i < 150; i++)
      f.insert(
        String(i).padStart(3, '0'),
        String(i),
        i % 2 ? '2026-08' : '2026-09',
        i % 2 ? '2026-09' : null,
        { i },
      )
    const ids: string[] = []
    let cursor: string | null = null
    do {
      const result = await f.request({ limit: 7, ...(cursor ? { cursor } : {}) })
      ids.push(...result.records.map(row => row.sourceRecordId))
      cursor = result.nextCursor
    } while (cursor)
    expect(ids.length).toBe(150)
    expect(new Set(ids).size).toBe(150)
  } finally {
    f.db.close()
  }
})

test('scans past unchanged records to return geometry-only changes in the same page', async () => {
  const f = fixture()
  try {
    for (let i = 0; i < 520; i++)
      f.insert(String(i).padStart(3, '0'), String(i), '2026-08', null, {})
    f.insert(
      '999',
      'before',
      '2026-08',
      '2026-09',
      {},
      { type: 'Point', coordinates: [1, 2] },
    )
    f.insert(
      '999',
      'after',
      '2026-09',
      null,
      {},
      { type: 'Point', coordinates: [2, 3] },
    )
    const result = await f.request({ type: 'changed', limit: 1 })
    expect(result.records[0]!.fields.map(field => field.path)).toEqual([['geometry']])
    expect(result.nextCursor).toBeNull()
  } finally {
    f.db.close()
  }
})

test('unavailable, incompatible and reversed releases never masquerade as removals', async () => {
  const f = fixture()
  try {
    await expect(f.request({ toRelease: 'missing' })).rejects.toMatchObject({
      status: 404,
    })
    await expect(f.request({ toRelease: 'other' })).rejects.toMatchObject({
      status: 409,
    })
    await expect(
      f.request({ fromRelease: 'current', toRelease: 'old' }),
    ).rejects.toMatchObject({ status: 422 })
    await expect(f.request({ cursor: 'bad' })).rejects.toMatchObject({
      code: 'invalid_cursor',
    })
  } finally {
    f.db.close()
  }
})

for (const type of ['added', 'changed', 'removed'] as const) {
  test(`${type} limit counts sparse matches and cursors do not skip lookahead`, async () => {
    const f = fixture()
    try {
      for (let i = 0; i < 1600; i++) {
        const id = String(i).padStart(4, '0')
        if (i % 600 !== 599) f.insert(id, 'same', '2026-08', null, {})
        else if (type === 'added') f.insert(id, 'new', '2026-09', null, {})
        else if (type === 'removed') f.insert(id, 'old', '2026-08', '2026-09', {})
        else {
          f.insert(id, 'old', '2026-08', '2026-09', { name: 'old' })
          f.insert(id, 'new', '2026-09', null, { name: 'new' })
        }
      }
      const first = await f.request({ type, limit: 1 })
      expect(first.records.map(row => row.sourceRecordId)).toEqual(['0599'])
      expect(first.nextCursor).not.toBeNull()
      await expect(
        f.request({
          cursor: first.nextCursor,
          type: type === 'added' ? 'removed' : 'added',
        }),
      ).rejects.toMatchObject({ code: 'cursor_comparison_mismatch' })
      const second = await f.request({ type, limit: 1, cursor: first.nextCursor })
      expect(second.records.map(row => row.sourceRecordId)).toEqual(['1199'])
      expect(second.nextCursor).toBeNull()
      const full = await f.request({ type, limit: 2 })
      expect(full.records).toHaveLength(2)
      expect(full.nextCursor).toBeNull()
      const short = await f.request({ type, limit: 3 })
      expect(short.records).toHaveLength(2)
      expect(short.nextCursor).toBeNull()
    } finally {
      f.db.close()
    }
  })
}
