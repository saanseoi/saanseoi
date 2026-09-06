import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { prepareSqlDelivery, runSqlDelivery } from './sqlDelivery.ts'
import { withDeliveryLock } from './sqlDeliveryFiles.ts'
import { prepareReleaseSqlDelivery } from './releaseSqlDelivery.ts'
import type { LocalAddressDbContext } from '../dbCache/localDbCacheTypes.ts'
import {
  assertSqlDeliveryPlanningAllowed,
  completeSqlDeliveryRelease,
} from './sqlDeliveryPending.ts'
import type { D1ImportFetch } from '@repo/core/d1ImportApi'

async function fixture(
  work: (f: Awaited<ReturnType<typeof createFixture>>) => Promise<void>,
) {
  const f = await createFixture()
  try {
    await work(f)
  } finally {
    f.remote.close()
    await rm(f.root, { recursive: true, force: true })
  }
}

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
    import { runSqlDeliveryCommand } from ${JSON.stringify(join(import.meta.dir, '../commands/sqlDelivery.ts'))};
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

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'sql-delivery-test-'))
  const directory = join(root, 'delivery')
  const localPath = join(root, 'current.sqlite')
  const local = new Database(localPath)
  const remote = new Database(':memory:')
  for (const db of [local, remote])
    db.exec('CREATE TABLE counter (n INTEGER); INSERT INTO counter VALUES (0);')
  local.close()
  await writeFile(
    join(root, 'manifest.json'),
    JSON.stringify({
      target: 'preview',
      preparedAt: 'generation-1',
      files: { DB_CURRENT: localPath },
    }),
  )
  const context = {
    releaseId: 'release',
    environment: 'preview' as const,
    phase: 'data',
    inputs: { snapshotId: 'snapshot' },
    cacheDir: root,
    cachePreparedAt: 'generation-1',
  }
  const uploads = new Map<string, string>()
  const events: string[] = []
  let failure:
    | 'none'
    | 'after-commit'
    | 'before-commit'
    | 'upload'
    | 'poll'
    | 'cleared' = 'none'
  let pendingSql = ''
  let activeEtag = ''
  const fetch: D1ImportFetch = async (input, init) => {
    if (init?.method === 'PUT') {
      if (failure === 'upload') throw new Error('fixture upload rejected')
      const sql = new TextDecoder().decode(init.body as ArrayBuffer)
      uploads.set(activeEtag, sql)
      events.push('upload')
      return new Response(null, {
        headers: { ETag: createHash('md5').update(sql).digest('hex') },
      })
    }
    const body = JSON.parse(init?.body as string)
    if (String(input).endsWith('/query')) {
      if (body.batch) {
        events.push('bound')
        remote.transaction(() => {
          for (const statement of body.batch)
            remote.query(statement.sql).run(...statement.params)
        })()
        if (failure === 'after-commit') throw new Error('connection lost after commit')
        return Response.json({
          success: true,
          result: body.batch.map(() => ({ success: true, results: [] })),
        })
      }
      return Response.json({
        success: true,
        result: [{ success: true, results: remote.query(body.sql).all() }],
      })
    }
    events.push(body.action)
    if (body.action === 'init') {
      activeEtag = body.etag
      return Response.json({
        success: true,
        result: { filename: body.etag, upload_url: 'https://upload.example/sql' },
      })
    }
    if (body.action === 'ingest') {
      if (failure === 'before-commit')
        throw new Error('connection lost before a known outcome')
      if (failure === 'poll' || failure === 'cleared') {
        pendingSql = uploads.get(body.etag) ?? ''
        return Response.json({
          success: true,
          result: { success: false, at_bookmark: 'bookmark-1' },
        })
      }
      remote.transaction(() => remote.exec(uploads.get(body.etag) ?? ''))()
      if (failure === 'after-commit') throw new Error('connection lost after commit')
      return Response.json({
        success: true,
        result: { success: true, status: 'complete' },
      })
    }
    if (body.action === 'poll') {
      if (failure === 'poll') throw new Error('poll connection lost')
      if (failure === 'cleared')
        return Response.json({
          success: true,
          result: { success: false, error: 'Not currently importing anything.' },
        })
      expect(body.current_bookmark).toBe('bookmark-1')
      remote.transaction(() => remote.exec(pendingSql))()
      return Response.json({
        success: true,
        result: { success: true, status: 'complete' },
      })
    }
    throw new Error(`Unexpected action ${body.action}`)
  }
  const options = {
    accountId: 'account',
    apiToken: 'token',
    fetch,
    pollIntervalMs: 0,
    targets: { DB_CURRENT: 'db' },
  }
  return {
    root,
    directory,
    context,
    localPath,
    remote,
    events,
    options,
    fail(value: typeof failure) {
      failure = value
    },
    async prepare() {
      return prepareSqlDelivery(directory, context, async append => {
        for (const n of [1, 10, 100])
          await append(
            { bindingName: 'DB_CURRENT', databaseId: 'db' },
            new TextEncoder().encode(`UPDATE counter SET n = n + ${n};`),
          )
      })
    },
    localValue() {
      const db = new Database(localPath)
      try {
        return db.query('SELECT n FROM counter').get()
      } finally {
        db.close()
      }
    },
  }
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
