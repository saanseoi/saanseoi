import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  readDeliveryPlan,
  readDeliveryProgress,
  writeDeliveryFile,
} from './sqlDeliveryFiles.ts'

const NAME = 'pending-sql-delivery.json'
type Pending = { releaseId: string; directories: string[] }

export async function readPendingSqlDelivery(
  cacheDir: string,
): Promise<Pending | null> {
  try {
    return JSON.parse(await readFile(join(cacheDir, NAME), 'utf8')) as Pending
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function assertSqlDeliveryPlanningAllowed(
  cacheDir: string,
  releaseId?: string,
) {
  const pending = await readPendingSqlDelivery(cacheDir)
  if (pending && pending.releaseId !== releaseId) {
    throw new Error(
      `The mirror has an unfinished SQL delivery for ${pending.releaseId}. Resume the retained plan with sql:resume --plan ${pending.directories[0]} before planning another release.`,
    )
  }
}

/** Caller holds the cache-wide delivery lock. */
export async function registerPendingSqlDelivery(
  cacheDir: string,
  releaseId: string,
  directory: string,
) {
  await assertSqlDeliveryPlanningAllowed(cacheDir, releaseId)
  const pending = await readPendingSqlDelivery(cacheDir)
  await writeDeliveryFile(
    cacheDir,
    NAME,
    JSON.stringify({
      releaseId,
      directories: [...new Set([...(pending?.directories ?? []), directory])],
    }),
  )
}

/** Only the owning release may clear its marker after replay and metadata synchronisation. */
export async function completeSqlDeliveryRelease(cacheDir: string, releaseId: string) {
  const pending = await readPendingSqlDelivery(cacheDir)
  if (pending?.releaseId !== releaseId) return false
  for (const directory of pending.directories) {
    const plan = await readDeliveryPlan(directory)
    if (!plan) throw new Error('Cannot clear an incomplete SQL delivery plan.')
    const progress = await readDeliveryProgress(directory, plan)
    if (
      plan.batches.some(
        batch =>
          progress.remote[batch.index]?.status !== 'complete' ||
          !progress.local[batch.index],
      )
    ) {
      return false
    }
  }
  await rm(join(cacheDir, NAME))
  return true
}
