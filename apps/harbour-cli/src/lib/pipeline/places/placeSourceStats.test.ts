import {
  insertReleaseFixture,
  releaseFixtureSchemaSql,
} from '../../../../../../libs/core/src/testing/releaseFixtures'
import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { HarbourReadableDb } from '@repo/core/db/types'
import type { NormalisedPlace } from '@repo/core/pipeline/services/places/place'
import { buildPlaceSourceStats, readPlaceSourceStatsRecords } from './placeSourceStats'

function fixture() {
  const meta = new Database(':memory:')
  meta.exec(releaseFixtureSchemaSql())
  for (const [datasetId, sourceVersion, status] of [
    ['places', '2025-09', 'archived'],
    ['places', '2025-10', 'archived'],
    ['places', '2025-11', 'failed'],
    ['other', '2025-11', 'current'],
    ['places', '2026-01', 'current'],
  ] as const)
    insertReleaseFixture(meta, {
      id: `${datasetId}-${sourceVersion}`,
      datasetId,
      sourceVersion,
      status,
      resourceType: 'place',
    })
  const sources = [new Database(':memory:'), new Database(':memory:')]
  for (const db of sources)
    db.exec(
      'CREATE TABLE overturePlaces (sourceRecordId, properties, sourceGeometry, validFromRelease, validToRelease, versionHash DEFAULT "hash")',
    )
  const add = (shard: number, id: string, name: string, end: string | null = null) =>
    sources[shard]!.query(
      'INSERT INTO overturePlaces (sourceRecordId,properties,sourceGeometry,validFromRelease,validToRelease) VALUES (?, ?, ?, ?, ?)',
    ).run(
      id,
      JSON.stringify({
        name,
        version: 1,
        sources: [{ dataset: 'test', update_time: 'old' }],
      }),
      JSON.stringify({ type: 'Point', coordinates: [114, 22] }),
      '2025-10',
      end,
    )
  const input = {
    metaDb: drizzle({ client: meta }) as unknown as HarbourReadableDb,
    sourceDbs: sources.map(
      db => drizzle({ client: db }) as unknown as HarbourReadableDb,
    ),
    datasetId: 'places',
    sourceVersion: '2025-12',
  }
  return {
    input,
    add,
    close: () => {
      meta.close()
      for (const db of sources) db.close()
    },
  }
}

async function* places(entries: [string, string, number?][]) {
  for (const [id, name, lng = 114] of entries)
    yield {
      id,
      raw: {
        id,
        name,
        version: 2,
        sources: [{ dataset: 'test', update_time: 'new' }],
        geometry: { type: 'Point', coordinates: [lng, 22] },
      },
    } as unknown as NormalisedPlace
}

const counts = (rows: Awaited<ReturnType<typeof buildPlaceSourceStats>>) =>
  Object.fromEntries(rows.map(row => [row.measure, row.value]))

test('retained source reads exhaust every page and keep shard membership', async () => {
  const f = fixture()
  try {
    for (let i = 0; i < 1001; i++) f.add(0, String(i).padStart(4, '0'), 'Place')
    f.add(1, 'other-shard', 'Place')
    const records = await readPlaceSourceStatsRecords(f.input.sourceDbs, '2025-10')
    expect(records.size).toBe(1002)
    expect(records.has('1000')).toBe(true)
    expect(records.has('other-shard')).toBe(true)
  } finally {
    f.close()
  }
})

test('Places source totals use the published predecessor across shards, including closed assertions on retry', async () => {
  const f = fixture()
  try {
    f.add(0, 'stable', 'Same')
    f.add(0, 'changed', 'Old', '2025-12')
    f.add(1, 'removed', 'Removed', '2025-12')
    f.add(1, 'geometry', 'Moved', '2025-12')
    const run = () =>
      buildPlaceSourceStats({
        ...f.input,
        places: places([
          ['stable', 'Same'],
          ['changed', 'New'],
          ['added', 'Added'],
          ['geometry', 'Moved', 115],
        ]),
      })
    expect(counts(await run())).toEqual({
      count: 4,
      added_count: 1,
      changed_count: 2,
      removed_count: 1,
      unchanged_count: 1,
    })
    expect(counts(await run())).toEqual(counts(await run()))
    expect(
      counts(await buildPlaceSourceStats({ ...f.input, places: places([]) })),
    ).toEqual({
      count: 0,
      added_count: 0,
      changed_count: 0,
      removed_count: 4,
      unchanged_count: 0,
    })
    expect(
      counts(
        await buildPlaceSourceStats({
          ...f.input,
          sourceVersion: '2025-08',
          places: places([['first', 'First']]),
        }),
      ),
    ).toEqual({
      count: 1,
      added_count: 1,
      changed_count: 0,
      removed_count: 0,
      unchanged_count: 0,
    })
  } finally {
    f.close()
  }
})

test('ambiguous retained identities and duplicate incoming identities fail instead of undercounting', async () => {
  const f = fixture()
  try {
    f.add(0, 'duplicate', 'One')
    f.add(1, 'duplicate', 'Two')
    await expect(
      readPlaceSourceStatsRecords(f.input.sourceDbs, '2025-10'),
    ).rejects.toThrow('Ambiguous')
    await expect(
      buildPlaceSourceStats({
        ...f.input,
        sourceVersion: '2025-08',
        places: places([
          ['one', 'A'],
          ['one', 'B'],
        ]),
      }),
    ).rejects.toThrow('Duplicate')
  } finally {
    f.close()
  }
})

test('source statistics use publisher IDs even when canonical IDs differ', async () => {
  const f = fixture()
  try {
    f.add(0, 'publisher', 'Same')
    async function* canonical() {
      for await (const place of places([['publisher', 'Same']]))
        yield { ...place, id: 'ss-canonical' }
    }
    expect(
      counts(await buildPlaceSourceStats({ ...f.input, places: canonical() })),
    ).toEqual({
      count: 1,
      added_count: 0,
      changed_count: 0,
      removed_count: 0,
      unchanged_count: 1,
    })
  } finally {
    f.close()
  }
})
