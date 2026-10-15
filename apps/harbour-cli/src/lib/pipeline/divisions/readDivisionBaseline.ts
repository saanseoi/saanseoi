import { defineRelations } from 'drizzle-orm'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { currentSchema, eq, metaSchema } from '@repo/db'
import { getDivisionVersionMapForSnapshot } from '@repo/core/pipeline/db/division'
import {
  buildDivisionBaseHashInput,
  normaliseDivisionI18nSnapshotRow,
} from '@repo/core/pipeline/services/divisions/division'
import { restoreSnapshotProjection } from '../../commands/rollback/projection'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes'
import type { HarbourReadableDb } from '@repo/core/db/types'

/** A displaced published revision is read from exact history, never a fabricated receipt. */
export async function readDivisionBaseline(
  context: LocalAddressDbContext,
  snapshotId: string,
  ownerShardKeys: string[],
) {
  const receipt = await context.currentDb
    .select()
    .from(currentSchema.divisionPublicationState)
    .where(eq(currentSchema.divisionPublicationState.snapshotId, snapshotId))
    .get()
  const options = { buildDivisionBaseHashInput, normaliseDivisionI18nSnapshotRow }
  if (receipt) {
    if (!receipt.preparedAt || !receipt.publicationToken)
      throw new Error(
        `Division snapshot ${snapshotId} has an incomplete publication receipt.`,
      )
    return getDivisionVersionMapForSnapshot(
      context.currentDb as never,
      receipt.scopeId,
      options,
      ownerShardKeys,
    )
  }
  const snapshot = await context.metaDb
    .select({
      status: metaSchema.metaSnapshots.status,
      resourceType: metaSchema.metaSnapshotLineages.resourceType,
    })
    .from(metaSchema.metaSnapshots)
    .innerJoin(
      metaSchema.metaSnapshotLineages,
      eq(
        metaSchema.metaSnapshots.snapshotLineageId,
        metaSchema.metaSnapshotLineages.id,
      ),
    )
    .where(eq(metaSchema.metaSnapshots.id, snapshotId))
    .get()
  if (snapshot?.status !== 'published' || snapshot.resourceType !== 'division')
    throw new Error(`Division replay requires a published snapshot ${snapshotId}.`)
  const path = context.state.files?.DB_CURRENT
  if (!path) throw new Error('Division replay requires the current schema.')
  const source = new Database(path, { readonly: true, create: false })
  const candidate = new Database(':memory:')
  try {
    for (const table of ['divisions', 'divisionsI18n']) {
      const schema = source
        .query<{ sql: string }, [string]>(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
        )
        .get(table)
      if (!schema) throw new Error(`Missing Division schema ${table}.`)
      candidate.exec(schema.sql)
    }
    await restoreSnapshotProjection({
      current: candidate,
      metaDb: context.metaDb as never,
      historyTargets: context.historyTargets.map(target => ({
        bindingName: target.bindingName,
        db: target.db as HarbourReadableDb,
      })),
      snapshotId,
      scopeId: snapshotId,
      resourceType: 'division',
      deferForeignKeyValidation: true,
    })
    return await getDivisionVersionMapForSnapshot(
      drizzle({
        client: candidate,
        relations: defineRelations(currentSchema),
      }) as never,
      snapshotId,
      options,
      ownerShardKeys,
    )
  } finally {
    candidate.close()
    source.close()
  }
}
