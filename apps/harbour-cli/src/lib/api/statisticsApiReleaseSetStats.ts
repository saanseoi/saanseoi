import { and, eq, inArray, historySchema, metaSchema } from '@repo/db'
import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  listApiReleaseSetSnapshots,
  listSnapshotSourceReleases,
} from '@repo/core/db/metaRegistry'
import { chunkArray } from '@repo/core/pipeline/utils'
import { readStatisticSnapshotRecords } from '@repo/core/pipeline/services/statistics/statisticSnapshotRecords'
import type { ApiReleaseSetScopedStatsRow } from '@repo/db/metaSchema'
import type { DivisionHistoryTarget } from './divisionApiReleaseSetStats'
import { buildStatisticsRecordChurn } from './statisticsApiRecordChurn'

type RecordRow = typeof historySchema.statsRecords.$inferSelect
type Field = typeof historySchema.statsFields.$inferSelect
type Label = typeof historySchema.statsFieldsI18n.$inferSelect
export type StatisticsStatsData = {
  records: RecordRow[]
  fields: Field[]
  labels: Label[]
}
const key = (...parts: string[]) => JSON.stringify(parts)

export async function listStatisticsStatsReleases(db: HarbourReadableDb) {
  const rows = await db
    .select({
      id: metaSchema.metaApiReleaseSets.id,
      code: metaSchema.metaApiReleaseSets.code,
      apiVersionId: metaSchema.metaApiReleaseSets.apiVersionId,
      domainCode: metaSchema.metaApiReleaseSets.domainCode,
      regionCode: metaSchema.metaApiReleaseSets.regionCode,
      cohortKey: metaSchema.metaApiReleaseSets.cohortKey,
      revision: metaSchema.metaApiReleaseSets.revision,
    })
    .from(metaSchema.metaApiReleaseSets)
    .innerJoin(
      metaSchema.metaApiVersions,
      eq(metaSchema.metaApiVersions.id, metaSchema.metaApiReleaseSets.apiVersionId),
    )
    .where(
      and(
        eq(metaSchema.metaApiVersions.familyType, 'stats'),
        inArray(metaSchema.metaApiReleaseSets.status, ['current', 'archived']),
      ),
    )
    .all()
  return rows.sort(
    (a, b) => a.cohortKey.localeCompare(b.cohortKey) || a.revision - b.revision,
  )
}

/** Resolve the frozen publication branch and its exact reference period. */
export async function readStatisticsStatsData(
  metaDb: HarbourReadableDb,
  targets: DivisionHistoryTarget[],
  release: { id: string; cohortKey: string },
): Promise<StatisticsStatsData> {
  const snapshots = (await listApiReleaseSetSnapshots(metaDb, release.id)).filter(
    row => row.snapshotResourceType === 'divisionStatistic',
  )
  const sources = await listSnapshotSourceReleases(
    metaDb,
    snapshots.map(row => row.snapshotId),
  )
  if (!sources.length)
    throw new Error(`No Statistics source membership for ${release.id}`)
  const data: StatisticsStatsData = { records: [], fields: [], labels: [] }
  const databases = targets.map(target => target.db as HarbourReadableDb)
  const records = new Map<string, RecordRow>()
  for (const snapshot of snapshots) {
    for (const row of await readStatisticSnapshotRecords(
      metaDb,
      databases,
      snapshot.snapshotId,
    )) {
      if (row.referencePeriodCode !== release.cohortKey) continue
      const previous = records.get(row.id)
      if (previous && previous.versionHash !== row.versionHash)
        throw new Error(`Conflicting Statistics versions for ${row.id}`)
      records.set(row.id, row)
    }
  }
  data.records = [...records.values()]
  const used = new Set(
    data.records.flatMap(row =>
      Object.keys(row.values).map(field => {
        const version = row.fieldDefinitionHashes[field]
        if (!version)
          throw new Error(`Missing definition version for ${row.datasetCode}:${field}`)
        return key(row.datasetCode, field, version)
      }),
    ),
  )
  const hashes = [
    ...new Set(data.records.flatMap(row => Object.values(row.fieldDefinitionHashes))),
  ]
  const fields = new Map<string, Field>()
  const labels = new Map<string, Label>()
  for (const db of databases) {
    for (const batch of chunkArray(hashes, 90)) {
      const definitions = await db
        .select()
        .from(historySchema.statsFields)
        .where(inArray(historySchema.statsFields.versionHash, batch))
        .all()
      for (const row of definitions as Field[]) {
        const identity = key(row.datasetCode, row.fieldName, row.versionHash)
        if (used.has(identity)) fields.set(identity, row)
      }
      const localisations = await db
        .select()
        .from(historySchema.statsFieldsI18n)
        .where(inArray(historySchema.statsFieldsI18n.versionHash, batch))
        .all()
      for (const row of localisations as Label[])
        if (used.has(key(row.datasetCode, row.fieldName, row.versionHash)))
          labels.set(
            key(row.datasetCode, row.fieldName, row.versionHash, row.locale),
            row,
          )
    }
  }
  data.fields = [...fields.values()]
  data.labels = [...labels.values()]
  for (const identity of used)
    if (!fields.has(identity))
      throw new Error(`Missing retained Statistics definition ${identity}`)

  if (!data.records.length)
    throw new Error(`No retained Statistics records for ${release.id}`)
  for (const dataset of new Set(sources.map(row => row.datasetCode))) {
    if (!data.records.some(row => row.datasetCode === dataset))
      throw new Error(
        `Missing retained Statistics records for ${dataset} in ${release.cohortKey}`,
      )
  }

  return data
}

