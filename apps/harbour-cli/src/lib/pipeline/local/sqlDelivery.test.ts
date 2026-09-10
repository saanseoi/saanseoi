import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fixture } from './sqlDeliveryTestFixture.ts'
import { prepareSqlDelivery, runSqlDelivery } from './sqlDelivery.ts'
import { withDeliveryLock } from './sqlDeliveryFiles.ts'
import { prepareReleaseSqlDelivery } from './releaseSqlDelivery.ts'
import { captureSqlDeliveryBatches } from './sqlDeliveryBatchCapture.ts'
import { executeSqlText } from './sqlImport.ts'
import { buildStatisticSqlBatches } from '../statistics/statisticSqlReplay.ts'
import { geometryBuildUpsertSql } from '../divisions/processLocalDivisionGeometrySqlUpload.ts'
import { buildPlaceSql } from '../places/processLocalPlaceSqlUploadRows.ts'
import { normaliseOverturePlace } from '@repo/core/pipeline/services/place'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import {
  assertSqlDeliveryPlanningAllowed,
  completeSqlDeliveryRelease,
} from './sqlDeliveryPending.ts'
import type { D1ImportFetch } from '@repo/core/d1ImportApi'

test('captured family SQL seals once and replays exact bytes remotely then locally', () =>
  fixture(async f => {
    let generated = 0
    const prepare = () =>
      prepareReleaseSqlDelivery({
        directory: f.directory,
        context: {
          state: {
            target: 'preview',
            dbCacheDir: f.root,
            bindings: { DB_CURRENT: { databaseId: 'db' } },
          },
        } as unknown as LocalAddressDbContext,
        releaseId: 'release',
        phase: 'family',
        inputs: { sourceSha: 'frozen' },
        generate: capture =>
          captureSqlDeliveryBatches(capture, async () => {
            generated++
            const target = { name: 'current' as const, databaseId: 'db' }
            for (let i = 0; i < 3; i++) {
              await executeSqlText(target, 'UPDATE counter SET n = n + 1;', {
                isLocal: true,
              })
              await executeSqlText(target, 'UPDATE counter SET n = n + 1;', {
                isLocal: false,
              })
            }
          }),
      })
    const plan = await prepare()
    expect(plan.batches).toHaveLength(1)
    expect(f.localValue()).toEqual({ n: 0 })
    expect(f.events).toHaveLength(0)
    await runSqlDelivery(f.directory, { ...f.options, mode: 'remote' })
    await prepare()
    expect(generated).toBe(1)
    await runSqlDelivery(f.directory, { ...f.options, mode: 'local' })
    await runSqlDelivery(f.directory, { ...f.options, mode: 'remote' })
    await runSqlDelivery(f.directory, { ...f.options, mode: 'local' })
    expect(f.localValue()).toEqual({ n: 3 })
    expect(f.remote.query('SELECT n FROM counter').get()).toEqual({ n: 3 })
    expect(f.events.filter(event => event === 'ingest')).toHaveLength(1)
  }))

test('100 completed batches use three receipt reads for resume and local replay', () =>
  fixture(async f => {
    await prepareSqlDelivery(f.directory, f.context, async append => {
      for (let i = 0; i < 100; i++)
        await append(
          { bindingName: 'DB_CURRENT', databaseId: 'db' },
          new TextEncoder().encode('UPDATE counter SET n = n + 1;'),
        )
    })
    await runSqlDelivery(f.directory, { ...f.options, mode: 'remote' })
    const ingestCount = f.events.filter(event => event === 'ingest').length
    let reads = 0
    const fetch: D1ImportFetch = async (input, init) => {
      if (String(input).endsWith('/query')) reads++
      return f.options.fetch(input, init)
    }
    await runSqlDelivery(f.directory, { ...f.options, fetch, mode: 'remote' })
    expect(reads).toBe(3)
    expect(f.events.filter(event => event === 'ingest')).toHaveLength(ingestCount)
    reads = 0
    await runSqlDelivery(f.directory, { ...f.options, fetch, mode: 'local' })
    expect(reads).toBe(3)
    expect(f.localValue()).toEqual({ n: 100 })
  }))

