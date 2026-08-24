import type {
  CanonicalStatsGeography,
  HistoryDatabase,
  StatsAggregation,
  StatsFieldComparability,
  StatsPeriodicity,
  StatsStatisticKind,
} from '@repo/db'
import { and, asc, eq, inArray, sql } from '@repo/db'
import { historySchema } from '@repo/db'
import type { RequestedApiLocaleSelection } from '@repo/core'

const { statsRecords, statsFields, statsFieldsI18n, statsMeasures, statsMeasuresI18n } =
  historySchema
// Leave room for dataset, locale, and filter parameters below D1's 100-variable cap.
const D1_QUERY_BATCH_SIZE = 80
const D1_MULTI_ARRAY_BATCH_SIZE = 30

export type StatisticFilters = {
  datasetCode?: string
  divisionId?: string
  fieldName?: string
  referencePeriod?: string
}

export type StatisticRecord = {
  id: string
  datasetCode: string
  sourceReleaseId: string
  sourceFeatureRef: string
  divisionId: string | null
  referencePeriodCode: string
  referencePeriodStart: string | null
  referencePeriodEnd: string | null
  referencePeriodEndYear: string
  referencePeriodGranularity: string
  geography: CanonicalStatsGeography
  dimensions: Record<string, string>
  values: Record<string, string>
  createdAt: string
  updatedAt: string
}

export type StatisticFieldDefinition = {
  datasetCode: string
  fieldName: string
  measureCode: string
  sourceField: string
  dimensions: Record<string, string>
  sourceNullOption: string | null
  statisticKind: StatsStatisticKind
  aggregation: StatsAggregation
  aggregationPercentile: number | null
  periodicity: StatsPeriodicity | null
  comparability: StatsFieldComparability | null
  denominatorFieldName: string | null
  valueKind: string
  unitCode: string
  i18n: Record<
    string,
    {
      name: string
      description: string | null
      isTranslationVerified: boolean
    }
  >
}

export type StatisticMeasureDefinition = {
  datasetCode: string
  measureCode: string
  i18n: Record<
    string,
    {
      name: string
      description: string | null
      isTranslationVerified: boolean
    }
  >
}

