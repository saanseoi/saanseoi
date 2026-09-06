import {
  listPublishedSnapshotsForResourceTypeRegionAtOrAfterCohortKey,
  resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey,
  resolvePublishedSnapshotForResourceTypeRegionCohortKey,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { chunkArray } from '@repo/core/pipeline/utils'
import { toIsoTimestamp } from '@repo/db'
import { currentSchema, historySchema } from '@repo/db'
import { eq } from 'drizzle-orm'
import type { resolveLocalAddressDbContext } from '../dbCache/localDbCache.ts'
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
  historyDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['historyDb'],
  metaDb: HarbourReadableDb,
  plan: GeometryUploadPlan,
  rows: Array<NonNullable<NormalisedGeometry>>,
) {
  const lookup = await resolveDivisionReferenceLookup(metaDb, plan)
  if (lookup.snapshots.length === 0) {
    throw new Error(
      isCenstatdPermanentLivingQuartersPlan(plan)
        ? `No published canonical Overture division snapshot exists for ${plan.regionCode}/${plan.cohortKey}; C&SD permanent living quarters references cannot be validated.`
        : `No published division snapshot exists for ${plan.regionCode}/${plan.cohortKey}; geometry references cannot be validated.`,
    )
  }
  const initialDivisionSnapshot = lookup.snapshots.at(0)
  if (!initialDivisionSnapshot) {
    throw new Error('Division reference lookup returned no snapshots.')
  }
  const referenceIds = new Set(
    rows.flatMap(row => divisionReferenceIds(plan.type, row)),
  )
  let divisionSnapshot = initialDivisionSnapshot
  let knownIds = new Set<string>()
  let selectionIndex = 0
  for (const [index, candidate] of lookup.snapshots.entries()) {
    let divisionRows = await listCurrentDivisionIds(currentDb, candidate.id)
    if (divisionRows.length === 0) {
      await restoreDivisionSnapshotFromHistory(
        currentDb as unknown as HarbourWritableDb,
        historyDb,
        candidate.id,
      )
      divisionRows = await listCurrentDivisionIds(currentDb, candidate.id)
    }
    const candidateIds = new Set(divisionRows.map(row => row.id))
    if (hasDivisionReferences(candidateIds, referenceIds)) {
      divisionSnapshot = candidate
      knownIds = candidateIds
      selectionIndex = index
      break
    }
    if (index === 0) knownIds = candidateIds
  }
  const missingReferences = rows.flatMap(row => {
    const missingIds = divisionReferenceIds(plan.type, row).filter(
      id => !knownIds.has(id),
    )
    return missingIds.length > 0
      ? [
          {
            missingIds: [...new Set(missingIds)],
            record: row.source.rawProperties,
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
        { publisherCode: 'overture', variant: 'overture' },
      )
    const laterSnapshots =
      await listPublishedSnapshotsForResourceTypeRegionAtOrAfterCohortKey(
        metaDb,
        'division',
        plan.regionCode,
        plan.cohortKey,
        { publisherCode: 'overture', variant: 'overture' },
      )
    const snapshots = [prior, ...laterSnapshots].filter(
      (snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot),
    )
    const uniqueSnapshots = [
      ...new Map(snapshots.map(snapshot => [snapshot.id, snapshot])).values(),
    ]
    return {
      snapshots: uniqueSnapshots,
      selectedByRule: 'api-composition:divisions:censtatd-area-type->overture-division',
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
    selectedByRule: 'api-composition:divisions:division-geometry->division',
    selectionMode: 'exact_ref',
  }
}

async function listCurrentDivisionIds(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  snapshotId: string,
) {
  return currentDb
    .select({ id: currentSchema.divisions.id })
    .from(currentSchema.divisions)
    .where(eq(currentSchema.divisions.snapshotId, snapshotId))
    .all()
}

// A division release may publish before its required geometry companion. If the
// asynchronous cleanup removes that incomplete snapshot in the meantime, rebuild
// its current projection from the immutable history snapshot before validation.
async function restoreDivisionSnapshotFromHistory(
  currentDb: HarbourWritableDb,
  historyDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['historyDb'],
  snapshotId: string,
) {
  const [divisionRows, i18nRows] = await Promise.all([
    historyDb
      .select({
        bbox: historySchema.divisions.bbox,
        cartography: historySchema.divisions.cartography,
        geometry: historySchema.divisions.geometry,
        hierarchy: historySchema.divisions.hierarchy,
        id: historySchema.divisions.id,
        identifiers: historySchema.divisions.identifiers,
        level: historySchema.divisions.level,
        sources: historySchema.divisions.sources,
        type: historySchema.divisions.type,
        wikidata: historySchema.divisions.wikidata,
      })
      .from(historySchema.divisions)
      .where(eq(historySchema.divisions.snapshotId, snapshotId))
      .all(),
    historyDb
      .select({
        divisionId: historySchema.divisionsI18n.divisionId,
        isLocaleInferred: historySchema.divisionsI18n.isLocaleInferred,
        locale: historySchema.divisionsI18n.locale,
        name: historySchema.divisionsI18n.name,
        nameAlts: historySchema.divisionsI18n.nameAlts,
        nameRules: historySchema.divisionsI18n.nameRules,
        nameVariant: historySchema.divisionsI18n.nameVariant,
      })
      .from(historySchema.divisionsI18n)
      .where(eq(historySchema.divisionsI18n.snapshotId, snapshotId))
      .all(),
  ])

  if (divisionRows.length === 0) return

  const now = toIsoTimestamp()
  for (const chunk of chunkArray(divisionRows, 8)) {
    await currentDb
      .insert(currentSchema.divisions)
      .values(
        chunk.map(row => ({
          ...row,
          createdAt: now,
          snapshotId,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing()
      .run()
  }
  for (const chunk of chunkArray(i18nRows, 8)) {
    await currentDb
      .insert(currentSchema.divisionsI18n)
      .values(
        chunk.map(row => ({
          ...row,
          createdAt: now,
          snapshotId,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing()
      .run()
  }
}

export function divisionReferenceIds(
  type: GeometryUploadPlan['type'],
  row: NonNullable<NormalisedGeometry>,
) {
  const canonical = row.canonical as {
    divisionId?: string
    leftDivisionId?: string
    rightDivisionId?: string
  }
  return type === 'divisionArea'
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
