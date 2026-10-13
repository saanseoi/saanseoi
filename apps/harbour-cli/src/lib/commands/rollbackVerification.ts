import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  currentRollbackPredicateSql,
  type describeDraftReleasePurgePlan,
} from '@repo/core/pipeline/rollback'
import {
  and,
  currentSchema,
  eq,
  historySchema,
  metaSchema,
  ne,
  sourceSchema,
  sql,
} from '@repo/db'
import type { resolveLocalAddressDbContext } from '../dbCache/localDbCache.ts'
import type {
  ResolvedReleaseRecord,
  RollbackOperation,
  RollbackPlanCounts,
} from './rollbackTypes.ts'

export async function countRollbackPlanRows(
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  input: {
    apiReleaseSetId: string
    previousApiReleaseSetId: string | null
    previousReleaseId: string | null
    release: ResolvedReleaseRecord
    snapshotId: string
    tables: ReturnType<typeof describeDraftReleasePurgePlan>
    operation: RollbackOperation
  },
): Promise<RollbackPlanCounts> {
  const [sourceRows, historyRows, currentRows, metaRows] = await Promise.all([
    countSourceRollbackRows(dbContext, input),
    countHistoryRollbackRows(dbContext.historyDb, input),
    countCurrentRollbackRows(dbContext.currentDb, input),
    countMetaRollbackRows(dbContext.metaDb, input),
  ])

  return {
    current: {
      rows: currentRows,
      tables: input.tables.currentTables.length,
    },
    history: {
      rows: historyRows,
      tables: input.tables.historyTables.length,
    },
    meta: {
      rows: metaRows,
      tables: 1,
    },
    source: {
      rows: sourceRows,
      tables: input.tables.sourceTables.length,
    },
  }
}

async function countCurrentRollbackRows(
  db: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  input: {
    snapshotId: string
    tables: ReturnType<typeof describeDraftReleasePurgePlan>
  },
) {
  let total = 0

  for (const tableName of input.tables.currentTables) {
    const table = resolveCurrentTable(tableName)

    total += await countRows(
      db,
      table,
      sql.raw(
        currentRollbackPredicateSql(
          tableName,
          tableName === 'placesDivision' ? 'placeSnapshotId' : 'snapshotId',
          input.snapshotId,
        ),
      ),
    )
  }

  return total
}

async function countHistoryRollbackRows(
  db: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['historyDb'],
  input: {
    release: ResolvedReleaseRecord
    snapshotId: string
    tables: ReturnType<typeof describeDraftReleasePurgePlan>
  },
) {
  let total = 0

  for (const tableName of input.tables.historyTables) {
    const table = resolveHistoryTable(tableName)
    const cacheRows = await countRows(
      db,
      table,
      and(eq(table.snapshotId, input.snapshotId)),
    )
    total += cacheRows
  }

  return total
}

async function countSourceRollbackRows(
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  input: {
    previousReleaseId: string | null
    release: ResolvedReleaseRecord
    tables: ReturnType<typeof describeDraftReleasePurgePlan>
    operation: RollbackOperation
  },
) {
  let total = 0

  for (const sourceTarget of dbContext.sourceTargets) {
    const db = sourceTarget.db as Awaited<
      ReturnType<typeof resolveLocalAddressDbContext>
    >['sourceDb']
    for (const tableName of input.tables.sourceTables) {
      const table = resolveSourceTable(tableName)
      if (input.operation === 'purge') {
        total += await countRows(
          db,
          table,
          eq(table.resourceReleaseId, input.release.resourceReleaseId),
        )
        if (input.release.resourceType === 'place') {
          total += await countRows(
            db,
            table,
            and(
              eq(table.isCurrent, false),
              eq(table.validToRelease, input.release.sourceVersion),
            ),
          )
        }
        continue
      }
      const deletedRows = await countRows(
        db,
        table,
        and(
          eq(table.resourceReleaseId, input.release.resourceReleaseId),
          eq(table.validFromRelease, input.release.sourceVersion),
        ),
      )
      const reopenedRows = await countRows(
        db,
        table,
        and(
          eq(table.isCurrent, false),
          eq(table.validToRelease, input.release.sourceVersion),
        ),
      )
      const reassignedRows = input.previousReleaseId
        ? await countRows(
            db,
            table,
            and(
              eq(table.resourceReleaseId, input.release.resourceReleaseId),
              ne(table.validFromRelease, input.release.sourceVersion),
            ),
          )
        : 0

      total += deletedRows + reopenedRows + reassignedRows
    }
  }

  return total
}

