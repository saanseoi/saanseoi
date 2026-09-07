import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertSqlDeliveryPlanningAllowed,
  completeSqlDeliveryRelease,
  findPendingSqlDeliveryReleaseId,
  readPendingSqlDelivery,
  registerPendingSqlDelivery,
} from './sqlDeliveryPending.ts'
import { prepareSqlDelivery, withDeliveryLock } from './sqlDeliveryFiles.ts'

test('malformed pending markers cannot be mistaken for an unowned cache', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pending-invalid-'))
  try {
    for (const marker of [
      null,
      {},
      { releaseId: '', directories: ['plan'] },
      { releaseId: 'release', directories: [] },
      { releaseId: 'release', directories: [null] },
    ]) {
      await writeFile(join(root, 'pending-sql-delivery.json'), JSON.stringify(marker))
      await expect(assertSqlDeliveryPlanningAllowed(root, 'release')).rejects.toThrow(
        'Invalid SQL delivery ownership marker',
      )
      await expect(completeSqlDeliveryRelease(root, 'release')).rejects.toThrow(
        'Invalid SQL delivery ownership marker',
      )
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('completion cannot clear ownership while another phase holds the cache lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pending-concurrent-'))
  try {
    const directory = join(root, 'plan')
    await prepareSqlDelivery(
      directory,
      {
        environment: 'local',
        releaseId: 'release',
        phase: 'empty',
        inputs: {},
        cacheDir: root,
        cachePreparedAt: 'fixed',
      },
      async () => {},
    )
    await withDeliveryLock(join(root, 'sql-delivery-lock'), async () => {
      await registerPendingSqlDelivery(root, 'release', directory)
      await expect(completeSqlDeliveryRelease(root, 'release')).rejects.toThrow(
        'locked',
      )
      expect((await readPendingSqlDelivery(root))?.releaseId).toBe('release')
    })
    expect(await completeSqlDeliveryRelease(root, 'release')).toBe(true)
    expect(await readPendingSqlDelivery(root)).toBeNull()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('recognises only a retained plan for the exact source release', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pending-release-code-'))
  try {
    const directory = join(root, 'plan')
    await prepareSqlDelivery(
      directory,
      {
        environment: 'local',
        releaseId: 'release',
        phase: 'source',
        inputs: { version: { releaseCode: 'release-code' } },
        cacheDir: root,
        cachePreparedAt: 'fixed',
      },
      async () => {},
    )
    await registerPendingSqlDelivery(root, 'release', directory)

    expect(await findPendingSqlDeliveryReleaseId(root, 'release-code')).toBe('release')
    expect(await findPendingSqlDeliveryReleaseId(root, 'other-code')).toBeUndefined()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('completion rejects a marker pointing to another release plan', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pending-wrong-plan-'))
  try {
    const directory = join(root, 'plan')
    await prepareSqlDelivery(
      directory,
      {
        environment: 'local',
        releaseId: 'other',
        phase: 'empty',
        inputs: {},
        cacheDir: root,
        cachePreparedAt: 'fixed',
      },
      async () => {},
    )
    await writeFile(
      join(root, 'pending-sql-delivery.json'),
      JSON.stringify({ releaseId: 'release', directories: [directory] }),
    )
    await expect(completeSqlDeliveryRelease(root, 'release')).rejects.toThrow(
      'does not belong',
    )
    expect((await readPendingSqlDelivery(root))?.releaseId).toBe('release')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
