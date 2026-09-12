import type {
  CanonicalStatsGeography,
  CurrentDatabase,
  HistoryDatabase,
  StatsAggregation,
  StatsFieldComparability,
  StatsPeriodicity,
  StatsStatisticKind,
} from '@repo/db'
import { and, asc, currentSchema, eq, inArray, sql } from '@repo/db'
import type { RequestedApiLocaleSelection } from '@repo/core'

const { statsRecords, statsFields, statsFieldsI18n, statsMeasures, statsMeasuresI18n } =
  currentSchema
const D1_QUERY_BATCH_SIZE = 30

export type StatisticDatabase = CurrentDatabase | HistoryDatabase
export type StatisticReadSelection = {
  mode: 'current' | 'history'
  datasetCodes: string[]
  /** Root-to-leaf snapshot ancestry. Descendants supply only changed versions. */
  snapshotIds: string[]
  publications: Array<{
    datasetCode: string
    referencePeriodCode: string
    snapshotId: string
  }>
}

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
  values: Record<string, string>
  fieldSources: Record<string, { sourceReleaseId: string; sourceFeatureRef: string }>
  fieldDefinitionHashes: Record<string, string>
  versionHash: string
  createdAt: string
  updatedAt: string
}

export type StatisticFieldDefinition = {
  datasetCode: string
  versionHash: string
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
  versionHash: string
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
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size))
  return result
}

/** JSON array bindings keep publication scopes below D1's variable limit. */
function statisticConditions(
  selection: StatisticReadSelection,
  filters: StatisticFilters = {},
) {
  return and(
    sql`exists (select 1 from json_each(${JSON.stringify(selection.publications)}) as publication
      where json_extract(publication.value, '$.datasetCode') = ${statsRecords.datasetCode}
      and json_extract(publication.value, '$.referencePeriodCode') = ${statsRecords.referencePeriodCode})`,
    filters.datasetCode ? eq(statsRecords.datasetCode, filters.datasetCode) : undefined,
    filters.divisionId ? eq(statsRecords.divisionId, filters.divisionId) : undefined,
    filters.referencePeriod
      ? eq(statsRecords.referencePeriodCode, filters.referencePeriod)
      : undefined,
    filters.fieldName
      ? sql`json_type(${statsRecords.values}, '$.' || ${filters.fieldName}) is not null`
      : undefined,
    selection.mode === 'history'
      ? sql`${statsRecords.versionHash} = (
      select change.versionHash
      from snapshotVersionChanges as change
      join json_each(${JSON.stringify(selection.snapshotIds)}) as selected on selected.value = change.snapshotId
      where change.recordType = 'statsRecord' and change.recordId = ${statsRecords.id}
      order by cast(selected.key as integer) desc limit 1
    )`
      : undefined,
  )
}

function mapStatisticRecord(row: typeof statsRecords.$inferSelect): StatisticRecord {
  return { ...row }
}

function sortRecords(rows: StatisticRecord[]) {
  return rows.sort(
    (left, right) =>
      left.datasetCode.localeCompare(right.datasetCode) ||
      left.referencePeriodCode.localeCompare(right.referencePeriodCode) ||
      left.id.localeCompare(right.id),
  )
}

export async function listStatisticRecords(
  dbs: StatisticDatabase[],
  lookup: {
    selection: StatisticReadSelection
    cohortKey: string
    filters: StatisticFilters
    limit: number
    offset: number
  },
) {
  const rows = (
    await Promise.all(
      dbs.map(db =>
        db
          .select()
          .from(statsRecords)
          .where(
            and(
              statisticConditions(lookup.selection, lookup.filters),
              eq(statsRecords.referencePeriodCode, lookup.cohortKey),
            ),
          )
          .orderBy(
            asc(statsRecords.datasetCode),
            asc(statsRecords.referencePeriodCode),
            asc(statsRecords.id),
          )
          .limit(lookup.limit + lookup.offset)
          .all(),
      ),
    )
  ).flat()
  return sortRecords(rows.map(mapStatisticRecord)).slice(
    lookup.offset,
    lookup.offset + lookup.limit,
  )
}

