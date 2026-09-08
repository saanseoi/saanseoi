import { index, integer, text } from 'drizzle-orm/sqlite-core'
import { jsonText, timestamps } from '../shared'

/**
 * A publisher or ingestion reference supporting a source record.
 *
 * `dataset` is the shared minimum. Source-specific keys preserve publisher
 * attribution and immutable ingestion evidence without a schema migration.
 */
export type SourceReference = {
  dataset: string
  [key: string]: unknown
}

/** Null when no publisher or ingestion evidence is supplied; never a self-reference. */
export const sourceReferences = () => jsonText<SourceReference[]>('sources')

export const sourceVersioning = {
  versionHash: text('versionHash').notNull(),
  releaseId: text('releaseId').notNull(),
  validFromRelease: text('validFromRelease').notNull(),
  validToRelease: text('validToRelease'),
  isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
  ...timestamps,
}

/** A source child row with a stable parent-record identity and release history. */
export function sourceVersionedRecordColumns() {
  return {
    sourceRecordId: text('sourceRecordId').notNull(),
    ...sourceVersioning,
  }
}

/** A versioned publisher source record with optional source provenance. */
export function sourceVersionedAssertionColumns() {
  return {
    sourceRecordId: text('sourceRecordId').notNull(),
    sources: sourceReferences(),
    ...sourceVersioning,
  }
}

/**
 * Columns shared by an immutable publisher-source record. Use this for
 * tabular publisher records; source geometry is deliberately optional.
 * Publisher attributes, including publisher record versions, belong in rawProperties, without parallel extracted or
 * canonical columns. Additional columns represent source identity, provenance,
 * native relationships or separately retained evidence, not canonical projections.
 */
export function sourceAssertionColumns() {
  return {
    sourceRecordId: text('sourceRecordId').notNull(),
    sources: sourceReferences(),
    rawProperties: jsonText('rawProperties'),
    ...sourceVersioning,
  }
}

/** Adds the required native geometry to a versioned source record. */
export function sourceSpatialAssertionColumns() {
  return {
    ...sourceAssertionColumns(),
    sourceGeometry: jsonText('sourceGeometry').notNull(),
  }
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

/** A source child row retained independently for every release revision. */
export function sourceReleaseRevisionRecordColumns() {
  return {
    sourceRecordId: text('sourceRecordId').notNull(),
    ...sourceReleaseRevisioning,
  }
}

/** A release-revision source record with optional source provenance. */
export function sourceReleaseRevisionAssertionColumns() {
  return {
    sourceRecordId: text('sourceRecordId').notNull(),
    sources: sourceReferences(),
    rawProperties: jsonText('rawProperties'),
    ...sourceReleaseRevisioning,
  }
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
