import { expect, test } from 'bun:test'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { withDeliveryLock } from '../../../apps/harbour-cli/src/lib/pipeline/local/sqlDeliveryFiles.ts'
import {
  assertSqlDeliveryGeneration,
  readSqlDeliveryGeneration,
} from '../../../apps/harbour-cli/src/lib/pipeline/local/sqlDeliveryGeneration.ts'
import { assertSqlDeliveryPlanningAllowed } from '../../../apps/harbour-cli/src/lib/pipeline/local/sqlDeliveryPending.ts'
import { resetLocalDb } from './reset-local-db.ts'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'reset-local-db-'))
  const cacheDir = join(root, '.local/d1/dev/v3/d1/miniflare-D1DatabaseObject')
  const lock = join(cacheDir, 'sql-delivery-lock')
  const marker = join(cacheDir, 'pending-sql-delivery.json')
  const deliveries = join(root, '.local/harbour-sql/deliveries/local')
  const files = [
    join(deliveries, 'release-test/phase/plan.json'),
    join(root, '.local/harbour-sql/releases/local/release-test/source.json'),
    join(root, '.local/d1/dev/v3/r2/retained-object'),
  ] as const
  const remote = join(root, '.local/harbour-sql/deliveries/preview/plan.json')
  for (const path of [...files, remote, marker]) {
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, '{}')
  }
  await writeFile(
    marker,
    JSON.stringify({ releaseId: 'test', directories: [join(files[0], '..')] }),
  )
  return { root, cacheDir, lock, marker, deliveries, files, remote }
}

test('full reset holds the delivery lock and clears ownership after all database steps', async () => {
  const f = await fixture()
  const steps: string[] = []
  try {
    await resetLocalDb('all', {
      repoRoot: f.root,
      executeStep: async step => {
        steps.push(basename(step.command[1] ?? ''))
        expect(await Bun.file(f.marker).exists()).toBe(true)
        expect(await Bun.file(f.files[0]).exists()).toBe(true)
        await expect(withDeliveryLock(f.lock, async () => {})).rejects.toThrow('locked')
      },
    })
    expect(steps).toEqual([
      'drop-local-db.sh',
      'migrate-local-db.sh',
      'syncMetaRegistry.ts',
      'vacuum-local-db.sh',
    ])
    for (const path of [...f.files, f.marker]) {
      expect(await Bun.file(path).exists()).toBe(false)
    }
    expect(await Bun.file(f.remote).exists()).toBe(true)
    await assertSqlDeliveryPlanningAllowed(f.cacheDir, 'new-release')
    await withDeliveryLock(f.lock, async () => {})
    await expect(assertSqlDeliveryGeneration(f.cacheDir, 'test', null)).rejects.toThrow(
      'invalidated',
    )
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

for (const failureStep of [1, 2, 3, 4]) {
  test(`failed reset step ${failureStep} retains ownership and artefacts`, async () => {
    const f = await fixture()
    let steps = 0
    try {
      await expect(
        resetLocalDb('all', {
          repoRoot: f.root,
          executeStep: async () => {
            if (++steps === failureStep) throw new Error('reset step failed')
          },
        }),
      ).rejects.toThrow('reset step failed')
      expect(steps).toBe(failureStep)
      for (const path of [...f.files, f.marker]) {
        expect(await Bun.file(path).exists()).toBe(true)
      }
      await expect(
        assertSqlDeliveryPlanningAllowed(f.cacheDir, 'new-release'),
      ).rejects.toThrow('unfinished SQL delivery')
      await withDeliveryLock(f.lock, async () => {})
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
}

test('active delivery prevents a reset before any database work or invalidation', async () => {
  const f = await fixture()
  let calls = 0
  try {
    await withDeliveryLock(f.lock, async () => {
      await expect(
        resetLocalDb('all', {
          repoRoot: f.root,
          executeStep: async () => {
            calls++
          },
        }),
      ).rejects.toThrow('locked')
    })
    expect(calls).toBe(0)
    expect(await readSqlDeliveryGeneration(f.cacheDir, 'test')).toBeNull()
    expect(await Bun.file(f.marker).exists()).toBe(true)
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

test('family reset retains pending ownership and local artefacts', async () => {
  const f = await fixture()
  try {
    await resetLocalDb('meta', { repoRoot: f.root, executeStep: async () => {} })
    for (const path of [...f.files, f.marker]) {
      expect(await Bun.file(path).exists()).toBe(true)
    }
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

test('failed artefact cleanup retains the pending ownership marker', async () => {
  const f = await fixture()
  try {
    await chmod(join(f.deliveries, 'release-test/phase'), 0o500)
    await expect(
      resetLocalDb('all', { repoRoot: f.root, executeStep: async () => {} }),
    ).rejects.toThrow('EACCES')
    expect(await Bun.file(f.marker).exists()).toBe(true)
    await withDeliveryLock(f.lock, async () => {})
  } finally {
    await chmod(join(f.deliveries, 'release-test/phase'), 0o700)
    await rm(f.root, { recursive: true, force: true })
  }
})