async function countMetaRollbackRows(
  db: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['metaDb'],
  input: {
    apiReleaseSetId: string
    previousApiReleaseSetId: string | null
    previousReleaseId: string | null
    release: ResolvedReleaseRecord
    snapshotId: string
    operation: RollbackOperation
  },
) {
  const [
    provenanceRows,
    releaseSetSnapshotRows,
    journalRows,
    statsRows,
    processingRunRows,
    shardAssignmentRows,
    dependencyRows,
    assemblyRows,
    snapshotSourceRows,
    releaseSetRows,
    snapshotRows,
    releaseRows,
    previousReleaseRows,
    previousReleaseSetRows,
  ] = await Promise.all([
    countRows(
      db,
      metaSchema.metaApiFieldProvenance,
      eq(metaSchema.metaApiFieldProvenance.apiReleaseSetId, input.apiReleaseSetId),
    ),
    countRows(
      db,
      metaSchema.metaApiReleaseSetSnapshots,
      eq(metaSchema.metaApiReleaseSetSnapshots.apiReleaseSetId, input.apiReleaseSetId),
    ),
    countRows(
      db,
      metaSchema.metaReleaseSetLifecycleJournal,
      sql`${metaSchema.metaReleaseSetLifecycleJournal.resourceReleaseId} = ${input.release.resourceReleaseId} OR ${metaSchema.metaReleaseSetLifecycleJournal.relatedResourceReleaseId} = ${input.release.resourceReleaseId}`,
    ),
    countRows(
      db,
      metaSchema.stats,
      input.operation === 'purge'
        ? sql`${metaSchema.stats.resourceReleaseId} = ${input.release.resourceReleaseId} OR ${metaSchema.stats.apiReleaseSetId} = ${input.apiReleaseSetId}`
        : eq(metaSchema.stats.resourceReleaseId, input.release.resourceReleaseId),
    ),
    countRows(
      db,
      metaSchema.processingRuns,
      eq(metaSchema.processingRuns.resourceReleaseId, input.release.resourceReleaseId),
    ),
    countRows(
      db,
      metaSchema.metaReleaseShardAssignments,
      eq(
        metaSchema.metaReleaseShardAssignments.resourceReleaseId,
        input.release.resourceReleaseId,
      ),
    ),
    countRows(
      db,
      metaSchema.metaSnapshotDependencies,
      eq(metaSchema.metaSnapshotDependencies.snapshotId, input.snapshotId),
    ),
    countRows(
      db,
      metaSchema.metaSnapshotAssemblies,
      eq(metaSchema.metaSnapshotAssemblies.snapshotId, input.snapshotId),
    ),
    countRows(
      db,
      metaSchema.metaSnapshotResourceReleases,
      sql`${metaSchema.metaSnapshotResourceReleases.snapshotId} = ${input.snapshotId} OR ${metaSchema.metaSnapshotResourceReleases.resourceReleaseId} = ${input.release.resourceReleaseId}`,
    ),
    countRows(
      db,
      metaSchema.metaApiReleaseSets,
      eq(metaSchema.metaApiReleaseSets.id, input.apiReleaseSetId),
    ),
    countRows(
      db,
      metaSchema.metaSnapshots,
      eq(metaSchema.metaSnapshots.id, input.snapshotId),
    ),
    countRows(
      db,
      metaSchema.metaResourceReleases,
      eq(metaSchema.metaResourceReleases.id, input.release.resourceReleaseId),
    ),
    input.previousReleaseId
      ? countRows(
          db,
          metaSchema.metaResourceReleases,
          eq(metaSchema.metaResourceReleases.id, input.previousReleaseId),
        )
      : Promise.resolve(0),
    input.previousApiReleaseSetId
      ? countRows(
          db,
          metaSchema.metaApiReleaseSets,
          eq(metaSchema.metaApiReleaseSets.id, input.previousApiReleaseSetId),
        )
      : Promise.resolve(0),
  ])

  return (
    provenanceRows +
    releaseSetSnapshotRows +
    journalRows +
    statsRows +
    processingRunRows +
    shardAssignmentRows +
    dependencyRows +
    assemblyRows +
    snapshotSourceRows +
    releaseSetRows +
    snapshotRows +
    releaseRows +
    previousReleaseRows +
    previousReleaseSetRows
  )
}

