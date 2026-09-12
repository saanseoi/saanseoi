import { listCurrentSnapshotCleanupCandidates } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  and,
  eq,
  metaApiReleaseSets,
  metaApiReleaseSetSnapshots,
  metaApiVersions,
} from '@repo/db'
import type {
  CleanupSnapshotsRequest,
  CleanupSnapshotsResult,
  HarbourJobQueue,
  ReconcileDraftReleaseSetsRequest,
} from './controlTypes.ts'

export const DEFAULT_SNAPSHOT_CLEANUP_DELAY_SECONDS = 30

export async function handleScheduleSnapshotCleanup(
  db: HarbourReadableDb,
  cleanupQueue: HarbourJobQueue,
  request: CleanupSnapshotsRequest,
): Promise<CleanupSnapshotsResult> {
  return scheduleCurrentSnapshotCleanup(db, cleanupQueue, request)
}

/** Deferred members become obsolete only after reconciliation archives their sets. */
export async function scheduleReconciledSnapshotCleanup(
  db: HarbourReadableDb,
  cleanupQueue: HarbourJobQueue,
  request: ReconcileDraftReleaseSetsRequest,
) {
  const snapshots = await db
    .select({ snapshotId: metaApiReleaseSetSnapshots.snapshotId })
    .from(metaApiReleaseSetSnapshots)
    .innerJoin(
      metaApiReleaseSets,
      eq(metaApiReleaseSets.id, metaApiReleaseSetSnapshots.apiReleaseSetId),
    )
    .innerJoin(metaApiVersions, eq(metaApiVersions.id, metaApiReleaseSets.apiVersionId))
    .where(
      and(
        eq(metaApiReleaseSets.status, 'archived'),
        request.apiFamily
          ? eq(metaApiVersions.familyType, request.apiFamily)
          : undefined,
        request.regionCode
          ? eq(metaApiReleaseSets.regionCode, request.regionCode)
          : undefined,
      ),
    )
    .groupBy(metaApiReleaseSetSnapshots.snapshotId)
    .all()

  // The ordinary selector still protects members pinned by current or draft
  // sets, and independently retained geometry. Retry even when no drafts remain.
  return scheduleCurrentSnapshotCleanup(db, cleanupQueue, {
    snapshotIds: snapshots.map(snapshot => snapshot.snapshotId),
  })
}

export async function scheduleCurrentSnapshotCleanup(
  db: HarbourReadableDb,
  cleanupQueue: HarbourJobQueue,
  request: CleanupSnapshotsRequest,
): Promise<CleanupSnapshotsResult> {
  const delaySeconds = Math.max(
    0,
    Math.floor(request.delaySeconds ?? DEFAULT_SNAPSHOT_CLEANUP_DELAY_SECONDS),
  )
  const candidates = await listCurrentSnapshotCleanupCandidates(db, {
    resourceType: request.resourceType,
    snapshotIds: request.snapshotIds,
  })
  const snapshotIds = candidates.map(candidate => candidate.snapshotId)

  if (snapshotIds.length === 0 || request.dryRun) {
    return {
      candidateCount: snapshotIds.length,
      delaySeconds,
      dryRun: Boolean(request.dryRun),
      snapshotIds,
      status: 'skipped',
    }
  }

  await cleanupQueue.send(
    {
      jobType: 'cleanupCurrentSnapshots',
      requestedAt: new Date().toISOString(),
      resourceType: request.resourceType,
      snapshotIds,
    },
    {
      delaySeconds,
    },
  )

  return {
    candidateCount: snapshotIds.length,
    delaySeconds,
    dryRun: false,
    snapshotIds,
    status: 'queued',
  }
}
