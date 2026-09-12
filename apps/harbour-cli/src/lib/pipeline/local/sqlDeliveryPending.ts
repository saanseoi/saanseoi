import { readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { buildDeterministicReleaseId } from '@repo/core/db/metaRegistry'
import { acknowledgeSqlDeliveryMirrorFiles } from './sqlDeliveryMirrorFiles.ts'
import {
  readDeliveryPlan,
  readDeliveryProgress,
  writeDeliveryFile,
  withDeliveryLock,
} from './sqlDeliveryFiles.ts'

const NAME = 'pending-sql-delivery.json'
type Pending = { releaseId: string; directories: string[] }

/**
 * Returns the retained release only when every sealed plan proves that it is
 * the source release about to be registered. Callers must still let the normal
 * ownership assertion reject every other pending release.
 */
export async function findPendingSqlDeliveryReleaseId(
  cacheDir: string,
  releaseCode: string,
) {
  const pending = await readPendingSqlDelivery(cacheDir)
  if (!pending) return undefined

  const expectedReleaseId = buildDeterministicReleaseId(releaseCode)

  for (const directory of pending.directories) {
    const plan = await readDeliveryPlan(directory)
    if (
      !plan ||
      plan.context.releaseId !== pending.releaseId ||
      resolve(plan.context.cacheDir) !== resolve(cacheDir) ||
      (plan.context.releaseId !== expectedReleaseId &&
        !hasReleaseCode(plan.context.inputs, releaseCode))
    ) {
      return undefined
    }
  }

  return pending.releaseId
}

export async function readPendingSqlDelivery(
  cacheDir: string,
): Promise<Pending | null> {
  try {
    const pending = JSON.parse(await readFile(join(cacheDir, NAME), 'utf8')) as Pending
    if (
      !pending ||
      typeof pending.releaseId !== 'string' ||
      !pending.releaseId.trim() ||
      !Array.isArray(pending.directories) ||
      pending.directories.length === 0 ||
      pending.directories.some(
        directory => typeof directory !== 'string' || !directory.trim(),
      )
    )
      throw new Error(
        'Invalid SQL delivery ownership marker; refusing to infer an unowned cache.',
      )
    return pending
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

/**
 * Clear an ownership marker only when every referenced sealed plan is gone.
 * Callers must hold the cache-wide delivery lock and are responsible for the
 * destructive operation that makes abandoning the marker appropriate.
 */
export async function discardAbandonedSqlDelivery(cacheDir: string) {
  const pending = await readPendingSqlDelivery(cacheDir)
  if (!pending) return null

  for (const directory of pending.directories) {
    if (await readDeliveryPlan(directory)) {
      throw new Error(
        `A sealed SQL delivery plan still exists at ${directory}; resume it before discarding ownership.`,
      )
    }
  }

  await rm(join(cacheDir, NAME))
  return pending
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
  return withDeliveryLock(join(cacheDir, 'sql-delivery-lock'), () =>
    completeLocked(cacheDir, releaseId),
  )
}

async function completeLocked(cacheDir: string, releaseId: string) {
  const pending = await readPendingSqlDelivery(cacheDir)
  if (pending?.releaseId !== releaseId) return false
  const acknowledged: Array<{
    directory: string
    plan: NonNullable<Awaited<ReturnType<typeof readDeliveryPlan>>>
  }> = []
  for (const directory of pending.directories) {
    const plan = await readDeliveryPlan(directory)
    if (!plan) throw new Error('Cannot clear an incomplete SQL delivery plan.')
    if (
      plan.context.releaseId !== releaseId ||
      resolve(plan.context.cacheDir) !== resolve(cacheDir)
    )
      throw new Error('Pending SQL plan does not belong to this release and cache.')
    const progress = await readDeliveryProgress(directory, plan)
    if (
      plan.batches.some(
        batch =>
          (plan.context.environment !== 'local' &&
            progress.remote[batch.index]?.status !== 'complete') ||
          !progress.local[batch.index],
      )
    ) {
      return false
    }
    acknowledged.push({ directory, plan })
  }
  await acknowledgeSqlDeliveryMirrorFiles(acknowledged)
  await rm(join(cacheDir, NAME))
  return true
}

function hasReleaseCode(inputs: Record<string, unknown>, releaseCode: string) {
  const version = inputs.version
  return (
    typeof version === 'object' &&
    version !== null &&
    !Array.isArray(version) &&
    (version as Record<string, unknown>).releaseCode === releaseCode
  )
}
