import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sha256, writeDeliveryFile } from './sqlDeliveryFiles.ts'

function name(releaseId: string) {
  return `${sha256(releaseId)}.json`
}

export async function readSqlDeliveryGeneration(cacheDir: string, releaseId: string) {
  try {
    const value = JSON.parse(
      await readFile(
        join(cacheDir, 'sql-delivery-generations', name(releaseId)),
        'utf8',
      ),
    )
    if (
      value?.releaseId !== releaseId ||
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
  for (const releaseId of new Set(releaseIds)) {
    if (!releaseId.trim())
      throw new Error('Reset requires non-empty release identities.')
    await writeDeliveryFile(
      join(cacheDir, 'sql-delivery-generations'),
      name(releaseId),
      JSON.stringify({ releaseId, generation: randomUUID() }),
    )
  }
}

export async function assertSqlDeliveryGeneration(
  cacheDir: string,
  releaseId: string,
  generation: unknown,
) {
  if ((generation ?? null) !== (await readSqlDeliveryGeneration(cacheDir, releaseId)))
    throw new Error(
      'SQL delivery was invalidated by a scoped reset; prepare a new plan.',
    )
}
