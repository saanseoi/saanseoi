import type { RequestedApiLocaleSelection } from '@repo/core'
import type { ResolvedSnapshotVersion } from '@repo/core/pipeline/db/snapshotReplay.ts'
import { historyVersionSelection } from '@repo/core/pipeline/db/snapshotReplay.ts'
import { resolveStatisticEvents } from '@repo/core/pipeline/services/statistics/statisticSnapshotRecords.ts'
import type {
  CanonicalStatsGeography,
  CurrentDatabase,
  HistoryDatabase,
  StatsAggregation,
  StatsFieldComparability,
  StatsPeriodicity,
  StatsStatisticKind,
} from '@repo/db'
import {
  and,
  asc,
  currentSchema,
  eq,
  getTableColumns,
  historySchema,
  inArray,
  sql,
  statisticDefinitionHashes,
} from '@repo/db'
import {
  GeographicCrosswalkUnavailableError,
  geographicFilterContext,
  geographicMembershipSql,
} from '../lib/geographicFilterContext'

const { statsRecords, statsFields, statsFieldsI18n, statsMeasures, statsMeasuresI18n } =
  currentSchema
const D1_QUERY_BATCH_SIZE = 30

export type StatisticDatabase = CurrentDatabase | HistoryDatabase
export type StatisticReadSelection = {
  mode: 'current' | 'history'
  snapshotProducers?: Record<string, string | Record<string, string>>
  datasetCodes: string[]
  /** Root-to-leaf snapshot ancestry. Descendants supply only changed versions. */
  snapshotIds: string[]
  publications: Array<{
    datasetCode: string
    referencePeriodCode: string
    snapshotId: string
  }>
}

/** Derived provenance is selected without asking a HISTORY shard for META columns. */
function statisticProducerColumn(selection: StatisticReadSelection) {
  if (selection.mode === 'current') return statsRecords.sourceReleaseId
  const producers = selection.snapshotProducers
  if (!producers || selection.snapshotIds.some(id => !producers[id]))
    throw new Error(
      'Historical Statistics require the producer of every introducing snapshot.',
    )
  return sql<string>`case json_type(${JSON.stringify(producers)}, '$.' || json_quote(${historySchema.statsRecords.snapshotId})) when 'text' then json_extract(${JSON.stringify(producers)}, '$.' || json_quote(${historySchema.statsRecords.snapshotId})) else json_extract(${JSON.stringify(producers)}, '$.' || json_quote(${historySchema.statsRecords.snapshotId}) || '.' || json_quote(${statsRecords.datasetCode})) end`.as(
    'sourceReleaseId',
  )
}
function statisticRecordColumns(selection: StatisticReadSelection) {
  return {
    ...getTableColumns(statsRecords),
    sourceReleaseId: statisticProducerColumn(selection),
  }
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
      meta: import('@repo/db').I18nMeta
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
      meta: import('@repo/db').I18nMeta
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
  applyGeographic = true,
) {
  return and(
    sql`exists (select 1 from json_each(${JSON.stringify(selection.publications)}) as publication
      where json_extract(publication.value, '$.datasetCode') = ${statsRecords.datasetCode}
      and json_extract(publication.value, '$.referencePeriodCode') = ${statsRecords.referencePeriodCode})`,
    applyGeographic
      ? geographicMembershipSql(sql`json_array(${statsRecords.divisionId})`, {
          domain: sql`json_extract(${statsRecords.geography}, '$.areaCompanion.domainCode')`,
          cohort: sql`json_extract(${statsRecords.geography}, '$.areaCompanion.cohortKey')`,
        })
      : undefined,
    filters.datasetCode ? eq(statsRecords.datasetCode, filters.datasetCode) : undefined,
    filters.divisionId ? eq(statsRecords.divisionId, filters.divisionId) : undefined,
    filters.referencePeriod
      ? eq(statsRecords.referencePeriodCode, filters.referencePeriod)
      : undefined,
    filters.fieldName
      ? sql`json_type(${statsRecords.values}, '$.' || ${filters.fieldName}) is not null`
      : undefined,
    selection.mode === 'history'
      ? historyVersionSelection(
          historySchema.statsRecords,
          historySelections.get(selection) ?? [],
        )
      : undefined,
  )
}

