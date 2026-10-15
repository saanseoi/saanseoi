import type { SnapshotCleanupMessage } from '@repo/core'
import type { ResourceType } from '@repo/core'
import { listCurrentSnapshotCleanupCandidates } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { and, currentSchema, eq, sql } from '@repo/db'
import type { CurrentDatabase, MetaDatabase } from '@repo/db'

type SnapshotCleanupCandidate = {
  snapshotId: string
  resourceType: ResourceType
}

type SnapshotCleanupResult = {
  deletedSnapshots: number
  skippedSnapshots: number
  snapshotIds: string[]
}

type AtomicWritableDb = HarbourReadableDb &
  HarbourWritableDb & {
    batch?: (statements: [unknown, ...unknown[]]) => Promise<unknown>
    transaction?: (run: () => unknown) => unknown
  }

async function runAtomically(db: AtomicWritableDb, statements: unknown[]) {
  if (typeof db.batch === 'function') {
    await db.batch(statements as [unknown, ...unknown[]])
  } else if (typeof db.transaction === 'function') {
    // Bun SQLite executes synchronously inside its transaction callback.
    db.transaction(() => {
      for (const statement of statements) {
        const result = (statement as { run(): unknown }).run()
        if (result instanceof Promise)
          throw new Error('Snapshot cleanup requires an atomic database batch')
      }
    })
  } else {
    throw new Error('Snapshot cleanup requires an atomic database batch')
  }
}

export async function cleanupCurrentSnapshots(
  metaDb: MetaDatabase,
  currentDb: CurrentDatabase,
  message: SnapshotCleanupMessage,
): Promise<SnapshotCleanupResult> {
  const metaRepoDb = metaDb as unknown as HarbourReadableDb
  const currentRepoDb = currentDb as unknown as HarbourReadableDb & HarbourWritableDb
  const candidates = (await listCurrentSnapshotCleanupCandidates(metaRepoDb, {
    resourceType: message.resourceType,
    snapshotIds: message.snapshotIds,
  })) as SnapshotCleanupCandidate[]
  const snapshotIds: string[] = []
  let skippedSnapshots = 0

  for (const resourceType of [
    'place',
    'address',
    'street',
    'division',
    'divisionArea',
    'divisionBoundary',
    'divisionStatistic',
  ] as const) {
    for (const candidate of candidates.filter(
      candidate => candidate.resourceType === resourceType,
    )) {
      const deleted = await cleanupSnapshotByResourceType(currentRepoDb, candidate)

      if (deleted) {
        snapshotIds.push(candidate.snapshotId)
      } else {
        skippedSnapshots += 1
      }
    }
  }

  return {
    deletedSnapshots: snapshotIds.length,
    skippedSnapshots,
    snapshotIds,
  }
}