async function countRows(
  db: { select: (selection: Record<string, unknown>) => unknown },
  table: unknown,
  where: unknown,
) {
  const typedDb = db as unknown as HarbourReadableDb
  const row = (await typedDb
    .select({ count: sql<number>`count(*)` })
    .from(table)
    .where(where)
    .get()) as { count: number | bigint | string } | undefined

  return Number(row?.count ?? 0)
}

function resolveCurrentTable(tableName: string) {
  switch (tableName) {
    case 'addressPublicationState':
      return currentSchema.addressPublicationState
    case 'divisionPublicationState':
      return currentSchema.divisionPublicationState
    case 'divisionAreaPublicationState':
      return currentSchema.divisionAreaPublicationState
    case 'divisionBoundaryPublicationState':
      return currentSchema.divisionBoundaryPublicationState
    case 'placePublicationState':
      return currentSchema.placePublicationState
    case 'divisionAreas':
      return currentSchema.divisionAreas
    case 'divisionBoundaries':
      return currentSchema.divisionBoundaries
    case 'addressSearchScopes':
      return currentSchema.addressSearchScopes
    case 'address2d':
      return currentSchema.address2d
    case 'address2dI18n':
      return currentSchema.address2dI18n
    case 'address3d':
      return currentSchema.address3d
    case 'address3dI18n':
      return currentSchema.address3dI18n
    case 'divisionSearchScopes':
      return currentSchema.divisionSearchScopes
    case 'divisions':
      return currentSchema.divisions
    case 'divisionsI18n':
      return currentSchema.divisionsI18n
    case 'places':
      return currentSchema.places
    case 'placesI18n':
      return currentSchema.placesI18n
    case 'placesDivision':
      return currentSchema.placesDivision
    case 'placesCells':
      return currentSchema.placesCells
    case 'placeSearchScopes':
      return currentSchema.placeSearchScopes
    default:
      throw new Error(`Unsupported rollback current table: ${tableName}`)
  }
}

function resolveHistoryTable(tableName: string) {
  switch (tableName) {
    case 'address2d':
      return historySchema.address2d
    case 'address2dI18n':
      return historySchema.address2dI18n
    case 'address3d':
      return historySchema.address3d
    case 'address3dI18n':
      return historySchema.address3dI18n
    case 'divisions':
      return historySchema.divisions
    case 'divisionsI18n':
      return historySchema.divisionsI18n
    case 'places':
      return historySchema.places
    case 'placesI18n':
      return historySchema.placesI18n
    default:
      throw new Error(`Unsupported rollback history table: ${tableName}`)
  }
}

function resolveSourceTable(tableName: string) {
  switch (tableName) {
    case 'hkgovAlsAddresses2d':
      return sourceSchema.sourceHkgovAlsAddresses2d
    case 'ssDivision':
      return sourceSchema.sourceSsDivision
    case 'ssDivisionArea':
      return sourceSchema.sourceSsDivisionArea
    case 'overtureDivisions':
      return sourceSchema.sourceOvertureDivisions
    case 'hkgovPlandPlanningCells':
      return sourceSchema.sourceHkgovPlandPlanningCells
    case 'hkgovPlandNewTowns':
      return sourceSchema.sourceHkgovPlandNewTowns
    case 'overturePlaces':
      return sourceSchema.sourceOverturePlaces
    default:
      throw new Error(`Unsupported rollback source table: ${tableName}`)
  }
}

