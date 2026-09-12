import { historySchema, sql } from '@repo/db'
import type { NewSourceResolution, SourceResolutions } from '@repo/db/historySchema'
import type { HarbourWritableDb } from '../../lib/db/types'
import { chunkArray, getMaxRowsPerInsert } from '../utils'

/** Each caller supplies the complete interpretation for its source/snapshot key. */
export async function recordSourceResolutions(
  db: HarbourWritableDb,
  rows: NewSourceResolution[],
) {
  for (const chunk of chunkArray(rows, getMaxRowsPerInsert(6))) {
    await db
      .insert(historySchema.sourceResolutions)
      .values(chunk.map(row => ({ ...row, scopeId: resolutionScopeId(row) })))
      .onConflictDoUpdate({
        target: [
          historySchema.sourceResolutions.scopeId,
          historySchema.sourceResolutions.sourceReleaseId,
          historySchema.sourceResolutions.sourceRecordId,
          historySchema.sourceResolutions.sourceVersionHash,
        ],
        set: { resolutions: sql`excluded.resolutions` },
      })
      .run()
  }
}

/** Keep only actual entity references; missing matches are not invented IDs. */
export function resolvedEntities(
  values: Record<string, unknown>,
): SourceResolutions['entities'] {
  return Object.fromEntries(
    Object.entries(values).flatMap(([type, id]) =>
      typeof id === 'string' && id.length ? [[type, [id]]] : [],
    ),
  )
}

/** Bound delivery writers use the same snapshot-scoped contract as Drizzle. */
export function sourceResolutionSql(row: NewSourceResolution) {
  const quote = (value: string | null | undefined) =>
    value == null ? 'NULL' : `'${value.replaceAll("'", "''")}'`
  return `INSERT INTO sourceResolutions (scopeId, snapshotId, sourceReleaseId, sourceRecordId, sourceVersionHash, resolutions) VALUES (${[
    resolutionScopeId(row),
    row.snapshotId,
    row.sourceReleaseId,
    row.sourceRecordId,
    row.sourceVersionHash,
    JSON.stringify(row.resolutions),
  ]
    .map(quote)
    .join(
      ', ',
    )}) ON CONFLICT(scopeId, sourceReleaseId, sourceRecordId, sourceVersionHash) DO UPDATE SET resolutions = excluded.resolutions;`
}

export function resolutionScopeId(
  row: Pick<NewSourceResolution, 'snapshotId' | 'sourceReleaseId'>,
) {
  return row.snapshotId
    ? `snapshot:${row.snapshotId}`
    : `release:${row.sourceReleaseId}`
}