test('batched receipt checks reject mismatches and missing receipts before local writes', () =>
  fixture(async f => {
    await f.prepare()
    await runSqlDelivery(f.directory, { ...f.options, mode: 'remote' })
    f.remote.exec(
      "UPDATE harbourSqlDeliveryReceipts SET sha256='wrong' WHERE batchIndex=2",
    )
    await expect(
      runSqlDelivery(f.directory, { ...f.options, mode: 'local' }),
    ).rejects.toThrow('receipt mismatch')
    await expect(
      runSqlDelivery(f.directory, { ...f.options, mode: 'remote' }),
    ).rejects.toThrow('receipt mismatch')
    f.remote.exec('DELETE FROM harbourSqlDeliveryReceipts WHERE batchIndex=2')
    await expect(
      runSqlDelivery(f.directory, { ...f.options, mode: 'local' }),
    ).rejects.toThrow('not confirmed')
    await expect(
      runSqlDelivery(f.directory, { ...f.options, mode: 'remote' }),
    ).rejects.toThrow('receipt disappeared')
    expect(f.localValue()).toEqual({ n: 0 })
    expect(f.events.filter(event => event === 'ingest')).toHaveLength(3)
  }))

test('parallel remote targets overlap without reordering batches within a target', () =>
  fixture(async f => {
    await prepareSqlDelivery(
      f.directory,
      {
        ...f.context,
        inputs: { parallelTargets: true },
      },
      async append => {
        for (let index = 0; index < 4; index++) {
          await append(
            index % 2 === 0
              ? { bindingName: 'DB_CURRENT', databaseId: 'db' }
              : { bindingName: 'DB_HISTORY', databaseId: 'history' },
            new TextEncoder().encode(
              JSON.stringify([
                { sql: 'UPDATE counter SET n = n + ?;', params: [index + 1] },
              ]),
            ),
            'bound',
          )
        }
      },
    )
    const active = new Set<string>()
    const order = new Map<string, number[]>()
    let peak = 0
    const fetch: D1ImportFetch = async (input, init) => {
      const body = JSON.parse(init?.body as string)
      if (!body.batch) return f.options.fetch(input, init)
      const target = String(input)
      expect(active.has(target)).toBe(false)
      active.add(target)
      peak = Math.max(peak, active.size)
      const sequence = order.get(target) ?? []
      sequence.push(
        body.batch.find((statement: { params: unknown[] }) => statement.params.length)
          ?.params[0],
      )
      order.set(target, sequence)
      await Bun.sleep(10)
      try {
        return await f.options.fetch(input, init)
      } finally {
        active.delete(target)
      }
    }
    await runSqlDelivery(f.directory, {
      ...f.options,
      fetch,
      mode: 'remote',
      targets: { DB_CURRENT: 'db', DB_HISTORY: 'history' },
    })
    expect(peak).toBe(2)
    expect([...order.values()].sort((a, b) => a[0]! - b[0]!)).toEqual([
      [1, 3],
      [2, 4],
    ])
    expect(f.remote.query('SELECT n FROM counter').get()).toEqual({ n: 10 })
  }))

for (const acknowledgementLost of [false, true])
  test(`Address3D groups sealed bound batches and recovers each receipt: lost acknowledgement=${acknowledgementLost}`, () =>
    fixture(async f => {
      await prepareSqlDelivery(
        f.directory,
        {
          ...f.context,
          phase: 'address3d-data',
          inputs: { independentBoundTargets: true },
        },
        async append => {
          for (let index = 0; index < 10; index++)
            await append(
              { bindingName: 'DB_CURRENT', databaseId: 'db' },
              new TextEncoder().encode(
                JSON.stringify([{ sql: 'UPDATE counter SET n = n + ?;', params: [1] }]),
              ),
              'bound',
            )
        },
      )
      const sealed = await readFile(join(f.directory, 'plan.json'), 'utf8')
      if (acknowledgementLost) {
        f.fail('after-commit')
        await expect(
          runSqlDelivery(f.directory, { ...f.options, mode: 'remote' }),
        ).rejects.toThrow('connection lost')
        expect(f.remote.query('SELECT n FROM counter').get()).toEqual({ n: 8 })
        f.fail('none')
      }
      await runSqlDelivery(f.directory, { ...f.options, mode: 'remote' })
      expect(f.events.filter(event => event === 'bound')).toHaveLength(2)
      expect(f.remote.query('SELECT n FROM counter').get()).toEqual({ n: 10 })
      expect(await readFile(join(f.directory, 'plan.json'), 'utf8')).toBe(sealed)
      await runSqlDelivery(f.directory, { ...f.options, mode: 'local' })
      await runSqlDelivery(f.directory, { ...f.options, mode: 'remote' })
      expect(f.localValue()).toEqual({ n: 10 })
      expect(f.events.filter(event => event === 'bound')).toHaveLength(2)
    }))

