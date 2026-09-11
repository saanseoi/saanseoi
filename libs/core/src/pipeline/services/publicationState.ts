import { eq, metaSnapshots } from '@repo/db'
import type { HarbourReadableDb } from '../../lib/db/types'
import { resolvePublicationSelections } from './publicationSelections'

export const publicationFamilies = [
  'division',
  'divisionArea',
  'divisionBoundary',
  'street',
  'address',
  'place',
] as const
export type PublicationFamily = (typeof publicationFamilies)[number]

export type PublicationStatement = {
  bind(...values: unknown[]): PublicationStatement
  all<T>(): Promise<{ results: T[] }>
  run(): Promise<unknown>
}
export type PublicationDatabase = {
  prepare(query: string): PublicationStatement
}

type PreparedPublication = {
  snapshotId: string
  scopeId: string
  publicationToken: string
  preparedAt: string
}

/**
 * A delivery receipt proves completion, including an empty snapshot. Only
 * publication may make that receipt serveable. Missing receipts stay unready;
 * reconciliation does not infer or backfill them from partially present rows.
 */
export async function finalisePublishedResources(
  meta: HarbourReadableDb,
  current: PublicationDatabase,
  options: {
    deferred?: boolean
    publishedFamilies?: readonly string[]
    snapshotIds?: readonly string[]
  } = {},
  dependencies = { resolvePublicationSelections },
) {
  if (options.deferred) return
  const families = new Set<PublicationFamily>()
  if (options.publishedFamilies === undefined && options.snapshotIds === undefined) {
    for (const family of publicationFamilies) families.add(family)
  } else {
    for (const family of options.publishedFamilies ?? []) {
      if (family === 'divisions') families.add('division')
      // A release set can activate companions delivered by an earlier deferred
      // upload, independently of the snapshot that triggered this publication.
      if (family === 'divisions' || family === 'stats') {
        families.add('divisionArea')
        families.add('divisionBoundary')
      }
      if (family === 'addresses' || family === 'places') families.add('address')
      if (family === 'places') families.add('place')
      if (family === 'streets') families.add('street')
    }
    for (const id of options.snapshotIds ?? []) {
      const snapshot = await meta
        .select({ family: metaSnapshots.resourceType })
        .from(metaSnapshots)
        .where(eq(metaSnapshots.id, id))
        .get()
      if (
        snapshot &&
        publicationFamilies.includes(snapshot.family as PublicationFamily)
      )
        families.add(snapshot.family as PublicationFamily)
    }
  }
  if (!families.size) return
  const prior = new Map<PublicationFamily, PreparedPublication[]>()
  for (const family of families) {
    const rows = await current
      .prepare(
        `SELECT snapshotId, scopeId, publicationToken, preparedAt FROM ${family}PublicationState WHERE preparedAt IS NOT NULL`,
      )
      .all<PreparedPublication>()
    prior.set(family, rows.results)
  }
  const selections = await dependencies.resolvePublicationSelections(meta)
  for (const family of families) {
    const table = `${family}PublicationState`
    const prepared = await current
      .prepare(
        `SELECT snapshotId, scopeId, publicationToken, preparedAt FROM ${table}
         WHERE status = 'publishing' AND preparedAt IS NOT NULL`,
      )
      .all<PreparedPublication>()
    for (const receipt of prepared.results) {
      if (!selections[family].has(receipt.snapshotId)) continue
      const snapshot = await meta
        .select({
          status: metaSnapshots.status,
          resourceType: metaSnapshots.resourceType,
          lineage: metaSnapshots.snapshotLineageId,
        })
        .from(metaSnapshots)
        .where(eq(metaSnapshots.id, receipt.snapshotId))
        .get()
      if (snapshot?.status !== 'published') continue
      if (snapshot.resourceType !== family)
        throw new Error(
          `Publication receipt family mismatch for ${receipt.snapshotId}.`,
        )
      if (family === 'address' && snapshot.lineage !== receipt.scopeId)
        throw new Error(`Address publication scope mismatch for ${receipt.snapshotId}.`)
      await current
        .prepare(
          `UPDATE ${table} SET status = 'current', updatedAt = ?
           WHERE snapshotId = ? AND scopeId = ? AND publicationToken = ?
             AND status = 'publishing' AND preparedAt = ?`,
        )
        .bind(
          new Date().toISOString(),
          receipt.snapshotId,
          receipt.scopeId,
          receipt.publicationToken,
          receipt.preparedAt,
        )
        .run()
    }
    // Only the authoritative selected set may retire a completed marker. Active
    // delivery receipts remain protected, and no observation data is rewritten.
    const ids = [...selections[family]]
    if (ids.length) {
      const ready = await current
        .prepare(
          `SELECT snapshotId FROM ${table} WHERE status = 'current' AND preparedAt IS NOT NULL
         AND publicationToken <> '' AND snapshotId IN (SELECT value FROM json_each(?))`,
        )
        .bind(JSON.stringify(ids))
        .all<{ snapshotId: string }>()
      if (ready.results.length !== ids.length)
        throw new Error(
          `Published ${family} snapshots do not have complete delivery receipts.`,
        )
    }
    if (ids.length && family !== 'address') {
      const candidates = (prior.get(family) ?? []).filter(
        row => !selections[family].has(row.snapshotId),
      )
      if (!candidates.length) continue
      const ancestors = await publicationAncestors(meta, ids)
      const retired = candidates.filter(row => ancestors.has(row.snapshotId))
      if (!retired.length) continue
      await current
        .prepare(
          `DELETE FROM ${table} WHERE preparedAt IS NOT NULL
         AND EXISTS (SELECT 1 FROM json_each(?) retired
           WHERE json_extract(retired.value, '$.snapshotId') = ${table}.snapshotId
             AND json_extract(retired.value, '$.publicationToken') = ${table}.publicationToken)`,
        )
        .bind(JSON.stringify(retired))
        .run()
    }
  }
}

async function publicationAncestors(meta: HarbourReadableDb, selected: string[]) {
  const ancestors = new Set<string>()
  const visited = new Set<string>()
  for (const id of selected) {
    let next: string | null = id
    while (next && !visited.has(next)) {
      visited.add(next)
      const row = await meta
        .select({ parent: metaSnapshots.parentSnapshotId })
        .from(metaSnapshots)
        .where(eq(metaSnapshots.id, next))
        .get()
      next = row?.parent ?? null
      if (next) ancestors.add(next)
    }
  }
  return ancestors
}
