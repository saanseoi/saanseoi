import {
  ensureDraftSnapshotForRelease,
  resolveShardForTypeRegionYear,
  upsertReleaseShardAssignment,
  upsertSnapshotShardAssignment,
  upsertSnapshotSource,
  waitForDatasetRecord,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'

import type { UploadTarget } from '../cli/options.ts'

export async function materialiseStatisticSnapshots(args: {
  datasetCode: string
  metaDb: HarbourReadableDb & HarbourWritableDb
  referencePeriods: Array<{ code: string; endYear: string }>
  releaseId: string
  target: UploadTarget
}) {
  const dataset = await waitForDatasetRecord(args.metaDb, {
    releaseId: args.releaseId,
  })
  if (!dataset) {
    throw new Error(`Release not found: ${args.releaseId}`)
  }

  if (args.referencePeriods.length === 0) {
    throw new Error(
      `Statistic release ${args.releaseId} contains no reference periods.`,
    )
  }

  assertReferencePeriodsDoNotPostdateRelease(
    args.referencePeriods,
    dataset.cohortKey,
    dataset.releaseCode,
  )

  const environment =
    args.target.environment === 'production' ? 'production' : 'preview'
  const sourceShard = await resolveShardForTypeRegionYear(
    args.metaDb,
    'source',
    environment,
    dataset.regionCode,
    dataset.sourceVersion,
  )
  if (!sourceShard) {
    throw new Error(
      `Source shard mapping not found for ${dataset.regionCode}/${dataset.sourceVersion}.`,
    )
  }
  await upsertReleaseShardAssignment(args.metaDb, dataset.releaseId, sourceShard.id)

  const snapshots = []
  for (const referencePeriod of args.referencePeriods) {
    const snapshot = await ensureDraftSnapshotForRelease(
      args.metaDb,
      'divisionStatistic',
      {
        cohortKey: referencePeriod.code,
        datasetCode: args.datasetCode,
        datasetId: dataset.datasetId,
        identityMode: 'persistent',
        regionCode: dataset.regionCode,
        sourceReleaseId: dataset.releaseId,
        variant: args.datasetCode,
      },
    )
    await upsertSnapshotSource(
      args.metaDb,
      snapshot.id,
      dataset.datasetId,
      dataset.releaseId,
      'primary',
      {
        anchorReleaseId: dataset.releaseId,
        selectedByRule: 'stats-reference-period-exact-release-v1',
        selectionMode: 'exact_ref',
        sourceCohortKey: referencePeriod.code,
      },
    )

    const historyShard = await resolveShardForTypeRegionYear(
      args.metaDb,
      'history',
      environment,
      dataset.regionCode,
      referencePeriod.endYear,
    )
    if (!historyShard) {
      throw new Error(
        `History shard mapping not found for ${dataset.regionCode}/${referencePeriod.endYear}.`,
      )
    }

    await Promise.all([
      upsertReleaseShardAssignment(args.metaDb, dataset.releaseId, historyShard.id),
      upsertSnapshotShardAssignment(args.metaDb, snapshot.id, historyShard.id),
    ])
    snapshots.push(snapshot)
  }

  return snapshots
}

function assertReferencePeriodsDoNotPostdateRelease(
  referencePeriods: Array<{ code: string; endYear: string }>,
  releaseCohortKey: string | null,
  releaseCode: string,
) {
  const releaseYear = releaseCohortKey?.match(/^\d{4}/)?.[0]
  if (!releaseYear) return

  const postdated = referencePeriods.find(
    referencePeriod => referencePeriod.endYear > releaseYear,
  )
  if (!postdated) return

  throw new Error(
    `Statistic reference period ${postdated.code} postdates source release ${releaseCode} (${releaseCohortKey}).`,
  )
}
