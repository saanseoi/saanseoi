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
import type { describeLatestReleaseRollbackPlan } from '@repo/core/pipeline/rollback'
import {
  resolveActiveReleaseSetForType,
  resolveDatasetRecord,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import type { ResourceType } from '@repo/core'
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
    tables: ReturnType<typeof describeLatestReleaseRollbackPlan>
    operation: RollbackOperation
  },
): Promise<RollbackPlanCounts> {
  const [sourceRows, historyRows, currentRows, metaRows] = await Promise.all([
    countSourceRollbackRows(dbContext.sourceDb, input),
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
    tables: ReturnType<typeof describeLatestReleaseRollbackPlan>
  },
) {
  let total = 0

  for (const tableName of input.tables.currentTables) {
    const table = resolveCurrentTable(tableName)

    total += await countRows(
      db,
      table,
      eq(resolveCurrentSnapshotColumn(tableName, table), input.snapshotId),
    )
  }

  return total
}

async function countHistoryRollbackRows(
  db: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['historyDb'],
  input: {
    release: ResolvedReleaseRecord
    snapshotId: string
    tables: ReturnType<typeof describeLatestReleaseRollbackPlan>
  },
) {
  let total = 0

  total += await countRows(
    db,
    historySchema.snapshotVersionChanges,
    eq(historySchema.snapshotVersionChanges.snapshotId, input.snapshotId),
  )

  for (const tableName of input.tables.historyTables) {
    const table = resolveHistoryTable(tableName)
    const cacheRows = await countRows(
      db,
      table,
      and(
        eq(table.sourceReleaseId, input.release.releaseId),
        eq(table.snapshotId, input.snapshotId),
      ),
    )
    total += cacheRows
  }

  return total
}

async function countSourceRollbackRows(
  db: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['sourceDb'],
  input: {
    previousReleaseId: string | null
    release: ResolvedReleaseRecord
    tables: ReturnType<typeof describeLatestReleaseRollbackPlan>
    operation: RollbackOperation
  },
) {
  let total = 0

  for (const tableName of input.tables.sourceTables) {
    const table = resolveSourceTable(tableName)
    if (input.operation === 'purge') {
      total += await countRows(db, table, eq(table.releaseId, input.release.releaseId))
      continue
    }
    const deletedRows = await countRows(
      db,
      table,
      and(
        eq(table.releaseId, input.release.releaseId),
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
            eq(table.releaseId, input.release.releaseId),
            ne(table.validFromRelease, input.release.sourceVersion),
          ),
        )
      : 0

    total += deletedRows + reopenedRows + reassignedRows
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
    ingestRunRows,
    processingActionRows,
    processingChunkRows,
    shardAssignmentRows,
    assemblyRunRows,
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
      metaSchema.metaPublishedDataJournal,
      sql`${metaSchema.metaPublishedDataJournal.releaseId} = ${input.release.releaseId} OR ${metaSchema.metaPublishedDataJournal.relatedReleaseId} = ${input.release.releaseId}`,
    ),
    countRows(
      db,
      metaSchema.stats,
      input.operation === 'purge'
        ? sql`${metaSchema.stats.releaseId} = ${input.release.releaseId} OR ${metaSchema.stats.apiReleaseSetId} = ${input.apiReleaseSetId}`
        : eq(metaSchema.stats.releaseId, input.release.releaseId),
    ),
    countRows(
      db,
      metaSchema.ingestRuns,
      eq(metaSchema.ingestRuns.releaseId, input.release.releaseId),
    ),
    input.operation === 'purge'
      ? countRows(
          db,
          metaSchema.releaseProcessingActions,
          eq(metaSchema.releaseProcessingActions.releaseId, input.release.releaseId),
        )
      : Promise.resolve(0),
    input.operation === 'purge'
      ? countRows(
          db,
          metaSchema.releaseProcessingActionChunks,
          eq(
            metaSchema.releaseProcessingActionChunks.releaseId,
            input.release.releaseId,
          ),
        )
      : Promise.resolve(0),
    countRows(
      db,
      metaSchema.metaReleaseShardAssignments,
      eq(metaSchema.metaReleaseShardAssignments.releaseId, input.release.releaseId),
    ),
    countRows(
      db,
      metaSchema.metaSnapshotAssemblyRuns,
      eq(metaSchema.metaSnapshotAssemblyRuns.snapshotId, input.snapshotId),
    ),
    countRows(
      db,
      metaSchema.metaSnapshotSources,
      sql`${metaSchema.metaSnapshotSources.snapshotId} = ${input.snapshotId} OR ${metaSchema.metaSnapshotSources.resourceReleaseId} = ${input.release.releaseId}`,
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
      metaSchema.metaReleases,
      eq(metaSchema.metaReleases.id, input.release.releaseId),
    ),
    input.previousReleaseId
      ? countRows(
          db,
          metaSchema.metaReleases,
          eq(metaSchema.metaReleases.id, input.previousReleaseId),
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
    ingestRunRows +
    processingActionRows +
    processingChunkRows +
    shardAssignmentRows +
    assemblyRunRows +
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

function resolveCurrentSnapshotColumn(
  tableName: string,
  table: { placeSnapshotId?: unknown; snapshotId?: unknown },
) {
  return (
    tableName === 'placesDivision' ? table.placeSnapshotId : table.snapshotId
  ) as typeof currentSchema.places.snapshotId
}

function resolveCurrentTable(tableName: string) {
  switch (tableName) {
    case 'addressesFts':
      return currentSchema.addressesFts
    case 'address2d':
      return currentSchema.address2d
    case 'address2dI18n':
      return currentSchema.address2dI18n
    case 'address3d':
      return currentSchema.address3d
    case 'address3dI18n':
      return currentSchema.address3dI18n
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
    case 'placesFts':
      return currentSchema.placesFts
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
    releaseId: string
    snapshotId: string
    tables: ReturnType<typeof describeLatestReleaseRollbackPlan>
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
    ingestRunRows,
    processingActionRows,
    processingChunkRows,
  ] = await Promise.all([
    countRows(
      dbContext.metaDb,
      metaSchema.metaReleases,
      eq(metaSchema.metaReleases.id, input.releaseId),
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
    countPurgeSourceRows(dbContext.sourceDb, input),
    countPurgeHistoryRows(dbContext.historyDb, input),
    countPurgeCurrentRows(dbContext.currentDb, input),
    countRows(
      dbContext.metaDb,
      metaSchema.stats,
      sql`${metaSchema.stats.releaseId} = ${input.releaseId} OR ${metaSchema.stats.apiReleaseSetId} = ${input.apiReleaseSetId}`,
    ),
    countRows(
      dbContext.metaDb,
      metaSchema.metaPublishedDataJournal,
      sql`${metaSchema.metaPublishedDataJournal.releaseId} = ${input.releaseId} OR ${metaSchema.metaPublishedDataJournal.relatedReleaseId} = ${input.releaseId}`,
    ),
    countRows(
      dbContext.metaDb,
      metaSchema.metaApiFieldProvenance,
      eq(metaSchema.metaApiFieldProvenance.apiReleaseSetId, input.apiReleaseSetId),
    ),
    countRows(
      dbContext.metaDb,
      metaSchema.metaSnapshotSources,
      sql`${metaSchema.metaSnapshotSources.snapshotId} = ${input.snapshotId} OR ${metaSchema.metaSnapshotSources.resourceReleaseId} = ${input.releaseId}`,
    ),
    countRows(
      dbContext.metaDb,
      metaSchema.ingestRuns,
      eq(metaSchema.ingestRuns.releaseId, input.releaseId),
    ),
    countRows(
      dbContext.metaDb,
      metaSchema.releaseProcessingActions,
      eq(metaSchema.releaseProcessingActions.releaseId, input.releaseId),
    ),
    countRows(
      dbContext.metaDb,
      metaSchema.releaseProcessingActionChunks,
      eq(metaSchema.releaseProcessingActionChunks.releaseId, input.releaseId),
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
    ingestRunRows +
    processingActionRows +
    processingChunkRows

  if (remainingRows > 0) {
    throw new Error(
      `Purge verification failed: ${remainingRows} release-owned rows remain in the local mirror.`,
    )
  }
}

async function countPurgeSourceRows(
  db: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['sourceDb'],
  input: {
    releaseId: string
    tables: ReturnType<typeof describeLatestReleaseRollbackPlan>
  },
) {
  let total = 0

  for (const tableName of input.tables.sourceTables) {
    const table = resolveSourceTable(tableName)
    total += await countRows(db, table, eq(table.releaseId, input.releaseId))
  }

  return total
}

async function countPurgeHistoryRows(
  db: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['historyDb'],
  input: {
    releaseId: string
    snapshotId: string
    tables: ReturnType<typeof describeLatestReleaseRollbackPlan>
  },
) {
  let total = await countRows(
    db,
    historySchema.snapshotVersionChanges,
    eq(historySchema.snapshotVersionChanges.snapshotId, input.snapshotId),
  )

  for (const tableName of input.tables.historyTables) {
    const table = resolveHistoryTable(tableName)
    total += await countRows(
      db,
      table,
      and(
        eq(table.snapshotId, input.snapshotId),
        eq(table.sourceReleaseId, input.releaseId),
      ),
    )
  }

  return total
}

async function countPurgeCurrentRows(
  db: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  input: {
    snapshotId: string
    tables: ReturnType<typeof describeLatestReleaseRollbackPlan>
  },
) {
  let total = 0

  for (const tableName of input.tables.currentTables) {
    const table = resolveCurrentTable(tableName)
    total += await countRows(
      db,
      table,
      eq(resolveCurrentSnapshotColumn(tableName, table), input.snapshotId),
    )
  }

  return total
}

export async function verifyRollbackResult(
  metaDb: HarbourReadableDb,
  input: {
    previousReleaseId: string | null
    previousReleaseSetId: string | null
    releaseId: string
    resourceType: ResourceType
  },
) {
  const [rolledBackRelease, previousRelease, activeReleaseSet] = await Promise.all([
    resolveDatasetRecord(metaDb, { releaseId: input.releaseId }),
    input.previousReleaseId
      ? resolveDatasetRecord(metaDb, { releaseId: input.previousReleaseId })
      : Promise.resolve(null),
    resolveActiveReleaseSetForType(metaDb, input.resourceType),
  ])

  if (rolledBackRelease) {
    throw new Error(
      `Rollback verification failed: release ${rolledBackRelease.releaseCode} still exists in metadata.`,
    )
  }

  if (!input.previousReleaseId) {
    if (activeReleaseSet) {
      throw new Error(
        `Rollback verification failed: current API release set ${activeReleaseSet.id} still exists after rolling back the initial release.`,
      )
    }

    return
  }

  if (!previousRelease) {
    throw new Error(
      `Rollback verification failed: previous release ${input.previousReleaseId} was not found.`,
    )
  }

  if (previousRelease.status !== 'published') {
    throw new Error(
      `Rollback verification failed: previous release ${previousRelease.releaseCode} is ${previousRelease.status}, expected published.`,
    )
  }

  if (!activeReleaseSet) {
    throw new Error('Rollback verification failed: no current API release set found.')
  }

  if (!input.previousReleaseSetId) {
    throw new Error('Rollback verification failed: previous API release set missing.')
  }

  if (activeReleaseSet.id !== input.previousReleaseSetId) {
    throw new Error(
      `Rollback verification failed: current API release set is ${activeReleaseSet.id}, expected ${input.previousReleaseSetId}.`,
    )
  }
}
