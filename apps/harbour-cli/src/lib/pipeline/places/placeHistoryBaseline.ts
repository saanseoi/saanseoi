import { currentSchema, historySchema, eq, sql } from '@repo/db'
import type { HarbourReadableDb } from '@repo/core/db/types'
import type { SnapshotReplayStep } from '@repo/core/db/metaRegistry'
import {
  resolveSnapshotVersionState,
  groupResolvedVersionsByShard,
} from '@repo/core/pipeline/db/snapshotReplay'
import type { LocalAddressDbContext } from '../../dbCache/localDbCache.ts'
import type { PlaceHistoryState } from './processLocalPlaceSqlUploadTypes.ts'

/** The serving predecessor owns membership; retained isCurrent flags are not selection. */
export async function loadCurrentPlaceHistory(
  targets: LocalAddressDbContext['historyTargets'],
  ownership: {
    currentDb: HarbourReadableDb
    scopeId: string
    replayPlan: SnapshotReplayStep[]
  },
): Promise<PlaceHistoryState[]> {
  const shards = new Map(
    targets.map(target => [
      target.bindingName,
      {
        bindingName: target.bindingName,
        db: target.db as HarbourReadableDb,
      },
    ]),
  )
  if (shards.size !== targets.length)
    throw new Error('Duplicate Place history binding.')
  for (const step of ownership.replayPlan)
    if (!step.shards.length)
      throw new Error(
        `Place predecessor ${step.snapshotId} has no retained history assignment.`,
      )
  const versions = await resolveSnapshotVersionState(ownership.replayPlan, shards, [
    'place',
    'placeI18n',
  ])
  const states = new Map<string, PlaceHistoryState>()
  const localeRows: NonNullable<PlaceHistoryState['locales']> = []
  for (const [bindingName, group] of groupResolvedVersionsByShard(versions.values())) {
    const db = shards.get(bindingName)?.db
    if (!db) throw new Error(`Missing Place history binding ${bindingName}.`)
    for (const localised of [false, true]) {
      const expected = group.filter(
        version => version.recordType === (localised ? 'placeI18n' : 'place'),
      )
      const table = localised ? historySchema.placesI18n : historySchema.places
      for (let start = 0; start < expected.length; start += 100) {
        const batch = expected.slice(start, start + 100)
        const identities = new Set(
          batch.map(version =>
            JSON.stringify([version.recordId, version.locale, version.versionHash]),
          ),
        )
        const found = new Set<string>()
        const rows = await db
          .select()
          .from(table)
          .where(
            sql`${table.versionHash} in (select value from json_each(${JSON.stringify(batch.map(version => version.versionHash))}))`,
          )
          .all()
        for (const row of rows) {
          const identity = JSON.stringify([
            localised ? row.placeId : row.id,
            localised ? row.locale : '',
            row.versionHash,
          ])
          if (!identities.has(identity)) continue
          if (found.has(identity))
            throw new Error(`Duplicate exact Place history component ${identity}.`)
          found.add(identity)
          if (localised)
            localeRows.push({
              bindingName,
              row: row as typeof historySchema.placesI18n.$inferSelect,
            })
          else
            states.set(String(row.id), {
              bindingName,
              row: row as typeof historySchema.places.$inferSelect,
              locales: [],
            })
        }
        if (found.size !== identities.size)
          throw new Error(`Missing exact Place predecessor content on ${bindingName}.`)
      }
    }
  }
  for (const localised of localeRows) {
    const state = states.get(localised.row.placeId)
    if (!state)
      throw new Error(
        `Place predecessor locale without a base: ${localised.row.placeId}/${localised.row.locale}.`,
      )
    state.locales ??= []
    state.locales.push(localised)
  }
  const ownedIds = new Set(
    (
      await ownership.currentDb
        .select({ id: currentSchema.places.id })
        .from(currentSchema.places)
        .where(eq(currentSchema.places.snapshotId, ownership.scopeId))
        .all()
    ).map(row => row.id),
  )
  if (ownedIds.size !== states.size || [...states.keys()].some(id => !ownedIds.has(id)))
    throw new Error('Place predecessor membership does not match its serving scope.')
  const links = await ownership.currentDb
    .select()
    .from(currentSchema.placesDivision)
    .where(eq(currentSchema.placesDivision.placeSnapshotId, ownership.scopeId))
    .all()
  for (const link of links) {
    const state = states.get(String(link.placeId))
    if (!state)
      throw new Error(
        `Current Place Division link without a base: ${link.placeId}/${link.divisionId}.`,
      )
    state.divisionLinks ??= []
    state.divisionLinks.push(link as typeof currentSchema.placesDivision.$inferSelect)
  }
  return [...states.values()]
}
