import { metaSnapshotResourceReleaseDetails } from '@repo/db/metaSchema'
import { metaResourceReleaseDetails } from '@repo/db/metaSchema'
import { and, eq, metaSchema } from '@repo/db'
import type { ResourceType } from '../../types'
import type { HarbourReadableDb } from './types'

type SelectedSnapshot = {
  snapshotId: string
  resourceType: ResourceType
  variant: string
}

const { metaDatasets, metaPublishers, metaSnapshotLineages, metaSnapshots } = metaSchema

/** Published companions must use the publisher releases retained by the curated build. */
export async function assertCuratedReleaseInputs(
  db: HarbourReadableDb,
  snapshots: readonly SelectedSnapshot[],
) {
  const curated = snapshots.filter(
    snapshot =>
      snapshot.variant === 'saanseoi' &&
      (snapshot.resourceType === 'division' ||
        snapshot.resourceType === 'divisionArea'),
  )
  if (!curated.length) return

  const selectedInputs = []
  for (const snapshot of snapshots.filter(
    snapshot => snapshot.variant === 'overture',
  )) {
    const sources = await db
      .select({
        datasetId: metaSnapshotResourceReleaseDetails.datasetId,
        resourceReleaseId: metaResourceReleaseDetails.id,
        resourceType: metaResourceReleaseDetails.resourceType,
        releaseCode: metaResourceReleaseDetails.code,
      })
      .from(metaSnapshotResourceReleaseDetails)
      .innerJoin(
        metaSnapshots,
        eq(metaSnapshots.id, metaSnapshotResourceReleaseDetails.snapshotId),
      )
      .innerJoin(
        metaSnapshotLineages,
        eq(metaSnapshots.snapshotLineageId, metaSnapshotLineages.id),
      )
      .innerJoin(
        metaResourceReleaseDetails,
        and(
          eq(
            metaResourceReleaseDetails.id,
            metaSnapshotResourceReleaseDetails.resourceReleaseId,
          ),
          eq(
            metaResourceReleaseDetails.datasetId,
            metaSnapshotResourceReleaseDetails.datasetId,
          ),
          eq(
            metaResourceReleaseDetails.resourceType,
            metaSnapshotLineages.resourceType,
          ),
        ),
      )
      .innerJoin(
        metaDatasets,
        eq(metaDatasets.id, metaSnapshotResourceReleaseDetails.datasetId),
      )
      .innerJoin(metaPublishers, eq(metaPublishers.id, metaDatasets.publisherId))
      .where(
        and(
          eq(metaSnapshotResourceReleaseDetails.snapshotId, snapshot.snapshotId),
          eq(metaSnapshotResourceReleaseDetails.role, 'primary'),
          eq(metaSnapshotLineages.resourceType, snapshot.resourceType),
          eq(metaSnapshots.status, 'published'),
          eq(metaPublishers.code, 'overture'),
        ),
      )
      .all()
    selectedInputs.push(...sources)
  }

  for (const snapshot of curated) {
    const retainedInputs = await db
      .select({
        datasetId: metaSnapshotResourceReleaseDetails.datasetId,
        resourceReleaseId: metaResourceReleaseDetails.id,
        resourceType: metaResourceReleaseDetails.resourceType,
        releaseCode: metaResourceReleaseDetails.code,
      })
      .from(metaSnapshotResourceReleaseDetails)
      .innerJoin(
        metaResourceReleaseDetails,
        and(
          eq(
            metaResourceReleaseDetails.id,
            metaSnapshotResourceReleaseDetails.resourceReleaseId,
          ),
          eq(
            metaResourceReleaseDetails.datasetId,
            metaSnapshotResourceReleaseDetails.datasetId,
          ),
        ),
      )
      .innerJoin(
        metaDatasets,
        eq(metaDatasets.id, metaSnapshotResourceReleaseDetails.datasetId),
      )
      .innerJoin(metaPublishers, eq(metaPublishers.id, metaDatasets.publisherId))
      .where(
        and(
          eq(metaSnapshotResourceReleaseDetails.snapshotId, snapshot.snapshotId),
          eq(metaSnapshotResourceReleaseDetails.role, 'enrichment'),
          eq(
            metaSnapshotResourceReleaseDetails.selectedByRule,
            'provenance:curated-division:build-inputs:v1',
          ),
          eq(metaPublishers.code, 'overture'),
        ),
      )
      .all()

    for (const resourceType of ['division', 'divisionArea'] as const) {
      const retained = retainedInputs.filter(
        input => input.resourceType === resourceType,
      )
      const selected = selectedInputs.filter(
        input => input.resourceType === resourceType,
      )
      const key = (input: (typeof retainedInputs)[number]) =>
        JSON.stringify([input.datasetId, input.resourceReleaseId])
      const retainedKeys = new Set(retained.map(key))
      const selectedKeys = new Set(selected.map(key))
      if (
        !retainedKeys.size ||
        retainedKeys.size !== selectedKeys.size ||
        [...retainedKeys].some(value => !selectedKeys.has(value))
      ) {
        throw new Error(
          `API Overture ${resourceType} selection does not match retained inputs for curated snapshot ${snapshot.snapshotId}. Expected: ${retained.map(input => input.releaseCode).join(', ') || 'missing'}; selected: ${selected.map(input => input.releaseCode).join(', ') || 'missing'}.`,
        )
      }
    }
  }
}