test('grouped bound batches with no receipts refuse an uncertain replay', () =>
  fixture(async f => {
    await prepareSqlDelivery(
      f.directory,
      {
        ...f.context,
        phase: 'address3d-data',
        inputs: { independentBoundTargets: true },
      },
      async append => {
        for (let index = 0; index < 2; index++)
          await append(
            { bindingName: 'DB_CURRENT', databaseId: 'db' },
            new TextEncoder().encode(
              JSON.stringify([{ sql: 'UPDATE counter SET n = n + 1;', params: [] }]),
            ),
            'bound',
          )
      },
    )
    const fetch: D1ImportFetch = async (input, init) => {
      if (JSON.parse(init?.body as string).batch) throw new Error('uncertain transport')
      return f.options.fetch(input, init)
    }
    await expect(
      runSqlDelivery(f.directory, { ...f.options, fetch, mode: 'remote' }),
    ).rejects.toThrow('uncertain transport')
    await expect(
      runSqlDelivery(f.directory, { ...f.options, mode: 'remote' }),
    ).rejects.toThrow('uncertain outcome')
    expect(f.remote.query('SELECT n FROM counter').get()).toEqual({ n: 0 })
  }))

test('bound preparation rejects invalid statement budgets before sealing', () =>
  fixture(async f => {
    await expect(
      prepareSqlDelivery(f.directory, f.context, async append => {
        await append(
          { bindingName: 'DB_CURRENT', databaseId: 'db' },
          new TextEncoder().encode(
            JSON.stringify([{ sql: 'SELECT 1', params: Array(101).fill(1) }]),
          ),
          'bound',
        )
      }),
    ).rejects.toThrow('budget exceeded')
    await expect(Bun.file(join(f.directory, 'plan.json')).exists()).resolves.toBe(false)
  }))

test('independent bound targets combine alternating collections without changing either database order', () =>
  fixture(async f => {
    const plan = await prepareReleaseSqlDelivery({
      directory: f.directory,
      context: {
        state: {
          target: 'preview',
          dbCacheDir: f.root,
          bindings: {
            DB_CURRENT: { databaseId: 'current' },
            DB_HISTORY: { databaseId: 'history' },
          },
        },
      } as unknown as LocalAddressDbContext,
      releaseId: 'release',
      phase: 'address3d-data',
      inputs: { independentBoundTargets: true },
      generate: async capture => {
        for (let collection = 0; collection < 100; collection++) {
          for (const databaseId of ['history', 'current']) {
            await capture(
              { databaseId },
              new TextEncoder().encode(
                JSON.stringify(
                  Array.from({ length: 3 }, (_, index) => ({
                    sql: 'SELECT ?',
                    params: [collection * 3 + index],
                  })),
                ),
              ),
              'bound',
            )
          }
        }
        await capture(
          { databaseId: 'current' },
          new TextEncoder().encode('SELECT 999;'),
        )
      },
    })
    expect(plan.batches).toHaveLength(11)
    expect(plan.batches.at(-1)?.kind).toBe('sql')
    for (const databaseId of ['history', 'current']) {
      const values: number[] = []
      for (const batch of plan.batches.filter(
        batch => batch.kind === 'bound' && batch.target.databaseId === databaseId,
      )) {
        const statements = JSON.parse(
          await readFile(join(f.directory, batch.file), 'utf8'),
        )
        expect(statements.length).toBeLessThanOrEqual(64)
        expect(statements.length % 3).toBe(0)
        values.push(
          ...statements.map((statement: { params: number[] }) => statement.params[0]),
        )
      }
      expect(values).toEqual(Array.from({ length: 300 }, (_, index) => index))
    }
  }))

