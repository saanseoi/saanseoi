import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalExecBinding } from '../dbCache/localDbCache.ts'
import type { LocalAddressDbContext } from '../dbCache/localDbCacheTypes.ts'
import { withDeliveryLock } from '../localPipeline/sqlDeliveryFiles.ts'
import { executeResetSqlArtefacts } from './resetLifecycle.ts'

test('scoped reset SQL rechecks pending ownership and excludes active delivery writers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reset-delivery-guard-'))
  const db = new Database(':memory:')
  const actions: string[] = []
  const input = {
    artefacts: [
      {
        target: {
          name: 'current' as const,
          databaseId: null,
          binding: createLocalExecBinding(db, 'DB_CURRENT'),
        },
        sql: 'DELETE FROM protectedRows;',
      },
    ],
    cacheReleaseCodes: [],
    cacheReleaseIds: [],
    cacheRoot: root,
    context: { state: { dbCacheDir: root } } as unknown as LocalAddressDbContext,
    keepCache: true,
    target: { remote: false, environment: 'preview' as const },
    remoteCacheErrorMessage: 'reset failed',
    validateUnderLock: async () => {
      actions.push('validate')
      await expect(
        withDeliveryLock(join(root, 'sql-delivery-lock'), async () => {}),
      ).rejects.toThrow('locked')
    },
    beforeSql: async () => {
      actions.push('assets')
      expect(db.query('SELECT count(*) AS n FROM protectedRows').get()).toEqual({
        n: 1,
      })
      await expect(
        withDeliveryLock(join(root, 'sql-delivery-lock'), async () => {}),
      ).rejects.toThrow('locked')
    },
    afterSql: async () => {
      actions.push('review files')
      expect(db.query('SELECT count(*) AS n FROM protectedRows').get()).toEqual({
        n: 0,
      })
      await expect(
        withDeliveryLock(join(root, 'sql-delivery-lock'), async () => {}),
      ).rejects.toThrow('locked')
    },
  }
  try {
    db.exec('CREATE TABLE protectedRows(id); INSERT INTO protectedRows VALUES(1)')
    await withDeliveryLock(join(root, 'sql-delivery-lock'), async () => {
      await expect(executeResetSqlArtefacts(input)).rejects.toThrow('locked')
    })
    expect(db.query('SELECT count(*) AS n FROM protectedRows').get()).toEqual({ n: 1 })
    const marker = join(root, 'pending-sql-delivery.json')
    await writeFile(
      marker,
      JSON.stringify({ releaseId: 'active', directories: [join(root, 'plan')] }),
    )
    await expect(executeResetSqlArtefacts(input)).rejects.toThrow(
      'unfinished SQL delivery',
    )
    // Remote mode must also refuse before attempting any remote request.
    await expect(
      executeResetSqlArtefacts({
        ...input,
        target: { remote: true, environment: 'preview' },
      }),
    ).rejects.toThrow('unfinished SQL delivery')
    expect(db.query('SELECT count(*) AS n FROM protectedRows').get()).toEqual({ n: 1 })
    await rm(marker)
    expect(actions).toEqual([])
    await expect(
      executeResetSqlArtefacts({
        ...input,
        validateUnderLock: async () => {
          throw new Error('ownership changed')
        },
      }),
    ).rejects.toThrow('ownership changed')
    expect(actions).toEqual([])
    await executeResetSqlArtefacts(input)
    expect(actions).toEqual(['validate', 'assets', 'review files'])
    expect(db.query('SELECT count(*) AS n FROM protectedRows').get()).toEqual({ n: 0 })
  } finally {
    db.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('scoped local reset can discard an orphaned SQL ownership marker', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reset-orphaned-delivery-'))
  const db = new Database(':memory:')
  const marker = join(root, 'pending-sql-delivery.json')
  try {
    db.exec('CREATE TABLE protectedRows(id); INSERT INTO protectedRows VALUES(1)')
    await writeFile(
      marker,
      JSON.stringify({
        releaseId: 'orphaned-release',
        directories: [join(root, 'missing-plan')],
      }),
    )
    await executeResetSqlArtefacts({
      artefacts: [
        {
          target: {
            name: 'current' as const,
            databaseId: null,
            binding: createLocalExecBinding(db, 'DB_CURRENT'),
          },
          sql: 'DELETE FROM protectedRows;',
        },
      ],
      cacheReleaseCodes: [],
      cacheReleaseIds: [],
      cacheRoot: root,
      context: { state: { dbCacheDir: root } } as unknown as LocalAddressDbContext,
      keepCache: true,
      discardAbandonedSqlDelivery: true,
      target: { remote: false, environment: 'preview' },
      remoteCacheErrorMessage: 'reset failed',
    })
    expect(await Bun.file(marker).exists()).toBe(false)
    expect(db.query('SELECT count(*) AS n FROM protectedRows').get()).toEqual({ n: 0 })
  } finally {
    db.close()
    await rm(root, { recursive: true, force: true })
  }
})
