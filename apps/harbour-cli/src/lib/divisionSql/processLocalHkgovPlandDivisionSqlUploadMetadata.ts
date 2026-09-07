import { eq } from 'drizzle-orm'
import { metaSchema } from '@repo/db'
import type { LocalAddressDbContext } from '../dbCache/localDbCache.ts'
import {
  buildInsertStatements,
  buildUpdateSuffix,
  sqlFile,
  sqlLiteral,
  type PlandSqlState,
} from './processLocalHkgovPlandDivisionSqlUploadSql.ts'

export async function buildPlandMetaSql(
  context: LocalAddressDbContext,
  state: PlandSqlState,
) {
  const [
    snapshots,
    sources,
    assemblyRuns,
    releaseAssignments,
    snapshotAssignments,
    auditSql,
    stats,
  ] = await Promise.all([
    context.metaDb
      .select()
      .from(metaSchema.metaSnapshots)
      .where(eq(metaSchema.metaSnapshots.id, state.snapshotId))
      .all(),
    context.metaDb
      .select()
      .from(metaSchema.metaSnapshotSources)
      .where(eq(metaSchema.metaSnapshotSources.snapshotId, state.snapshotId))
      .all(),
    context.metaDb
      .select()
      .from(metaSchema.metaSnapshotAssemblyRuns)
      .where(eq(metaSchema.metaSnapshotAssemblyRuns.snapshotId, state.snapshotId))
      .all(),
    context.metaDb
      .select()
      .from(metaSchema.metaReleaseShardAssignments)
      .where(eq(metaSchema.metaReleaseShardAssignments.releaseId, state.releaseId))
      .all(),
    context.metaDb
      .select()
      .from(metaSchema.metaSnapshotShardAssignments)
      .where(eq(metaSchema.metaSnapshotShardAssignments.snapshotId, state.snapshotId))
      .all(),
    readAuditReplaySql(context.metaDb, state.releaseId),
    context.metaDb
      .select()
      .from(metaSchema.stats)
      .where(eq(metaSchema.stats.releaseId, state.releaseId))
      .all(),
  ])
  if (
    snapshots.length !== 1 ||
    !sources.some(row => row.sourceReleaseId === state.releaseId)
  ) {
    throw new Error(`PLAND snapshot metadata is incomplete for ${state.releaseId}.`)
  }
  if (releaseAssignments.length === 0 || snapshotAssignments.length === 0) {
    throw new Error(`PLAND shard assignments are incomplete for ${state.releaseId}.`)
  }
  const snapshotLineageId = snapshots[0]?.snapshotLineageId
  const lineages = snapshotLineageId
    ? await context.metaDb
        .select()
        .from(metaSchema.metaSnapshotLineages)
        .where(eq(metaSchema.metaSnapshotLineages.id, snapshotLineageId))
        .all()
    : []
  if (snapshotLineageId && lineages.length !== 1) {
    throw new Error(`PLAND snapshot lineage is missing for ${state.snapshotId}.`)
  }
  const lineageColumns = [
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
  ]
  const snapshotColumns = [
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
  ]
  const sourceColumns = [
    'snapshotId',
    'datasetId',
    'sourceReleaseId',
    'role',
    'selectedByRule',
    'selectionMode',
    'anchorReleaseId',
    'sourceCohortKey',
    'createdAt',
  ]
  const assemblyRunColumns = [
    'id',
    'snapshotId',
    'snapshotAssemblyId',
    'anchorReleaseId',
    'anchorCohortKey',
    'status',
    'selectionSummaryJson',
    'createdAt',
    'updatedAt',
  ]
  const statsColumns = [
    'id',
    'type',
    'releaseId',
    'snapshotId',
    'apiReleaseSetId',
    'dimension',
    'metric',
    'metricUnit',
    'value',
    'groupBy',
    'groupValue',
    'createdAt',
    'updatedAt',
  ]
  return sqlFile([
    ...buildInsertStatements('snapshotLineages', lineageColumns, lineages, {
      suffix: buildUpdateSuffix(lineageColumns, ['id']),
    }),
    ...buildInsertStatements('snapshots', snapshotColumns, snapshots, {
      suffix: buildUpdateSuffix(snapshotColumns, ['id']),
    }),
    ...buildInsertStatements('snapshotSources', sourceColumns, sources, {
      suffix: buildUpdateSuffix(sourceColumns, ['snapshotId', 'sourceReleaseId']),
    }),
    ...buildInsertStatements('snapshotAssemblyRuns', assemblyRunColumns, assemblyRuns, {
      suffix: buildUpdateSuffix(assemblyRunColumns, ['id']),
    }),
    ...buildInsertStatements(
      'releaseShardAssignments',
      ['releaseId', 'dataShardId'],
      releaseAssignments,
      {
        suffix: 'ON CONFLICT(releaseId, dataShardId) DO NOTHING',
      },
    ),
    ...buildInsertStatements(
      'snapshotShardAssignments',
      ['snapshotId', 'dataShardId'],
      snapshotAssignments,
      {
        suffix: 'ON CONFLICT(snapshotId, dataShardId) DO NOTHING',
      },
    ),
    ...auditSql,
    `DELETE FROM stats WHERE releaseId = ${sqlLiteral(state.releaseId)};`,
    ...buildInsertStatements('stats', statsColumns, stats),
  ])
}
import { readAuditReplaySql } from '@repo/core/pipeline/db/processingActionReplay'