/** Candidates must already be authorised by the metadata cleanup selection. */
export async function cleanupSnapshotByResourceType(
  db: AtomicWritableDb,
  candidate: SnapshotCleanupCandidate,
) {
  if (candidate.resourceType === 'divisionStatistic') {
    // These snapshot-owned links are separate from the retained statsRecords packs.
    const publication = currentSchema.statsPublicationState
    const unselected = sql`NOT EXISTS (SELECT 1 FROM ${publication}
      WHERE ${publication.snapshotId} = ${candidate.snapshotId})`
    if (
      await db
        .select({ id: publication.snapshotId })
        .from(publication)
        .where(eq(publication.snapshotId, candidate.snapshotId))
        .limit(1)
        .get()
    )
      return false
    await db
      .delete(currentSchema.divisionStatistics)
      .where(
        and(
          eq(currentSchema.divisionStatistics.snapshotId, candidate.snapshotId),
          unselected,
        ),
      )
      .run()
    return true
  }
  const publication = {
    place: currentSchema.placePublicationState,
    address: currentSchema.addressPublicationState,
    street: currentSchema.streetPublicationState,
    division: currentSchema.divisionPublicationState,
    divisionArea: currentSchema.divisionAreaPublicationState,
    divisionBoundary: currentSchema.divisionBoundaryPublicationState,
  }[candidate.resourceType]
  if (!publication) return false
  const receipt = await db
    .select({
      scopeId: publication.scopeId,
      publicationToken: publication.publicationToken,
      preparedAt: publication.preparedAt,
    })
    .from(publication)
    .where(eq(publication.snapshotId, candidate.snapshotId))
    .get()
  // A replaced revision no longer owns current rows. Never infer its scope from
  // lineage and delete the replacement, or interrupt a delivery still in progress.
  if (!receipt?.preparedAt || !receipt.publicationToken) return false
  const scopeId = receipt.scopeId
  const guards = [
    sql`EXISTS (SELECT 1 FROM ${publication}
    WHERE ${publication.scopeId} = ${scopeId}
      AND ${publication.snapshotId} = ${candidate.snapshotId}
      AND ${publication.publicationToken} = ${receipt.publicationToken}
      AND ${publication.preparedAt} = ${receipt.preparedAt})`,
  ]
  const search = {
    place: currentSchema.placeSearchScopes,
    address: currentSchema.addressSearchScopes,
    division: currentSchema.divisionSearchScopes,
  }[candidate.resourceType as 'place' | 'address' | 'division']
  if (search)
    guards.push(sql`NOT EXISTS (SELECT 1 FROM ${search}
    WHERE ${search.snapshotId} = ${candidate.snapshotId})`)
  // Places retain logical historical dependencies and their serving content;
  // those references do not require an Address or Division current projection.
  if (candidate.resourceType === 'street')
    guards.push(sql`NOT EXISTS (
    SELECT 1 FROM ${currentSchema.address2d} WHERE ${currentSchema.address2d.streetSnapshotId} = ${scopeId})`)
  if (candidate.resourceType === 'division')
    guards.push(
      sql`NOT EXISTS (SELECT 1 FROM ${currentSchema.address2d}
      WHERE ${currentSchema.address2d.divisionSnapshotId} = ${scopeId})`,
    )
  const guard = and(...guards)
  if (
    !(await db
      .select({ scopeId: publication.scopeId })
      .from(publication)
      .where(and(eq(publication.scopeId, scopeId), guard))
      .get())
  )
    return false

  const c = currentSchema
  const owned = {
    place: [
      [c.placesCells, c.placesCells.scopeId],
      [c.placesI18n, c.placesI18n.scopeId],
      [c.places, c.places.scopeId],
    ],
    address: [
      [c.address3dI18n, c.address3dI18n.scopeId],
      [c.address3d, c.address3d.scopeId],
      [c.address2dI18n, c.address2dI18n.scopeId],
      [c.address2dBuildingNumberLookup, c.address2dBuildingNumberLookup.scopeId],
      [c.streetsAddress, c.streetsAddress.addressSnapshotId],
      [c.address2d, c.address2d.scopeId],
    ],
    street: [
      [c.streetChangelog, c.streetChangelog.scopeId],
      [c.streetGeometry, c.streetGeometry.scopeId],
      [c.streetNameChanges, c.streetNameChanges.scopeId],
      [c.streetsAddress, c.streetsAddress.streetScopeId],
      [c.streetsI18n, c.streetsI18n.scopeId],
      [c.streets, c.streets.scopeId],
    ],
    division: [
      [c.divisionsI18n, c.divisionsI18n.scopeId],
      [c.divisions, c.divisions.scopeId],
    ],
    divisionArea: [[c.divisionAreas, c.divisionAreas.scopeId]],
    divisionBoundary: [[c.divisionBoundaries, c.divisionBoundaries.scopeId]],
  } as const
  await runAtomically(db, [
    ...owned[candidate.resourceType].map(([table, column]) =>
      db.delete(table).where(and(eq(column, scopeId), guard)),
    ),
    // Keep the ownership proof until all associated rows have been removed.
    db.delete(publication).where(and(eq(publication.scopeId, scopeId), guard)),
  ])
  return !(await db
    .select({ scopeId: publication.scopeId })
    .from(publication)
    .where(eq(publication.scopeId, scopeId))
    .get())
}
