import { and, eq, gt, isNull, lte, or } from 'drizzle-orm'
import {
  listPublishedSnapshotsForResourceTypeRegionAtOrAfterCohortKey,
  resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey,
  resolvePublishedSnapshotForResourceTypeRegionCohortKey,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  metaResourceReleaseDetails,
  metaSnapshotResourceReleases,
  sourceSchema,
} from '@repo/db'
import type { ReplayShard } from '@repo/core/pipeline/db/snapshotReplay'
import { readDivisionSnapshot } from './readDivisionSnapshot.ts'
import type { resolveLocalAddressDbContext } from '../../dbCache/localDbCache.ts'
import type {
  GeometryUploadPlan,
  NormalisedGeometry,
} from './processLocalDivisionGeometrySqlUploadTypes.ts'
import {
  divisionReferenceVariant,
  isCenstatdPermanentLivingQuartersPlan,
} from './processLocalDivisionGeometrySqlUploadPreparation.ts'

export async function assertDivisionReferences(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  sourceDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['sourceDb'],
  historyTargets: readonly ReplayShard[],
  metaDb: HarbourReadableDb,
  plan: GeometryUploadPlan,
  rows: Array<NonNullable<NormalisedGeometry>>,
) {
  const lookup = await resolveDivisionReferenceLookup(metaDb, plan)
  if (lookup.snapshots.length === 0) {
    throw new Error(
      isCenstatdPermanentLivingQuartersPlan(plan)
        ? `No published canonical SaanSeoi division snapshot exists for ${plan.regionCode}/${plan.cohortKey}; C&SD permanent living quarters references cannot be validated.`
        : `No published division snapshot exists for ${plan.regionCode}/${plan.cohortKey}; geometry references cannot be validated.`,
    )
  }
  const initialDivisionSnapshot = lookup.snapshots.at(0)
  if (!initialDivisionSnapshot) {
    throw new Error('Division reference lookup returned no snapshots.')
  }
  const referenceIds = new Set(
    rows.flatMap(row => divisionReferenceIds(plan.resourceType, row)),
  )
  let divisionSnapshot = initialDivisionSnapshot
  let knownIds = new Set<string>()
  let selectionIndex = 0
  for (const [index, candidate] of lookup.snapshots.entries()) {
    const candidateIds =
      plan.source === 'saanseoi'
        ? await readCuratedDivisionSourceIds(sourceDb, metaDb, candidate.id)
        : new Set(
            (
              await readDivisionSnapshot(
                currentDb as never,
                metaDb,
                candidate.id,
                historyTargets,
              )
            ).divisions.map(row => row.id),
          )
    if (hasDivisionReferences(candidateIds, referenceIds)) {
      divisionSnapshot = candidate
      knownIds = candidateIds
      selectionIndex = index
      break
    }
    if (index === 0) knownIds = candidateIds
  }
  const missingReferences = rows.flatMap(row => {
    const missingIds = divisionReferenceIds(plan.resourceType, row).filter(
      id => !knownIds.has(id),
    )
    return missingIds.length > 0
      ? [
          {
            missingIds: [...new Set(missingIds)],
            record: row.source.properties,
          },
        ]
      : []
  })
  const missingIds = [
    ...new Set(missingReferences.flatMap(reference => reference.missingIds)),
  ]
  if (missingIds.length > 0) {
    throw new Error(
      [
        `Division geometry references ${missingIds.length} division IDs absent from ${divisionSnapshot.code}.`,
        ...formatMissingDivisionReferenceRecords(missingReferences),
      ].join('\n'),
    )
  }

  return {
    id: divisionSnapshot.id,
    selectedByRule: lookup.selectedByRule,
    selectionMode:
      selectionIndex === 0
        ? lookup.selectionMode
        : 'nearest_snapshot_containing_references',
  }
}