test('release capture coalesces adjacent bound collections without splitting or reordering', () =>
  fixture(async f => {
    const plan = await prepareReleaseSqlDelivery({
      directory: f.directory,
      context: {
        state: {
          target: 'preview',
          dbCacheDir: f.root,
          bindings: { DB_CURRENT: { databaseId: 'db' } },
        },
      } as unknown as LocalAddressDbContext,
      releaseId: 'release',
      phase: 'data',
      inputs: {},
      generate: async capture => {
        for (let collection = 0; collection < 23; collection++) {
          await capture(
            { databaseId: 'db' },
            new TextEncoder().encode(
              JSON.stringify(
                Array.from({ length: 3 }, (_, index) => ({
                  sql: 'UPDATE counter SET n = n + ?',
                  params: [collection * 3 + index],
                })),
              ),
            ),
            'bound',
          )
        }
      },
    })
    expect(plan.batches).toHaveLength(2)
    const payloads = await Promise.all(
      plan.batches.map(batch => Bun.file(join(f.directory, batch.file)).json()),
    )
    expect(payloads.map(statements => statements.length)).toEqual([63, 6])
    expect(payloads.flat().map(statement => statement.params[0])).toEqual(
      Array.from({ length: 69 }, (_, index) => index),
    )
  }))

test('status command reads a sealed plan without credentials or network access', () =>
  fixture(async f => {
    const plan = await f.prepare()
    const child = Bun.spawn(
      [
        process.execPath,
        '-e',
        `
    import { runSqlDeliveryCommand } from ${JSON.stringify(join(import.meta.dir, '../../commands/sqlDelivery.ts'))};
    globalThis.fetch = () => { throw new Error('Unexpected network request'); };
    await runSqlDeliveryCommand({ command: 'sql:status', positionals: [], options: { plan: ${JSON.stringify(f.directory)} } }, { remote: true, environment: 'preview' }, ${JSON.stringify(f.root)});
  `,
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: '', CLOUDFLARE_D1_TOKEN: '' },
      },
    )
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    expect(stderr).toBe('')
    expect(code).toBe(0)
    expect(JSON.parse(stdout).plan.id).toBe(plan.id)
  }))

test('generated Places and search recover in phase order against the current schema', () =>
  fixture(async f => {
    const baseline = new Database(':memory:')
    const local = new Database(f.localPath)
    try {
      const schema = loadMigrationSql(
        join(import.meta.dir, '../../../../../../libs/db/migrations'),
        ['current'],
      )
      for (const db of [baseline, local, f.remote]) db.exec(schema)
      const places = Array.from({ length: 30 }, (_, index) => {
        const place = normaliseOverturePlace(
          {
            id: `place-${index}`,
            names: { primary: `Recoveryshop ${index}` },
            geometry: { type: 'Point', coordinates: [114, 22] },
          },
          '2026-08-19.0',
        )
        if (!place) throw new Error('Invalid fixture Place')
        return {
          place,
          address2dId: null,
          address3dId: null,
          divisionIds: [],
          versionHash: `v-${index}`,
          sourcePayloadHash: `s-${index}`,
        }
      })
      const built = await buildPlaceSql(
        {
          activeHistoryBindingName: 'history',
          activeSourceBindingName: 'source',
          sourceBindingNames: ['source'],
          datasetId: 'places',
          message: {
            releaseId: 'release',
            sourceVersion: '2026-08-19.0',
          } as Parameters<typeof buildPlaceSql>[0]['message'],
          snapshots: {
            snapshotId: 'snapshot',
            addressSnapshotId: 'address',
            divisionSnapshotId: 'division',
          },
          places,
          historyRows: [],
        },
        { timestamp: '2026-09-07T00:00:00Z' },
      )
      const dataSql = built.currentSql.join('\n')
      const searchSql = await readFile(
        join(
          import.meta.dir,
          '../../../../../../libs/db/scripts/sql/rebuild-places-fts.sql',
        ),
        'utf8',
      )
      baseline.exec(dataSql)
      baseline.exec(searchSql)
      const plan = await prepareSqlDelivery(f.directory, f.context, append =>
        captureSqlDeliveryBatches(
          async (_, bytes) => {
            await append({ bindingName: 'DB_CURRENT', databaseId: 'db' }, bytes)
          },
          () =>
            executeSqlText({ databaseId: 'db', name: 'current' }, dataSql, {
              isLocal: false,
            }),
          10_000,
        ),
      )
      expect(plan.batches.length).toBeGreaterThan(1)
      const searchDirectory = join(f.root, 'search-delivery')
      await prepareSqlDelivery(
        searchDirectory,
        { ...f.context, phase: 'search' },
        async append => {
          await append(
            { bindingName: 'DB_CURRENT', databaseId: 'db' },
            new TextEncoder().encode(searchSql),
          )
        },
      )
      f.fail('after-commit')
      await expect(
        runSqlDelivery(f.directory, { ...f.options, mode: 'remote' }),
      ).rejects.toThrow('connection lost')
      f.fail('none')
      await runSqlDelivery(f.directory, { ...f.options, mode: 'remote' })
      await runSqlDelivery(searchDirectory, { ...f.options, mode: 'remote' })
      expect(
        f.remote
          .query(
            "SELECT COUNT(*) AS n FROM placesFts WHERE placesFts MATCH 'Recoveryshop'",
          )
          .get(),
      ).toEqual({ n: 30 })
      await expect(
        runSqlDelivery(f.directory, {
          ...f.options,
          mode: 'local',
          onProgress: completed => {
            if (completed === 1) throw new Error('mirror interrupted')
          },
        }),
      ).rejects.toThrow('mirror interrupted')
      await runSqlDelivery(f.directory, { ...f.options, mode: 'local' })
      await runSqlDelivery(searchDirectory, { ...f.options, mode: 'local' })
      for (const table of ['places', 'placesI18n', 'placesCells', 'placesFts']) {
        const query = `SELECT * FROM ${table} ORDER BY rowid`
        expect(local.query(query).all()).toEqual(baseline.query(query).all())
        expect(f.remote.query(query).all()).toEqual(baseline.query(query).all())
      }
      await runSqlDelivery(f.directory, { ...f.options, mode: 'remote' })
      await runSqlDelivery(searchDirectory, { ...f.options, mode: 'remote' })
      await runSqlDelivery(searchDirectory, { ...f.options, mode: 'local' })
      expect(f.events.filter(event => event === 'ingest')).toHaveLength(
        plan.batches.length + 1,
      )
    } finally {
      baseline.close()
      local.close()
    }
  }))

