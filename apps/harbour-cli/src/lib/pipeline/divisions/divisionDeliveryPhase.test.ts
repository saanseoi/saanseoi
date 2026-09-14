import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  prepareNativeSqlDelivery,
  runNativeSqlDelivery,
} from '../local/nativeSqlDelivery.ts'
import { readDeliveryPlan } from '../local/sqlDeliveryFiles.ts'
import { completeSqlDeliveryRelease } from '../local/sqlDeliveryPending.ts'
import { resolveDivisionDeliveryPhase } from './divisionDeliveryPhase.ts'

const input = {
  classificationFixtureHash: 'classification',
  preparedSha256: 'prepared',
  supplementalRowsHash: 'supplemental',
}

test('published division rebuilds use a resumable plan distinct from the original delivery', async () => {
  expect(await resolveDivisionDeliveryPhase(input)).toBe('division-data')

  const first = await resolveDivisionDeliveryPhase({
    ...input,
    rebuildPublishedSnapshot: true,
  })
  const retry = await resolveDivisionDeliveryPhase({
    ...input,
    rebuildPublishedSnapshot: true,
  })

  expect(first).toMatch(/^division-data-rebuild-[a-f0-9]{16}$/)
  expect(retry).toBe(first)
  expect(first).not.toBe('division-data')
})

test('a published division rebuild retains the completed original delivery plan', async () => {
  const root = await mkdtemp(join(tmpdir(), 'division-rebuild-plan-'))
  const dbPath = join(root, 'current.sqlite')
  const releaseId = `division-rebuild-${crypto.randomUUID()}`
  const originalDirectory = join(root, 'division-data')
  const rebuildDirectory = join(
    root,
    await resolveDivisionDeliveryPhase({ ...input, rebuildPublishedSnapshot: true }),
  )
  const db = new Database(dbPath)
  try {
    db.exec('CREATE TABLE counter(n); INSERT INTO counter VALUES(0)')
    await prepareNativeSqlDelivery({
      directory: originalDirectory,
      ownershipDirectory: root,
      files: { DB_CURRENT: dbPath },
      releaseId,
      phase: 'division-data',
      inputs: input,
      generate: async append => {
        await append(
          { bindingName: 'DB_CURRENT', databaseId: 'DB_CURRENT' },
          new TextEncoder().encode('UPDATE counter SET n=n+1;'),
        )
      },
    })
    await runNativeSqlDelivery(originalDirectory, { files: { DB_CURRENT: dbPath } })
    expect(await completeSqlDeliveryRelease(root, releaseId)).toBe(true)
    const originalPlan = await readDeliveryPlan(originalDirectory)

    await prepareNativeSqlDelivery({
      directory: rebuildDirectory,
      ownershipDirectory: root,
      files: { DB_CURRENT: dbPath },
      releaseId,
      phase: rebuildDirectory.slice(root.length + 1),
      inputs: input,
      generate: async append => {
        await append(
          { bindingName: 'DB_CURRENT', databaseId: 'DB_CURRENT' },
          new TextEncoder().encode('UPDATE counter SET n=n+1;'),
        )
      },
    })

    expect(await readDeliveryPlan(originalDirectory)).toEqual(originalPlan)
    expect(await readDeliveryPlan(rebuildDirectory)).not.toEqual(originalPlan)
    await runNativeSqlDelivery(rebuildDirectory, { files: { DB_CURRENT: dbPath } })
    expect(db.query('SELECT n FROM counter').get()).toEqual({ n: 2 })
  } finally {
    db.close()
    await rm(root, { recursive: true, force: true })
  }
})
