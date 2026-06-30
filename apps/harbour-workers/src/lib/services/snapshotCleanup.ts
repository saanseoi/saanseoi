import type { SnapshotCleanupMessage } from '@repo/core'
import type { ResourceType } from '@repo/core'
import { listCurrentSnapshotCleanupCandidates } from '@repo/core/db/metaRepository'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { currentSchema, eq } from '@repo/db'
import type { CurrentDatabase, MetaDatabase } from '@repo/db'

import { runStatementsInGroupsWithWriteRetry } from '../utils'

type SnapshotCleanupCandidate = {
  snapshotId: string
  resourceType: ResourceType
}

type SnapshotCleanupResult = {
  deletedSnapshots: number
  skippedSnapshots: number
  snapshotIds: string[]
}

export async function cleanupCurrentSnapshots(
  metaDb: MetaDatabase,
  currentDb: CurrentDatabase,
  message: SnapshotCleanupMessage,
): Promise<SnapshotCleanupResult> {
  const metaRepoDb = metaDb as unknown as HarbourReadableDb
  const currentRepoDb = currentDb as unknown as HarbourReadableDb & HarbourWritableDb
  const candidates = (await listCurrentSnapshotCleanupCandidates(metaRepoDb, {
    resourceType: message.resourceType,
    snapshotIds: message.snapshotIds,
  })) as SnapshotCleanupCandidate[]
  const snapshotIds: string[] = []
  let skippedSnapshots = 0

  for (const resourceType of ['place', 'address', 'street', 'division'] as const) {
    for (const candidate of candidates.filter(
      candidate => candidate.resourceType === resourceType,
    )) {
      const deleted = await cleanupSnapshotByResourceType(currentRepoDb, candidate)

      if (deleted) {
        snapshotIds.push(candidate.snapshotId)
      } else {
        skippedSnapshots += 1
      }
    }
  }

  console.info(
    JSON.stringify({
      deletedSnapshots: snapshotIds.length,
      jobType: message.jobType,
      phase: 'cleanupCurrentSnapshots',
      requestedAt: message.requestedAt,
      resourceType: message.resourceType ?? null,
      skippedSnapshots,
      snapshotIds,
    }),
  )

  return {
    deletedSnapshots: snapshotIds.length,
    skippedSnapshots,
    snapshotIds,
  }
}

async function cleanupSnapshotByResourceType(
  db: HarbourReadableDb & HarbourWritableDb,
  candidate: SnapshotCleanupCandidate,
) {
  switch (candidate.resourceType) {
    case 'place':
      await deletePlaceSnapshot(db, candidate.snapshotId)
      return true
    case 'address':
      if (await addressSnapshotHasCurrentDependents(db, candidate.snapshotId)) {
        return false
      }
      await deleteAddressSnapshot(db, candidate.snapshotId)
      return true
    case 'street':
      if (await streetSnapshotHasCurrentDependents(db, candidate.snapshotId)) {
        return false
      }
      await deleteStreetSnapshot(db, candidate.snapshotId)
      return true
    case 'division':
      if (await divisionSnapshotHasCurrentDependents(db, candidate.snapshotId)) {
        return false
      }
      await deleteDivisionSnapshot(db, candidate.snapshotId)
      return true
  }
}

async function deletePlaceSnapshot(
  db: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
) {
  await runStatementsInGroupsWithWriteRetry(db, [
    db
      .delete(currentSchema.placesFts)
      .where(eq(currentSchema.placesFts.snapshotId, snapshotId)),
    db
      .delete(currentSchema.placesCells)
      .where(eq(currentSchema.placesCells.snapshotId, snapshotId)),
    db
      .delete(currentSchema.placesDivision)
      .where(eq(currentSchema.placesDivision.placeSnapshotId, snapshotId)),
    db
      .delete(currentSchema.placesI18n)
      .where(eq(currentSchema.placesI18n.snapshotId, snapshotId)),
    db
      .delete(currentSchema.places)
      .where(eq(currentSchema.places.snapshotId, snapshotId)),
  ])
}

async function deleteAddressSnapshot(
  db: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
) {
  await runStatementsInGroupsWithWriteRetry(db, [
    db
      .delete(currentSchema.address3dI18n)
      .where(eq(currentSchema.address3dI18n.snapshotId, snapshotId)),
    db
      .delete(currentSchema.address3d)
      .where(eq(currentSchema.address3d.snapshotId, snapshotId)),
    db
      .delete(currentSchema.address2dI18n)
      .where(eq(currentSchema.address2dI18n.snapshotId, snapshotId)),
    db
      .delete(currentSchema.streetsAddress)
      .where(eq(currentSchema.streetsAddress.addressSnapshotId, snapshotId)),
    db
      .delete(currentSchema.address2d)
      .where(eq(currentSchema.address2d.snapshotId, snapshotId)),
  ])
}

async function deleteStreetSnapshot(
  db: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
) {
  await runStatementsInGroupsWithWriteRetry(db, [
    db
      .delete(currentSchema.streetsAddress)
      .where(eq(currentSchema.streetsAddress.streetSnapshotId, snapshotId)),
    db
      .delete(currentSchema.streetsI18n)
      .where(eq(currentSchema.streetsI18n.snapshotId, snapshotId)),
    db
      .delete(currentSchema.streets)
      .where(eq(currentSchema.streets.snapshotId, snapshotId)),
  ])
}

async function deleteDivisionSnapshot(
  db: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
) {
  await runStatementsInGroupsWithWriteRetry(db, [
    db
      .delete(currentSchema.divisionsI18n)
      .where(eq(currentSchema.divisionsI18n.snapshotId, snapshotId)),
    db
      .delete(currentSchema.divisions)
      .where(eq(currentSchema.divisions.snapshotId, snapshotId)),
  ])
}

async function addressSnapshotHasCurrentDependents(
  db: HarbourReadableDb,
  snapshotId: string,
) {
  return rowExists(
    await db
      .select({ id: currentSchema.places.id })
      .from(currentSchema.places)
      .where(eq(currentSchema.places.addressSnapshotId, snapshotId))
      .limit(1)
      .get(),
  )
}

async function streetSnapshotHasCurrentDependents(
  db: HarbourReadableDb,
  snapshotId: string,
) {
  return rowExists(
    await db
      .select({ id: currentSchema.address2d.id })
      .from(currentSchema.address2d)
      .where(eq(currentSchema.address2d.streetSnapshotId, snapshotId))
      .limit(1)
      .get(),
  )
}

async function divisionSnapshotHasCurrentDependents(
  db: HarbourReadableDb,
  snapshotId: string,
) {
  const addressDependent = await db
    .select({ id: currentSchema.address2d.id })
    .from(currentSchema.address2d)
    .where(eq(currentSchema.address2d.divisionSnapshotId, snapshotId))
    .limit(1)
    .get()

  if (rowExists(addressDependent)) {
    return true
  }

  return rowExists(
    await db
      .select({ divisionId: currentSchema.placesDivision.divisionId })
      .from(currentSchema.placesDivision)
      .where(eq(currentSchema.placesDivision.divisionSnapshotId, snapshotId))
      .limit(1)
      .get(),
  )
}

function rowExists(row: unknown) {
  return Boolean(row)
}