for (const family of ['statistics', 'geometry'] as const) {
  test(`${family} generated SQL survives lost remote acknowledgement and interrupted mirror replay`, () =>
    fixture(async f => {
      const geometry = { type: 'Polygon', coordinates: ['香港;'.repeat(40_000)] }
      const schema =
        family === 'geometry'
          ? 'CREATE TABLE divisionAreas (snapshotId TEXT, id TEXT, geometry TEXT, PRIMARY KEY(snapshotId,id));'
          : `CREATE TABLE hkgovCenstatdStatistics (
            createdAt TEXT, isCurrent INTEGER, rawProperties TEXT, releaseId TEXT,
            sourceGeometry TEXT, sourceRecordId TEXT, sources TEXT, updatedAt TEXT,
            validFromRelease TEXT, validToRelease TEXT, version INTEGER, versionHash TEXT,
            PRIMARY KEY(sourceRecordId,versionHash));`
      const sql =
        family === 'geometry'
          ? geometryBuildUpsertSql('divisionAreas', [
              { snapshotId: 'snapshot', id: 'area', geometry },
            ])
          : buildStatisticSqlBatches({
              releaseId: 'release',
              releaseCode: 'release-code',
              source: {
                table: 'hkgovCenstatdStatistics',
                rows: Array.from({ length: 40 }, (_, index) => ({
                  createdAt: '2026-09-07',
                  updatedAt: '2026-09-07',
                  isCurrent: true,
                  rawProperties: {
                    label: `香港 O'Brien; ${index}`,
                    value: 'x'.repeat(5000),
                  },
                  releaseId: 'release',
                  sourceRecordId: `row-${index}`,
                  sources: [],
                  sourceGeometry: null,
                  validFromRelease: 'release-code',
                  validToRelease: null,
                  version: 1,
                  versionHash: `hash-${index}`,
                })),
              },
            }).source.join('\n')
      const query =
        family === 'geometry'
          ? 'SELECT * FROM divisionAreas ORDER BY id'
          : 'SELECT * FROM hkgovCenstatdStatistics ORDER BY sourceRecordId'
      const baseline = new Database(':memory:')
      const local = new Database(f.localPath)
      try {
        for (const db of [baseline, local, f.remote]) db.exec(schema)
        baseline.exec(sql)
        const expected = baseline.query(query).all()
        const plan = await prepareSqlDelivery(f.directory, f.context, append =>
          captureSqlDeliveryBatches(
            async (target, bytes) => {
              if (!target.databaseId) throw new Error('Missing fixture database ID')
              await append(
                { bindingName: 'DB_CURRENT', databaseId: target.databaseId },
                bytes,
              )
            },
            () =>
              executeSqlText({ databaseId: 'db', name: 'current' }, sql, {
                isLocal: false,
              }),
            100_000,
          ),
        )
        expect(plan.batches.length).toBeGreaterThan(1)
        f.fail('after-commit')
        await expect(
          runSqlDelivery(f.directory, { ...f.options, mode: 'remote' }),
        ).rejects.toThrow('connection lost')
        f.fail('none')
        await runSqlDelivery(f.directory, { ...f.options, mode: 'remote' })
        expect(f.remote.query(query).all()).toEqual(expected)
        expect(f.events.filter(event => event === 'ingest')).toHaveLength(
          plan.batches.length,
        )
        await expect(
          runSqlDelivery(f.directory, {
            ...f.options,
            mode: 'local',
            onProgress: completed => {
              if (completed === 1) throw new Error('mirror interrupted')
            },
          }),
        ).rejects.toThrow('mirror interrupted')
        await runSqlDelivery(f.directory, { ...f.options, mode: 'local' })
        await runSqlDelivery(f.directory, { ...f.options, mode: 'local' })
        expect(local.query(query).all()).toEqual(expected)
        expect(f.events.filter(event => event === 'ingest')).toHaveLength(
          plan.batches.length,
        )
      } finally {
        baseline.close()
        local.close()
      }
    }))
}