export async function readCuratedDivisionSourceIds(
  sourceDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['sourceDb'],
  metaDb: HarbourReadableDb,
  snapshotId: string,
) {
  const releases = await metaDb
    .select({ sourceVersion: metaResourceReleaseDetails.sourceVersion })
    .from(metaSnapshotResourceReleases)
    .innerJoin(
      metaResourceReleaseDetails,
      eq(metaResourceReleaseDetails.id, metaSnapshotResourceReleases.resourceReleaseId),
    )
    .where(
      and(
        eq(metaSnapshotResourceReleases.snapshotId, snapshotId),
        eq(metaSnapshotResourceReleases.role, 'primary'),
      ),
    )
    .all()
  const ids = new Set<string>()
  for (const release of releases) {
    const records = await sourceDb
      .select({ sourceRecordId: sourceSchema.sourceSsDivision.sourceRecordId })
      .from(sourceSchema.sourceSsDivision)
      .where(
        and(
          lte(sourceSchema.sourceSsDivision.validFromRelease, release.sourceVersion),
          or(
            isNull(sourceSchema.sourceSsDivision.validToRelease),
            gt(sourceSchema.sourceSsDivision.validToRelease, release.sourceVersion),
          ),
        ),
      )
      .all()
    for (const record of records) ids.add(record.sourceRecordId)
  }
  return ids
}

export function hasDivisionReferences(
  knownIds: ReadonlySet<string>,
  referenceIds: ReadonlySet<string>,
) {
  return [...referenceIds].every(id => knownIds.has(id))
}

async function resolveDivisionReferenceLookup(
  metaDb: HarbourReadableDb,
  plan: GeometryUploadPlan,
) {
  if (isCenstatdPermanentLivingQuartersPlan(plan)) {
    const prior =
      await resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey(
        metaDb,
        'division',
        plan.regionCode,
        plan.cohortKey,
        { publisherCode: 'saanseoi', variant: 'saanseoi' },
      )
    const laterSnapshots =
      await listPublishedSnapshotsForResourceTypeRegionAtOrAfterCohortKey(
        metaDb,
        'division',
        plan.regionCode,
        plan.cohortKey,
        { publisherCode: 'saanseoi', variant: 'saanseoi' },
      )
    const snapshots = [prior, ...laterSnapshots].filter(
      (snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot),
    )
    const uniqueSnapshots = [
      ...new Map(snapshots.map(snapshot => [snapshot.id, snapshot])).values(),
    ]
    return {
      snapshots: uniqueSnapshots,
      selectedByRule: 'lookup:censtatd-living-quarters:saanseoi-division-references:v1',
      selectionMode: prior ? 'latest_at_or_before' : 'earliest_at_or_after',
    }
  }

  return {
    snapshots: [
      await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
        metaDb,
        'division',
        plan.regionCode,
        plan.cohortKey,
        { variant: divisionReferenceVariant(plan) },
      ),
    ].filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot)),
    selectedByRule: 'lookup:division-geometry:division-references:v1',
    selectionMode: 'exact_ref',
  }
}

export function divisionReferenceIds(
  resourceType: GeometryUploadPlan['resourceType'],
  row: NonNullable<NormalisedGeometry>,
) {
  const canonical = row.canonical as {
    divisionId?: string
    leftDivisionId?: string
    rightDivisionId?: string
  }
  return resourceType === 'divisionArea'
    ? canonical.divisionId
      ? [canonical.divisionId]
      : []
    : [canonical.leftDivisionId, canonical.rightDivisionId].filter((id): id is string =>
        Boolean(id),
      )
}

export function formatMissingDivisionReferenceRecords(
  references: Array<{ missingIds: string[]; record: unknown }>,
) {
  const examples = references.slice(0, 3)
  const label = examples.length === 1 ? 'Affected record:' : 'Affected records:'
  const records = examples.map((reference, index) =>
    [
      examples.length > 1
        ? `Record ${index + 1} (missing division IDs: ${reference.missingIds.join(', ')}):`
        : `Missing division IDs: ${reference.missingIds.join(', ')}`,
      formatDiagnosticRecord(reference.record),
    ].join('\n'),
  )
  const remaining = references.length - examples.length

  return [
    '',
    label,
    ...records,
    ...(remaining > 0
      ? [`... and ${remaining} more affected record${remaining === 1 ? '' : 's'}.`]
      : []),
  ]
}

function bigintJsonReplacer(_key: string, value: unknown) {
  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (Array.isArray(value) && value.length > 3) {
    return [...value.slice(0, 3), `... ${value.length - 3} more`]
  }

  return value
}

function formatDiagnosticRecord(record: unknown) {
  return JSON.stringify(record, bigintJsonReplacer, 2)
}
