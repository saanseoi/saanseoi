import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { SnapshotReplayStep } from '@repo/core/db/metaRegistry'
import {
  resolveSnapshotVersionState,
  type ReplayShard,
  type ResolvedSnapshotVersion,
} from '@repo/core/pipeline/db/snapshotReplay.ts'
import { historySchema } from '@repo/db'
import { iterateSnapshotVersions } from './snapshotChangeVersions'

function fixture() {
  const clients = new Map<string, Database>()
  const shards = new Map<string, ReplayShard>()
  const plan: SnapshotReplayStep[] = []
  function step(snapshotId: string, bindingName: string) {
    if (!clients.has(bindingName)) {
      const client = new Database(':memory:')
      client.exec(`create table places (id text, snapshotId text, versionHash text, operation text, createdAt text default '', primary key(id,snapshotId));
        create table placesI18n (placeId text, locale text, snapshotId text, versionHash text, operation text, createdAt text default '', primary key(placeId,snapshotId,locale));
        create view historyEvents as select snapshotId,'place' recordType,id recordId,'' locale,versionHash,operation,createdAt,null producerDatasetCode from places
          union all select snapshotId,'placeI18n',placeId,locale,versionHash,operation,createdAt,null from placesI18n;`)
      clients.set(bindingName, client)
      shards.set(bindingName, {
        bindingName,
        db: drizzle({ client }) as unknown as ReplayShard['db'],
      })
    }
    plan.push({
      snapshotId,
      resourceReleaseId: 'source',
      parentSnapshotId: plan.at(-1)?.snapshotId ?? null,
      shards: [{ bindingName, dataShardId: bindingName }],
    })
    return (id: string, locale = '', operation = 'upsert', hash = snapshotId) => {
      const db = clients.get(bindingName)!
      if (locale)
        db.query(
          'insert into placesI18n(placeId,locale,snapshotId,operation,versionHash) values (?,?,?,?,?)',
        ).run(id, locale, snapshotId, operation, operation === 'delete' ? null : hash)
      else
        db.query(
          'insert into places(id,snapshotId,operation,versionHash) values (?,?,?,?)',
        ).run(id, snapshotId, operation, operation === 'delete' ? null : hash)
    }
  }
  async function compare() {
    const expected = await resolveSnapshotVersionState(plan, shards, [
      'place',
      'placeI18n',
    ])
    const actual: ResolvedSnapshotVersion[] = []
    for await (const record of iterateSnapshotVersions(plan, shards, 'place', [
      historySchema.places,
      historySchema.placesI18n,
      'placeId',
    ]))
      actual.push(...record.versions)
    const normalise = (values: Iterable<(typeof actual)[number]>) =>
      [...values]
        .map(v =>
          JSON.stringify([
            v.recordType,
            v.recordId,
            v.locale,
            v.snapshotId,
            v.versionHash,
            v.sourceReleaseId,
            v.shard.bindingName,
          ]),
        )
        .sort()
    expect(normalise(actual)).toEqual(normalise(expected.values()))
    return actual
  }
  return {
    step,
    plan,
    compare,
    close: () => {
      for (const client of clients.values()) client.close()
    },
  }
}

test('streaming agrees with reference replay across shards, deletions, resurrection and locale-only events', async () => {
  const f = fixture()
  try {
    const root = f.step('z-root', 'BEFORE')
    for (const id of [
      'unchanged',
      'deleted',
      'resurrected',
      'locale-only',
      'fresh-locale',
      'same-step',
    ]) {
      root(id)
      root(id, 'en')
    }
    const delta = f.step('a-delta', '2025')
    delta('deleted', '', 'delete')
    delta('resurrected', '', 'delete')
    delta('fresh-locale', '', 'delete')
    delta('same-step', '', 'delete')
    delta('same-step', 'en')
    delta('locale-only', 'en')
    delta('new')
    delta('new', 'en')
    const leaf = f.step('leaf', '2026')
    leaf('resurrected')
    leaf('fresh-locale')
    leaf('fresh-locale', 'en')
    leaf('same-step')
    const other = f.step('other-branch', '2026')
    other('unchanged', '', 'delete')
    other('not-on-branch')
    f.plan.pop()
    const actual = await f.compare()
    expect(actual.some(v => v.recordId === 'resurrected' && v.locale === 'en')).toBe(
      false,
    )
    expect(actual.some(v => v.recordId === 'fresh-locale' && v.locale === 'en')).toBe(
      true,
    )
    expect(actual.some(v => v.recordId === 'same-step' && v.locale === 'en')).toBe(true)
  } finally {
    f.close()
  }
})

test('locale windows split inside records without losing or repeating versions', async () => {
  const f = fixture()
  try {
    const root = f.step('root', '2025')
    for (let i = 0; i < 9000; i++) {
      const id = String(i).padStart(5, '0')
      root(id)
      root(id, 'en')
      root(id, 'zh-Hant')
      root(id, 'zh-Hans')
    }
    const leaf = f.step('leaf', '2026')
    leaf('00000', 'en')
    leaf('08999', '', 'delete')
    expect((await f.compare()).filter(v => v.recordType === 'place')).toHaveLength(8999)
  } finally {
    f.close()
  }
})

test('long branches use bounded parameters and preserve the latest operation', async () => {
  const f = fixture()
  try {
    for (let i = 0; i < 110; i++)
      f.step(`step-${i}`, '2026')('one', '', i % 2 ? 'upsert' : 'delete')
    expect((await f.compare())[0]?.snapshotId).toBe('step-109')
  } finally {
    f.close()
  }
})
