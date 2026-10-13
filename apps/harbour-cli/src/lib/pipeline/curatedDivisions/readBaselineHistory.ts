import { Database } from 'bun:sqlite'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import { resolveSnapshotVersionState } from '@repo/core/pipeline/db/snapshotReplay'
import type { resolveLocalAddressDbContext } from '../../dbCache/localDbCache'

/** Read the exact published baseline after its serving projection is replaced. */
export async function readBaselineHistory(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  snapshotId: string,
  recordTypes: readonly ('division' | 'divisionI18n' | 'divisionArea')[],
) {
  const plan = await resolveSnapshotReplayPlan(context.metaDb as never, snapshotId)
  const versions = await resolveSnapshotVersionState(
    plan,
    new Map(
      context.historyTargets.map(target => [
        target.bindingName,
        {
          bindingName: target.bindingName,
          db: target.db as never,
        },
      ]),
    ),
    recordTypes,
  )
  const databases = new Map<string, Database>()
  const rows: Record<string, Record<string, any>[]> = {
    division: [],
    divisionI18n: [],
    divisionArea: [],
  }
  try {
    for (const version of versions.values()) {
      const binding = version.shard.bindingName
      let database = databases.get(binding)
      if (!database) {
        const path = context.state.files?.[binding]
        if (!path) throw new Error(`Missing baseline history binding ${binding}`)
        database = new Database(path, { readonly: true })
        databases.set(binding, database)
      }
      const translated = version.recordType === 'divisionI18n'
      const table = translated
        ? 'divisionsI18n'
        : version.recordType === 'division'
          ? 'divisions'
          : 'divisionAreas'
      const row = database
        .query(
          `SELECT * FROM ${table} WHERE ${translated ? 'divisionId' : 'id'}=? AND snapshotId=? AND operation='upsert' AND versionHash=?${translated ? ' AND locale=?' : ''}`,
        )
        .get(
          ...(translated
            ? [
                version.recordId,
                version.snapshotId,
                version.versionHash,
                version.locale,
              ]
            : [version.recordId, version.snapshotId, version.versionHash]),
        ) as Record<string, any> | null
      if (!row)
        throw new Error(
          `Missing retained ${version.recordType} ${version.recordId} for ${snapshotId}`,
        )
      const {
        operation: _operation,
        snapshotId: _,
        versionHash: __,
        sourceReleaseId: ___,
        isCurrent: ____,
        createdAt: _____,
        updatedAt: ______,
        ...content
      } = row
      rows[version.recordType]!.push(content)
    }
    return rows
  } finally {
    for (const database of databases.values()) database.close()
  }
}