test('interrupted remote delivery resumes after the committed batch, then replays exactly once locally', () =>
  fixture(async f => {
    await f.prepare()
    f.fail('after-commit')
    await expect(
      runSqlDelivery(f.directory, { ...f.options, mode: 'remote' }),
    ).rejects.toThrow('connection lost')
    expect(f.remote.query('SELECT n FROM counter').get()).toEqual({ n: 1 })
    f.fail('none')
    await runSqlDelivery(f.directory, { ...f.options, mode: 'remote' })
    expect(f.events.filter(e => e === 'ingest')).toHaveLength(3)
    expect(f.remote.query('SELECT n FROM counter').get()).toEqual({ n: 111 })
    await expect(
      runSqlDelivery(f.directory, {
        ...f.options,
        mode: 'local',
        onProgress: n => {
          if (n === 1) throw new Error('interrupted local replay')
        },
      }),
    ).rejects.toThrow('interrupted')
    expect(f.localValue()).toEqual({ n: 1 })
    // Simulate loss of the local acknowledgement after the transaction committed.
    const progress = JSON.parse(
      await readFile(join(f.directory, 'progress.json'), 'utf8'),
    )
    progress.local = {}
    await writeFile(join(f.directory, 'progress.json'), JSON.stringify(progress))
    const ingests = f.events.filter(e => e === 'ingest').length
    await runSqlDelivery(f.directory, { ...f.options, mode: 'local' })
    await runSqlDelivery(f.directory, { ...f.options, mode: 'local' })
    expect(f.localValue()).toEqual({ n: 111 })
    expect(f.events.filter(e => e === 'ingest')).toHaveLength(ingests)
  }))

test('an ambiguous remote outcome without a receipt cannot re-ingest or advance', () =>
  fixture(async f => {
    await f.prepare()
    f.fail('before-commit')
    await expect(
      runSqlDelivery(f.directory, { ...f.options, mode: 'remote' }),
    ).rejects.toThrow('connection lost')
    f.fail('none')
    await expect(
      runSqlDelivery(f.directory, { ...f.options, mode: 'remote' }),
    ).rejects.toThrow('uncertain remote outcome')
    expect(f.events.filter(e => e === 'ingest')).toHaveLength(1)
    expect(f.remote.query('SELECT n FROM counter').get()).toEqual({ n: 0 })
    await expect(
      runSqlDelivery(f.directory, { ...f.options, mode: 'local' }),
    ).rejects.toThrow('not confirmed')
  }))

test('sealed plans are reused without generation and reject tampering or target drift', () =>
  fixture(async f => {
    await f.prepare()
    await prepareSqlDelivery(f.directory, f.context, async () => {
      throw new Error('must not regenerate')
    })
    await expect(
      runSqlDelivery(f.directory, {
        ...f.options,
        mode: 'remote',
        targets: { DB_CURRENT: 'other-db' },
      }),
    ).rejects.toThrow('target changed')
    await writeFile(join(f.directory, '0.sql'), 'UPDATE counter SET n = 999;')
    await expect(
      runSqlDelivery(f.directory, { ...f.options, mode: 'remote' }),
    ).rejects.toThrow('has changed')
    expect(f.events).toHaveLength(0)
  }))

