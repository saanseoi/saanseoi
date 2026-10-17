import { and, eq, historySchema, type PlaceDivisionDefinitionSet } from '@repo/db'
import type { HarbourReadableDb } from '../../../lib/db/types'
import { resolveSnapshotReplayPlan } from '../../../lib/db/metaRegistry'
import { readSnapshotDependencies } from '../../db/snapshotDependencies'
import { resolveSnapshotVersionState, type ReplayShard } from '../../db/snapshotReplay'

export async function readPlacePublicationDependencies(
  meta: HarbourReadableDb,
  snapshotId: string,
) {
  const selected = await readSnapshotDependencies(meta, snapshotId)
  if (!selected.address || !selected.division)
    throw new Error(
      `Place publication ${snapshotId} requires exact Address and Division dependencies.`,
    )
  for (const role of ['address', 'supplementaryAddress']) {
    if (!selected[role]) continue
    const address = await readSnapshotDependencies(meta, selected[role])
    if (address.division !== selected.division)
      throw new Error(
        `Place publication ${snapshotId} has inconsistent ${role}/Division dependencies.`,
      )
  }
  return selected as Record<'address' | 'division', string> & {
    supplementaryAddress?: string
  }
}

/** Resolve one complete logical Division revision, including inherited content versions. */
export async function replayPlaceDivisionDefinitions(
  meta: HarbourReadableDb,
  shards: ReadonlyMap<string, ReplayShard>,
  snapshotId: string,
  ids: readonly string[],
): Promise<PlaceDivisionDefinitionSet> {
  const wanted = [...new Set(ids)]
  if (!wanted.length) return {}
  const plan = await resolveSnapshotReplayPlan(meta, snapshotId)
  const versions = await resolveSnapshotVersionState(
    plan,
    shards,
    ['division', 'divisionI18n'],
    wanted,
  )
  const result: PlaceDivisionDefinitionSet = {}
  for (const version of versions.values()) {
    if (version.recordType !== 'division') continue
    const t = historySchema.divisions
    const row = await version.shard.db
      .select({ level: t.level })
      .from(t)
      .where(
        and(
          eq(t.id, version.recordId),
          eq(t.snapshotId, version.snapshotId),
          eq(t.versionHash, version.versionHash),
        ),
      )
      .get()
    if (!row) throw new Error(`Missing Division ${version.recordId} in ${snapshotId}.`)
    result[version.recordId] = {
      divisionSnapshotId: snapshotId,
      level: row.level,
      locales: [],
    }
  }
  for (const version of versions.values()) {
    if (version.recordType !== 'divisionI18n') continue
    const t = historySchema.divisionsI18n
    const row = await version.shard.db
      .select({ locale: t.locale, name: t.name })
      .from(t)
      .where(
        and(
          eq(t.divisionId, version.recordId),
          eq(t.snapshotId, version.snapshotId),
          eq(t.versionHash, version.versionHash),
          eq(t.locale, version.locale),
        ),
      )
      .get()
    if (!row || !result[version.recordId])
      throw new Error(
        `Missing Division localisation ${version.recordId}/${version.locale}.`,
      )
    result[version.recordId]!.locales.push(row)
  }
  if (wanted.some(id => !result[id]))
    throw new Error(`Incomplete Division dependency ${snapshotId}.`)
  for (const entry of Object.values(result))
    entry.locales.sort((a, b) => a.locale.localeCompare(b.locale))
  return result
}

export function resolvePlaceAddressSnapshot(
  selected: { address: string; supplementaryAddress?: string },
  role: 'address' | 'supplementaryAddress' | null,
): string | null {
  if (!role) return null
  const snapshotId = selected[role]
  if (!snapshotId)
    throw new Error('Place Address role has no selected publication dependency.')
  return snapshotId
}
