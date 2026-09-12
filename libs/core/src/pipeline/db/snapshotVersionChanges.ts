import { historySchema, sql } from '@repo/db'

import type { HarbourWritableDb } from '../../lib/db/types'
import { chunkArray, getMaxRowsPerInsert } from '../utils'

export type SnapshotVersionRecordType =
  | 'address2d'
  | 'address2dI18n'
  | 'address3d'
  | 'address3dI18n'
  | 'division'
  | 'divisionArea'
  | 'divisionBoundary'
  | 'divisionI18n'
  | 'place'
  | 'placeI18n'
  | 'street'
  | 'streetI18n'
  | 'streetChangelog'

type SnapshotVersionChangeInput = {
  recordId: string
  locale?: string
  versionHash?: string | null
}

const SNAPSHOT_VERSION_CHANGE_COLUMN_COUNT = 9

export async function recordSnapshotVersionChanges(
  db: HarbourWritableDb,
  args: {
    changes: SnapshotVersionChangeInput[]
    operation: 'delete' | 'upsert'
    recordType: SnapshotVersionRecordType
    snapshotId: string
    sourceReleaseId?: string | null
  },
) {
  if (args.changes.length === 0) return

  const now = new Date().toISOString()
  // The conflict update also binds operation, source release and timestamp (and
  // a null hash for deletions), in addition to every inserted row's columns.
  const chunkSize = getMaxRowsPerInsert(SNAPSHOT_VERSION_CHANGE_COLUMN_COUNT, 4)

  for (const changes of chunkArray(args.changes, chunkSize)) {
    await db
      .insert(historySchema.snapshotVersionChanges)
      .values(
        changes.map(change => ({
          snapshotId: args.snapshotId,
          recordType: args.recordType,
          recordId: change.recordId,
          locale: change.locale ?? '',
          versionHash:
            args.operation === 'upsert' ? (change.versionHash ?? null) : null,
          operation: args.operation,
          sourceReleaseId: args.sourceReleaseId ?? null,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [
          historySchema.snapshotVersionChanges.snapshotId,
          historySchema.snapshotVersionChanges.recordType,
          historySchema.snapshotVersionChanges.recordId,
          historySchema.snapshotVersionChanges.locale,
        ],
        set: {
          versionHash: args.operation === 'upsert' ? sql`excluded.versionHash` : null,
          operation: args.operation,
          sourceReleaseId: args.sourceReleaseId ?? null,
          updatedAt: now,
        },
      })
      .run()
  }
}
