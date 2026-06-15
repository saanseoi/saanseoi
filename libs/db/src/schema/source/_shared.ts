import { sql } from 'drizzle-orm'
import { index, integer, text } from 'drizzle-orm/sqlite-core'

export const jsonText = (name: string) => text(name, { mode: 'json' })

export const sourceTimestamps = {
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}

export const sourceRecordColumns = {
  releaseId: text('releaseId').notNull(),
  datasetId: text('datasetId').notNull(),
  sourceRecordId: text('sourceRecordId').notNull(),
  sourcePayloadHash: text('sourcePayloadHash'),
  ...sourceTimestamps,
}

export const sourceVersioning = {
  versionHash: text('versionHash').notNull(),
  releaseId: text('releaseId').notNull(),
  validFromRelease: text('validFromRelease').notNull(),
  validToRelease: text('validToRelease'),
  isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
  ...sourceTimestamps,
}

export const sourceRecordIndexes = <
  TTable extends {
    datasetId: unknown
    releaseId: unknown
    sourceRecordId: unknown
  },
>(
  table: TTable,
  prefix: string,
) => [
  index(`${prefix}_datasetId_idx`).on(table.datasetId as never),
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
