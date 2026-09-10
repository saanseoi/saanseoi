import { Database } from 'bun:sqlite'
import { expect } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { prepareSqlDelivery } from './sqlDelivery.ts'
import type { D1ImportFetch } from '@repo/core/d1ImportApi'

export async function fixture(
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
    | 'reattach'
    | 'reset-reattach'
    | 'reset-always'
    | 'cancelled-reattach'
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
      if (pendingSql && ['reset-reattach', 'reset-always'].includes(failure)) {
        if (failure === 'reset-reattach') failure = 'reattach'
        return Response.json({
          success: true,
          result: { success: false, error: '{"D1_RESET_DO":true}' },
        })
      }
      if (pendingSql && ['reattach', 'cancelled-reattach'].includes(failure)) {
        failure = 'none'
        return Response.json({
          success: true,
          result: { success: true, status: 'active', at_bookmark: 'bookmark-2' },
        })
      }
      return Response.json({
        success: true,
        result: { filename: body.etag, upload_url: 'https://upload.example/sql' },
      })
    }
    if (body.action === 'ingest') {
      if (failure === 'before-commit')
        throw new Error('connection lost before a known outcome')
      if (
        [
          'poll',
          'cleared',
          'reattach',
          'reset-reattach',
          'reset-always',
          'cancelled-reattach',
        ].includes(failure)
      ) {
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
      if (failure === 'cancelled-reattach')
        return Response.json({
          success: true,
          result: {
            success: false,
            error: 'Cancelled due to no poll() received in 15000ms.',
          },
        })
      if (['cleared', 'reattach', 'reset-reattach', 'reset-always'].includes(failure))
        return Response.json({
          success: true,
          result: { success: false, error: 'Not currently importing anything.' },
        })
      expect(['bookmark-1', 'bookmark-2']).toContain(body.current_bookmark)
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