export function buildStatisticsStatsRows(
  data: StatisticsStatsData,
  previous?: StatisticsStatsData,
) {
  const rows: ApiReleaseSetScopedStatsRow[] = []
  const timestamp = new Date().toISOString()
  const add = (
    dimension: string,
    value: number,
    groupBy: string | null = null,
    groupValue: string | null = null,
    metric = 'count',
    metricUnit = 'count',
  ) =>
    rows.push({
      dimension,
      value,
      groupBy,
      groupValue,
      metric,
      metricUnit,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  const distribute = (dimension: string, groupBy: string, values: Iterable<string>) => {
    const counts = new Map<string, number>()
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
    for (const [value, count] of [...counts].sort(([a], [b]) => a.localeCompare(b)))
      add(dimension, count, groupBy, value)
  }
  const fields = new Map(
    data.fields.map(row => [key(row.datasetCode, row.fieldName, row.versionHash), row]),
  )
  const observations: {
    field: string
    period: string
    status: string
    kind: string
  }[] = []
  for (const record of data.records)
    for (const [field, value] of Object.entries(record.values)) {
      if (
        !fields.has(
          key(record.datasetCode, field, record.fieldDefinitionHashes[field] ?? ''),
        )
      )
        throw new Error(`Missing definition for ${record.datasetCode}:${field}`)
      observations.push({
        field: `${record.datasetCode}:${field}`,
        period: record.referencePeriodCode,
        status:
          value === 'suppressed' || value === '**'
            ? 'suppressed'
            : ['unavailable', '-', '–', 'N.A.', 'NA'].includes(value)
              ? 'unavailable'
              : 'published',
        kind: /^[+-]?\d+(?:\.\d+)?$/.test(value) ? 'numeric' : 'categorical',
      })
    }
  add('records', data.records.length)
  add('observations', observations.length)
  add('fields', fields.size)
  add(
    'measures',
    new Set(data.fields.map(row => key(row.datasetCode, row.measureCode))).size,
  )
  add('datasets', new Set(data.records.map(row => row.datasetCode)).size)
  add(
    'reference_periods',
    new Set(data.records.map(row => row.referencePeriodCode)).size,
  )
  distribute(
    'records',
    'dataset',
    data.records.map(row => row.datasetCode),
  )
  distribute(
    'records',
    'geographyKind',
    data.records.map(row => row.geography.kind),
  )
  distribute(
    'records',
    'divisionLinkage',
    data.records.map(row => (row.divisionId ? 'linked' : 'unlinked')),
  )
  for (const [group, property] of [
    ['field', 'field'],
    ['referencePeriod', 'period'],
    ['observationStatus', 'status'],
    ['valueKind', 'kind'],
  ] as const)
    distribute(
      'observations',
      group,
      observations.map(row => row[property]),
    )
  for (const group of ['statisticKind', 'aggregation', 'unitCode'] as const)
    distribute(
      'fields',
      group,
      data.fields.map(row => row[group]),
    )
  const labels = data.labels.filter(
    row =>
      fields.has(key(row.datasetCode, row.fieldName, row.versionHash)) &&
      row.name.trim(),
  )
  for (const locale of ['en', 'zh-hant', 'zh-hans']) {
    const selected = labels.filter(row => row.locale.toLowerCase() === locale)
    add('field_labels', selected.length, 'locale', locale)
    add(
      'field_label_coverage',
      fields.size ? (selected.length / fields.size) * 100 : 0,
      'locale',
      locale,
      'coverage',
      'percentage',
    )
    add(
      'unverified_field_labels',
      selected.filter(row => !row.isTranslationVerified).length,
      'locale',
      locale,
    )
  }
  for (const [dimension, value] of Object.entries(
    buildStatisticsRecordChurn(data.records, previous?.records),
  ))
    add(dimension, value, null, null, 'churn')

  // Structural identity counts are independent of record value changes.
  if (previous) {
    const structures = (value: StatisticsStatsData) => ({
      fields: new Set(value.fields.map(row => key(row.datasetCode, row.fieldName))),
      measures: new Set(value.fields.map(row => key(row.datasetCode, row.measureCode))),
      geographies: new Set(
        value.records.map(row =>
          key(
            row.datasetCode,
            row.geography.kind,
            row.geography.code,
            row.geography.class ?? '',
            row.geography.namespace ?? '',
          ),
        ),
      ),
    })
    const current = structures(data),
      before = structures(previous)
    for (const group of ['fields', 'measures', 'geographies'] as const) {
      add('count', current[group].size, 'structural', group, 'churn')
      add(
        'added_count',
        [...current[group]].filter(id => !before[group].has(id)).length,
        'structural',
        group,
        'churn',
      )
      add(
        'removed_count',
        [...before[group]].filter(id => !current[group].has(id)).length,
        'structural',
        group,
        'churn',
      )
      add(
        'unchanged_count',
        [...current[group]].filter(id => before[group].has(id)).length,
        'structural',
        group,
        'churn',
      )
    }
  }
  return rows
}

export async function buildStatisticsApiStats(
  metaDb: HarbourReadableDb,
  targets: DivisionHistoryTarget[],
  id: string,
) {
  const releases = await listStatisticsStatsReleases(metaDb)
  const index = releases.findIndex(row => row.id === id),
    release = releases[index]
  if (!release) throw new Error(`Published Statistics API release set not found: ${id}`)
  const previous = releases
    .slice(0, index)
    .findLast(
      row =>
        row.apiVersionId === release.apiVersionId &&
        row.domainCode === release.domainCode &&
        row.regionCode === release.regionCode &&
        row.cohortKey.replace(/\d/g, '') === release.cohortKey.replace(/\d/g, ''),
    )
  return buildStatisticsStatsRows(
    await readStatisticsStatsData(metaDb, targets, release),
    previous ? await readStatisticsStatsData(metaDb, targets, previous) : undefined,
  )
}
