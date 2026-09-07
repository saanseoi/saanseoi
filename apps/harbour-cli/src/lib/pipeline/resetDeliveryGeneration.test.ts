import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalExecBinding } from '../dbCache/localDbCache.ts'
import type { LocalAddressDbContext } from '../dbCache/localDbCacheTypes.ts'
import {
  prepareNativeSqlDelivery,
  runNativeSqlDelivery,
} from '../localPipeline/nativeSqlDelivery.ts'
import { completeSqlDeliveryRelease } from '../localPipeline/sqlDeliveryPending.ts'
import { prepareReleaseSqlDelivery } from '../localPipeline/releaseSqlDelivery.ts'
import { runSqlDelivery } from '../localPipeline/sqlDelivery.ts'
import { withDeliveryLock } from '../localPipeline/sqlDeliveryFiles.ts'
import { invalidateSqlDeliveryReleases } from '../localPipeline/sqlDeliveryGeneration.ts'
import { executeResetSqlArtefacts } from './resetLifecycle.ts'

test('scoped reset invalidates only owned release plans and fresh plans cannot reuse old receipts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reset-generations-'))
  const path = join(root, 'current.sqlite')
  const db = new Database(path)
  const files = { DB_CURRENT: path }
  const context = {
    state: { target: 'local', dbCacheDir: root, files },
  } as unknown as LocalAddressDbContext
  const prepare = (directory: string, releaseId: string, increment: number) =>
    prepareNativeSqlDelivery({
      directory,
      ownershipDirectory: root,
      files,
      releaseId,
      phase: 'data',
      inputs: {},
      generate: async append => {
        await append(
          { bindingName: 'DB_CURRENT', databaseId: 'DB_CURRENT' },
          Buffer.from(`UPDATE counter SET n=n+${increment};`),
        )
      },
    })
  try {
    db.exec('CREATE TABLE counter(n); INSERT INTO counter VALUES(0)')
    const original = await prepare(join(root, 'a'), 'release-a', 1)
    await runNativeSqlDelivery(join(root, 'a'), { files })
    await completeSqlDeliveryRelease(root, 'release-a')
    await prepare(join(root, 'b'), 'release-b', 10)
    await runNativeSqlDelivery(join(root, 'b'), { files })
    await completeSqlDeliveryRelease(root, 'release-b')
    await executeResetSqlArtefacts({
      artefacts: [
        {
          sql: 'UPDATE counter SET n=10;',
          target: {
            name: 'current',
            databaseId: null,
            binding: createLocalExecBinding(db, 'DB_CURRENT'),
          },
        },
      ],
      cacheReleaseIds: ['release-a'],
      cacheReleaseCodes: [],
      cacheRoot: root,
      context,
      keepCache: true,
      target: { remote: false, environment: 'preview' },
      remoteCacheErrorMessage: 'reset failed',
    })
    await expect(runNativeSqlDelivery(join(root, 'a'), { files })).rejects.toThrow(
      'invalidated by a scoped reset',
    )
    await runNativeSqlDelivery(join(root, 'b'), { files })
    await completeSqlDeliveryRelease(root, 'release-b')
    expect(db.query('SELECT n FROM counter').get()).toEqual({ n: 10 })
    expect(
      db
        .query('SELECT count(*) AS n FROM harbourSqlDeliveryReceipts WHERE planId=?')
        .get(original.id),
    ).toEqual({ n: 1 })
    const fresh = await prepare(join(root, 'fresh-a'), 'release-a', 1)
    expect(fresh.id).not.toBe(original.id)
    await runNativeSqlDelivery(join(root, 'fresh-a'), { files })
    expect(db.query('SELECT n FROM counter').get()).toEqual({ n: 11 })
  } finally {
    db.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('a reset invalidates remote SQL before receipt lookup or network access', async () => {
  const root = await mkdtemp(join(tmpdir(), 'remote-reset-generation-'))
  try {
    await writeFile(
      join(root, 'manifest.json'),
      JSON.stringify({ preparedAt: 'fixed' }),
    )
    const context = {
      state: {
        target: 'preview',
        dbCacheDir: root,
        bindings: { DB_CURRENT: { databaseId: 'remote-db' } },
      },
    } as unknown as LocalAddressDbContext
    const input = {
      directory: join(root, 'plan'),
      context,
      releaseId: 'release',
      phase: 'data',
      inputs: {},
      generate: async (
        capture: (target: { databaseId: string }, bytes: Uint8Array) => Promise<void>,
      ) => {
        await capture({ databaseId: 'remote-db' }, Buffer.from('SELECT 1;'))
      },
    }
    const old = await prepareReleaseSqlDelivery(input)
    await withDeliveryLock(join(root, 'sql-delivery-lock'), () =>
      invalidateSqlDeliveryReleases(root, ['release']),
    )
    await expect(
      runSqlDelivery(input.directory, {
        accountId: '',
        apiToken: '',
        mode: 'remote',
        targets: { DB_CURRENT: 'remote-db' },
      }),
    ).rejects.toThrow('invalidated by a scoped reset')
    const fresh = await prepareReleaseSqlDelivery({
      ...input,
      directory: join(root, 'fresh'),
    })
    expect(fresh.id).not.toBe(old.id)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
