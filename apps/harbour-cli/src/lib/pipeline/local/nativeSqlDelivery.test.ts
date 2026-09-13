import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm, stat, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareNativeSqlDelivery, runNativeSqlDelivery } from './nativeSqlDelivery.ts'
import {
  completeSqlDeliveryRelease,
  readPendingSqlDelivery,
} from './sqlDeliveryPending.ts'
import { runSqlDelivery } from './sqlDelivery.ts'

test('native preparation excludes concurrent producers and reserves sealed plans before replay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-producers-'))
  const path = join(root, 'current.sqlite')
  const db = new Database(path)
  let unblock!: () => void
  const blocked = new Promise<void>(resolve => {
    unblock = resolve
  })
  let entered!: () => void
  const generating = new Promise<void>(resolve => {
    entered = resolve
  })
  let first: ReturnType<typeof prepareNativeSqlDelivery> | undefined
  try {
    db.exec('CREATE TABLE counter(n); INSERT INTO counter VALUES(0)')
    const input = {
      directory: join(root, 'first'),
      ownershipDirectory: root,
      files: { DB_CURRENT: path },
      releaseId: 'first',
      phase: 'data',
      inputs: {},
      generate: async (
        append: Parameters<
          Parameters<typeof prepareNativeSqlDelivery>[0]['generate']
        >[0],
      ) => {
        entered()
        await blocked
        await append(
          { bindingName: 'DB_CURRENT', databaseId: 'DB_CURRENT' },
          new TextEncoder().encode('UPDATE counter SET n=n+1;'),
        )
      },
    }
    first = prepareNativeSqlDelivery(input)
    await generating
    let secondGenerated = false
    const second = {
      ...input,
      directory: join(root, 'second'),
      releaseId: 'second',
      generate: async () => {
        secondGenerated = true
      },
    }
    await expect(prepareNativeSqlDelivery(second)).rejects.toThrow('locked')
    expect(secondGenerated).toBe(false)
    unblock()
    await first
    expect(await readPendingSqlDelivery(root)).toEqual({
      releaseId: 'first',
      directories: [input.directory],
    })
    await expect(prepareNativeSqlDelivery(second)).rejects.toThrow(
      'unfinished SQL delivery',
    )
    expect(await completeSqlDeliveryRelease(root, 'first')).toBe(false)
    expect(db.query('SELECT n FROM counter').get()).toEqual({ n: 0 })
    await runNativeSqlDelivery(input.directory, { files: input.files })
    expect(await completeSqlDeliveryRelease(root, 'first')).toBe(true)
    await prepareNativeSqlDelivery(second)
    expect(secondGenerated).toBe(true)
  } finally {
    unblock()
    await first?.catch(() => {})
    db.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('failed native generation releases the cache lock without reserving an unsealed plan', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-prepare-failure-'))
  const path = join(root, 'current.sqlite')
  const db = new Database(path)
  try {
    db.exec('CREATE TABLE counter(n); INSERT INTO counter VALUES(0)')
    const input = {
      directory: join(root, 'plan'),
      ownershipDirectory: root,
      files: { DB_CURRENT: path },
      releaseId: 'failed',
      phase: 'data',
      inputs: {},
      generate: async () => {
        throw new Error('generation failed')
      },
    }
    await expect(prepareNativeSqlDelivery(input)).rejects.toThrow('generation failed')
    expect(await readPendingSqlDelivery(root)).toBeNull()
    await prepareNativeSqlDelivery({
      ...input,
      releaseId: 'replacement',
      generate: async append => {
        await append(
          { bindingName: 'DB_CURRENT', databaseId: 'DB_CURRENT' },
          new TextEncoder().encode('UPDATE counter SET n=n+1;'),
        )
      },
    })
    await runNativeSqlDelivery(input.directory, { files: input.files })
    expect(db.query('SELECT n FROM counter').get()).toEqual({ n: 1 })
    expect(await completeSqlDeliveryRelease(root, 'replacement')).toBe(true)
  } finally {
    db.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('native SQL receipts resume committed payloads without network credentials or regeneration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-delivery-'))
  const path = join(root, 'current.sqlite')
  const db = new Database(path)
  try {
    db.exec('CREATE TABLE counter(n); INSERT INTO counter VALUES(0)')
    const directory = join(root, 'plan')
    const files = { DB_CURRENT: path }
    let generated = 0
    const prepare = () =>
      prepareNativeSqlDelivery({
        directory,
        ownershipDirectory: root,
        files,
        releaseId: 'release',
        phase: 'data',
        inputs: { source: 'frozen' },
        generate: async append => {
          generated++
          for (const n of [1, 10, 100])
            await append(
              { bindingName: 'DB_CURRENT', databaseId: 'DB_CURRENT' },
              new TextEncoder().encode(`UPDATE counter SET n=n+${n};`),
            )
        },
      })
    await prepare()
    await expect(
      runSqlDelivery(directory, {
        accountId: '',
        apiToken: '',
        mode: 'remote',
        targets: { DB_CURRENT: 'DB_CURRENT' },
      }),
    ).rejects.toThrow('local SQL delivery executor')
    const child = Bun.spawn(
      [
        process.execPath,
        '-e',
        `
      import { runSqlDeliveryCommand } from ${JSON.stringify(join(import.meta.dir, '../../commands/sqlDelivery.ts'))};
      globalThis.fetch = () => { throw new Error('Unexpected network'); };
      await runSqlDeliveryCommand({ command: 'sql:status', positionals: [], options: { plan: ${JSON.stringify(directory)} } }, { remote: false, environment: 'preview' }, ${JSON.stringify(root)});
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
    expect(code).toBe(0)
    expect(stderr).toBe('')
    expect(JSON.parse(stdout).plan.context.environment).toBe('local')
    await expect(
      runNativeSqlDelivery(directory, {
        files,
        onProgress: n => {
          if (n === 1) throw new Error('interrupted')
        },
      }),
    ).rejects.toThrow('interrupted')
    expect(db.query('SELECT n FROM counter').get()).toEqual({ n: 1 })
    await prepare()
    expect(generated).toBe(1)
    await runNativeSqlDelivery(directory, { files })
    const progressPath = join(directory, 'progress.json')
    await utimes(progressPath, 1, 1)
    await runNativeSqlDelivery(directory, { files })
    expect((await stat(progressPath)).mtimeMs).toBe(1000)
    expect(db.query('SELECT n FROM counter').get()).toEqual({ n: 111 })
    expect(await completeSqlDeliveryRelease(root, 'release')).toBe(true)
    db.exec('DELETE FROM harbourSqlDeliveryReceipts WHERE batchIndex=0')
    await expect(runNativeSqlDelivery(directory, { files })).rejects.toThrow(
      'receipt disappeared',
    )
    expect(db.query('SELECT n FROM counter').get()).toEqual({ n: 111 })
  } finally {
    db.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('native replay rejects reset identities and changed configured paths before writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-reset-'))
  const path = join(root, 'current.sqlite')
  const db = new Database(path)
  try {
    db.exec('CREATE TABLE counter(n); INSERT INTO counter VALUES(0)')
    const directory = join(root, 'plan')
    const files = { DB_CURRENT: path }
    await prepareNativeSqlDelivery({
      directory,
      ownershipDirectory: root,
      files,
      releaseId: 'release',
      phase: 'data',
      inputs: {},
      generate: async append => {
        await append(
          { bindingName: 'DB_CURRENT', databaseId: 'DB_CURRENT' },
          new TextEncoder().encode('UPDATE counter SET n=1;'),
        )
      },
    })
    await expect(
      runNativeSqlDelivery(directory, {
        files: { DB_CURRENT: join(root, 'other.sqlite') },
      }),
    ).rejects.toThrow('configuration changed')
    db.exec("UPDATE harbourSqlDeliveryReceipts SET sha256='reset' WHERE batchIndex=-1")
    await expect(runNativeSqlDelivery(directory, { files })).rejects.toThrow(
      'identity changed',
    )
    expect(db.query('SELECT n FROM counter').get()).toEqual({ n: 0 })
  } finally {
    db.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('preparation reads an existing database identity while an unrelated writer holds a reserved lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-identity-read-'))
  const path = join(root, 'meta.sqlite')
  const writer = new Database(path)
  try {
    writer.exec(
      "CREATE TABLE progress(n); INSERT INTO progress VALUES(0); CREATE TABLE harbourSqlDeliveryReceipts(planId TEXT,batchIndex INTEGER,sha256 TEXT,PRIMARY KEY(planId,batchIndex)); INSERT INTO harbourSqlDeliveryReceipts VALUES('native-database-identity',-1,'identity'); BEGIN IMMEDIATE; UPDATE progress SET n=1",
    )
    const plan = await prepareNativeSqlDelivery({
      directory: join(root, 'plan'),
      ownershipDirectory: root,
      releaseId: 'release',
      phase: 'data',
      inputs: {},
      files: { DB_META: path },
      generate: async () => {},
    })
    expect(plan.context.inputs.nativeTargets).toEqual({
      DB_META: { path, identity: 'identity' },
    })
    expect(writer.query('SELECT n FROM progress').get()).toEqual({ n: 1 })
  } finally {
    if (writer.inTransaction) writer.exec('ROLLBACK')
    writer.close()
    await rm(root, { recursive: true, force: true })
  }
})