function mapStatisticRecord(
  row: typeof statsRecords.$inferSelect & {
    fieldDefinitionHashes: Record<string, string>
  },
): StatisticRecord {
  if (!row.fieldDefinitionHashes)
    throw new Error(`Missing statistic definition set ${row.definitionSetId}.`)
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

async function assertStatisticCrosswalks(
  dbs: StatisticDatabase[],
  selection: StatisticReadSelection,
  filters: StatisticFilters = {},
) {
  await prepareHistorySelection(dbs, selection)
  const context = geographicFilterContext()
  if (!context?.groups.length) return
  for (const db of dbs) {
    const domain = sql<string>`json_extract(${statsRecords.geography}, '$.areaCompanion.domainCode')`
    const cohort = sql<string>`json_extract(${statsRecords.geography}, '$.areaCompanion.cohortKey')`
    const companions = await db
      .selectDistinct({ domain, cohort })
      .from(statsRecords)
      .where(
        and(
          statisticConditions(selection, filters, false),
          sql`${domain} = 'hkgov-pland-pu'`,
        ),
      )
      .all()
    for (const companion of companions)
      if (
        !context.crosswalkSelections?.some(
          row =>
            row.sourceDomain === companion.domain &&
            row.sourceCohort === companion.cohort,
        )
      )
        throw new GeographicCrosswalkUnavailableError(
          `No crosswalk for ${companion.domain}@${companion.cohort} and ${context.releaseSet}.`,
        )
  }
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
  await assertStatisticCrosswalks(dbs, lookup.selection, lookup.filters)
  const rows = (
    await Promise.all(
      dbs.map(db =>
        db
          .select({
            ...statisticRecordColumns(lookup.selection),
            fieldDefinitionHashes: statisticDefinitionHashes.as(
              'fieldDefinitionHashes',
            ),
          })
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
  await assertStatisticCrosswalks(dbs, lookup.selection, lookup)
  const rows = (
    await Promise.all(
      dbs.map(db =>
        db
          .select({
            id: statsRecords.id,
            datasetCode: statsRecords.datasetCode,
            sourceReleaseId: statisticProducerColumn(lookup.selection),
            sourceFeatureRef: statsRecords.sourceFeatureRef,
            divisionId: statsRecords.divisionId,
            referencePeriodCode: statsRecords.referencePeriodCode,
            referencePeriodStart: statsRecords.referencePeriodStart,
            referencePeriodEnd: statsRecords.referencePeriodEnd,
            referencePeriodEndYear: statsRecords.referencePeriodEndYear,
            referencePeriodGranularity: statsRecords.referencePeriodGranularity,
            geography: statsRecords.geography,
            value: sql<string>`json_extract(${statsRecords.values}, '$.' || ${lookup.fieldName})`,
            fieldDefinitionHash: sql<string>`json_extract(${statisticDefinitionHashes}, '$.' || ${lookup.fieldName})`,
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
  await assertStatisticCrosswalks(dbs, lookup.selection, lookup.filters)
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
  await assertStatisticCrosswalks(dbs, lookup.selection, {
    referencePeriod: lookup.cohortKey,
  })
  const rows = await Promise.all(
    dbs.map(db =>
      db
        .select({
          ...statisticRecordColumns(lookup.selection),
          fieldDefinitionHashes: statisticDefinitionHashes.as('fieldDefinitionHashes'),
        })
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
    and json_extract(${statisticDefinitionHashes}, '$.' || ${statsFields.fieldName}) = ${statsFields.versionHash})`
}

export async function listStatisticFieldDefinitions(
  dbs: StatisticDatabase[],
  lookup: DictionaryLookup,
): Promise<StatisticFieldDefinition[]> {
  await prepareHistorySelection(dbs, lookup.selection)
  if (lookup.selection.mode === 'history')
    return (await historicalDictionaryMetadata(dbs, lookup)).fields
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
        meta: row.meta,
      }
  }
  return [...definitions.values()]
}

export async function listStatisticMeasureDefinitions(
  dbs: StatisticDatabase[],
  lookup: DictionaryLookup,
): Promise<StatisticMeasureDefinition[]> {
  await prepareHistorySelection(dbs, lookup.selection)
  if (lookup.selection.mode === 'history')
    return (await historicalDictionaryMetadata(dbs, lookup)).measures
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
        meta: row.meta,
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

const historySelections = new WeakMap<
  StatisticReadSelection,
  Array<
    Pick<
      ResolvedSnapshotVersion,
      'recordType' | 'recordId' | 'locale' | 'snapshotId' | 'versionHash'
    >
  >
>()

async function prepareHistorySelection(
  dbs: StatisticDatabase[],
  selection: StatisticReadSelection,
) {
  if (selection.mode !== 'history' || historySelections.has(selection)) return
  const groups = await resolveStatisticEvents(dbs as never, selection.snapshotIds, [
    'statsRecord',
  ])
  const events = [...groups.values()].flat()
  for (const event of events) {
    const producer = selection.snapshotProducers?.[event.snapshotId]
    if (
      !producer ||
      (typeof producer !== 'string' && !producer[event.producerDatasetCode ?? ''])
    )
      throw new Error(
        `Missing Statistics producer for ${event.snapshotId}/${event.producerDatasetCode ?? 'default'}.`,
      )
  }
  historySelections.set(selection, events)
}

async function historicalDictionaryMetadata(
  dbs: StatisticDatabase[],
  lookup: DictionaryLookup,
) {
  const { readHistoryDictionaryVersions } = await import(
    '@repo/core/pipeline/db/historyDictionaries.ts'
  )
  const records =
    lookup.records ??
    (
      await Promise.all(
        dbs.map(db =>
          db
            .select({
              ...statisticRecordColumns(lookup.selection),
              fieldDefinitionHashes: statisticDefinitionHashes.as(
                'fieldDefinitionHashes',
              ),
            })
            .from(statsRecords)
            .where(statisticConditions(lookup.selection))
            .all(),
        ),
      )
    )
      .flat()
      .map(mapStatisticRecord)
  const references = [
    ...new Map(
      records.flatMap(record =>
        Object.entries(record.fieldDefinitionHashes).map(([identity, versionHash]) => {
          const reference = { datasetCode: record.datasetCode, identity, versionHash }
          return [JSON.stringify(reference), reference] as const
        }),
      ),
    ).values(),
  ]
  const fields = await readHistoryDictionaryVersions(
    dbs as never,
    lookup.selection.snapshotIds,
    'statsFields',
    references,
  )
  const measureRefs = [
    ...new Map(
      fields.map(field => {
        const ref = {
          datasetCode: String(field.datasetCode),
          identity: String(field.measureCode),
          versionHash: String(field.measureVersionHash),
        }
        return [JSON.stringify(ref), ref] as const
      }),
    ).values(),
  ]
  const measures = await readHistoryDictionaryVersions(
    dbs as never,
    lookup.selection.snapshotIds,
    'statsMeasures',
    measureRefs,
  )
  if (fields.length !== references.length || measures.length !== measureRefs.length)
    throw new Error('Missing historical Statistics definitions.')
  const localeSelected = (locale: string) =>
    lookup.localeSelection.mode === 'all' ||
    (lookup.localeSelection.mode === 'requested' &&
      lookup.localeSelection.locales.some(
        value => value.toLowerCase() === locale.toLowerCase(),
      ))
  const labels =
    lookup.localeSelection.mode === 'none'
      ? []
      : await readHistoryDictionaryVersions(
          dbs as never,
          lookup.selection.snapshotIds,
          'statsFieldsI18n',
          references,
        )
  const measureLabels =
    lookup.localeSelection.mode === 'none'
      ? []
      : await readHistoryDictionaryVersions(
          dbs as never,
          lookup.selection.snapshotIds,
          'statsMeasuresI18n',
          measureRefs,
        )
  const localise = (
    row: Record<string, unknown>,
    names: Record<string, unknown>[],
    identity: string,
  ) =>
    Object.fromEntries(
      names
        .filter(
          name =>
            name.datasetCode === row.datasetCode &&
            name[identity] === row[identity] &&
            name.versionHash === row.versionHash &&
            localeSelected(String(name.locale)),
        )
        .map(name => [
          String(name.locale).toLowerCase(),
          {
            name: name.name,
            description: name.description,
            meta: name.meta,
          },
        ]),
    )
  return {
    fields: fields.map(row => ({
      ...row,
      i18n: localise(row, labels, 'fieldName'),
    })) as StatisticFieldDefinition[],
    measures: measures.map(row => ({
      datasetCode: row.datasetCode,
      measureCode: row.measureCode,
      versionHash: row.versionHash,
      i18n: localise(row, measureLabels, 'measureCode'),
    })) as StatisticMeasureDefinition[],
  }
}
