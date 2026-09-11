import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import {
  canonicalStatsField,
  canonicalStatsFieldI18n,
  canonicalStatsMeasure,
  canonicalStatsMeasureI18n,
  canonicalStatsRecord,
  canonicalStatsValueI18n,
  timestamps,
} from '../shared'

const definitionVersion = { versionHash: text('versionHash').notNull().default('') }

/** Latest published values for every retained reference period. */
export const statsRecords = sqliteTable(
  'statsRecords',
  { ...canonicalStatsRecord, ...definitionVersion, ...timestamps },
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
  { ...canonicalStatsField, ...definitionVersion, ...timestamps },
  table => [
    primaryKey({ columns: [table.datasetCode, table.fieldName, table.versionHash] }),
  ],
)

export const statsMeasures = sqliteTable(
  'statsMeasures',
  { ...canonicalStatsMeasure, ...definitionVersion, ...timestamps },
  table => [
    primaryKey({ columns: [table.datasetCode, table.measureCode, table.versionHash] }),
  ],
)

export const statsMeasuresI18n = sqliteTable(
  'statsMeasuresI18n',
  { ...canonicalStatsMeasureI18n, ...definitionVersion, ...timestamps },
  table => [
    primaryKey({
      columns: [table.datasetCode, table.measureCode, table.locale, table.versionHash],
    }),
  ],
)

export const statsFieldsI18n = sqliteTable(
  'statsFieldsI18n',
  { ...canonicalStatsFieldI18n, ...definitionVersion, ...timestamps },
  table => [
    primaryKey({
      columns: [table.datasetCode, table.fieldName, table.locale, table.versionHash],
    }),
  ],
)

export const statsValuesI18n = sqliteTable(
  'statsValuesI18n',
  { ...canonicalStatsValueI18n, ...definitionVersion, ...timestamps },
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