/** Aggregate endpoints return the complete geography, projecting only the selected field. */
export async function listStatisticRecordsForGeography(
  dbs: StatisticDatabase[],
  lookup: {
    selection: StatisticReadSelection
    datasetCode?: string
    fieldName: string
    referencePeriod?: string
  },
) {
  const rows = (
    await Promise.all(
      dbs.map(db =>
        db
          .select({
            id: statsRecords.id,
            datasetCode: statsRecords.datasetCode,
            sourceReleaseId: statsRecords.sourceReleaseId,
            sourceFeatureRef: statsRecords.sourceFeatureRef,
            divisionId: statsRecords.divisionId,
            referencePeriodCode: statsRecords.referencePeriodCode,
            referencePeriodStart: statsRecords.referencePeriodStart,
            referencePeriodEnd: statsRecords.referencePeriodEnd,
            referencePeriodEndYear: statsRecords.referencePeriodEndYear,
            referencePeriodGranularity: statsRecords.referencePeriodGranularity,
            geography: statsRecords.geography,
            value: sql<string>`json_extract(${statsRecords.values}, '$.' || ${lookup.fieldName})`,
            fieldDefinitionHash: sql<string>`json_extract(${statsRecords.fieldDefinitionHashes}, '$.' || ${lookup.fieldName})`,
            versionHash: statsRecords.versionHash,
            createdAt: statsRecords.createdAt,
            updatedAt: statsRecords.updatedAt,
          })
          .from(statsRecords)
          .where(statisticConditions(lookup.selection, lookup))
          .orderBy(asc(statsRecords.referencePeriodCode), asc(statsRecords.id))
          .all(),
      ),
    )
  ).flat()
  return rows.map(({ value, fieldDefinitionHash, ...row }) => ({
    ...row,
    values: { [lookup.fieldName]: value },
    fieldSources: {},
    fieldDefinitionHashes: { [lookup.fieldName]: fieldDefinitionHash },
  }))
}

export async function countStatisticRecords(
  dbs: StatisticDatabase[],
  lookup: {
    selection: StatisticReadSelection
    cohortKey: string
    filters: StatisticFilters
  },
) {
  const rows = await Promise.all(
    dbs.map(db =>
      db
        .select({ count: sql<number>`count(*)` })
        .from(statsRecords)
        .where(
          and(
            statisticConditions(lookup.selection, lookup.filters),
            eq(statsRecords.referencePeriodCode, lookup.cohortKey),
          ),
        )
        .get(),
    ),
  )
  return rows.reduce((total, row) => total + Number(row?.count ?? 0), 0)
}

export async function getStatisticRecord(
  dbs: StatisticDatabase[],
  lookup: { selection: StatisticReadSelection; cohortKey: string; id: string },
) {
  const rows = await Promise.all(
    dbs.map(db =>
      db
        .select()
        .from(statsRecords)
        .where(
          and(
            statisticConditions(lookup.selection, {
              referencePeriod: lookup.cohortKey,
            }),
            eq(statsRecords.id, lookup.id),
          ),
        )
        .limit(1)
        .get(),
    ),
  )
  const row = rows.find(Boolean)
  return row ? mapStatisticRecord(row) : null
}

type DictionaryLookup = {
  datasetCodes: string[]
  localeSelection: RequestedApiLocaleSelection
  selection: StatisticReadSelection
  /** Narrow list/detail metadata to the returned packs; registries use all selected packs. */
  records?: StatisticRecord[]
}

function referencedFieldCondition(lookup: DictionaryLookup) {
  if (lookup.records) {
    const hashes = [
      ...new Set(
        lookup.records.flatMap(record => Object.values(record.fieldDefinitionHashes)),
      ),
    ]
    return sql`${statsFields.versionHash} in (select value from json_each(${JSON.stringify(hashes)}))`
  }
  return sql`exists (select 1 from ${statsRecords} where ${statisticConditions(lookup.selection)}
    and ${statsRecords.datasetCode} = ${statsFields.datasetCode}
    and json_extract(${statsRecords.fieldDefinitionHashes}, '$.' || ${statsFields.fieldName}) = ${statsFields.versionHash})`
}

