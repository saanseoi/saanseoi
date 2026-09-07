import type { DatasetProcessingMessage } from '@repo/core'
import {
  and,
  eq,
  metaReleaseShardAssignments,
  metaSnapshotLineages,
  metaSnapshotAssemblyRuns,
  metaSnapshotShardAssignments,
  metaSnapshotSources,
  metaSnapshots,
  releaseProcessingActions,
  stats,
} from '@repo/db'
import type { MetaDatabase } from '@repo/db'
import type {
  DivisionSqlState,
  SqlValue,
} from './processLocalDivisionSqlUploadTypes.ts'
import { jsonText } from './processLocalDivisionSqlUploadPreparation.ts'
import { DIVISION_BATCH_SIZE } from './processLocalDivisionSqlUploadConfig.ts'
import {
  buildInsertStatements,
  sqlLiteral,
} from './processLocalDivisionSqlUploadRows.ts'
import {
  buildDivisionSqlRunId,
  buildSqlImportFile,
} from './processLocalDivisionSqlUploadImport.ts'

export async function buildDivisionMetaSqlFile(
  metaDb: MetaDatabase,
  message: DatasetProcessingMessage,
  state: DivisionSqlState,
  reportProgress: (current: number) => Promise<void>,
) {
  const releaseId = message.releaseId ?? message.datasetId
  const snapshotRow = await metaDb
    .select({
      id: metaSnapshots.id,
      snapshotLineageId: metaSnapshots.snapshotLineageId,
      parentSnapshotId: metaSnapshots.parentSnapshotId,
      resourceType: metaSnapshots.resourceType,
      code: metaSnapshots.code,
      cohortKey: metaSnapshots.cohortKey,
      revision: metaSnapshots.revision,
      status: metaSnapshots.status,
      publishedAt: metaSnapshots.publishedAt,
      validFrom: metaSnapshots.validFrom,
      validTo: metaSnapshots.validTo,
      notes: metaSnapshots.notes,
      createdAt: metaSnapshots.createdAt,
      updatedAt: metaSnapshots.updatedAt,
    })
    .from(metaSnapshots)
    .where(eq(metaSnapshots.id, state.snapshotId))
    .limit(1)
    .get()

  if (!snapshotRow) {
    throw new Error(
      `Division snapshot metadata missing from local meta cache: ${state.snapshotId}.`,
    )
  }

  const snapshotLineageRows = snapshotRow.snapshotLineageId
    ? await metaDb
        .select()
        .from(metaSnapshotLineages)
        .where(eq(metaSnapshotLineages.id, snapshotRow.snapshotLineageId))
        .all()
    : []

  if (snapshotLineageRows.length !== 1) {
    throw new Error(
      `Division snapshot lineage metadata missing for snapshot ${state.snapshotId}.`,
    )
  }

  const snapshotSourceRows = await metaDb
    .select({
      snapshotId: metaSnapshotSources.snapshotId,
      datasetId: metaSnapshotSources.datasetId,
      sourceReleaseId: metaSnapshotSources.sourceReleaseId,
      role: metaSnapshotSources.role,
      selectedByRule: metaSnapshotSources.selectedByRule,
      selectionMode: metaSnapshotSources.selectionMode,
      anchorReleaseId: metaSnapshotSources.anchorReleaseId,
      sourceCohortKey: metaSnapshotSources.sourceCohortKey,
      createdAt: metaSnapshotSources.createdAt,
    })
    .from(metaSnapshotSources)
    .where(eq(metaSnapshotSources.snapshotId, state.snapshotId))
    .all()

  if (!snapshotSourceRows.some(row => row.sourceReleaseId === releaseId)) {
    throw new Error(
      `Division snapshot source metadata missing for release ${releaseId} and snapshot ${state.snapshotId}.`,
    )
  }

  const snapshotAssemblyRunRows = await metaDb
    .select({
      id: metaSnapshotAssemblyRuns.id,
      snapshotId: metaSnapshotAssemblyRuns.snapshotId,
      snapshotAssemblyId: metaSnapshotAssemblyRuns.snapshotAssemblyId,
      anchorReleaseId: metaSnapshotAssemblyRuns.anchorReleaseId,
      anchorCohortKey: metaSnapshotAssemblyRuns.anchorCohortKey,
      status: metaSnapshotAssemblyRuns.status,
      selectionSummaryJson: metaSnapshotAssemblyRuns.selectionSummaryJson,
      createdAt: metaSnapshotAssemblyRuns.createdAt,
      updatedAt: metaSnapshotAssemblyRuns.updatedAt,
    })
    .from(metaSnapshotAssemblyRuns)
    .where(eq(metaSnapshotAssemblyRuns.snapshotId, state.snapshotId))
    .all()
  const serialisedSnapshotAssemblyRunRows = snapshotAssemblyRunRows.map(row => ({
    ...row,
    selectionSummaryJson: jsonText(row.selectionSummaryJson),
  }))

  const releaseShardAssignmentRows = await metaDb
    .select({
      releaseId: metaReleaseShardAssignments.releaseId,
      dataShardId: metaReleaseShardAssignments.dataShardId,
    })
    .from(metaReleaseShardAssignments)
    .where(eq(metaReleaseShardAssignments.releaseId, releaseId))
    .all()

  const snapshotShardAssignmentRows = await metaDb
    .select({
      snapshotId: metaSnapshotShardAssignments.snapshotId,
      dataShardId: metaSnapshotShardAssignments.dataShardId,
    })
    .from(metaSnapshotShardAssignments)
    .where(eq(metaSnapshotShardAssignments.snapshotId, state.snapshotId))
    .all()

  if (releaseShardAssignmentRows.length === 0) {
    throw new Error(
      `Division release shard assignment missing from local meta cache: ${releaseId}.`,
    )
  }

  if (snapshotShardAssignmentRows.length === 0) {
    throw new Error(
      `Division snapshot shard assignment missing from local meta cache: ${state.snapshotId}.`,
    )
  }

  const [auditSql, processingStatsRows] = await Promise.all([
    readAuditReplaySql(metaDb, releaseId),
    metaDb
      .select()
      .from(stats)
      .where(and(eq(stats.releaseId, releaseId), eq(stats.type, 'processing')))
      .all(),
  ])

  const rows: Record<string, SqlValue>[] = []

  for (let index = 0; index < state.statsRows.length; index += DIVISION_BATCH_SIZE) {
    const batch = state.statsRows.slice(index, index + DIVISION_BATCH_SIZE)

    for (const row of batch) {
      rows.push({
        id: crypto.randomUUID(),
        type: row.type,
        releaseId: message.releaseId ?? message.datasetId,
        dimension: row.dimension,
        metric: row.metric,
        metricUnit: row.metricUnit,
        value: row.value,
        groupBy: row.groupBy ?? null,
        groupValue: row.groupValue ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
    }

    await reportProgress(Math.min(index + batch.length, state.statsRows.length))
  }

  for (const row of processingStatsRows) {
    rows.push({
      id: row.id,
      type: row.type,
      releaseId: row.releaseId,
      dimension: row.dimension,
      metric: row.metric,
      metricUnit: row.metricUnit,
      value: row.value,
      groupBy: row.groupBy ?? null,
      groupValue: row.groupValue ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  }

  const statements = [
    ...buildInsertStatements(
      'snapshotLineages',
      [
        'id',
        'code',
        'regionCode',
        'resourceType',
        'variant',
        'identityMode',
        'primaryDatasetId',
        'versionHash',
        'createdAt',
        'updatedAt',
      ],
      snapshotLineageRows,
      {
        suffix: `
ON CONFLICT(id) DO UPDATE SET
  code = excluded.code,
  regionCode = excluded.regionCode,
  resourceType = excluded.resourceType,
  variant = excluded.variant,
  identityMode = excluded.identityMode,
  primaryDatasetId = excluded.primaryDatasetId,
  versionHash = excluded.versionHash,
  createdAt = excluded.createdAt,
  updatedAt = excluded.updatedAt`.trim(),
      },
    ),
    ...buildInsertStatements(
      'snapshots',
      [
        'id',
        'snapshotLineageId',
        'parentSnapshotId',
        'resourceType',
        'code',
        'cohortKey',
        'revision',
        'status',
        'publishedAt',
        'validFrom',
        'validTo',
        'notes',
        'createdAt',
        'updatedAt',
      ],
      [snapshotRow],
      {
        suffix: `
ON CONFLICT(id) DO UPDATE SET
  snapshotLineageId = excluded.snapshotLineageId,
  parentSnapshotId = excluded.parentSnapshotId,
  resourceType = excluded.resourceType,
  code = excluded.code,
  cohortKey = excluded.cohortKey,
  revision = excluded.revision,
  status = excluded.status,
  publishedAt = excluded.publishedAt,
  validFrom = excluded.validFrom,
  validTo = excluded.validTo,
  notes = excluded.notes,
  createdAt = excluded.createdAt,
  updatedAt = excluded.updatedAt`.trim(),
      },
    ),
    ...buildInsertStatements(
      'snapshotSources',
      [
        'snapshotId',
        'datasetId',
        'sourceReleaseId',
        'role',
        'selectedByRule',
        'selectionMode',
        'anchorReleaseId',
        'sourceCohortKey',
        'createdAt',
      ],
      snapshotSourceRows,
      {
        suffix: `
ON CONFLICT(snapshotId, sourceReleaseId) DO UPDATE SET
  datasetId = excluded.datasetId,
  role = excluded.role,
  selectedByRule = excluded.selectedByRule,
  selectionMode = excluded.selectionMode,
  anchorReleaseId = excluded.anchorReleaseId,
  sourceCohortKey = excluded.sourceCohortKey,
  createdAt = excluded.createdAt`.trim(),
      },
    ),
    ...buildInsertStatements(
      'snapshotAssemblyRuns',
      [
        'id',
        'snapshotId',
        'snapshotAssemblyId',
        'anchorReleaseId',
        'anchorCohortKey',
        'status',
        'selectionSummaryJson',
        'createdAt',
        'updatedAt',
      ],
      serialisedSnapshotAssemblyRunRows,
      {
        suffix: `
ON CONFLICT(id) DO UPDATE SET
  snapshotId = excluded.snapshotId,
  snapshotAssemblyId = excluded.snapshotAssemblyId,
  anchorReleaseId = excluded.anchorReleaseId,
  anchorCohortKey = excluded.anchorCohortKey,
  status = excluded.status,
  selectionSummaryJson = excluded.selectionSummaryJson,
  createdAt = excluded.createdAt,
  updatedAt = excluded.updatedAt`.trim(),
      },
    ),
    ...buildInsertStatements(
      'releaseShardAssignments',
      ['releaseId', 'dataShardId'],
      releaseShardAssignmentRows,
      {
        suffix: `ON CONFLICT(releaseId, dataShardId) DO NOTHING`,
      },
    ),
    ...buildInsertStatements(
      'snapshotShardAssignments',
      ['snapshotId', 'dataShardId'],
      snapshotShardAssignmentRows,
      {
        suffix: `ON CONFLICT(snapshotId, dataShardId) DO NOTHING`,
      },
    ),
    ...auditSql,
    `DELETE FROM stats WHERE releaseId = ${sqlLiteral(releaseId)};`,
    ...buildInsertStatements(
      'stats',
      [
        'id',
        'type',
        'releaseId',
        'dimension',
        'metric',
        'metricUnit',
        'value',
        'groupBy',
        'groupValue',
        'createdAt',
        'updatedAt',
      ],
      rows,
      {
        verb: 'INSERT INTO',
      },
    ),
  ]

  return buildSqlImportFile(
    'meta',
    `${buildDivisionSqlRunId(message)}-meta.sql`,
    statements,
  )
}
import { readAuditReplaySql } from '@repo/core/pipeline/db/processingActionReplay'
