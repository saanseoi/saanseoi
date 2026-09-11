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
import { importPlaceSqlBatches } from './processLocalPlaceSqlUploadImport.ts'
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
    mirror?: { context: LocalAddressDbContext; clients: Record<string, Database> },
  ) => {
    const planningContext = mirror?.context ?? context
    const planningClients = mirror?.clients ?? clients
    const planningMeta = planningClients.DB_META
    if (!planningMeta) throw new Error('Missing planning metadata')
    const snapshotId = `revision-${revision}`
    planningMeta
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
    planningMeta
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
      context: planningContext,
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
        const client = planningClients[batch.binding]
        if (!client) throw new Error(`Missing test database: ${batch.binding}`)
        client.transaction(() => {
          for (const statement of batch.statements)
            client.query(statement.sql).run(...statement.params)
        })()
      }
    }
    return { ...output, batches, execute, path, input }
  }
  return { root, clients, current, history, source, meta, row, run, context }
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

test('native Places integration retries the retained final plan without generating against changed input', () =>
  fixture(async f => {
    const prepared = await f.run(1, [f.row])
    const delivery = {
      directory: join(f.root, 'native-delivery'),
      context: f.context,
      releaseId: 'revision-1',
      inputs: { snapshotId: 'revision-1', inputDigest: 'sealed-fixture' },
    }
    const apply = () =>
      importPlaceSqlBatches(
        {} as Parameters<typeof importPlaceSqlBatches>[0],
        prepared.input,
        prepared.path,
        1,
        'revision-1',
        { isLocal: true },
        undefined,
        delivery,
      )
    await apply()
    const data = f.current.query('SELECT * FROM places').all()
    const receipts = f.current
      .query('SELECT * FROM harbourSqlDeliveryReceipts ORDER BY planId,batchIndex')
      .all()
    await Bun.write(prepared.path, 'not valid JSON')
    await apply()
    expect(f.current.query('SELECT * FROM places').all()).toEqual(data)
    expect(
      f.current
        .query('SELECT * FROM harbourSqlDeliveryReceipts ORDER BY planId,batchIndex')
        .all(),
    ).toEqual(receipts)
  }))

test('verified bootstrap mirror plans an actual Place delta without changing its imported baseline', () =>
  fixture(async f => {
    const initial = await f.run(1, [f.row])
    initial.execute()
    f.current.exec("UPDATE placePublicationState SET status='current'")
    for (const [binding, shardType] of [
      ['DB_META', 'meta'],
      ['DB_CURRENT', 'current'],
      ['DB_SOURCE_HK_2025', 'source'],
    ] as const) {
      f.meta
        .query(
          'INSERT INTO dataShards(id,shardType,regionCode,year,environment,databaseName,databaseId,bindingName,status,versionHash) VALUES (?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          binding,
          shardType,
          'hk',
          '2025',
          'preview',
          binding,
          binding,
          binding,
          'active',
          'hash',
        )
    }
    const spec = join(f.root, 'bootstrap-input.json')
    const config = join(f.root, 'bootstrap-targets.json')
    const bundle = join(f.root, 'bundle')
    const mirrorRoot = join(f.root, 'production-mirror')
    const files = f.context.state.files
    if (!files) throw new Error('Missing bootstrap fixture files')
    await Bun.write(spec, JSON.stringify(files))
    await Bun.write(
      config,
      JSON.stringify({
        d1_databases: Object.keys(files).map((binding, index) => ({
          binding,
          database_name: binding.toLowerCase(),
          database_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        })),
      }),
    )
    const process = Bun.spawn(
      [
        'python3',
        '-c',
        `
import importlib.util, json, sys
from pathlib import Path
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('bootstrap', sys.argv[1])
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)
paths = {key: Path(value) for key, value in json.loads(Path(sys.argv[2]).read_text()).items()}
config, bundle, mirror = map(Path, sys.argv[3:])
with patch.object(bootstrap, 'local_paths', return_value=paths):
    bootstrap.prepare(bundle, config)
manifest = bootstrap.verify(bundle)
# Isolated fixture: restore_check above verifies each complete import locally.
# Live imports require check-import receipts from each actual destination.
(bundle / 'verified-imports.json').write_text(json.dumps({row['binding']: row['sha256'] for row in manifest['databases']}))
with patch.object(bootstrap, 'CONFIG', config):
    bootstrap.seed_mirror(bundle, mirror)
`,
        join(import.meta.dir, '../../../../../../scripts/d1-bootstrap.py'),
        spec,
        config,
        bundle,
        mirrorRoot,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ])
    expect({ exitCode, error: exitCode === 0 ? '' : stdout + stderr }).toEqual({
      exitCode: 0,
      error: '',
    })
    const state = await Bun.file(join(mirrorRoot, 'manifest.json')).json()
    const clients: Record<string, Database> = {}
    try {
      for (const [binding, path] of Object.entries(state.files))
        clients[binding] = new Database(String(path))
      const current = clients.DB_CURRENT
      const history = clients.DB_HISTORY_HK_2025
      const source = clients.DB_SOURCE_HK_2025
      const meta = clients.DB_META
      if (!current || !history || !source || !meta)
        throw new Error('Incomplete bootstrapped mirror')
      const context = {
        ...f.context,
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
        state: { ...f.context.state, ...state, dbCacheDir: mirrorRoot },
      } as unknown as LocalAddressDbContext
      const before = current.query('SELECT * FROM placesI18n ORDER BY locale').all()
      const english = f.row.place.i18n.find(value => value.locale === 'en')
      if (!english) throw new Error('English Place locale missing')
      english.name = 'After bootstrap'
      const delta = await f.run(2, [f.row], 1, { context, clients })
      expect(delta.mutationSummary.tables.DB_CURRENT?.places?.updated).toBe(0)
      expect(delta.mutationSummary.tables.DB_CURRENT?.placesI18n?.updated).toBe(1)
      expect(
        delta.mutationSummary.tables.DB_SOURCE_HK_2025?.overturePlaces?.updated,
      ).toBe(0)
      expect(current.query('SELECT * FROM placesI18n ORDER BY locale').all()).toEqual(
        before,
      )
      delta.execute()
      expect(
        current.query("SELECT name FROM placesI18n WHERE locale='en'").get(),
      ).toEqual({ name: 'After bootstrap' })
      expect(f.current.query('SELECT * FROM placesI18n ORDER BY locale').all()).toEqual(
        before,
      )
      expect(meta.query('SELECT DISTINCT environment FROM dataShards').all()).toEqual([
        { environment: 'production' },
      ])
    } finally {
      for (const db of Object.values(clients)) db.close()
    }
  }))
