import { and, desc, eq, historySchema, inArray, metaSchema, stats } from '@repo/db'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { readStatisticSnapshotRecords } from '@repo/core/pipeline/services/statistics/statisticSnapshotRecords.ts'
import { chunkArray } from '@repo/core/pipeline/utils.ts'

/** Source assertion counts remain available when a reissue reuses canonical packs. */
export async function readStatisticsSourceMeasures(input: {
  metaDb: HarbourReadableDb
  historyDbs: HarbourReadableDb[]
  datasetCode: string
  sourceReleaseId: string
  includeUnobserved?: boolean
}) {
  const release = await input.metaDb
    .select({ id: metaSchema.metaReleases.id })
    .from(metaSchema.metaReleases)
    .where(
      and(
        eq(metaSchema.metaReleases.sourceReleaseId, input.sourceReleaseId),
        eq(metaSchema.metaReleases.resourceType, 'divisionStatistic'),
      ),
    )
    .get()
  if (!release) return []
  const assertions = await input.metaDb
    .select({ fieldName: stats.groupValue, count: stats.value })
    .from(stats)
    .where(
      and(
        eq(stats.releaseId, release.id),
        eq(stats.dimension, 'observations'),
        eq(stats.groupBy, 'field'),
        eq(stats.metric, 'count'),
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
      metaSchema.metaSnapshotSources,
      eq(metaSchema.metaSnapshotSources.snapshotId, metaSchema.metaSnapshots.id),
    )
    .where(
      and(
        eq(metaSchema.metaSnapshotSources.resourceReleaseId, release.id),
        eq(metaSchema.metaSnapshots.resourceType, 'divisionStatistic'),
      ),
    )
    .orderBy(
      desc(metaSchema.metaSnapshots.revision),
      desc(metaSchema.metaSnapshots.createdAt),
    )
    .all()
  const selectedCohorts = new Set<string>()
  const references = new Map<string, { hash: string; assertedHere: boolean }>()
  for (const snapshot of snapshots) {
    const cohort = JSON.stringify([snapshot.lineage, snapshot.cohort])
    if (selectedCohorts.has(cohort)) continue
    selectedCohorts.add(cohort)
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
  const hashes = [...new Set([...references.values()].map(reference => reference.hash))]
  for (const db of input.historyDbs) {
    for (const batch of chunkArray(hashes, 90)) {
      const fields = await db
        .select({
          definition: historySchema.statsFieldsI18n.description,
          aggregation: historySchema.statsFields.aggregation,
          fieldName: historySchema.statsFields.fieldName,
          versionHash: historySchema.statsFields.versionHash,
          name: historySchema.statsFieldsI18n.name,
          sourceField: historySchema.statsFields.sourceField,
          statisticKind: historySchema.statsFields.statisticKind,
          unitCode: historySchema.statsFields.unitCode,
          valueKind: historySchema.statsFields.valueKind,
        })
        .from(historySchema.statsFields)
        .leftJoin(
          historySchema.statsFieldsI18n,
          and(
            eq(
              historySchema.statsFieldsI18n.datasetCode,
              historySchema.statsFields.datasetCode,
            ),
            eq(
              historySchema.statsFieldsI18n.fieldName,
              historySchema.statsFields.fieldName,
            ),
            eq(
              historySchema.statsFieldsI18n.versionHash,
              historySchema.statsFields.versionHash,
            ),
            eq(historySchema.statsFieldsI18n.locale, 'en'),
          ),
        )
        .where(
          and(
            eq(historySchema.statsFields.datasetCode, input.datasetCode),
            inArray(historySchema.statsFields.versionHash, batch),
          ),
        )
        .all()
      for (const row of fields)
        if (references.get(row.fieldName)?.hash === row.versionHash)
          rows.set(row.fieldName, row)
    }
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
