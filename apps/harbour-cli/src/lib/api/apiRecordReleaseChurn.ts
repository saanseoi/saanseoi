import type { HarbourReadableDb } from '@repo/core/db/types'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import {
  resolveSnapshotVersionState,
  type ReplayShard,
  type ResolvedSnapshotVersion,
} from '@repo/core/pipeline/db/snapshotReplay'
import {
  buildChurnCounts,
  buildChurnStatsRows,
} from '@repo/core/pipeline/services/metrics/releaseStats'
import { and, eq, inArray, metaSchema } from '@repo/db'

export type RecordHistoryTarget = { bindingName: string; db: unknown }

/** Base records and their independently versioned public translations/geometry form one copy. */
export function apiRecordVersions(
  state: Iterable<ResolvedSnapshotVersion>,
  type: 'place' | 'street',
) {
  const versions = [...state]
  const dependencies = new Map<string, Array<[string, string, string]>>()
  for (const row of versions) {
    if (row.recordType === type) continue
    const values = dependencies.get(row.recordId) ?? []
    values.push([row.recordType, row.locale, row.versionHash])
    dependencies.set(row.recordId, values)
  }
  return new Map(
    versions
      .filter(row => row.recordType === type)
      .map(row => [
        row.recordId,
        {
          id: row.recordId,
          type,
          churnHash: JSON.stringify([
            row.versionHash,
            (dependencies.get(row.recordId) ?? []).sort((a, b) =>
              JSON.stringify(a).localeCompare(JSON.stringify(b)),
            ),
          ]),
          localisedRows: [],
          parentId: null,
          geometry: null,
        },
      ]),
  )
}

export async function buildApiRecordReleaseChurn(
  metaDb: HarbourReadableDb,
  targets: RecordHistoryTarget[],
  apiReleaseSetId: string,
  family: 'places' | 'streets',
) {
  const type = family === 'places' ? 'place' : 'street'
  const sets = metaSchema.metaApiReleaseSets
  const versions = metaSchema.metaApiVersionReleaseSets
  const snapshots = metaSchema.metaSnapshots
  const membership = metaSchema.metaApiReleaseSetSnapshots
  const lineages = metaSchema.metaSnapshotLineages
  const releases = await metaDb
    .select({
      id: sets.id,
      cohortKey: sets.cohortKey,
      revision: sets.revision,
      domainCode: sets.domainCode,
      regionCode: sets.regionCode,
      apiVersionId: versions.apiVersionId,
      snapshotId: snapshots.id,
    })
    .from(sets)
    .innerJoin(versions, eq(versions.apiReleaseSetId, sets.id))
    .innerJoin(
      metaSchema.metaApiVersions,
      eq(metaSchema.metaApiVersions.id, versions.apiVersionId),
    )
    .innerJoin(membership, eq(membership.apiReleaseSetId, sets.id))
    .innerJoin(snapshots, eq(snapshots.id, membership.snapshotId))
    .innerJoin(lineages, eq(lineages.id, snapshots.snapshotLineageId))
    .where(
      and(
        eq(metaSchema.metaApiVersions.familyType, family),
        inArray(versions.status, ['current', 'archived']),
        eq(membership.role, 'primary'),
        eq(lineages.resourceType, type),
        eq(snapshots.status, 'published'),
      ),
    )
    .all()
  releases.sort(
    (a, b) => a.cohortKey.localeCompare(b.cohortKey) || a.revision - b.revision,
  )
  const index = releases.findIndex(row => row.id === apiReleaseSetId)
  const current = releases[index]
  if (!current)
    throw new Error(`Published ${family} API release set not found: ${apiReleaseSetId}`)
  const previous = releases
    .slice(0, index)
    .findLast(
      row =>
        row.apiVersionId === current.apiVersionId &&
        row.domainCode === current.domainCode &&
        row.regionCode === current.regionCode,
    )
  const shards = new Map<string, ReplayShard>(
    targets.map(row => [
      row.bindingName,
      { bindingName: row.bindingName, db: row.db as HarbourReadableDb },
    ]),
  )
  async function read(snapshotId: string) {
    const plan = await resolveSnapshotReplayPlan(metaDb, snapshotId)
    if (!plan.length || plan.some(step => !step.shards.length))
      throw new Error(`Missing history assignment for ${snapshotId}`)
    const state = await resolveSnapshotVersionState(
      plan,
      shards,
      type === 'place'
        ? ['place', 'placeI18n']
        : ['street', 'streetI18n', 'streetGeometry'],
    )
    return apiRecordVersions(state.values(), type)
  }
  const before = previous ? await read(previous.snapshotId) : new Map()
  const after = await read(current.snapshotId)
  const churn = buildChurnCounts(before, after)
  const rows = buildChurnStatsRows({ totals: churn.totals, byType: new Map() })
  if (type === 'street')
    rows.push({
      category: 'records',
      measure: 'count',
      unit: 'count',
      value: churn.totals.count,
      dimension: null,
      dimensionValue: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  return rows
}

/** Fail processing rather than storing a release page without its aggregate record counts. */
export function assertApiRecordChangeTotals(
  rows: readonly {
    category: string
    measure: string
    value: number
    dimension?: string | null
  }[],
) {
  const totals = new Map<string, number>()
  for (const row of rows.filter(row => row.category === 'changes' && !row.dimension)) {
    if (totals.has(row.measure))
      throw new Error(`Duplicate aggregate record change measure: ${row.measure}`)
    totals.set(row.measure, row.value)
  }
  for (const key of [
    'count',
    'added_count',
    'changed_count',
    'removed_count',
    'unchanged_count',
  ]) {
    const count = totals.get(key)
    if (count === undefined || !Number.isSafeInteger(count) || count < 0)
      throw new Error(`Missing or invalid aggregate record change measure: ${key}`)
  }
  if (
    totals.get('count') !==
    totals.get('added_count')! +
      totals.get('changed_count')! +
      totals.get('unchanged_count')!
  )
    throw new Error('Aggregate record change counts do not balance')
  const records = rows.find(
    row => row.category === 'records' && row.measure === 'count' && !row.dimension,
  )
  if (records && records.value !== totals.get('count'))
    throw new Error('Aggregate record change count does not match primary records')
}
