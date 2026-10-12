import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { binaryText, geoBbox, jsonText, timestamps } from '../shared'
import {
  sourceSpatialAssertionColumns,
  sourceVersionIndexes,
  sourceRecordColumns,
} from './shared'

/** Complete publisher features, shared by statistics and geography ingestion. */
export const sourceHkgovCenstatdStatistics = sqliteTable(
  'hkgovCenstatdStatistics',
  {
    ...sourceSpatialAssertionColumns(),
    datasetCode: text('datasetCode').notNull(),
    sourceGeometry: binaryText('sourceGeometry').notNull(),
    sourceLocator: jsonText<Record<string, unknown>>('sourceLocator'),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.datasetCode, table.sourceRecordId, table.versionHash],
    }),
    ...sourceVersionIndexes(table, 'hkgovCenstatdStatistics'),
  ],
)

/** Exact feature-version membership; payloads can be shared by resource releases. */
export const sourceHkgovCenstatdStatisticsReleaseMemberships = sqliteTable(
  'hkgovCenstatdStatisticsReleaseMemberships',
  {
    datasetCode: text('datasetCode').notNull(),
    resourceReleaseId: text('resourceReleaseId').notNull(),
    sourceRecordId: text('sourceRecordId').notNull(),
    versionHash: text('versionHash').notNull(),
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
    index('hkgovCenstatdStatisticsReleaseMemberships_resourceReleaseId_idx').on(
      table.resourceReleaseId,
    ),
  ],
)

/**
 * Materialised geometry transforms of a C&SD district source record.
 *
 * A transform is deliberately not a second source record: `sourceRecordId`
 * and `inputVersionHash` identify the exact C&SD assertion it was derived
 * from. Its own `versionHash` versions the materialised transform output.
 */
export const sourceHkgovCenstatdDivisionAreaDerivatives = sqliteTable(
  'hkgovCenstatdDivisionAreaDerivatives',
  {
    ...sourceRecordColumns(),
    datasetCode: text('datasetCode').notNull(),
    inputVersionHash: text('inputVersionHash').notNull(),
    transform: text('transform').notNull(),
    derivation: jsonText('derivation').notNull(),
    ...geoBbox,
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [
        table.datasetCode,
        table.sourceRecordId,
        table.inputVersionHash,
        table.transform,
        table.versionHash,
      ],
    }),
    ...sourceVersionIndexes(table, 'hkgovCenstatdDivisionAreaDerivatives'),
  ],
)
