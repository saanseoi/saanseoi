import {
  and,
  or,
  eq,
  metaAssets,
  metaDatasets,
  metaResourceReleases,
  metaSnapshotResourceReleases,
  metaSnapshots,
} from '@repo/db'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { upsertSnapshotSource } from '@repo/core/db/metaRegistry'
import type { CuratedSourceRelease } from './archiveInput'

/** Link existing releases; never relabel upstream evidence as a synthetic release. */
export async function retainCuratedSourceReleases(
  db: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
  anchorReleaseId: string,
  sources: CuratedSourceRelease[],
) {
  const resolved = []
  for (const source of sources) {
    const release = await db
      .select({
        id: metaResourceReleases.id,
        datasetId: metaResourceReleases.datasetId,
        rawObjectKey: metaAssets.assetKey,
        contentHash: metaAssets.contentHash,
        sourceVersion: metaResourceReleases.sourceVersion,
        resourceType: metaResourceReleases.resourceType,
        status: metaResourceReleases.status,
      })
      .from(metaResourceReleases)
      .innerJoin(metaDatasets, eq(metaDatasets.id, metaResourceReleases.datasetId))
      .innerJoin(
        metaAssets,
        and(
          or(
            eq(metaAssets.resourceReleaseId, metaResourceReleases.id),
            eq(metaAssets.sourceReleaseId, metaResourceReleases.sourceReleaseId),
          ),
          eq(metaAssets.assetKey, source.rawObjectKey),
          or(
            eq(metaAssets.role, 'releaseSourceArchive'),
            eq(metaAssets.role, 'resourceSourceArchive'),
          ),
        ),
      )
      .where(
        and(
          eq(metaDatasets.code, source.datasetCode),
          eq(metaResourceReleases.code, source.releaseCode),
        ),
      )
      .get()
    if (
      !release ||
      !['current', 'archived'].includes(release.status) ||
      release.rawObjectKey !== source.rawObjectKey ||
      release.contentHash !== source.contentHash ||
      release.sourceVersion !== source.sourceVersion ||
      release.resourceType !== source.resourceType
    )
      throw new Error(
        `Curated input ${source.releaseCode} must be published with the archive pinned by the manifest.`,
      )
    if (source.snapshotId) {
      const pinned = await db
        .select({ id: metaSnapshots.id })
        .from(metaSnapshots)
        .innerJoin(
          metaSnapshotResourceReleases,
          eq(metaSnapshotResourceReleases.snapshotId, metaSnapshots.id),
        )
        .where(
          and(
            eq(metaSnapshots.id, source.snapshotId),
            eq(metaSnapshotResourceReleases.resourceReleaseId, release.id),
            eq(metaSnapshotResourceReleases.role, 'primary'),
            eq(metaSnapshots.status, 'published'),
            eq(
              metaSnapshots.resourceType,
              source.resourceType as 'division' | 'divisionArea' | 'divisionBoundary',
            ),
          ),
        )
        .get()
      if (!pinned)
        throw Error(`Pinned input snapshot ${source.snapshotId} is unavailable.`)
    }
    resolved.push({ release, source })
  }
  for (const { release, source } of resolved)
    await upsertSnapshotSource(
      db,
      snapshotId,
      release.datasetId,
      release.id,
      'enrichment',
      {
        anchorReleaseId,
        selectedByRule: 'provenance:curated-division:build-inputs:v1',
        selectionMode: 'exact_ref',
        sourceCohortKey: source.sourceVersion,
      },
    )
}

export function curatedInventorySnapshots(sources: CuratedSourceRelease[] | undefined) {
  return (sources ?? [])
    .filter(
      source =>
        source.datasetCode.startsWith('ds-hk-overture-') &&
        source.snapshotId &&
        ['division', 'divisionArea', 'divisionBoundary'].includes(source.resourceType),
    )
    .map(source => ({
      snapshotId: source.snapshotId!,
      resourceType: source.resourceType as
        | 'division'
        | 'divisionArea'
        | 'divisionBoundary',
      variant: 'overture',
    }))
}
