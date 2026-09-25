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
    divisionAreaSnapshotId?: string
    snapshotId: string
    supplementaryAddressSnapshotId: string
  },
  datasetId: string,
  resourceReleaseId: string,
  plan: PlaceUploadPlan,
  target: UploadTarget,
  options: { sourceBindingNames?: readonly string[] } = {},
) {
  await upsertSnapshotSource(
    metaDb,
    snapshots.snapshotId,
    datasetId,
    resourceReleaseId,
    'primary',
    {
      anchorReleaseId: resourceReleaseId,
      selectedByRule: 'snapshot-assembly-places-overture-v1',
      selectionMode: 'exact_ref',
      sourceCohortKey: plan.cohortKey,
    },
  )
  await recordPlaceAddressAssembly(metaDb, {
    snapshotId: snapshots.snapshotId,
    resourceType: 'place',
    anchorReleaseId: resourceReleaseId,
    anchorCohortKey: plan.cohortKey,
    dependencies: {
      address: snapshots.addressSnapshotId,
      division: snapshots.divisionSnapshotId,
      ...(snapshots.divisionAreaSnapshotId
        ? { divisionArea: snapshots.divisionAreaSnapshotId }
        : {}),
      supplementaryAddress: snapshots.supplementaryAddressSnapshotId,
    },
    reviewRequired: 0,
    detailsJson: {
      sourceReleaseId: resourceReleaseId,
      sourceVersion: plan.sourceVersion,
    },
  })
  await recordSnapshotLookupDependency(metaDb, {
    anchorReleaseId: resourceReleaseId,
    lookupSnapshotId: snapshots.addressSnapshotId,
    selectedByRule: 'api-composition:places/overture:place/default->address/default',
    selectionMode: 'latest_at_or_before_or_earliest_after_cohort',
    snapshotId: snapshots.snapshotId,
  })
  await recordSnapshotLookupDependency(metaDb, {
    anchorReleaseId: resourceReleaseId,
    lookupSnapshotId: snapshots.divisionSnapshotId,
    selectedByRule: 'place-preparation:address-exact-division',
    selectionMode: 'address_snapshot_reference',
    snapshotId: snapshots.snapshotId,
  })
  if (snapshots.divisionAreaSnapshotId)
    await recordSnapshotLookupDependency(metaDb, {
      anchorReleaseId: resourceReleaseId,
      lookupSnapshotId: snapshots.divisionAreaSnapshotId,
      selectedByRule: 'place-preparation:address-exact-division-area',
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
    await upsertReleaseShardAssignment(metaDb, resourceReleaseId, historyShard.id)
  }
  const sourceBindingNames = [
    ...(options.sourceBindingNames ?? []),
    ...(sourceShard ? [sourceShard.bindingName] : []),
  ]
  await assignPlaceSourceShards(
    metaDb,
    resourceReleaseId,
    environment,
    sourceBindingNames,
  )
}

export async function assignPlaceSourceShards(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  resourceReleaseId: string,
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
      upsertReleaseShardAssignment(metaDb, resourceReleaseId, shard.id),
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
  resourceReleaseId: string,
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
    assemblies,
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
      .from(metaSchema.metaSnapshotSourceReleases)
      .where(eq(metaSchema.metaSnapshotSourceReleases.snapshotId, snapshotId))
      .all(),
    db
      .select()
      .from(metaSchema.metaSnapshotShardAssignments)
      .where(eq(metaSchema.metaSnapshotShardAssignments.snapshotId, snapshotId))
      .all(),
    db
      .select()
      .from(metaSchema.metaSnapshotAssemblies)
      .where(eq(metaSchema.metaSnapshotAssemblies.snapshotId, snapshotId))
      .all(),
    db
      .select()
      .from(metaSchema.metaReleaseShardAssignments)
      .where(
        eq(metaSchema.metaReleaseShardAssignments.resourceReleaseId, resourceReleaseId),
      )
      .all(),
    db
      .select()
      .from(metaSchema.stats)
      .where(eq(metaSchema.stats.resourceReleaseId, resourceReleaseId))
      .all(),
  ])
  return [
    ...lineage.map(row => insertSql('snapshotLineages', row)),
    insertSql('snapshots', snapshot),
    ...sources.map(row => insertSql('snapshotSourceReleases', row)),
    ...shardAssignments.map(row => insertSql('snapshotShardAssignments', row)),
    ...assemblySql,
    ...assemblies.map(row => insertSql('snapshotAssemblies', row)),
    ...releaseAssignments.map(row => insertSql('releaseShardAssignments', row)),
    ...releaseStats.map(row => insertSql('stats', row)),
  ].join('\n')
}