function chunks<T>(items: T[], size = D1_QUERY_BATCH_SIZE) {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

function statisticConditions(
  sourceReleaseIds: string[],
  cohortKey: string,
  filters: StatisticFilters,
) {
  return and(
    inArray(statsRecords.sourceReleaseId, sourceReleaseIds),
    eq(statsRecords.isCurrent, true),
    eq(statsRecords.referencePeriodCode, cohortKey),
    filters.datasetCode ? eq(statsRecords.datasetCode, filters.datasetCode) : undefined,
    filters.divisionId ? eq(statsRecords.divisionId, filters.divisionId) : undefined,
    filters.referencePeriod
      ? eq(statsRecords.referencePeriodCode, filters.referencePeriod)
      : undefined,
    filters.fieldName
      ? sql`json_type(${statsRecords.values}, '$.' || ${filters.fieldName}) is not null`
      : undefined,
  )
}

function mapStatisticRecord(row: typeof statsRecords.$inferSelect): StatisticRecord {
  return {
    id: row.id,
    datasetCode: row.datasetCode,
    sourceReleaseId: row.sourceReleaseId,
    sourceFeatureRef: row.sourceFeatureRef,
    divisionId: row.divisionId,
    referencePeriodCode: row.referencePeriodCode,
    referencePeriodStart: row.referencePeriodStart,
    referencePeriodEnd: row.referencePeriodEnd,
    referencePeriodEndYear: row.referencePeriodEndYear,
    referencePeriodGranularity: row.referencePeriodGranularity,
    geography: row.geography,
    dimensions: row.dimensions,
    values: row.values,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function listStatisticRecords(
  dbs: HistoryDatabase[],
  lookup: {
    cohortKey: string
    sourceReleaseIds: string[]
    filters: StatisticFilters
    limit: number
    offset: number
  },
) {
  if (lookup.sourceReleaseIds.length === 0) return []
  const fetchLimit = lookup.limit + lookup.offset
  const rows = (
    await Promise.all(
      dbs.flatMap(db =>
        chunks(lookup.sourceReleaseIds).map(sourceReleaseIds =>
          db
            .select()
            .from(statsRecords)
            .where(
              statisticConditions(sourceReleaseIds, lookup.cohortKey, lookup.filters),
            )
            .orderBy(
              asc(statsRecords.datasetCode),
              asc(statsRecords.referencePeriodCode),
              asc(statsRecords.id),
            )
            .limit(fetchLimit)
            .all(),
        ),
      ),
    )
  ).flat()

  return rows
    .sort(
      (left, right) =>
        left.datasetCode.localeCompare(right.datasetCode) ||
        left.referencePeriodCode.localeCompare(right.referencePeriodCode) ||
        left.id.localeCompare(right.id),
    )
    .slice(lookup.offset, lookup.offset + lookup.limit)
    .map(mapStatisticRecord)
}

/**
 * Loads the complete selected geography dimension. Aggregate endpoints never
 * paginate this map: a partial map is not a usable statistical response.
 */
export async function listStatisticRecordsForGeography(
  dbs: HistoryDatabase[],
  lookup: {
    datasetCode?: string
    fieldName: string
    referencePeriod?: string
    sourceReleaseIds: string[]
  },
) {
  if (lookup.sourceReleaseIds.length === 0) return []
  const rows = (
    await Promise.all(
      dbs.flatMap(db =>
        chunks(lookup.sourceReleaseIds).map(sourceReleaseIds =>
          db
            .select()
            .from(statsRecords)
            .where(
              and(
                inArray(statsRecords.sourceReleaseId, sourceReleaseIds),
                eq(statsRecords.isCurrent, true),
                lookup.datasetCode
                  ? eq(statsRecords.datasetCode, lookup.datasetCode)
                  : undefined,
                lookup.referencePeriod
                  ? eq(statsRecords.referencePeriodCode, lookup.referencePeriod)
                  : undefined,
                sql`json_type(${statsRecords.values}, '$.' || ${lookup.fieldName}) is not null`,
              ),
            )
            .orderBy(asc(statsRecords.referencePeriodCode), asc(statsRecords.id))
            .all(),
        ),
      ),
    )
  ).flat()
  return rows.map(mapStatisticRecord)
}

export async function countStatisticRecords(
  dbs: HistoryDatabase[],
  lookup: {
    cohortKey: string
    sourceReleaseIds: string[]
    filters: StatisticFilters
  },
) {
  if (lookup.sourceReleaseIds.length === 0) return 0
  const rows = await Promise.all(
    dbs.flatMap(db =>
      chunks(lookup.sourceReleaseIds).map(sourceReleaseIds =>
        db
          .select({ count: sql<number>`count(*)` })
          .from(statsRecords)
          .where(
            statisticConditions(sourceReleaseIds, lookup.cohortKey, lookup.filters),
          )
          .get(),
      ),
    ),
  )
  return rows.reduce((total, row) => total + Number(row?.count ?? 0), 0)
}

export async function getStatisticRecord(
  dbs: HistoryDatabase[],
  lookup: { cohortKey: string; id: string; sourceReleaseIds: string[] },
) {
  if (lookup.sourceReleaseIds.length === 0) return null
  const rows = await Promise.all(
    dbs.flatMap(db =>
      chunks(lookup.sourceReleaseIds).map(sourceReleaseIds =>
        db
          .select()
          .from(statsRecords)
          .where(
            and(
              eq(statsRecords.id, lookup.id),
              eq(statsRecords.referencePeriodCode, lookup.cohortKey),
              inArray(statsRecords.sourceReleaseId, sourceReleaseIds),
              eq(statsRecords.isCurrent, true),
            ),
          )
          .limit(1)
          .get(),
      ),
    ),
  )
  const row = rows.find((value): value is typeof statsRecords.$inferSelect =>
    Boolean(value),
  )
  return row ? mapStatisticRecord(row) : null
}

export async function listStatisticFieldDefinitions(
  dbs: HistoryDatabase[],
  lookup: {
    datasetCodes: string[]
    localeSelection: RequestedApiLocaleSelection
    sourceReleaseIds: string[]
  },
): Promise<StatisticFieldDefinition[]> {
  if (lookup.sourceReleaseIds.length === 0 || lookup.datasetCodes.length === 0) {
    return []
  }
  const selectedLocales =
    lookup.localeSelection.mode === 'requested'
      ? lookup.localeSelection.locales
      : undefined
  const sourceReleaseBatches = chunks(
    [...new Set(lookup.sourceReleaseIds)],
    D1_MULTI_ARRAY_BATCH_SIZE,
  )
  const datasetBatches = chunks(
    [...new Set(lookup.datasetCodes)],
    D1_MULTI_ARRAY_BATCH_SIZE,
  )
  const localeBatches = selectedLocales
    ? chunks([...new Set(selectedLocales)], D1_MULTI_ARRAY_BATCH_SIZE)
    : [undefined]
  const [measureRows, i18nRows] = await Promise.all([
    Promise.all(
      dbs.flatMap(db =>
        sourceReleaseBatches.flatMap(sourceReleaseIds =>
          datasetBatches.map(datasetCodes =>
            db
              .select()
              .from(statsFields)
              .where(
                and(
                  inArray(statsFields.sourceReleaseId, sourceReleaseIds),
                  inArray(statsFields.datasetCode, datasetCodes),
                  eq(statsFields.isCurrent, true),
                ),
              )
              .all(),
          ),
        ),
      ),
    ).then(rows => rows.flat()),
    lookup.localeSelection.mode === 'none'
      ? Promise.resolve([])
      : Promise.all(
          dbs.flatMap(db =>
            sourceReleaseBatches.flatMap(sourceReleaseIds =>
              datasetBatches.flatMap(datasetCodes =>
                localeBatches.map(locales =>
                  db
                    .select()
                    .from(statsFieldsI18n)
                    .where(
                      and(
                        inArray(statsFieldsI18n.sourceReleaseId, sourceReleaseIds),
                        inArray(statsFieldsI18n.datasetCode, datasetCodes),
                        eq(statsFieldsI18n.isCurrent, true),
                        locales
                          ? inArray(
                              sql`lower(${statsFieldsI18n.locale})`,
                              locales.map(locale => locale.toLowerCase()),
                            )
                          : undefined,
                      ),
                    )
                    .all(),
                ),
              ),
            ),
          ),
        ).then(rows => rows.flat()),
  ])

  const definitions = new Map<string, StatisticFieldDefinition>()
  for (const row of measureRows) {
    const key = `${row.datasetCode}\u0000${row.fieldName}`
    if (definitions.has(key)) continue
    definitions.set(key, {
      datasetCode: row.datasetCode,
      fieldName: row.fieldName,
      measureCode: row.measureCode,
      sourceField: row.sourceField,
      dimensions: row.dimensions,
      sourceNullOption: row.sourceNullOption,
      statisticKind: row.statisticKind,
      aggregation: row.aggregation,
      aggregationPercentile: row.aggregationPercentile,
      periodicity: row.periodicity,
      comparability: row.comparability,
      denominatorFieldName: row.denominatorFieldName,
      valueKind: row.valueKind,
      unitCode: row.unitCode,
      i18n: {},
    })
  }
  for (const row of i18nRows) {
    const definition = definitions.get(`${row.datasetCode}\u0000${row.fieldName}`)
    if (!definition) continue
    definition.i18n[row.locale.toLowerCase()] = {
      name: row.name,
      description: row.description,
      isTranslationVerified: row.isTranslationVerified,
    }
  }
  return [...definitions.values()]
}

export async function listStatisticMeasureDefinitions(
  dbs: HistoryDatabase[],
  lookup: {
    datasetCodes: string[]
    localeSelection: RequestedApiLocaleSelection
    sourceReleaseIds: string[]
  },
): Promise<StatisticMeasureDefinition[]> {
  if (lookup.sourceReleaseIds.length === 0 || lookup.datasetCodes.length === 0) {
    return []
  }
  const selectedLocales =
    lookup.localeSelection.mode === 'requested'
      ? lookup.localeSelection.locales
      : undefined
  const sourceReleaseBatches = chunks(
    [...new Set(lookup.sourceReleaseIds)],
    D1_MULTI_ARRAY_BATCH_SIZE,
  )
  const datasetBatches = chunks(
    [...new Set(lookup.datasetCodes)],
    D1_MULTI_ARRAY_BATCH_SIZE,
  )
  const localeBatches = selectedLocales
    ? chunks([...new Set(selectedLocales)], D1_MULTI_ARRAY_BATCH_SIZE)
    : [undefined]
  const [measureRows, i18nRows] = await Promise.all([
    Promise.all(
      dbs.flatMap(db =>
        sourceReleaseBatches.flatMap(sourceReleaseIds =>
          datasetBatches.map(datasetCodes =>
            db
              .select()
              .from(statsMeasures)
              .where(
                and(
                  inArray(statsMeasures.sourceReleaseId, sourceReleaseIds),
                  inArray(statsMeasures.datasetCode, datasetCodes),
                  eq(statsMeasures.isCurrent, true),
                ),
              )
              .all(),
          ),
        ),
      ),
    ).then(rows => rows.flat()),
    lookup.localeSelection.mode === 'none'
      ? Promise.resolve([])
      : Promise.all(
          dbs.flatMap(db =>
            sourceReleaseBatches.flatMap(sourceReleaseIds =>
              datasetBatches.flatMap(datasetCodes =>
                localeBatches.map(locales =>
                  db
                    .select()
                    .from(statsMeasuresI18n)
                    .where(
                      and(
                        inArray(statsMeasuresI18n.sourceReleaseId, sourceReleaseIds),
                        inArray(statsMeasuresI18n.datasetCode, datasetCodes),
                        eq(statsMeasuresI18n.isCurrent, true),
                        locales
                          ? inArray(
                              sql`lower(${statsMeasuresI18n.locale})`,
                              locales.map(locale => locale.toLowerCase()),
                            )
                          : undefined,
                      ),
                    )
                    .all(),
                ),
              ),
            ),
          ),
        ).then(rows => rows.flat()),
  ])
  const definitions = new Map<string, StatisticMeasureDefinition>()
  for (const row of measureRows) {
    const key = `${row.datasetCode}\u0000${row.measureCode}`
    if (definitions.has(key)) continue
    definitions.set(key, {
      datasetCode: row.datasetCode,
      measureCode: row.measureCode,
      i18n: {},
    })
  }
  for (const row of i18nRows) {
    const definition = definitions.get(`${row.datasetCode}\u0000${row.measureCode}`)
    if (!definition) continue
    definition.i18n[row.locale.toLowerCase()] = {
      name: row.name,
      description: row.description,
      isTranslationVerified: row.isTranslationVerified,
    }
  }
  return [...definitions.values()]
}
