import { index, primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'

import {
  canonicalStatsField,
  canonicalStatsFieldI18n,
  canonicalStatsMeasure,
  canonicalStatsMeasureI18n,
  canonicalStatsRecord,
  canonicalStatsValueI18n,
  timestamps,
} from '../shared'

/** Latest canonical view only; revision history remains in the history shard. */
export const statsRecords = sqliteTable(
  'statsRecords',
  { ...canonicalStatsRecord, ...timestamps },
  table => [
    primaryKey({ columns: [table.id] }),
    index('statsRecords_dataset_period_idx').on(
      table.datasetCode,
      table.referencePeriodCode,
    ),
    index('statsRecords_division_period_idx').on(
      table.divisionId,
      table.referencePeriodCode,
    ),
    index('statsRecords_source_release_idx').on(table.sourceReleaseId),
  ],
)

export const statsFields = sqliteTable(
  'statsFields',
  { ...canonicalStatsField, ...timestamps },
  table => [primaryKey({ columns: [table.datasetCode, table.fieldName] })],
)

export const statsMeasures = sqliteTable(
  'statsMeasures',
  { ...canonicalStatsMeasure, ...timestamps },
  table => [primaryKey({ columns: [table.datasetCode, table.measureCode] })],
)

export const statsMeasuresI18n = sqliteTable(
  'statsMeasuresI18n',
  { ...canonicalStatsMeasureI18n, ...timestamps },
  table => [
    primaryKey({ columns: [table.datasetCode, table.measureCode, table.locale] }),
  ],
)

export const statsFieldsI18n = sqliteTable(
  'statsFieldsI18n',
  { ...canonicalStatsFieldI18n, ...timestamps },
  table => [
    primaryKey({ columns: [table.datasetCode, table.fieldName, table.locale] }),
  ],
)

export const statsValuesI18n = sqliteTable(
  'statsValuesI18n',
  { ...canonicalStatsValueI18n, ...timestamps },
  table => [
    primaryKey({
      columns: [table.datasetCode, table.dimensionCode, table.valueCode, table.locale],
    }),
  ],
)
