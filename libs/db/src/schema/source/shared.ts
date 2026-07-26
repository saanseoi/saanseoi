import { index, integer, text } from 'drizzle-orm/sqlite-core'
import { timestamps } from '../shared'

export const sourceVersioning = {
  versionHash: text('versionHash').notNull(),
  releaseId: text('releaseId').notNull(),
  validFromRelease: text('validFromRelease').notNull(),
  validToRelease: text('validToRelease'),
  isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
  ...timestamps,
}

/**
 * Immutable source-release branch membership. Unlike legacy source tables,
 * this does not infer a linear validity range: release revisions are retained
 * as separate branches and selected explicitly by snapshot composition.
 */
export const sourceReleaseRevisioning = {
  versionHash: text('versionHash').notNull(),
  releaseId: text('releaseId').notNull(),
  ...timestamps,
}

export const sourceReleaseRevisionIndexes = <
  TTable extends { releaseId: unknown; sourceRecordId: unknown },
>(
  table: TTable,
  prefix: string,
) => [
  index(`${prefix}_releaseId_idx`).on(table.releaseId as never),
  index(`${prefix}_sourceRecordId_idx`).on(table.sourceRecordId as never),
]

export const sourceVersionIndexes = <
  TTable extends {
    releaseId: unknown
    sourceRecordId: unknown
    validFromRelease: unknown
    validToRelease: unknown
    isCurrent: unknown
  },
>(
  table: TTable,
  prefix: string,
) => [
  index(`${prefix}_releaseId_idx`).on(table.releaseId as never),
  index(`${prefix}_sourceRecordId_idx`).on(table.sourceRecordId as never),
  index(`${prefix}_current_lookup_idx`).on(
    table.sourceRecordId as never,
    table.isCurrent as never,
  ),
  index(`${prefix}_release_validity_idx`).on(
    table.validFromRelease as never,
    table.validToRelease as never,
  ),
]
