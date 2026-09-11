import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { currentSchema, historySchema, metaSchema, sourceSchema } from '@repo/db'
import {
  hashPlaceMaterialisation,
  normaliseOverturePlace,
} from '@repo/core/pipeline/services/places/place'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import type { NetStatement } from '../local/netSqlitePlanTypes.ts'
import { captureResolvedPlaceDelivery } from './resolvedPlaceDelivery.ts'
import { validateResolvedPlaces } from './resolvedPlaceValidation.ts'
import type {
  BuildPlaceSqlInput,
  EnrichedPlace,
} from './processLocalPlaceSqlUploadTypes.ts'

async function fixture(work: (f: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
  const f = await setup()
  try {
    await work(f)
  } finally {
    for (const db of Object.values(f.clients)) db.close()
    await rm(f.root, { recursive: true, force: true })
  }
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'resolved-places-test-'))
  const files: Record<string, string> = {}
  const clients: Record<string, Database> = {}
  for (const [binding, family] of [
    ['DB_CURRENT', 'current'],
    ['DB_HISTORY_HK_2025', 'history'],
    ['DB_SOURCE_HK_2025', 'source'],
    ['DB_META', 'meta'],
  ] as const) {
    files[binding] = join(root, `${binding}.sqlite`)
    const db = new Database(files[binding])
    clients[binding] = db
    db.exec(
      loadMigrationSql(join(import.meta.dir, '../../../../../../libs/db/migrations'), [
        family,
      ]),
    )
  }
  const current = clients.DB_CURRENT
  const history = clients.DB_HISTORY_HK_2025
  const source = clients.DB_SOURCE_HK_2025
  const meta = clients.DB_META
  if (!current || !history || !source || !meta) throw new Error('Missing test database')
  const context = {
    currentDb: drizzle({ client: current, schema: currentSchema }),
    historyDb: drizzle({ client: history, schema: historySchema }),
    sourceDb: drizzle({ client: source, schema: sourceSchema }),
    metaDb: drizzle({ client: meta, schema: metaSchema }),
    historyTargets: [
      {
        bindingName: 'DB_HISTORY_HK_2025',
        db: drizzle({ client: history, schema: historySchema }),
      },
    ],
    sourceTargets: [
      {
        bindingName: 'DB_SOURCE_HK_2025',
        db: drizzle({ client: source, schema: sourceSchema }),
      },
    ],
    state: {
      files,
      bindings: Object.fromEntries(
        Object.keys(files).map(key => [key, { databaseId: key }]),
      ),
      dbCacheDir: root,
      preparedAt: 'initial',
      target: 'local',
    },
  } as unknown as LocalAddressDbContext
  meta.exec(`INSERT INTO dataShards(id,shardType,regionCode,year,environment,databaseName,databaseId,bindingName,status,versionHash)
    VALUES ('history','history','hk','2025','preview','history','history','DB_HISTORY_HK_2025','active','hash');`)
  const place = normaliseOverturePlace(
    {
      id: 'place',
      geometry: { type: 'Point', coordinates: [114, 22] },
      names: { en: 'Original', 'zh-Hant': '原文' },
    },
    '2025-01',
  )
  if (!place) throw new Error('Place fixture normalisation failed')
  const row: EnrichedPlace = {
    place,
    address2dId: null,
    address3dId: null,
    divisionIds: [],
    sourcePayloadHash: 'source',
    versionHash: await hashPlaceMaterialisation(place, {
      addressId: null,
      addressSnapshotId: 'address',
      divisionSnapshotId: 'division',
      divisionIds: [],
    }),
  }
  const run = async (
    revision: number,
    rows: EnrichedPlace[],
    declaredCount = rows.length,
  ) => {
    const snapshotId = `revision-${revision}`
    meta
      .query(
        'INSERT INTO snapshots(id,code,resourceType,cohortKey,status,parentSnapshotId) VALUES (?,?,?,?,?,?)',
      )
      .run(
        snapshotId,
        snapshotId,
        'place',
        '2025',
        'published',
        revision > 1 ? `revision-${revision - 1}` : null,
      )
    meta
      .query('INSERT INTO snapshotShardAssignments VALUES (?,?)')
      .run(snapshotId, 'history')
    const path = join(root, `rows-${revision}.jsonl`)
    await Bun.write(path, rows.map(row => JSON.stringify(row)).join('\n'))
    const input: BuildPlaceSqlInput = {
      activeHistoryBindingName: 'DB_HISTORY_HK_2025',
      activeSourceBindingName: 'DB_SOURCE_HK_2025',
      sourceBindingNames: ['DB_SOURCE_HK_2025'],
      datasetId: 'dataset',
      message: {
        releaseId: snapshotId,
        sourceVersion: `2025-${revision}`,
      } as BuildPlaceSqlInput['message'],
      snapshots: {
        snapshotId,
        snapshotLineageId: 'scope',
        addressSnapshotId: 'address',
        divisionSnapshotId: 'division',
      },
      places: [],
      historyRows: [],
    }
    const batches: Array<{ binding: string; statements: NetStatement[] }> = []
    const output = await captureResolvedPlaceDelivery({
      context,
      sqlInput: input,
      path,
      totalRows: declaredCount,
      timestamp: snapshotId,
      capture: async (target, bytes) => {
        batches.push({
          binding: target.bindingName,
          statements: JSON.parse(Buffer.from(bytes).toString()),
        })
      },
    })
    const execute = () => {
      for (const batch of batches) {
        const client = clients[batch.binding]
        if (!client) throw new Error(`Missing test database: ${batch.binding}`)
        client.transaction(() => {
          for (const statement of batch.statements)
            client.query(statement.sql).run(...statement.params)
        })()
      }
    }
    return { ...output, batches, execute, path }
  }
  return { root, clients, current, history, source, meta, row, run }
}

