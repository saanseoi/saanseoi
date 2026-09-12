import {
  readStatisticSnapshotRecords,
  STATISTIC_RECORD_TYPE,
  type RetainedStatisticRecord,
} from '@repo/core/pipeline/services/statistics/statisticSnapshotRecords'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { and, eq, historySchema } from '@repo/db'
import type { CanonicalStatsRows } from './normaliseHkgovCenstatdStatistics'
import { buildCanonicalStatsSqlBatches } from './canonicalStatsSql'
import { hashStatisticContent } from './statisticsRecordIdentity'

type InputRecord = CanonicalStatsRows['records'][number]
type Snapshot = { id: string; parentSnapshotId: string | null; cohortKey: string }
type SnapshotPredecessor = Pick<Snapshot, 'parentSnapshotId' | 'cohortKey'>

/** Publisher provenance is retained separately from the semantic change identity. */
export function statisticContentHash(record: InputRecord) {
  return hashStatisticContent({
    id: record.id,
    datasetCode: record.datasetCode,
    divisionId: record.divisionId,
    geography: record.geography,
    referencePeriodCode: record.referencePeriodCode,
    referencePeriodStart: record.referencePeriodStart,
    referencePeriodEnd: record.referencePeriodEnd,
    referencePeriodEndYear: record.referencePeriodEndYear,
    referencePeriodGranularity: record.referencePeriodGranularity,
    values: record.values,
    fieldDefinitionHashes: record.fieldDefinitionHashes,
  })
}

