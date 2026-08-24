import { index, primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'

import {
  canonicalStatsField,
  canonicalStatsFieldI18n,
  canonicalStatsMeasure,
  canonicalStatsMeasureI18n,
  canonicalStatsRecord,
  canonicalStatsValueI18n,
} from '../shared'
import { historyStatisticVersioning } from './shared'

/** Immutable canonical observations, including superseded publisher revisions. */
export const statsRecords = sqliteTable(
  'statsRecords',
  { ...canonicalStatsRecord, ...historyStatisticVersioning },
  table => [
    primaryKey({ columns: [table.id, table.versionHash] }),
    index('statsRecords_current_lookup_idx').on(table.id, table.isCurrent),
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
  { ...canonicalStatsField, ...historyStatisticVersioning },
  table => [
    primaryKey({
      columns: [
        table.datasetCode,
        table.fieldName,
        table.sourceReleaseId,
        table.versionHash,
      ],
    }),
    index('statsFields_current_lookup_idx').on(
      table.datasetCode,
      table.fieldName,
      table.isCurrent,
    ),
  ],
)

export const statsMeasures = sqliteTable(
  'statsMeasures',
  { ...canonicalStatsMeasure, ...historyStatisticVersioning },
  table => [
    primaryKey({
      columns: [
        table.datasetCode,
        table.measureCode,
        table.sourceReleaseId,
        table.versionHash,
      ],
    }),
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
      columns: [
        table.datasetCode,
        table.measureCode,
        table.locale,
        table.sourceReleaseId,
        table.versionHash,
      ],
    }),
  ],
)

export const statsFieldsI18n = sqliteTable(
  'statsFieldsI18n',
  { ...canonicalStatsFieldI18n, ...historyStatisticVersioning },
  table => [
    primaryKey({
      columns: [
        table.datasetCode,
        table.fieldName,
        table.locale,
        table.sourceReleaseId,
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
        table.sourceReleaseId,
        table.versionHash,
      ],
    }),
  ],
)
