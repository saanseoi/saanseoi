import type { DatasetProcessingMessage } from '@repo/core'
import {
  eq,
  metaReleaseShardAssignments,
  metaSnapshotLineages,
  metaSnapshotAssemblies,
  metaSnapshotShardAssignments,
  metaSnapshotResourceReleases,
  metaSnapshots,
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
  const resourceReleaseId = message.resourceReleaseId ?? message.datasetId
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
      snapshotId: metaSnapshotResourceReleases.snapshotId,
      datasetId: metaSnapshotResourceReleases.datasetId,
      resourceReleaseId: metaSnapshotResourceReleases.resourceReleaseId,
      role: metaSnapshotResourceReleases.role,
      selectedByRule: metaSnapshotResourceReleases.selectedByRule,
      selectionMode: metaSnapshotResourceReleases.selectionMode,
      anchorReleaseId: metaSnapshotResourceReleases.anchorReleaseId,
      sourceCohortKey: metaSnapshotResourceReleases.sourceCohortKey,
      createdAt: metaSnapshotResourceReleases.createdAt,
    })
    .from(metaSnapshotResourceReleases)
    .where(eq(metaSnapshotResourceReleases.snapshotId, state.snapshotId))
    .all()

  if (!snapshotSourceRows.some(row => row.resourceReleaseId === resourceReleaseId)) {
    throw new Error(
      `Division snapshot source metadata missing for release ${resourceReleaseId} and snapshot ${state.snapshotId}.`,
    )
  }

  const assemblySql = await readSnapshotAssemblySql(metaDb, state.snapshotId)
  const snapshotAssemblyRows = await metaDb
    .select({
      id: metaSnapshotAssemblies.id,
      snapshotId: metaSnapshotAssemblies.snapshotId,
      snapshotRecipeId: metaSnapshotAssemblies.snapshotRecipeId,
      anchorReleaseId: metaSnapshotAssemblies.anchorReleaseId,
      anchorCohortKey: metaSnapshotAssemblies.anchorCohortKey,
      status: metaSnapshotAssemblies.status,
      reviewRequired: metaSnapshotAssemblies.reviewRequired,
      detailsJson: metaSnapshotAssemblies.detailsJson,
      createdAt: metaSnapshotAssemblies.createdAt,
      updatedAt: metaSnapshotAssemblies.updatedAt,
    })
    .from(metaSnapshotAssemblies)
    .where(eq(metaSnapshotAssemblies.snapshotId, state.snapshotId))
    .all()
  const serialisedSnapshotAssemblyRows = snapshotAssemblyRows.map(row => ({
    ...row,
    detailsJson: jsonText(row.detailsJson),
  }))

  const releaseShardAssignmentRows = await metaDb
    .select({
      resourceReleaseId: metaReleaseShardAssignments.resourceReleaseId,
      dataShardId: metaReleaseShardAssignments.dataShardId,
    })
    .from(metaReleaseShardAssignments)
    .where(eq(metaReleaseShardAssignments.resourceReleaseId, resourceReleaseId))
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
      `Division release shard assignment missing from local meta cache: ${resourceReleaseId}.`,
    )
  }

  if (snapshotShardAssignmentRows.length === 0) {
    throw new Error(
      `Division snapshot shard assignment missing from local meta cache: ${state.snapshotId}.`,
    )
  }

  const auditSql = await readAuditReplaySql(metaDb, resourceReleaseId)

  const rows: Record<string, SqlValue>[] = []

  for (let index = 0; index < state.statsRows.length; index += DIVISION_BATCH_SIZE) {
    const batch = state.statsRows.slice(index, index + DIVISION_BATCH_SIZE)

    for (const row of batch) {
      rows.push({
        id: crypto.randomUUID(),
        resourceReleaseId: message.resourceReleaseId ?? message.datasetId,
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
      'snapshotResourceReleases',
      [
        'snapshotId',
        'datasetId',
        'resourceReleaseId',
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
ON CONFLICT(snapshotId, resourceReleaseId) DO UPDATE SET
  datasetId = excluded.datasetId,
  role = excluded.role,
  selectedByRule = excluded.selectedByRule,
  selectionMode = excluded.selectionMode,
  anchorReleaseId = excluded.anchorReleaseId,
  sourceCohortKey = excluded.sourceCohortKey,
  createdAt = excluded.createdAt`.trim(),
      },
    ),
    ...assemblySql,
    ...buildInsertStatements(
      'snapshotAssemblies',
      [
        'id',
        'snapshotId',
        'snapshotRecipeId',
        'anchorReleaseId',
        'anchorCohortKey',
        'status',
        'reviewRequired',
        'detailsJson',
        'createdAt',
        'updatedAt',
      ],
      serialisedSnapshotAssemblyRows,
      {
        suffix: `
ON CONFLICT(id) DO UPDATE SET
  snapshotId = excluded.snapshotId,
  snapshotRecipeId = excluded.snapshotRecipeId,
  anchorReleaseId = excluded.anchorReleaseId,
  anchorCohortKey = excluded.anchorCohortKey,
  status = excluded.status,
  reviewRequired = excluded.reviewRequired,
  detailsJson = excluded.detailsJson,
  createdAt = excluded.createdAt,
  updatedAt = excluded.updatedAt`.trim(),
      },
    ),
    ...buildInsertStatements(
      'releaseShardAssignments',
      ['resourceReleaseId', 'dataShardId'],
      releaseShardAssignmentRows,
      {
        suffix: `ON CONFLICT(resourceReleaseId, dataShardId) DO NOTHING`,
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
    `DELETE FROM stats WHERE resourceReleaseId = ${sqlLiteral(resourceReleaseId)} AND metric != 'processing';`,
    ...buildInsertStatements(
      'stats',
      [
        'id',
        'resourceReleaseId',
        'dimension',
        'metric',
        'metricUnit',
        'value',
        'groupBy',
        'groupValue',
        'createdAt',
        'updatedAt',
      ],
      rows.filter(row => row.metric !== 'processing'),
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
import { readSnapshotAssemblySql } from '@repo/core/pipeline/db/snapshotAssembly'
