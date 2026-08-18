import { index, primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'

import {
  canonicalStatsDimension,
  canonicalStatsMeasure,
  canonicalStatsMeasureI18n,
  canonicalStatsObservation,
  canonicalStatsSeries,
  canonicalStatsSeriesDimension,
  canonicalStatsValue,
  canonicalStatsValueI18n,
  timestamps,
} from '../shared'

/** Latest canonical view only; revision history remains in the history shard. */
export const statsObservations = sqliteTable(
  'statsObservations',
  { ...canonicalStatsObservation, ...timestamps },
  table => [
    primaryKey({ columns: [table.id] }),
    index('statsObservations_series_measure_idx').on(table.seriesId, table.measureCode),
  ],
)

export const statsSeries = sqliteTable(
  'statsSeries',
  { ...canonicalStatsSeries, ...timestamps },
  table => [
    primaryKey({ columns: [table.id] }),
    index('statsSeries_dataset_period_idx').on(
      table.datasetCode,
      table.referencePeriodCode,
    ),
    index('statsSeries_division_period_idx').on(
      table.divisionId,
      table.referencePeriodCode,
    ),
  ],
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

export const statsDimensions = sqliteTable(
  'statsDimensions',
  { ...canonicalStatsDimension, ...timestamps },
  table => [primaryKey({ columns: [table.datasetCode, table.dimensionCode] })],
)

export const statsValues = sqliteTable(
  'statsValues',
  { ...canonicalStatsValue, ...timestamps },
  table => [
    primaryKey({ columns: [table.datasetCode, table.dimensionCode, table.valueCode] }),
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

export const statsSeriesDimensions = sqliteTable(
  'statsSeriesDimensions',
  { ...canonicalStatsSeriesDimension, ...timestamps },
  table => [
    primaryKey({
      columns: [table.seriesId, table.dimensionCode, table.valueCode],
    }),
    index('statsSeriesDimensions_series_idx').on(table.seriesId),
  ],
)