export async function listStatisticFieldDefinitions(
  dbs: StatisticDatabase[],
  lookup: DictionaryLookup,
): Promise<StatisticFieldDefinition[]> {
  const rows = (
    await Promise.all(
      dbs.flatMap(db =>
        chunks([...new Set(lookup.datasetCodes)]).map(datasetCodes =>
          db
            .select()
            .from(statsFields)
            .where(
              and(
                inArray(statsFields.datasetCode, datasetCodes),
                referencedFieldCondition(lookup),
              ),
            )
            .all(),
        ),
      ),
    )
  ).flat()
  const definitions = new Map<string, StatisticFieldDefinition>()
  for (const row of rows.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  )) {
    const key = `${row.datasetCode}\u0000${row.fieldName}\u0000${row.versionHash}`
    if (!definitions.has(key)) definitions.set(key, { ...row, i18n: {} })
  }
  if (lookup.localeSelection.mode === 'none' || definitions.size === 0)
    return [...definitions.values()]
  const selectedLocales =
    lookup.localeSelection.mode === 'requested'
      ? lookup.localeSelection.locales.map(locale => locale.toLowerCase())
      : undefined
  const hashes = [...new Set(rows.map(row => row.versionHash))]
  const labels = (
    await Promise.all(
      dbs.flatMap(db =>
        chunks(hashes).map(batch =>
          db
            .select()
            .from(statsFieldsI18n)
            .where(
              and(
                inArray(statsFieldsI18n.versionHash, batch),
                selectedLocales
                  ? sql`lower(${statsFieldsI18n.locale}) in (select value from json_each(${JSON.stringify(selectedLocales)}))`
                  : undefined,
              ),
            )
            .all(),
        ),
      ),
    )
  ).flat()
  for (const row of labels) {
    const definition = definitions.get(
      `${row.datasetCode}\u0000${row.fieldName}\u0000${row.versionHash}`,
    )
    if (definition)
      definition.i18n[row.locale.toLowerCase()] = {
        name: row.name,
        description: row.description,
        isTranslationVerified: row.isTranslationVerified,
      }
  }
  return [...definitions.values()]
}

export async function listStatisticMeasureDefinitions(
  dbs: StatisticDatabase[],
  lookup: DictionaryLookup,
): Promise<StatisticMeasureDefinition[]> {
  const rows = (
    await Promise.all(
      dbs.flatMap(db =>
        chunks([...new Set(lookup.datasetCodes)]).map(datasetCodes =>
          db
            .select()
            .from(statsMeasures)
            .where(
              and(
                inArray(statsMeasures.datasetCode, datasetCodes),
                sql`exists (select 1 from ${statsFields} where ${statsFields.datasetCode} = ${statsMeasures.datasetCode}
        and ${statsFields.measureCode} = ${statsMeasures.measureCode} and ${statsFields.measureVersionHash} = ${statsMeasures.versionHash}
        and ${referencedFieldCondition(lookup)})`,
              ),
            )
            .all(),
        ),
      ),
    )
  ).flat()
  const definitions = new Map<string, StatisticMeasureDefinition>()
  for (const row of rows.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  )) {
    const key = `${row.datasetCode}\u0000${row.measureCode}\u0000${row.versionHash}`
    if (!definitions.has(key))
      definitions.set(key, {
        datasetCode: row.datasetCode,
        measureCode: row.measureCode,
        versionHash: row.versionHash,
        i18n: {},
      })
  }
  if (lookup.localeSelection.mode === 'none' || definitions.size === 0)
    return [...definitions.values()]
  const selectedLocales =
    lookup.localeSelection.mode === 'requested'
      ? lookup.localeSelection.locales.map(locale => locale.toLowerCase())
      : undefined
  const labels = (
    await Promise.all(
      dbs.flatMap(db =>
        chunks([...new Set(rows.map(row => row.versionHash))]).map(batch =>
          db
            .select()
            .from(statsMeasuresI18n)
            .where(
              and(
                inArray(statsMeasuresI18n.versionHash, batch),
                selectedLocales
                  ? sql`lower(${statsMeasuresI18n.locale}) in (select value from json_each(${JSON.stringify(selectedLocales)}))`
                  : undefined,
              ),
            )
            .all(),
        ),
      ),
    )
  ).flat()
  for (const row of labels) {
    const definition = definitions.get(
      `${row.datasetCode}\u0000${row.measureCode}\u0000${row.versionHash}`,
    )
    if (definition)
      definition.i18n[row.locale.toLowerCase()] = {
        name: row.name,
        description: row.description,
        isTranslationVerified: row.isTranslationVerified,
      }
  }
  return [...definitions.values()]
}

export async function isStatisticPublicationReady(
  db: CurrentDatabase,
  selection: StatisticReadSelection,
) {
  if (selection.mode === 'history') return true
  const table = currentSchema.statsPublicationState
  const publications = [
    ...new Map(
      selection.publications.map(scope => [
        `${scope.datasetCode}\u0000${scope.referencePeriodCode}`,
        scope,
      ]),
    ).values(),
  ]
  if (publications.length === 0) return false
  const row = await db
    .select({ count: sql<number>`count(*)` })
    .from(table)
    .where(
      and(
        eq(table.status, 'current'),
        sql`exists (select 1 from json_each(${JSON.stringify(publications)}) as publication
      where json_extract(publication.value, '$.datasetCode') = ${table.datasetCode}
      and json_extract(publication.value, '$.referencePeriodCode') = ${table.referencePeriodCode}
      and json_extract(publication.value, '$.snapshotId') = ${table.snapshotId})`,
      ),
    )
    .get()
  return Number(row?.count ?? 0) === publications.length
}
