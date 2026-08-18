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
} from '../shared'
import { historyStatisticVersioning } from './shared'

/** Immutable canonical observations, including superseded publisher revisions. */
export const statsObservations = sqliteTable(
  'statsObservations',
  { ...canonicalStatsObservation, ...historyStatisticVersioning },
  table => [
    primaryKey({ columns: [table.id, table.versionHash] }),
    index('statsObservations_current_lookup_idx').on(table.id, table.isCurrent),
    index('statsObservations_series_measure_idx').on(table.seriesId, table.measureCode),
  ],
)

export const statsSeries = sqliteTable(
  'statsSeries',
  { ...canonicalStatsSeries, ...historyStatisticVersioning },
  table => [
    primaryKey({ columns: [table.id, table.versionHash] }),
    index('statsSeries_current_lookup_idx').on(table.id, table.isCurrent),
    index('statsSeries_dataset_period_idx').on(
      table.datasetCode,
      table.referencePeriodCode,
    ),
    index('statsSeries_division_period_idx').on(
      table.divisionId,
      table.referencePeriodCode,
    ),
    index('statsSeries_source_release_idx').on(table.sourceReleaseId),
  ],
)

export const statsMeasures = sqliteTable(
  'statsMeasures',
  { ...canonicalStatsMeasure, ...historyStatisticVersioning },
  table => [
    primaryKey({ columns: [table.datasetCode, table.measureCode, table.versionHash] }),
    index('statsMeasures_current_lookup_idx').on(
      table.datasetCode,
      table.measureCode,
      table.isCurrent,
    ),
  ],
)

export const statsMeasuresI18n = sqliteTable(
  'statsMeasuresI18n',
  { ...canonicalStatsMeasureI18n, ...historyStatisticVersioning },
  table => [
    primaryKey({
      columns: [table.datasetCode, table.measureCode, table.locale, table.versionHash],
    }),
  ],
)

export const statsDimensions = sqliteTable(
  'statsDimensions',
  { ...canonicalStatsDimension, ...historyStatisticVersioning },
  table => [
    primaryKey({
      columns: [table.datasetCode, table.dimensionCode, table.versionHash],
    }),
  ],
)

export const statsValues = sqliteTable(
  'statsValues',
  { ...canonicalStatsValue, ...historyStatisticVersioning },
  table => [
    primaryKey({
      columns: [
        table.datasetCode,
        table.dimensionCode,
        table.valueCode,
        table.versionHash,
      ],
    }),
  ],
)

export const statsValuesI18n = sqliteTable(
  'statsValuesI18n',
  { ...canonicalStatsValueI18n, ...historyStatisticVersioning },
  table => [
    primaryKey({
      columns: [
        table.datasetCode,
        table.dimensionCode,
        table.valueCode,
        table.locale,
        table.versionHash,
      ],
    }),
  ],
)

export const statsSeriesDimensions = sqliteTable(
  'statsSeriesDimensions',
  { ...canonicalStatsSeriesDimension, ...historyStatisticVersioning },
  table => [
    primaryKey({
      columns: [
        table.seriesId,
        table.dimensionCode,
        table.valueCode,
        table.versionHash,
      ],
    }),
    index('statsSeriesDimensions_series_idx').on(table.seriesId, table.isCurrent),
  ],
)
