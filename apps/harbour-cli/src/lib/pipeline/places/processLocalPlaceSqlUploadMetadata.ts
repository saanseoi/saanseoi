import {
  resolveShardForTypeRegionYear,
  recordSnapshotLookupDependency,
  upsertReleaseShardAssignment,
  upsertSnapshotShardAssignment,
  upsertSnapshotSource,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type { UploadTarget } from '../../cli/options.ts'
import { resolvePipelineEnvironment } from '../../cli/options.ts'
import { recordPlaceAddressAssembly } from '@repo/core/pipeline/services/places/placeAddressAssembly'
import { readSnapshotAssemblySql } from '@repo/core/pipeline/db/snapshotAssembly'
import { metaSchema } from '@repo/db'
import { and, eq } from 'drizzle-orm'
import type { LocalAddressDbContext } from '../../dbCache/localDbCache.ts'
import type { SqlImportTargetContext } from '../local/sqlImport.ts'
import type { PlaceUploadPlan } from './processLocalPlaceSqlUploadTypes.ts'
import { insertSql } from './processLocalPlaceSqlUploadImport.ts'

export async function upsertPlaceMetadata(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  snapshots: {
    addressSnapshotId: string
    divisionSnapshotId: string
    snapshotId: string
    supplementaryAddressSnapshotId: string
  },
  datasetId: string,
  releaseId: string,
  plan: PlaceUploadPlan,
  target: UploadTarget,
  options: { sourceBindingNames?: readonly string[] } = {},
) {
  await upsertSnapshotSource(
    metaDb,
    snapshots.snapshotId,
    datasetId,
    releaseId,
    'primary',
    {
      anchorReleaseId: releaseId,
      selectedByRule: 'snapshot-assembly-places-overture-v1',
      selectionMode: 'exact_ref',
      sourceCohortKey: plan.cohortKey,
    },
  )
  await recordPlaceAddressAssembly(metaDb, {
    snapshotId: snapshots.snapshotId,
    resourceType: 'place',
    anchorReleaseId: releaseId,
    anchorCohortKey: plan.cohortKey,
    selectionSummaryJson: {
      addressSnapshotId: snapshots.addressSnapshotId,
      divisionSnapshotId: snapshots.divisionSnapshotId,
      sourceReleaseId: releaseId,
      sourceVersion: plan.sourceVersion,
      supplementaryAddressSnapshotId: snapshots.supplementaryAddressSnapshotId,
      addressReviewRequired: 0,
    },
  })
  await recordSnapshotLookupDependency(metaDb, {
    anchorReleaseId: releaseId,
    lookupSnapshotId: snapshots.addressSnapshotId,
    selectedByRule: 'api-composition:places/overture:place/default->address/default',
    selectionMode: 'latest_at_or_before_or_earliest_after_cohort',
    snapshotId: snapshots.snapshotId,
  })
  await recordSnapshotLookupDependency(metaDb, {
    anchorReleaseId: releaseId,
    lookupSnapshotId: snapshots.divisionSnapshotId,
    selectedByRule:
      'api-composition:places/overture:address/default->division/overture',
    selectionMode: 'address_snapshot_reference',
    snapshotId: snapshots.snapshotId,
  })
  const environment = resolvePipelineEnvironment(target)
  const historyShard = await resolveShardForTypeRegionYear(
    metaDb,
    'history',
    environment,
    plan.regionCode,
    plan.sourceVersion.slice(0, 4),
  )
  const sourceShard = await resolveShardForTypeRegionYear(
    metaDb,
    'source',
    environment,
    plan.regionCode,
    plan.sourceVersion.slice(0, 4),
  )
  if (historyShard) {
    await upsertSnapshotShardAssignment(metaDb, snapshots.snapshotId, historyShard.id)
    await upsertReleaseShardAssignment(metaDb, releaseId, historyShard.id)
  }
  const sourceBindingNames = [
    ...(options.sourceBindingNames ?? []),
    ...(sourceShard ? [sourceShard.bindingName] : []),
  ]
  await assignPlaceSourceShards(metaDb, releaseId, environment, sourceBindingNames)
}

export async function assignPlaceSourceShards(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  releaseId: string,
  environment: 'preview' | 'production',
  bindingNames: readonly string[],
) {
  const sourceShards = await Promise.all(
    [...new Set(bindingNames)].map(async bindingName => {
      const shard = await metaDb
        .select({
          id: metaSchema.metaDataShards.id,
          bindingName: metaSchema.metaDataShards.bindingName,
        })
        .from(metaSchema.metaDataShards)
        .where(
          and(
            eq(metaSchema.metaDataShards.bindingName, bindingName),
            eq(metaSchema.metaDataShards.shardType, 'source'),
            eq(metaSchema.metaDataShards.environment, environment),
            eq(metaSchema.metaDataShards.status, 'active'),
          ),
        )
        .limit(1)
        .get()
      if (!shard)
        throw new Error(
          `Active Places source shard ${bindingName} is not registered for ${environment}.`,
        )
      return shard
    }),
  )
  await Promise.all(
    sourceShards.map(shard =>
      upsertReleaseShardAssignment(metaDb, releaseId, shard.id),
    ),
  )
  return sourceShards
}

export async function placeTargets(
  dbContext: LocalAddressDbContext,
  metaDb: HarbourReadableDb,
  target: UploadTarget,
  regionCode: string,
  shardYear: string,
) {
  const environment = resolvePipelineEnvironment(target)
  const [currentShard, historyShard, sourceShard] = await Promise.all([
    resolveShardForTypeRegionYear(metaDb, 'current', environment),
    resolveShardForTypeRegionYear(
      metaDb,
      'history',
      environment,
      regionCode,
      shardYear,
    ),
    resolveShardForTypeRegionYear(metaDb, 'source', environment, regionCode, shardYear),
  ])
  return {
    current: {
      binding: dbContext.currentBinding,
      databaseId: currentShard?.databaseId ?? null,
      name: 'current',
    } satisfies SqlImportTargetContext,
    history: {
      binding: dbContext.historyBinding,
      databaseId: historyShard?.databaseId ?? null,
      name: 'history',
    } satisfies SqlImportTargetContext,
    historyByBinding: new Map(
      dbContext.historyTargets.map(target => [
        target.bindingName,
        {
          binding: target.binding,
          databaseId: target.databaseId,
          name: 'history' as const,
        } satisfies SqlImportTargetContext,
      ]),
    ),
    source: {
      binding: dbContext.sourceBinding,
      databaseId: sourceShard?.databaseId ?? null,
      name: 'source',
    } satisfies SqlImportTargetContext,
    sourceByBinding: new Map(
      dbContext.sourceTargets.map(target => [
        target.bindingName,
        {
          binding: target.binding,
          databaseId: target.databaseId,
          name: 'source' as const,
        } satisfies SqlImportTargetContext,
      ]),
    ),
    meta: {
      binding: dbContext.metaBinding,
      databaseId: dbContext.state.bindings.DB_META?.databaseId ?? null,
      name: 'meta',
    } satisfies SqlImportTargetContext,
    environment,
    metaDb,
    shardYear,
  }
}

export async function buildPlaceMetadataSql(
  db: HarbourReadableDb,
  snapshotId: string,
  releaseId: string,
) {
  const snapshot = await db
    .select()
    .from(metaSchema.metaSnapshots)
    .where(eq(metaSchema.metaSnapshots.id, snapshotId))
    .limit(1)
    .get()
  if (!snapshot) throw new Error(`Place snapshot metadata not found: ${snapshotId}.`)
  const assemblySql = await readSnapshotAssemblySql(db, snapshotId)
  const [
    lineage,
    sources,
    shardAssignments,
    assemblyRuns,
    releaseAssignments,
    releaseStats,
  ] = await Promise.all([
    db
      .select()
      .from(metaSchema.metaSnapshotLineages)
      .where(eq(metaSchema.metaSnapshotLineages.id, String(snapshot.snapshotLineageId)))
      .all(),
    db
      .select()
      .from(metaSchema.metaSnapshotSources)
      .where(eq(metaSchema.metaSnapshotSources.snapshotId, snapshotId))
      .all(),
    db
      .select()
      .from(metaSchema.metaSnapshotShardAssignments)
      .where(eq(metaSchema.metaSnapshotShardAssignments.snapshotId, snapshotId))
      .all(),
    db
      .select()
      .from(metaSchema.metaSnapshotAssemblyRuns)
      .where(eq(metaSchema.metaSnapshotAssemblyRuns.snapshotId, snapshotId))
      .all(),
    db
      .select()
      .from(metaSchema.metaReleaseShardAssignments)
      .where(eq(metaSchema.metaReleaseShardAssignments.releaseId, releaseId))
      .all(),
    db
      .select()
      .from(metaSchema.stats)
      .where(eq(metaSchema.stats.releaseId, releaseId))
      .all(),
  ])
  return [
    ...lineage.map(row => insertSql('snapshotLineages', row)),
    insertSql('snapshots', snapshot),
    ...sources.map(row => insertSql('snapshotSources', row)),
    ...shardAssignments.map(row => insertSql('snapshotShardAssignments', row)),
    ...assemblySql,
    ...assemblyRuns.map(row => insertSql('snapshotAssemblyRuns', row)),
    ...releaseAssignments.map(row => insertSql('releaseShardAssignments', row)),
    ...releaseStats.map(row => insertSql('stats', row)),
  ].join('\n')
}