/** An omitted field is not a withdrawal; supplied unavailable/suppressed values replace it. */
export function mergeStatisticRecord(
  previous: RetainedStatisticRecord | undefined,
  incoming: InputRecord,
  now: string,
): RetainedStatisticRecord | null {
  const values = { ...previous?.values, ...incoming.values }
  const fieldDefinitionHashes = {
    ...previous?.fieldDefinitionHashes,
    ...incoming.fieldDefinitionHashes,
  }
  const fieldSources = { ...previous?.fieldSources }
  for (const field of Object.keys(incoming.values)) {
    const source = incoming.fieldSources[field]
    if (!incoming.fieldDefinitionHashes[field] || !source)
      throw new Error(
        `Statistic ${incoming.id} has no definition or provenance for ${field}.`,
      )
    if (
      !previous ||
      previous.values[field] !== incoming.values[field] ||
      previous.fieldDefinitionHashes[field] !== incoming.fieldDefinitionHashes[field]
    ) {
      fieldSources[field] = source
    }
  }
  const merged = { ...incoming, values, fieldDefinitionHashes, fieldSources }
  const versionHash = statisticContentHash(merged)
  if (previous?.versionHash === versionHash) return null
  return {
    ...merged,
    versionHash,
    isCurrent: true,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Re-issued archives often repeat older periods. Provenance alone must not
 * allocate an immutable Statistics revision when its semantic content matches.
 */
export async function selectStatisticReferencePeriodsWithChanges(args: {
  canonical: CanonicalStatsRows
  metaDb: HarbourReadableDb
  historyDbs: HarbourReadableDb[]
  snapshots: SnapshotPredecessor[]
  now?: string
}) {
  const now = args.now ?? new Date().toISOString()
  const changedPeriods = new Set<string>()
  for (const snapshot of args.snapshots) {
    const previous = new Map(
      (snapshot.parentSnapshotId
        ? await readStatisticSnapshotRecords(
            args.metaDb,
            args.historyDbs,
            snapshot.parentSnapshotId,
          )
        : []
      )
        .filter(row => row.referencePeriodCode === snapshot.cohortKey)
        .map(row => [row.id, row]),
    )
    for (const incoming of args.canonical.records) {
      if (incoming.referencePeriodCode !== snapshot.cohortKey) continue
      if (mergeStatisticRecord(previous.get(incoming.id), incoming, now)) {
        changedPeriods.add(snapshot.cohortKey)
        break
      }
    }
  }
  return changedPeriods
}

/** Stage only real changes. Publication, not ingestion, promotes these into current. */
export async function planCanonicalStatistics(args: {
  canonical: CanonicalStatsRows
  metaDb: HarbourReadableDb
  historyDbs: HarbourReadableDb[]
  snapshots: Snapshot[]
  sourceReleaseId: string
  now?: string
}) {
  const now = args.now ?? new Date().toISOString()
  const changed: RetainedStatisticRecord[] = []
  const changes: Array<{ shardYear: string; row: Record<string, unknown> }> = []
  for (const snapshot of args.snapshots) {
    const previous = new Map(
      (snapshot.parentSnapshotId
        ? await readStatisticSnapshotRecords(
            args.metaDb,
            args.historyDbs,
            snapshot.parentSnapshotId,
          )
        : []
      )
        .filter(row => row.referencePeriodCode === snapshot.cohortKey)
        .map(row => [row.id, row]),
    )
    for (const incoming of args.canonical.records) {
      if (incoming.referencePeriodCode !== snapshot.cohortKey) continue
      const row = mergeStatisticRecord(previous.get(incoming.id), incoming, now)
      if (!row) continue
      changed.push(row)
      changes.push({
        shardYear: row.referencePeriodEndYear,
        row: {
          snapshotId: snapshot.id,
          recordType: STATISTIC_RECORD_TYPE,
          recordId: row.id,
          locale: '',
          versionHash: row.versionHash,
          operation: 'upsert',
          sourceReleaseId: args.sourceReleaseId,
          createdAt: now,
          updatedAt: now,
        },
      })
    }
    // A retry may complete an existing prefix, but must never silently change
    // the meaning of a snapshot whose immutable membership was already staged.
    const expected = new Map(
      changes
        .filter(change => change.row.snapshotId === snapshot.id)
        .map(change => [change.row.recordId, change.row.versionHash]),
    )
    for (const db of args.historyDbs) {
      const staged = await db
        .select()
        .from(historySchema.snapshotVersionChanges)
        .where(
          and(
            eq(historySchema.snapshotVersionChanges.snapshotId, snapshot.id),
            eq(historySchema.snapshotVersionChanges.recordType, STATISTIC_RECORD_TYPE),
          ),
        )
        .all()
      for (const row of staged) {
        if (
          row.operation !== 'upsert' ||
          expected.get(row.recordId) !== row.versionHash
        ) {
          throw new Error(
            `Statistic snapshot ${snapshot.id} already contains a different change for ${row.recordId}. Prepare a new revision.`,
          )
        }
      }
    }
  }
  const versionDictionary = (row: Record<string, unknown>) => ({
    ...row,
    versionHash: row.versionHash ?? hashStatisticContent(row),
    sourceReleaseId: args.sourceReleaseId,
    isCurrent: true,
    createdAt: now,
    updatedAt: now,
  })
  const dictionaries = [
    {
      table: 'statsFields' as const,
      rows: args.canonical.fields.map(versionDictionary),
    },
    {
      table: 'statsFieldsI18n' as const,
      rows: args.canonical.fieldsI18n.map(versionDictionary),
    },
    {
      table: 'statsMeasures' as const,
      rows: args.canonical.measures.map(versionDictionary),
    },
    {
      table: 'statsMeasuresI18n' as const,
      rows: args.canonical.measuresI18n.map(versionDictionary),
    },
    {
      table: 'statsValuesI18n' as const,
      rows: args.canonical.valuesI18n.map(versionDictionary),
    },
  ]
  return {
    changedRecords: changed,
    unchangedRecords: args.canonical.records.length - changed.length,
    buildBatches: (
      resolutions: Parameters<
        typeof buildCanonicalStatsSqlBatches
      >[0]['resolutions'] = [],
    ) =>
      buildCanonicalStatsSqlBatches({
        current: [],
        history: [{ rows: changed, table: 'statsRecords' }],
        changes,
        dictionaries,
        resolutions,
      }),
  }
}
