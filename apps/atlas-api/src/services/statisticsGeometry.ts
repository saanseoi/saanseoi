import { getPublicationReadiness, guardPublicationRead } from '../db/publicationState'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import { resolveSnapshotVersionState } from '@repo/core/pipeline/db/snapshotReplay.ts'
import {
  hasCurrentDivisionGeometrySnapshot,
  listReplayedDivisionAreasByDivisionIds,
} from '../db/divisionGeometryReplay'
import { listDivisionAreasCurrentByDivisionIds } from '../db/divisions'
import type { AppEnv } from '../types'

export const statisticGeometryDependencies = {
  getPublicationReadiness,
  hasCurrentDivisionGeometrySnapshot,
  listDivisionAreasCurrentByDivisionIds,
  listReplayedDivisionAreasByDivisionIds,
  resolveSnapshotReplayPlan,
  resolveSnapshotVersionState,
}

export type StatisticGeometryDependencies = typeof statisticGeometryDependencies

export async function loadStatisticAreas(args: {
  currentDb: AppEnv['Variables']['currentDb']
  metaDb: AppEnv['Variables']['metaDb']
  historyDbsByBinding: AppEnv['Variables']['historyDbsByBinding']
  snapshotId: string
  divisionIds: string[]
  variant: string
  dependencies: StatisticGeometryDependencies
}) {
  if (args.divisionIds.length === 0) return []
  const { dependencies, snapshotId } = args
  const lookup = { divisionIds: args.divisionIds, variant: args.variant }
  const token = await dependencies.getPublicationReadiness(
    args.currentDb,
    'divisionArea',
    [snapshotId],
  )
  if (token !== null) {
    const rows = await guardPublicationRead(
      args.currentDb,
      'divisionArea',
      [snapshotId],
      token,
      () =>
        dependencies.listDivisionAreasCurrentByDivisionIds(args.currentDb, {
          snapshotId,
          ...lookup,
        }),
      dependencies.getPublicationReadiness,
    )
    if (rows !== null) return rows
  }

  const plan = await dependencies.resolveSnapshotReplayPlan(
    args.metaDb as never,
    snapshotId,
  )
  const shards = new Map(
    Object.entries(args.historyDbsByBinding).map(([bindingName, db]) => [
      bindingName,
      { bindingName, db: db as never },
    ]),
  )
  const versions = await dependencies.resolveSnapshotVersionState(plan, shards, [
    'divisionArea',
  ])
  return dependencies.listReplayedDivisionAreasByDivisionIds(versions.values(), lookup)
}
