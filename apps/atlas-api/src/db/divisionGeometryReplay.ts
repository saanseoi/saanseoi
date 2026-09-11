import { getPublicationReadiness } from './publicationState'
import type { ResolvedSnapshotVersion } from '@repo/core/pipeline/db/snapshotReplay.ts'
import { groupResolvedVersionsByShard } from '@repo/core/pipeline/db/snapshotReplay.ts'
import { decompressJsonBrotli } from '@repo/core/pipeline/services/storage/brotliJson.ts'
import { and, eq, historySchema, or, sql } from '@repo/db'
import type { CurrentDatabase } from '@repo/db'
import type { DivisionAreaRecord, DivisionBoundaryRecord } from './divisions'

type GeometryKind = 'divisionArea' | 'divisionBoundary'
type GeometryLookup = { divisionIds: string[]; variant?: string }

export async function hasCurrentDivisionGeometrySnapshot(
  db: CurrentDatabase,
  snapshotId: string,
  kind: GeometryKind,
) {
  return (await getPublicationReadiness(db, kind, [snapshotId])) !== null
}

async function listReplayedGeometry(
  versions: Iterable<ResolvedSnapshotVersion>,
  kind: GeometryKind,
  lookup: GeometryLookup,
) {
  if (lookup.divisionIds.length === 0) return []
  const table =
    kind === 'divisionArea'
      ? historySchema.divisionAreas
      : historySchema.divisionBoundaries
  const selection = {
    id: table.id,
    variant: table.variant,
    bbox: table.bbox,
    geometry: table.geometry,
    identifiers: table.identifiers,
    sources: table.sources,
    type: table.type,
    isLand: table.isLand,
    isTerritorial: table.isTerritorial,
    ...(kind === 'divisionArea'
      ? { divisionId: historySchema.divisionAreas.divisionId }
      : {
          leftDivisionId: historySchema.divisionBoundaries.leftDivisionId,
          rightDivisionId: historySchema.divisionBoundaries.rightDivisionId,
        }),
  }
  const divisionIds = JSON.stringify([...new Set(lookup.divisionIds)])
  const divisionCondition =
    kind === 'divisionArea'
      ? sql`${historySchema.divisionAreas.divisionId} in (select value from json_each(${divisionIds}))`
      : sql`(${historySchema.divisionBoundaries.leftDivisionId} in (select value from json_each(${divisionIds})) or ${historySchema.divisionBoundaries.rightDivisionId} in (select value from json_each(${divisionIds})))`
  const reservedVariables = (kind === 'divisionArea' ? 1 : 2) + (lookup.variant ? 1 : 0)
  const batchSize = Math.floor((100 - reservedVariables) / 2)
  const grouped = groupResolvedVersionsByShard(
    [...versions].filter(version => version.recordType === kind),
  )
  const rows = (
    await Promise.all(
      [...grouped.values()].map(async shardVersions => {
        const firstVersion = shardVersions[0]
        if (!firstVersion) return []
        const db = firstVersion.shard.db
        const batches = Array.from(
          { length: Math.ceil(shardVersions.length / batchSize) },
          (_, index) => shardVersions.slice(index * batchSize, (index + 1) * batchSize),
        )
        return (
          await Promise.all(
            batches.map(batch =>
              db
                .select(selection)
                .from(table)
                .where(
                  and(
                    // The journal chooses both the content hash and its owner.
                    // Mutable history snapshotId/isCurrent fields are not membership.
                    or(
                      ...batch.map(version =>
                        and(
                          eq(table.id, version.recordId),
                          eq(table.versionHash, version.versionHash),
                        ),
                      ),
                    ),
                    divisionCondition,
                    lookup.variant ? eq(table.variant, lookup.variant) : undefined,
                  ),
                )
                .all(),
            ),
          )
        ).flat()
      }),
    )
  ).flat()
  return rows.map(row => ({
    ...row,
    geometry:
      row.geometry instanceof Uint8Array || row.geometry instanceof ArrayBuffer
        ? decompressJsonBrotli(row.geometry)
        : row.geometry,
  }))
}

export async function listReplayedDivisionAreasByDivisionIds(
  versions: Iterable<ResolvedSnapshotVersion>,
  lookup: GeometryLookup,
): Promise<DivisionAreaRecord[]> {
  return (await listReplayedGeometry(
    versions,
    'divisionArea',
    lookup,
  )) as DivisionAreaRecord[]
}

export async function listReplayedDivisionBoundariesByDivisionIds(
  versions: Iterable<ResolvedSnapshotVersion>,
  lookup: GeometryLookup,
): Promise<DivisionBoundaryRecord[]> {
  return (await listReplayedGeometry(
    versions,
    'divisionBoundary',
    lookup,
  )) as DivisionBoundaryRecord[]
}
