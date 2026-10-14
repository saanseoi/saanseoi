import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import {
  assertSqlDeliveryPlanningAllowed,
  completeSqlDeliveryRelease,
  findPendingSqlDeliveryReleaseId,
  readPendingSqlDelivery,
  registerPendingSqlDelivery,
} from './sqlDeliveryPending.ts'
import {
  prepareSqlDelivery,
  sha256,
  withDeliveryLock,
  writeDeliveryFile,
} from './sqlDeliveryFiles.ts'
import { buildDeterministicReleaseId } from '@repo/core/db/metaRegistry'

test('relative plan registration retains one absolute path for recovery from another working directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pending-relative-'))
  try {
    const directory = join(root, 'plan')
    await withDeliveryLock(join(root, 'sql-delivery-lock'), async () => {
      await registerPendingSqlDelivery(root, 'release', directory)
      await registerPendingSqlDelivery(
        root,
        'release',
        relative(process.cwd(), directory),
      )
    })
    expect((await readPendingSqlDelivery(root))?.directories).toEqual([directory])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('malformed pending markers cannot be mistaken for an unowned cache', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pending-invalid-'))
  try {
    for (const marker of [
      null,
      {},
      { resourceReleaseId: '', directories: ['plan'] },
      { resourceReleaseId: 'release', directories: [] },
      { resourceReleaseId: 'release', directories: [null] },
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
        resourceReleaseId: 'release',
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
      expect((await readPendingSqlDelivery(root))?.resourceReleaseId).toBe('release')
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
        resourceReleaseId: 'release',
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

test('recognises a retained plan whose exact deterministic release id has no release-code input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pending-release-id-'))
  try {
    const directory = join(root, 'plan')
    const releaseCode = 'dr-hk-hkgov-pland-division-pu-2016'
    const resourceReleaseId = buildDeterministicReleaseId(releaseCode)
    await prepareSqlDelivery(
      directory,
      {
        environment: 'local',
        resourceReleaseId,
        phase: 'planning-division-data',
        inputs: { preparedSha256: 'fixture' },
        cacheDir: root,
        cachePreparedAt: 'fixed',
      },
      async () => {},
    )
    await registerPendingSqlDelivery(root, resourceReleaseId, directory)

    expect(await findPendingSqlDeliveryReleaseId(root, releaseCode)).toBe(
      resourceReleaseId,
    )
    expect(
      await findPendingSqlDeliveryReleaseId(root, 'dr-hk-hkgov-pland-division-pu-2021'),
    ).toBeUndefined()
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
        resourceReleaseId: 'other',
        phase: 'empty',
        inputs: {},
        cacheDir: root,
        cachePreparedAt: 'fixed',
      },
      async () => {},
    )
    await writeFile(
      join(root, 'pending-sql-delivery.json'),
      JSON.stringify({ resourceReleaseId: 'release', directories: [directory] }),
    )
    await expect(completeSqlDeliveryRelease(root, 'release')).rejects.toThrow(
      'does not belong',
    )
    expect((await readPendingSqlDelivery(root))?.resourceReleaseId).toBe('release')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('missing, corrupt or incomplete payloads never establish acknowledged membership', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pending-membership-'))
  try {
    const directory = join(root, 'plan')
    const sql = Buffer.from('SELECT 1;')
    const membership = '{"ids":["accepted"]}'
    const plan = await prepareSqlDelivery(
      directory,
      {
        environment: 'production',
        resourceReleaseId: 'release',
        phase: 'data',
        inputs: {},
        cacheDir: root,
        cachePreparedAt: 'fixed',
      },
      async append => {
        await append({ databaseId: 'database', bindingName: 'CURRENT' }, sql)
        await writeFile(join(directory, 'membership.json'), membership)
        return {
          acknowledgedMirrorFiles: [
            {
              file: 'membership.json',
              mirrorFile: 'mirror.json',
              sha256: sha256(membership),
            },
          ],
        }
      },
    )
    await registerPendingSqlDelivery(root, 'release', directory)
    const progress = { version: 1, planId: plan.id, local: {}, remote: {} } as {
      version: number
      planId: string
      local: Record<string, { completedAt: string; durationMs: number }>
      remote: Record<string, { status: string; uploadMs: number; executionMs: number }>
    }
    expect(await completeSqlDeliveryRelease(root, 'release')).toBe(false)
    progress.local['0'] = { completedAt: 'now', durationMs: 0 }
    await writeDeliveryFile(directory, 'progress.json', JSON.stringify(progress))
    expect(await completeSqlDeliveryRelease(root, 'release')).toBe(false)
    progress.remote['0'] = { status: 'complete', uploadMs: 0, executionMs: 0 }
    await writeDeliveryFile(directory, 'progress.json', JSON.stringify(progress))
    for (const corrupt of [false, true]) {
      if (corrupt) await writeFile(join(directory, '0.sql'), 'corrupt')
      else await rm(join(directory, '0.sql'))
      await expect(completeSqlDeliveryRelease(root, 'release')).rejects.toThrow()
      await expect(readFile(join(root, 'mirror.json'))).rejects.toThrow('ENOENT')
      expect((await readPendingSqlDelivery(root))?.resourceReleaseId).toBe('release')
    }
    await writeFile(join(directory, '0.sql'), sql)
    expect(await completeSqlDeliveryRelease(root, 'release')).toBe(true)
    expect(await readFile(join(root, 'mirror.json'), 'utf8')).toBe(membership)
    expect(await readPendingSqlDelivery(root)).toBeNull()
    expect(await completeSqlDeliveryRelease(root, 'release')).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('partial mirror promotion retains ownership and retry completes exact membership', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pending-mirror-retry-'))
  try {
    await writeFile(join(root, 'first.json'), 'old')
    await mkdir(join(root, 'second.json'))
    const directory = join(root, 'plan')
    await prepareSqlDelivery(
      directory,
      {
        environment: 'local',
        resourceReleaseId: 'release',
        phase: 'empty',
        inputs: {},
        cacheDir: root,
        cachePreparedAt: 'fixed',
      },
      async () => {
        await writeFile(join(directory, 'membership.json'), 'accepted')
        return {
          acknowledgedMirrorFiles: ['first.json', 'second.json'].map(mirrorFile => ({
            file: 'membership.json',
            mirrorFile,
            sha256: sha256('accepted'),
          })),
        }
      },
    )
    await registerPendingSqlDelivery(root, 'release', directory)
    await expect(completeSqlDeliveryRelease(root, 'release')).rejects.toThrow()
    expect((await readPendingSqlDelivery(root))?.resourceReleaseId).toBe('release')
    await expect(
      assertSqlDeliveryPlanningAllowed(root, 'next-release'),
    ).rejects.toThrow('unfinished')
    await rm(join(root, 'second.json'), { recursive: true })
    expect(await completeSqlDeliveryRelease(root, 'release')).toBe(true)
    expect(await readFile(join(root, 'first.json'), 'utf8')).toBe('accepted')
    expect(await readFile(join(root, 'second.json'), 'utf8')).toBe('accepted')
    expect(await readPendingSqlDelivery(root)).toBeNull()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