test('a changed mirror generation cannot be used for local recovery', () =>
  fixture(async f => {
    await f.prepare()
    await runSqlDelivery(f.directory, { ...f.options, mode: 'remote' })
    await writeFile(
      join(f.root, 'manifest.json'),
      JSON.stringify({
        target: 'preview',
        preparedAt: 'different',
        files: { DB_CURRENT: f.localPath },
      }),
    )
    await expect(
      runSqlDelivery(f.directory, { ...f.options, mode: 'local' }),
    ).rejects.toThrow('mirror generation has changed')
    expect(f.localValue()).toEqual({ n: 0 })
  }))

test('delivery locks reject competing writers and release after failure', () =>
  fixture(async f => {
    await expect(
      withDeliveryLock(f.directory, () =>
        withDeliveryLock(f.directory, async () => {}),
      ),
    ).rejects.toThrow()
    await withDeliveryLock(f.directory, async () => {})
  }))

test('an uploaded payload can be retried before ingest without recalculating SQL', () =>
  fixture(async f => {
    await f.prepare()
    f.fail('upload')
    await expect(
      runSqlDelivery(f.directory, { ...f.options, mode: 'remote' }),
    ).rejects.toThrow('upload rejected')
    expect(f.remote.query('SELECT n FROM counter').get()).toEqual({ n: 0 })
    f.fail('none')
    await runSqlDelivery(f.directory, { ...f.options, mode: 'remote' })
    expect(f.events.filter(e => e === 'ingest')).toHaveLength(3)
  }))

test('resumes a retained poll bookmark after a network interruption', () =>
  fixture(async f => {
    await f.prepare()
    f.fail('poll')
    await expect(
      runSqlDelivery(f.directory, { ...f.options, mode: 'remote' }),
    ).rejects.toThrow('poll connection lost')
    f.fail('none')
    await runSqlDelivery(f.directory, { ...f.options, mode: 'remote' })
    expect(f.events.filter(e => e === 'ingest')).toHaveLength(3)
    expect(f.remote.query('SELECT n FROM counter').get()).toEqual({ n: 111 })
  }))

test('a cleared import without a receipt is not accepted as success', () =>
  fixture(async f => {
    await f.prepare()
    f.fail('cleared')
    await expect(
      runSqlDelivery(f.directory, { ...f.options, mode: 'remote' }),
    ).rejects.toThrow('without the expected receipt')
    expect(f.events.filter(e => e === 'ingest')).toHaveLength(1)
    expect(f.remote.query('SELECT n FROM counter').get()).toEqual({ n: 0 })
  }))

test('a polling checkpoint without a bookmark recovers by exact ETag', () =>
  fixture(async f => {
    await f.prepare()
    f.fail('poll')
    await expect(
      runSqlDelivery(f.directory, { ...f.options, mode: 'remote' }),
    ).rejects.toThrow('poll connection lost')
    const path = join(f.directory, 'progress.json')
    const progress = JSON.parse(await readFile(path, 'utf8'))
    delete progress.remote[0].bookmark
    await writeFile(path, JSON.stringify(progress))
    f.fail('reattach')
    await runSqlDelivery(f.directory, { ...f.options, mode: 'remote' })
    expect(f.events.filter(event => event === 'ingest')).toHaveLength(3)
    expect(f.remote.query('SELECT n FROM counter').get()).toEqual({ n: 111 })
  }))

for (const failure of ['reattach', 'reset-reattach', 'cancelled-reattach'] as const)
  test(`a stale bookmark recovers by exact ETag without another upload or ingest: ${failure}`, () =>
    fixture(async f => {
      await f.prepare()
      f.fail(failure)
      await runSqlDelivery(f.directory, { ...f.options, mode: 'remote' })
      expect(f.remote.query('SELECT n FROM counter').get()).toEqual({ n: 111 })
      expect(f.events.filter(event => event === 'ingest')).toHaveLength(3)
      expect(f.events.filter(event => event === 'upload')).toHaveLength(3)
      await runSqlDelivery(f.directory, { ...f.options, mode: 'remote' })
      expect(f.events.filter(event => event === 'ingest')).toHaveLength(3)
    }))

