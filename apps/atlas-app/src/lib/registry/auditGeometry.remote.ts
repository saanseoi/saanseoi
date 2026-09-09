import { query } from '$app/server'
import { z } from 'zod'
import { and, eq, currentSchema, historySchema, metaSchema } from '@repo/db'
import { getCurrentDb, getHistoryDb, getMetaDb } from './server'

export const getAuditGeometry = query(
  z.object({ releaseId: z.string(), divisionId: z.string() }),
  async ({ releaseId, divisionId }) => {
    const {
      metaSnapshotSources: sources,
      metaSnapshotShardAssignments: assignments,
      metaDataShards: shards,
    } = metaSchema
    const snapshots = await getMetaDb()
      .select({ snapshotId: sources.snapshotId, bindingName: shards.bindingName })
      .from(sources)
      .leftJoin(assignments, eq(assignments.snapshotId, sources.snapshotId))
      .leftJoin(shards, eq(shards.id, assignments.dataShardId))
      .where(eq(sources.resourceReleaseId, releaseId))
      .all()
    for (const snapshot of snapshots) {
      const table = currentSchema.divisionAreas
      const current = await getCurrentDb()
        .select({ geometry: table.geometry })
        .from(table)
        .where(
          and(
            eq(table.snapshotId, snapshot.snapshotId),
            eq(table.divisionId, divisionId),
          ),
        )
        .get()
      if (current) return current.geometry
      if (snapshot.bindingName) {
        const table = historySchema.divisionAreas
        const historical = await getHistoryDb(snapshot.bindingName)
          .select({ geometry: table.geometry })
          .from(table)
          .where(
            and(
              eq(table.snapshotId, snapshot.snapshotId),
              eq(table.divisionId, divisionId),
              eq(table.sourceReleaseId, releaseId),
            ),
          )
          .get()
        if (historical) return historical.geometry
      }
    }
    return null
  },
)
