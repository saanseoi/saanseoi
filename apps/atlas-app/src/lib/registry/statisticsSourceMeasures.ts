import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { readHistoryDictionaryVersions } from '@repo/core/pipeline/db/historyDictionaries.ts'
import { readStatisticSnapshotRecords } from '@repo/core/pipeline/services/statistics/statisticSnapshotRecords.ts'
import { and, desc, eq, metaSchema, stats } from '@repo/db'

/** Source assertion counts remain available when a reissue reuses canonical packs. */
export async function readStatisticsSourceMeasures(input: {
  metaDb: HarbourReadableDb
  historyDbs: HarbourReadableDb[]
  datasetCode: string
  sourceReleaseId: string
  includeUnobserved?: boolean
}) {
  const release = await input.metaDb
    .select({ id: metaSchema.metaResourceReleases.id })
    .from(metaSchema.metaResourceReleases)
    .where(
      and(
        eq(metaSchema.metaResourceReleases.sourceReleaseId, input.sourceReleaseId),
        eq(metaSchema.metaResourceReleases.resourceType, 'divisionStatistic'),
      ),
    )
    .get()
  if (!release) return []
  const assertions = await input.metaDb
    .select({ fieldName: stats.dimensionValue, count: stats.value })
    .from(stats)
    .where(
      and(
        eq(stats.resourceReleaseId, release.id),
        eq(stats.category, 'observations'),
        eq(stats.dimension, 'field'),
        eq(stats.measure, 'count'),
      ),
    )
    .all()
  const counts = new Map(
    assertions.flatMap(row =>
      row.fieldName ? [[row.fieldName, row.count] as const] : [],
    ),
  )
  const snapshots = await input.metaDb
    .select({
      id: metaSchema.metaSnapshots.id,
      lineage: metaSchema.metaSnapshots.snapshotLineageId,
      cohort: metaSchema.metaSnapshots.cohortKey,
    })
    .from(metaSchema.metaSnapshots)
    .innerJoin(
      metaSchema.metaSnapshotLineages,
      eq(
        metaSchema.metaSnapshots.snapshotLineageId,
        metaSchema.metaSnapshotLineages.id,
      ),
    )
    .innerJoin(
      metaSchema.metaSnapshotResourceReleases,
      eq(
        metaSchema.metaSnapshotResourceReleases.snapshotId,
        metaSchema.metaSnapshots.id,
      ),
    )
    .where(
      and(
        eq(metaSchema.metaSnapshotResourceReleases.resourceReleaseId, release.id),
        eq(metaSchema.metaSnapshotLineages.resourceType, 'divisionStatistic'),
      ),
    )
    .orderBy(
      desc(metaSchema.metaSnapshots.revision),
      desc(metaSchema.metaSnapshots.createdAt),
    )
    .all()
  const selectedCohorts = new Set<string>()
  const ancestorIds = new Set<string>()
  const references = new Map<string, { hash: string; assertedHere: boolean }>()
  for (const snapshot of snapshots) {
    const cohort = JSON.stringify([snapshot.lineage, snapshot.cohort])
    if (selectedCohorts.has(cohort)) continue
    selectedCohorts.add(cohort)
    for (const step of await resolveSnapshotReplayPlan(input.metaDb, snapshot.id))
      ancestorIds.add(step.snapshotId)
    const records = await readStatisticSnapshotRecords(
      input.metaDb,
      input.historyDbs,
      snapshot.id,
    )
    for (const record of records) {
      if (
        record.datasetCode !== input.datasetCode ||
        record.referencePeriodCode !== snapshot.cohort
      )
        continue
      for (const fieldName of Object.keys(record.values)) {
        if (!counts.has(fieldName)) continue
        const hash = record.fieldDefinitionHashes[fieldName]
        if (!hash) throw new Error(`Missing statistic field definition: ${fieldName}`)
        const assertedHere =
          record.fieldSources[fieldName]?.sourceReleaseId === release.id
        const previous = references.get(fieldName)
        if (!previous || (assertedHere && !previous.assertedHere))
          references.set(fieldName, { hash, assertedHere })
      }
    }
  }
  const rows = new Map<
    string,
    {
      definition: string | null
      aggregation: string
      fieldName: string
      name: string | null
      sourceField: string
      statisticKind: string
      unitCode: string
      valueKind: string
    }
  >()
  const wanted = [...references].map(([identity, reference]) => ({
    datasetCode: input.datasetCode,
    identity,
    versionHash: reference.hash,
  }))
  const fields = await readHistoryDictionaryVersions(
    input.historyDbs,
    [...ancestorIds],
    'statsFields',
    wanted,
  )
  const labels = await readHistoryDictionaryVersions(
    input.historyDbs,
    [...ancestorIds],
    'statsFieldsI18n',
    wanted,
  )
  for (const field of fields) {
    const label = labels.find(
      row =>
        row.datasetCode === field.datasetCode &&
        row.fieldName === field.fieldName &&
        row.versionHash === field.versionHash &&
        row.locale === 'en',
    )
    rows.set(String(field.fieldName), {
      fieldName: String(field.fieldName),
      aggregation: String(field.aggregation),
      sourceField: String(field.sourceField),
      statisticKind: String(field.statisticKind),
      unitCode: String(field.unitCode),
      valueKind: String(field.valueKind),
      definition: label?.description == null ? null : String(label.description),
      name: label?.name == null ? null : String(label.name),
    })
  }
  for (const fieldName of references.keys())
    if (!rows.has(fieldName))
      throw new Error(`Missing retained statistic definition: ${fieldName}`)
  return [...rows.values()]
    .sort((a, b) => a.sourceField.localeCompare(b.sourceField))
    .map(row => ({
      definition: row.definition,
      aggregation: row.aggregation,
      name: row.name ?? row.sourceField,
      observationCount: counts.get(row.fieldName) ?? 0,
      sourceField: row.sourceField,
      statisticKind: row.statisticKind,
      unitCode: row.unitCode,
      valueKind: row.valueKind,
    }))
}