test('repeated storage resets exhaust bounded lookups without repeating writes', () =>
  fixture(async f => {
    await f.prepare()
    f.fail('reset-always')
    await expect(
      runSqlDelivery(f.directory, { ...f.options, mode: 'remote' }),
    ).rejects.toThrow('exact-content recovery exhausted')
    expect(f.events.filter(event => event === 'init')).toHaveLength(4)
    expect(f.events.filter(event => event === 'ingest')).toHaveLength(1)
    expect(f.events.filter(event => event === 'upload')).toHaveLength(1)
    expect(f.remote.query('SELECT n FROM counter').get()).toEqual({ n: 0 })
  }))

test('bound rows retain their parameters and recover a lost commit acknowledgement', () =>
  fixture(async f => {
    await prepareSqlDelivery(f.directory, f.context, async append => {
      await append(
        { databaseId: 'db', bindingName: 'DB_CURRENT' },
        new TextEncoder().encode(
          JSON.stringify([
            { sql: 'UPDATE counter SET n = n + ?', params: [7] },
            { sql: 'UPDATE counter SET n = n * ?', params: [3] },
          ]),
        ),
        'bound',
      )
    })
    f.fail('after-commit')
    await expect(
      runSqlDelivery(f.directory, { ...f.options, mode: 'remote' }),
    ).rejects.toThrow('connection lost')
    f.fail('none')
    await runSqlDelivery(f.directory, { ...f.options, mode: 'remote' })
    await runSqlDelivery(f.directory, { ...f.options, mode: 'local' })
    expect(f.events.filter(e => e === 'bound')).toHaveLength(1)
    expect(f.localValue()).toEqual({ n: 21 })
  }))

test('a failing local transaction rolls back both data and receipt and can be retried', () =>
  fixture(async f => {
    await f.prepare()
    await runSqlDelivery(f.directory, { ...f.options, mode: 'remote' })
    const db = new Database(f.localPath)
    db.exec(
      "CREATE TRIGGER reject_write BEFORE UPDATE ON counter BEGIN SELECT RAISE(ABORT, 'injected local failure'); END;",
    )
    try {
      await expect(
        runSqlDelivery(f.directory, { ...f.options, mode: 'local' }),
      ).rejects.toThrow('injected local failure')
      expect(f.localValue()).toEqual({ n: 0 })
      db.exec('DROP TRIGGER reject_write;')
      await runSqlDelivery(f.directory, { ...f.options, mode: 'local' })
      expect(f.localValue()).toEqual({ n: 111 })
    } finally {
      db.close()
    }
  }))

test('a pending delivery blocks another release until both remote and local work finish', () =>
  fixture(async f => {
    await f.prepare()
    await runSqlDelivery(f.directory, { ...f.options, mode: 'remote' })
    await expect(
      assertSqlDeliveryPlanningAllowed(f.root, 'other-release'),
    ).rejects.toThrow('unfinished SQL delivery')
    expect(await completeSqlDeliveryRelease(f.root, 'release')).toBe(false)
    expect(await completeSqlDeliveryRelease(f.root, 'other-release')).toBe(false)
    await runSqlDelivery(f.directory, { ...f.options, mode: 'local' })
    expect(await completeSqlDeliveryRelease(f.root, 'release')).toBe(true)
    await assertSqlDeliveryPlanningAllowed(f.root, 'other-release')
  }))

test(
  'SIGKILL releases the delivery lock for a replacement process',
  () =>
    fixture(async f => {
      const child = Bun.spawn(
        [
          process.execPath,
          '-e',
          `
    import { withDeliveryLock } from ${JSON.stringify(join(import.meta.dir, 'sqlDeliveryFiles.ts'))};
    await withDeliveryLock(${JSON.stringify(f.directory)}, async () => {
      console.log('locked'); setInterval(() => {}, 1000); await new Promise(() => {});
    });
  `,
        ],
        { stdout: 'pipe', stderr: 'pipe' },
      )
      try {
        const reader = child.stdout.getReader()
        const first = await reader.read()
        expect(new TextDecoder().decode(first.value)).toContain('locked')
        reader.releaseLock()
        child.kill('SIGKILL')
        await child.exited
        await withDeliveryLock(f.directory, async () => {})
      } finally {
        child.kill()
        await child.exited
      }
    }),
  5000,
)
