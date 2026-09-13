import type { HarbourReadableDb } from '@repo/core/db/types'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import { resolveSnapshotSourceResolutions } from '@repo/core/pipeline/db/sourceResolutionReplay'
import { createHash } from '@repo/core/pipeline/utils'
import type { LocalAddressDbContext } from '../../dbCache/localDbCache.ts'
import { insertSql, lit } from './processLocalPlaceSqlUploadImport.ts'
import type { EnrichedPlace } from './processLocalPlaceSqlUploadTypes.ts'

export async function loadPreviousPlaceSourceResolutions(
  metaDb: HarbourReadableDb,
  targets: LocalAddressDbContext['historyTargets'],
  parentSnapshotId?: string | null,
) {
  if (!parentSnapshotId) return new Map()
  return resolveSnapshotSourceResolutions(
    await resolveSnapshotReplayPlan(metaDb, parentSnapshotId),
    new Map(
      targets.map(target => [
        target.bindingName,
        {
          bindingName: target.bindingName,
          db: target.db as HarbourReadableDb,
        },
      ]),
    ),
  )
}

export const canonicalPlaceJson = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  )

/** A component can reappear without replacing its original revision provenance. */
export function placeHistoryInsertSql(
  table: string,
  values: Record<string, unknown>,
  now: string,
) {
  const insert = insertSql(table, values)
  return (
    insert.slice(0, insert.indexOf(' ON CONFLICT')) +
    ` ON CONFLICT DO UPDATE SET isCurrent = 1, updatedAt = ${lit(now)} WHERE ${table}.isCurrent <> 1;`
  )
}

export function placeLocaleHash(
  localised: EnrichedPlace['place']['i18n'][number],
  dependencies?: Record<string, unknown> | null,
) {
  const { addressSnapshotId: _snapshot, ...text } = dependencies ?? {}
  return createHash({
    localised: { ...localised, accessHint: localised.accessHint ?? null },
    dependencies: Object.keys(text).length ? text : null,
  })
}

export function reusePlaceLocaleDependencies<T extends Record<string, unknown>>(
  candidate: T | undefined,
  previous: T | null | undefined,
) {
  const contents = (value: T | null | undefined) => {
    const { addressSnapshotId: _snapshot, ...text } = (value ?? {}) as Record<
      string,
      unknown
    >
    return canonicalPlaceJson(text)
  }
  if (!candidate) return null
  const isLinked = (value: T) => value.addressSnapshotId != null
  return previous &&
    isLinked(candidate) === isLinked(previous) &&
    contents(candidate) === contents(previous)
    ? previous
    : candidate
}
