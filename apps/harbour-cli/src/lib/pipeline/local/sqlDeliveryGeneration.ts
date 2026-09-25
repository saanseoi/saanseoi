import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sha256, writeDeliveryFile } from './sqlDeliveryFiles.ts'

function name(resourceReleaseId: string) {
  return `${sha256(resourceReleaseId)}.json`
}

export async function readSqlDeliveryGeneration(
  cacheDir: string,
  resourceReleaseId: string,
) {
  try {
    const value = JSON.parse(
      await readFile(
        join(cacheDir, 'sql-delivery-generations', name(resourceReleaseId)),
        'utf8',
      ),
    )
    if (
      value?.resourceReleaseId !== resourceReleaseId ||
      typeof value.generation !== 'string' ||
      !value.generation
    )
      throw new Error('Invalid SQL delivery reset generation.')
    return value.generation as string
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

/** Caller holds the cache-wide lock. Advance before any destructive reset writes. */
export async function invalidateSqlDeliveryReleases(
  cacheDir: string,
  releaseIds: readonly string[],
) {
  for (const resourceReleaseId of new Set(releaseIds)) {
    if (!resourceReleaseId.trim())
      throw new Error('Reset requires non-empty release identities.')
    await writeDeliveryFile(
      join(cacheDir, 'sql-delivery-generations'),
      name(resourceReleaseId),
      JSON.stringify({ resourceReleaseId, generation: randomUUID() }),
    )
  }
}

export async function assertSqlDeliveryGeneration(
  cacheDir: string,
  resourceReleaseId: string,
  generation: unknown,
) {
  if (
    (generation ?? null) !==
    (await readSqlDeliveryGeneration(cacheDir, resourceReleaseId))
  )
    throw new Error(
      'SQL delivery was invalidated by a scoped reset; prepare a new plan.',
    )
}