test('full Places compiler delivers only final changes across current, history and source', () =>
  fixture(async f => {
    const initial = await f.run(1, [f.row])
    expect(f.current.query('SELECT count(*) AS n FROM places').get()).toEqual({ n: 0 })
    initial.execute()
    const stored = f.current.query('SELECT * FROM places').get()
    f.row.place.lastSeenMonth = '2025-02'
    const unchanged = await f.run(2, [f.row])
    expect(unchanged.mutationSummary.statements).toBe(0)
    expect(unchanged.batches).toHaveLength(2)
    unchanged.execute()
    expect(f.current.query('SELECT * FROM places').get()).toEqual(stored)
    const english = f.row.place.i18n.find(value => value.locale === 'en')
    if (!english) throw new Error('English place locale missing')
    english.name = 'Revised English'
    const revised = await f.run(3, [f.row])
    expect(revised.mutationSummary.tables.DB_CURRENT?.places?.updated).toBe(0)
    expect(revised.mutationSummary.tables.DB_CURRENT?.placesI18n?.updated).toBe(1)
    expect(
      revised.mutationSummary.tables.DB_SOURCE_HK_2025?.overturePlaces?.updated,
    ).toBe(0)
    revised.execute()
    expect(f.current.query('SELECT * FROM places').get()).toEqual(stored)
    expect(f.history.query('SELECT count(*) AS n FROM places').get()).toEqual({ n: 1 })
    const removed = await f.run(4, [])
    removed.execute()
    expect(f.current.query('SELECT count(*) AS n FROM places').get()).toEqual({ n: 0 })
    expect(f.source.query('SELECT isCurrent FROM overturePlaces').get()).toEqual({
      isCurrent: 0,
    })
    expect(
      f.current.query('SELECT preparedAt FROM placePublicationState').get(),
    ).toEqual({ preparedAt: 'revision-4' })
  }))

test('incorrect staged row count emits no Places mutations', () =>
  fixture(async f => {
    await expect(f.run(1, [f.row], 2)).rejects.toThrow()
    expect(f.current.query('SELECT count(*) AS n FROM places').get()).toEqual({ n: 0 })
    expect(f.history.query('SELECT count(*) AS n FROM places').get()).toEqual({ n: 0 })
  }))

test('equal counts with wrong Places identity fail exact membership validation', () =>
  fixture(async f => {
    const initial = await f.run(1, [f.row])
    initial.execute()
    f.current.exec(
      "PRAGMA foreign_keys=OFF; UPDATE places SET id='wrong' WHERE id='place'",
    )
    await expect(
      validateResolvedPlaces(f.current, initial.path, 'scope', 1),
    ).rejects.toThrow('exact membership')
  }))
