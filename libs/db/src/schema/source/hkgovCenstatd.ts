import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { binaryText, geoBbox, jsonText, timestamps } from '../shared'
import { sourceAssertionColumns, sourceVersionIndexes } from './shared'

/** Immutable publisher geometry, deduplicated by content within a SOURCE shard. */
export const sourceHkgovCenstatdStatisticsGeometry = sqliteTable(
  'hkgovCenstatdStatisticsGeometry',
  {
    id: text('id').primaryKey(),
    sourceGeometry: binaryText('sourceGeometry').notNull(),
  },
)

/** Publisher statistics and provenance owned by one dataset release. */
export const sourceHkgovCenstatdStatistics = sqliteTable(
  'hkgovCenstatdStatistics',
  {
    ...sourceAssertionColumns(),
    datasetCode: text('datasetCode').notNull(),
    geometryId: text('geometryId')
      .notNull()
      .references(() => sourceHkgovCenstatdStatisticsGeometry.id),
    sourceLocator: jsonText<Record<string, unknown>>('sourceLocator'),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [
        table.datasetCode,
        table.resourceReleaseId,
        table.sourceRecordId,
        table.versionHash,
      ],
    }),
    index('hkgovCenstatdStatistics_geometryId_idx').on(table.geometryId),
    ...sourceVersionIndexes(table, 'hkgovCenstatdStatistics'),
  ],
)

/** Immutable transforms identified by geometry and the complete transform context. */
export const sourceHkgovCenstatdStatisticsGeometryDerivatives = sqliteTable(
  'hkgovCenstatdStatisticsGeometryDerivatives',
  {
    geometryId: text('geometryId')
      .notNull()
      .references(() => sourceHkgovCenstatdStatisticsGeometry.id),
    transform: text('transform').notNull(),
    transformHash: text('transformHash').notNull(),
    versionHash: text('versionHash').notNull(),
    derivation: jsonText('derivation').notNull(),
    ...geoBbox,
  },
  table => [
    primaryKey({ columns: [table.geometryId, table.transform, table.transformHash] }),
  ],
)
