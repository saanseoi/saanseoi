import type { HarbourReadableDb } from '@repo/core/db/types'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import {
  resolveSnapshotVersionState,
  type ReplayShard,
} from '@repo/core/pipeline/db/snapshotReplay'
import {
  buildChurnCounts,
  type ChurnCounts,
} from '@repo/core/pipeline/services/metrics/releaseStats'
import { and, eq, inArray, metaSchema } from '@repo/db'

export type AddressHistoryTarget = { bindingName: string; db: unknown }

export type AddressStatsRelease = {
  apiVersionId: string
  code: string
  domainCode: string
  id: string
  regionCode: string
  revision: number
  snapshotId: string
}

type AddressChurnSnapshot = {
  churnHash: string
  id: string
  localisedRows: []
  parentId: null
  geometry: null
  type: 'address2d' | 'address3d'
}

export type AddressStatsSnapshot = {
  address2d: Map<string, AddressChurnSnapshot>
  address3d: Map<string, AddressChurnSnapshot>
}

export type AddressApiReleaseSetChurn = {
  address2d: ChurnCounts
  address3d: ChurnCounts
  totals: ChurnCounts
}

export async function listAddressStatsReleases(db: HarbourReadableDb) {
  const rows = await db
    .select({
      apiVersionId: metaSchema.metaApiReleaseSets.apiVersionId,
      code: metaSchema.metaApiReleaseSets.code,
      domainCode: metaSchema.metaApiReleaseSets.domainCode,
      id: metaSchema.metaApiReleaseSets.id,
      regionCode: metaSchema.metaApiReleaseSets.regionCode,
      revision: metaSchema.metaApiReleaseSets.revision,
      snapshotId: metaSchema.metaSnapshots.id,
    })
    .from(metaSchema.metaApiReleaseSets)
    .innerJoin(
      metaSchema.metaApiVersions,
      eq(metaSchema.metaApiVersions.id, metaSchema.metaApiReleaseSets.apiVersionId),
    )
    .innerJoin(
      metaSchema.metaApiReleaseSetSnapshots,
      eq(
        metaSchema.metaApiReleaseSetSnapshots.apiReleaseSetId,
        metaSchema.metaApiReleaseSets.id,
      ),
    )
    .innerJoin(
      metaSchema.metaSnapshots,
      eq(metaSchema.metaSnapshots.id, metaSchema.metaApiReleaseSetSnapshots.snapshotId),
    )
    .where(
      and(
        eq(metaSchema.metaApiVersions.familyType, 'addresses'),
        inArray(metaSchema.metaApiReleaseSets.status, ['current', 'archived']),
        eq(metaSchema.metaApiReleaseSetSnapshots.role, 'primary'),
        eq(metaSchema.metaSnapshots.resourceType, 'address'),
        eq(metaSchema.metaSnapshots.status, 'published'),
      ),
    )
    .all()

  return rows.sort(
    (left, right) =>
      left.code.localeCompare(right.code) || left.revision - right.revision,
  )
}

export function previousAddressStatsRelease(
  releases: AddressStatsRelease[],
  id: string,
) {
  const index = releases.findIndex(release => release.id === id)
  const release = releases[index]
  if (!release) throw new Error(`Published Address API release set not found: ${id}`)

  return releases
    .slice(0, index)
    .findLast(
      candidate =>
        candidate.apiVersionId === release.apiVersionId &&
        candidate.domainCode === release.domainCode &&
        candidate.regionCode === release.regionCode,
    )
}

/**
 * Replays immutable membership rather than mutable current rows. Address2D and
 * Address3D version hashes each already cover their complete retained payload.
 */
export async function readAddressStatsSnapshot(
  metaDb: HarbourReadableDb,
  targets: AddressHistoryTarget[],
  snapshotId: string,
): Promise<AddressStatsSnapshot> {
  const plan = await resolveSnapshotReplayPlan(metaDb, snapshotId)
  if (plan.some(step => step.shards.length === 0))
    throw new Error(`Missing history assignment for ${snapshotId}`)

  const shards = new Map<string, ReplayShard>(
    targets.map(target => [
      target.bindingName,
      { bindingName: target.bindingName, db: target.db as HarbourReadableDb },
    ]),
  )
  const state = await resolveSnapshotVersionState(plan, shards, [
    'address2d',
    'address3d',
  ])
  const address2d = new Map<string, AddressChurnSnapshot>()
  const address3d = new Map<string, AddressChurnSnapshot>()

  for (const version of state.values()) {
    if (version.recordType !== 'address2d' && version.recordType !== 'address3d')
      continue
    const row = {
      churnHash: version.versionHash,
      id: version.recordId,
      localisedRows: [],
      parentId: null,
      geometry: null,
      type: version.recordType,
    } satisfies AddressChurnSnapshot
    ;(version.recordType === 'address2d' ? address2d : address3d).set(row.id, row)
  }

  return { address2d, address3d }
}

export function buildAddressStatsChurn(
  current: AddressStatsSnapshot,
  previous: AddressStatsSnapshot = {
    address2d: new Map(),
    address3d: new Map(),
  },
): AddressApiReleaseSetChurn {
  const address2d = buildChurnCounts(previous.address2d, current.address2d).totals
  const address3d = buildChurnCounts(previous.address3d, current.address3d).totals

  return {
    // Address2D is the API's primary-record count and release-page overview.
    totals: address2d,
    address2d,
    address3d,
  }
}

export async function buildAddressApiReleaseSetChurn(
  metaDb: HarbourReadableDb,
  targets: AddressHistoryTarget[],
  apiReleaseSetId: string,
) {
  const releases = await listAddressStatsReleases(metaDb)
  const currentRelease = releases.find(release => release.id === apiReleaseSetId)
  if (!currentRelease)
    throw new Error(`Published Address API release set not found: ${apiReleaseSetId}`)

  const previousRelease = previousAddressStatsRelease(releases, apiReleaseSetId)
  const [current, previous] = await Promise.all([
    readAddressStatsSnapshot(metaDb, targets, currentRelease.snapshotId),
    previousRelease
      ? readAddressStatsSnapshot(metaDb, targets, previousRelease.snapshotId)
      : Promise.resolve(undefined),
  ])

  return buildAddressStatsChurn(current, previous)
}
