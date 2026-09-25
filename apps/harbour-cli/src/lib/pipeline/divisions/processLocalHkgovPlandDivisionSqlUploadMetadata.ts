import { eq } from 'drizzle-orm'
import { readSnapshotAssemblySql } from '@repo/core/pipeline/db/snapshotAssembly'
import { metaSchema } from '@repo/db'
import type { LocalAddressDbContext } from '../../dbCache/localDbCache.ts'
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
    assemblies,
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
      .from(metaSchema.metaSnapshotSourceReleases)
      .where(eq(metaSchema.metaSnapshotSourceReleases.snapshotId, state.snapshotId))
      .all(),
    context.metaDb
      .select()
      .from(metaSchema.metaSnapshotAssemblies)
      .where(eq(metaSchema.metaSnapshotAssemblies.snapshotId, state.snapshotId))
      .all(),
    context.metaDb
      .select()
      .from(metaSchema.metaReleaseShardAssignments)
      .where(
        eq(
          metaSchema.metaReleaseShardAssignments.resourceReleaseId,
          state.resourceReleaseId,
        ),
      )
      .all(),
    context.metaDb
      .select()
      .from(metaSchema.metaSnapshotShardAssignments)
      .where(eq(metaSchema.metaSnapshotShardAssignments.snapshotId, state.snapshotId))
      .all(),
    readAuditReplaySql(context.metaDb, state.resourceReleaseId),
    context.metaDb
      .select()
      .from(metaSchema.stats)
      .where(eq(metaSchema.stats.resourceReleaseId, state.resourceReleaseId))
      .all(),
  ])
  if (
    snapshots.length !== 1 ||
    !sources.some(row => row.resourceReleaseId === state.resourceReleaseId)
  ) {
    throw new Error(
      `PLAND snapshot metadata is incomplete for ${state.resourceReleaseId}.`,
    )
  }
  if (releaseAssignments.length === 0 || snapshotAssignments.length === 0) {
    throw new Error(
      `PLAND shard assignments are incomplete for ${state.resourceReleaseId}.`,
    )
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
    'resourceReleaseId',
    'role',
    'selectedByRule',
    'selectionMode',
    'anchorReleaseId',
    'sourceCohortKey',
    'createdAt',
  ]
  const assemblyColumns = [
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
  ]
  const statsColumns = [
    'id',
    'resourceReleaseId',
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
  const assemblySql = await readSnapshotAssemblySql(context.metaDb, state.snapshotId)
  return sqlFile([
    ...buildInsertStatements('snapshotLineages', lineageColumns, lineages, {
      suffix: buildUpdateSuffix(lineageColumns, ['id']),
    }),
    ...buildInsertStatements('snapshots', snapshotColumns, snapshots, {
      suffix: buildUpdateSuffix(snapshotColumns, ['id']),
    }),
    ...buildInsertStatements('snapshotSourceReleases', sourceColumns, sources, {
      suffix: buildUpdateSuffix(sourceColumns, ['snapshotId', 'resourceReleaseId']),
    }),
    ...assemblySql,
    ...buildInsertStatements('snapshotAssemblies', assemblyColumns, assemblies, {
      suffix: buildUpdateSuffix(assemblyColumns, ['id']),
    }),
    ...buildInsertStatements(
      'releaseShardAssignments',
      ['resourceReleaseId', 'dataShardId'],
      releaseAssignments,
      {
        suffix: 'ON CONFLICT(resourceReleaseId, dataShardId) DO NOTHING',
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
    `DELETE FROM stats WHERE resourceReleaseId = ${sqlLiteral(state.resourceReleaseId)} AND metric != 'processing';`,
    ...buildInsertStatements(
      'stats',
      statsColumns,
      stats.filter(row => row.metric !== 'processing'),
    ),
  ])
}
import { readAuditReplaySql } from '@repo/core/pipeline/db/processingActionReplay'
