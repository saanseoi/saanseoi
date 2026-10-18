import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import {
  canonicalStatsFieldColumns,
  canonicalStatsFieldI18nColumns,
  canonicalStatsMeasureColumns,
  canonicalStatsMeasureI18nColumns,
  canonicalStatsRecordColumns,
  canonicalStatsValueI18nColumns,
  jsonText,
} from '../shared'
import { historyEventConstraints } from './constraints'
import { historyStatisticVersioning } from './shared'

const { sourceReleaseId: _producingRelease, ...historyStatsRecordColumns } =
  canonicalStatsRecordColumns(false)

/** Immutable canonical observations, including superseded publisher revisions. */
export const statsRecords = sqliteTable(
  'statsRecords',
  { ...historyStatsRecordColumns, ...historyStatisticVersioning },
  table => [
    ...historyEventConstraints(table, [
      'datasetCode',
      'referencePeriodCode',
      'referencePeriodGranularity',
      'referencePeriodEndYear',
      'geography',
      'fieldSources',
      'definitionSetId',
      'values',
    ]),
    primaryKey({ columns: [table.id, table.snapshotId] }),
  ],
)

export const statsFields = sqliteTable(
  'statsFields',
  { ...canonicalStatsFieldColumns(false), ...historyStatisticVersioning },
  table => [
    ...historyEventConstraints(table, [
      'measureCode',
      'measureVersionHash',
      'sourceField',
      'dimensions',
      'statisticKind',
      'aggregation',
      'valueKind',
      'unitCode',
    ]),
    primaryKey({
      columns: [table.datasetCode, table.fieldName, table.snapshotId],
    }),
  ],
)

export const statsMeasures = sqliteTable(
  'statsMeasures',
  { ...canonicalStatsMeasureColumns(false), ...historyStatisticVersioning },
  table => [
    ...historyEventConstraints(table, []),
    primaryKey({
      columns: [table.datasetCode, table.measureCode, table.snapshotId],
    }),
  ],
)

export const statsMeasuresI18n = sqliteTable(
  'statsMeasuresI18n',
  { ...canonicalStatsMeasureI18nColumns(false), ...historyStatisticVersioning },
  table => [
    ...historyEventConstraints(table, ['name']),
    primaryKey({
      columns: [table.datasetCode, table.measureCode, table.locale, table.snapshotId],
    }),
  ],
)

export const statsFieldsI18n = sqliteTable(
  'statsFieldsI18n',
  { ...canonicalStatsFieldI18nColumns(false), ...historyStatisticVersioning },
  table => [
    ...historyEventConstraints(table, ['name']),
    primaryKey({
      columns: [table.datasetCode, table.fieldName, table.locale, table.snapshotId],
    }),
  ],
)

export const statsValuesI18n = sqliteTable(
  'statsValuesI18n',
  { ...canonicalStatsValueI18nColumns(false), ...historyStatisticVersioning },
  table => [
    ...historyEventConstraints(table, ['name']),
    primaryKey({
      columns: [
        table.datasetCode,
        table.dimensionCode,
        table.valueCode,
        table.locale,
        table.snapshotId,
      ],
    }),
  ],
)

/** Shared immutable selections; identical record maps are stored once per database. */
export const statsDefinitionSets = sqliteTable('statsDefinitionSets', {
  id: text('id').primaryKey(),
  fieldDefinitionHashes: jsonText<Record<string, string>>(
    'fieldDefinitionHashes',
  ).notNull(),
})
