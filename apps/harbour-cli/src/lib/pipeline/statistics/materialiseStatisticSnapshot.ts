import { datasetVariantForSource } from '@repo/core/codes'
import {
  ensureDraftSnapshotForRelease,
  recordSnapshotAssembly,
  resolveAcceptedStatisticSnapshotParent,
  resolveShardForTypeRegionYear,
  upsertReleaseShardAssignment,
  upsertSnapshotShardAssignment,
  upsertSnapshotSource,
  waitForDatasetRecord,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { buildSnapshotLineageCode, metaSchema } from '@repo/db'
import { eq } from 'drizzle-orm'

import type { UploadTarget } from '../../cli/options.ts'

/** Resolve existing published baselines before allocating a new revision. */
export async function resolveStatisticSnapshotPredecessors(args: {
  datasetCode: string
  metaDb: HarbourReadableDb
  referencePeriods: Array<{ code: string; endYear: string }>
}) {
  const lineageCode = buildSnapshotLineageCode(
    args.datasetCode,
    'divisionStatistic',
    datasetVariantForSource('divisionStatistic', undefined, {
      datasetCode: args.datasetCode,
    }),
  )
  // A code rename preserves the persisted lineage ID and its history links.
  const lineage = await args.metaDb
    .select({ id: metaSchema.metaSnapshotLineages.id })
    .from(metaSchema.metaSnapshotLineages)
    .where(eq(metaSchema.metaSnapshotLineages.code, lineageCode))
    .get()
  return Promise.all(
    args.referencePeriods.map(async referencePeriod => ({
      cohortKey: referencePeriod.code,
      parentSnapshotId: lineage
        ? ((
            await resolveAcceptedStatisticSnapshotParent(
              args.metaDb,
              lineage.id,
              referencePeriod.code,
            )
          )?.id ?? null)
        : null,
    })),
  )
}

export async function materialiseStatisticSnapshots(args: {
  datasetCode: string
  metaDb: HarbourReadableDb & HarbourWritableDb
  referencePeriods: Array<{ code: string; endYear: string }>
  resourceReleaseId: string
  target: UploadTarget
}) {
  const dataset = await waitForDatasetRecord(args.metaDb, {
    resourceReleaseId: args.resourceReleaseId,
  })
  if (!dataset) {
    throw new Error(`Release not found: ${args.resourceReleaseId}`)
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
    dataset.sourceVersion.slice(0, 4),
  )
  if (!sourceShard) {
    throw new Error(
      `Source shard mapping not found for ${dataset.regionCode}/${dataset.sourceVersion}.`,
    )
  }
  await upsertReleaseShardAssignment(
    args.metaDb,
    dataset.resourceReleaseId,
    sourceShard.id,
  )

  const snapshots = []
  for (const referencePeriod of args.referencePeriods) {
    const snapshot = await ensureDraftSnapshotForRelease(
      args.metaDb,
      'divisionStatistic',
      {
        cohortKey: referencePeriod.code,
        datasetCode: args.datasetCode,
        datasetId: dataset.datasetId,
        // Exact periods are independent inventories; revisions inherit only
        // the preceding revision of this period, never another year's values.
        identityMode: 'cohort_scoped',
        regionCode: dataset.regionCode,
        sourceReleaseId: dataset.resourceReleaseId,
        variant: datasetVariantForSource('divisionStatistic', dataset.source, {
          datasetCode: args.datasetCode,
        }),
      },
    )
    await upsertSnapshotSource(
      args.metaDb,
      snapshot.id,
      dataset.resourceReleaseId,
      'primary',
      {
        anchorReleaseId: dataset.resourceReleaseId,
        selectedByRule: 'assembly:division-statistic:reference-period-release:v1',
        selectionMode: 'exact_ref',
      },
    )

    await recordSnapshotAssembly(args.metaDb, {
      snapshotId: snapshot.id,
      resourceType: 'divisionStatistic',
      anchorReleaseId: dataset.resourceReleaseId,
    })

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
      upsertReleaseShardAssignment(
        args.metaDb,
        dataset.resourceReleaseId,
        historyShard.id,
      ),
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
