import { sql } from 'drizzle-orm'
import { index, integer, text } from 'drizzle-orm/sqlite-core'
import { jsonText } from '../shared'

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

export const sourceRecordId = { sourceRecordId: text('sourceRecordId').notNull() }
/** Lifecycle columns; append timestamps after all table-specific columns. */
export const sourceVersioning = {
  versionHash: text('versionHash').notNull(),
  resourceReleaseId: text('resourceReleaseId').notNull(),
  // Version components within the owning source dataset, never full release codes.
  // The start release is part of period identity: recurring content gets a new row.
  validFromRelease: text('validFromRelease').notNull(),
  validToRelease: text('validToRelease'),
  isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
}

/** A source child row with a stable parent-record identity and release history. */
export function sourceRecordColumns() {
  return {
    ...sourceRecordId,
    ...sourceVersioning,
  }
}

/** A versioned publisher source record with optional source provenance. */
export function sourceReferencedRecordColumns() {
  return {
    ...sourceRecordId,
    sources: sourceReferences(),
    ...sourceVersioning,
  }
}

/**
 * Columns shared by an immutable publisher-source record. Use this for
 * tabular publisher records; source geometry is deliberately optional.
 * Publisher attributes, including publisher record versions, belong in properties, without parallel extracted or
 * canonical columns. Additional columns represent source identity, provenance,
 * native relationships or separately retained evidence, not canonical projections.
 */
export function sourceAssertionColumns() {
  return {
    ...sourceRecordId,
    properties: jsonText('properties'),
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

export const sourceVersionIndexes = <
  TTable extends {
    resourceReleaseId: unknown
    sourceRecordId: unknown
    validFromRelease: unknown
    validToRelease: unknown
    isCurrent: unknown
  },
>(
  table: TTable,
  prefix: string,
) => [
  index(`${prefix}_resourceReleaseId_idx`).on(table.resourceReleaseId as never),
  // Ingestion scans open assertions and reconciles them by publisher identity.
  // The primary key already supports unfiltered sourceRecordId lookups.
  index(`${prefix}_open_records_idx`)
    .on(table.sourceRecordId as never)
    .where(sql`${table.isCurrent} = 1`),
  index(`${prefix}_release_validity_idx`).on(
    table.validFromRelease as never,
    table.validToRelease as never,
  ),
]

/** Streets retains its separate source provenance contract. */
export function streetSourceAssertionColumns() {
  return { ...sourceAssertionColumns(), sources: sourceReferences() }
}

export function streetSourceSpatialAssertionColumns() {
  return {
    ...streetSourceAssertionColumns(),
    sourceGeometry: jsonText('sourceGeometry').notNull(),
  }
}