export async function verifyPurgeResult(
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  input: {
    apiReleaseSetId: string
    resourceReleaseId: string
    resourceType: string
    sourceVersion: string
    snapshotId: string
    tables: ReturnType<typeof describeDraftReleasePurgePlan>
  },
) {
  const [
    releaseRows,
    snapshotRows,
    releaseSetRows,
    sourceRows,
    historyRows,
    currentRows,
    statsRows,
    journalRows,
    provenanceRows,
    snapshotSourceRows,
    processingRunRows,
  ] = await Promise.all([
    countRows(
      dbContext.metaDb,
      metaSchema.metaResourceReleases,
      eq(metaSchema.metaResourceReleases.id, input.resourceReleaseId),
    ),
    countRows(
      dbContext.metaDb,
      metaSchema.metaSnapshots,
      eq(metaSchema.metaSnapshots.id, input.snapshotId),
    ),
    countRows(
      dbContext.metaDb,
      metaSchema.metaApiReleaseSets,
      eq(metaSchema.metaApiReleaseSets.id, input.apiReleaseSetId),
    ),
    countPurgeSourceRows(dbContext, input),
    countPurgeHistoryRows(dbContext.historyDb, input),
    countPurgeCurrentRows(dbContext.currentDb, input),
    countRows(
      dbContext.metaDb,
      metaSchema.stats,
      sql`${metaSchema.stats.resourceReleaseId} = ${input.resourceReleaseId} OR ${metaSchema.stats.apiReleaseSetId} = ${input.apiReleaseSetId}`,
    ),
    countRows(
      dbContext.metaDb,
      metaSchema.metaReleaseSetLifecycleJournal,
      sql`${metaSchema.metaReleaseSetLifecycleJournal.resourceReleaseId} = ${input.resourceReleaseId} OR ${metaSchema.metaReleaseSetLifecycleJournal.relatedResourceReleaseId} = ${input.resourceReleaseId}`,
    ),
    countRows(
      dbContext.metaDb,
      metaSchema.metaApiFieldProvenance,
      eq(metaSchema.metaApiFieldProvenance.apiReleaseSetId, input.apiReleaseSetId),
    ),
    countRows(
      dbContext.metaDb,
      metaSchema.metaSnapshotResourceReleases,
      sql`${metaSchema.metaSnapshotResourceReleases.snapshotId} = ${input.snapshotId} OR ${metaSchema.metaSnapshotResourceReleases.resourceReleaseId} = ${input.resourceReleaseId}`,
    ),
    countRows(
      dbContext.metaDb,
      metaSchema.processingRuns,
      eq(metaSchema.processingRuns.resourceReleaseId, input.resourceReleaseId),
    ),
  ])
  const remainingRows =
    releaseRows +
    snapshotRows +
    releaseSetRows +
    sourceRows +
    historyRows +
    currentRows +
    statsRows +
    journalRows +
    provenanceRows +
    snapshotSourceRows +
    processingRunRows

  if (remainingRows > 0) {
    throw new Error(
      `Purge verification failed: ${remainingRows} release-owned rows remain in the local mirror.`,
    )
  }
}

async function countPurgeSourceRows(
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  input: {
    resourceReleaseId: string
    resourceType: string
    sourceVersion: string
    tables: ReturnType<typeof describeDraftReleasePurgePlan>
  },
) {
  let total = 0

  for (const sourceTarget of dbContext.sourceTargets) {
    const db = sourceTarget.db as Awaited<
      ReturnType<typeof resolveLocalAddressDbContext>
    >['sourceDb']
    for (const tableName of input.tables.sourceTables) {
      const table = resolveSourceTable(tableName)
      total += await countRows(
        db,
        table,
        eq(table.resourceReleaseId, input.resourceReleaseId),
      )
      if (input.resourceType === 'place') {
        total += await countRows(
          db,
          table,
          and(
            eq(table.isCurrent, false),
            eq(table.validToRelease, input.sourceVersion),
          ),
        )
      }
    }
  }

  return total
}

async function countPurgeHistoryRows(
  db: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['historyDb'],
  input: {
    resourceReleaseId: string
    snapshotId: string
    tables: ReturnType<typeof describeDraftReleasePurgePlan>
  },
) {
  let total = 0

  for (const tableName of input.tables.historyTables) {
    const table = resolveHistoryTable(tableName)
    total += await countRows(db, table, and(eq(table.snapshotId, input.snapshotId)))
  }

  return total
}

async function countPurgeCurrentRows(
  db: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  input: {
    snapshotId: string
    tables: ReturnType<typeof describeDraftReleasePurgePlan>
  },
) {
  let total = 0

  for (const tableName of input.tables.currentTables) {
    const table = resolveCurrentTable(tableName)
    total += await countRows(
      db,
      table,
      sql.raw(
        currentRollbackPredicateSql(
          tableName,
          tableName === 'placesDivision' ? 'placeSnapshotId' : 'snapshotId',
          input.snapshotId,
        ),
      ),
    )
  }

  return total
}
