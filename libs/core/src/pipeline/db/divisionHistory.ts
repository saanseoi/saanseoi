import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { historySchema } from '@repo/db'
import type { DivisionI18nPayload } from '@repo/db/currentSchema'
import type { NewSourceResolution } from '@repo/db/historySchema'
import type { SnapshotReplayStep } from '../../lib/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '../../lib/db/types'
import {
  chunkArray,
  createHash,
  runStatementsInGroupsWithWriteRetry,
  stableJsonStringify,
} from '../utils'
import type {
  DivisionBaseRecord,
  DivisionVersionSnapshot,
  insertDivisionVersionRows,
} from './division'
import { recordSnapshotVersionChanges } from './snapshotVersionChanges'
import {
  resolveSnapshotSourceResolutions,
  type ResolvedSnapshotSourceResolution,
} from './sourceResolutionReplay'

export type DivisionHistoryShard = {
  bindingName: string
  db: HarbourReadableDb & HarbourWritableDb
}
export type DivisionHistoryComponent = {
  recordType: 'division' | 'divisionI18n'
  recordId: string
  locale: string
  versionHash: string
  shard: DivisionHistoryShard
}
export const divisionHistoryKey = (id: string, locale = '') =>
  JSON.stringify([id, locale])

/** Publication labels are source assertions, not canonical Division content. */
export function withoutDivisionPublicationVersion(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutDivisionPublicationVersion)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'sourceVersion')
        .map(([key, item]) => [key, withoutDivisionPublicationVersion(item)]),
    )
  return value ?? null
}

export function divisionLocaleContent(row: DivisionI18nPayload) {
  return {
    divisionId: row.divisionId,
    locale: row.locale,
    name: row.name ?? null,
    nameAlts: row.nameAlts ?? null,
    nameRules: row.nameRules ?? null,
    nameVariant: row.nameVariant ?? null,
    isLocaleInferred: Boolean(row.isLocaleInferred),
    nameProvenance:
      row.nameProvenance ?? (row.isLocaleInferred ? 'inferred' : 'provided'),
  }
}

/** The runtime processor and its writer share one independent-component decision. */
export async function planDivisionHistoryChanges(input: {
  base: DivisionBaseRecord
  i18n: DivisionI18nPayload[]
  previous?: DivisionVersionSnapshot
  components: ReadonlyMap<string, DivisionHistoryComponent>
  versionHash: string
  churnHash: string
}) {
  const baseChanged = input.previous?.versionHash !== input.versionHash
  const currentChanged = input.previous?.churnHash !== input.churnHash
  const baseRows: Parameters<typeof insertDivisionVersionRows>[2] = []
  const i18nRows: Parameters<typeof insertDivisionVersionRows>[3] = []
  const timestamp = input.base.updatedAt ?? new Date().toISOString()
  const closures: Array<DivisionHistoryComponent & { omitted?: boolean }> = []
  if (!currentChanged)
    return { baseChanged, currentChanged, baseRows, i18nRows, closures }
  if (baseChanged) {
    baseRows.push({ ...input.base, versionHash: input.versionHash })
    const prior = input.components.get(divisionHistoryKey(input.base.id))
    if (prior) closures.push(prior)
  }
  const previousLocales = new Map(
    input.previous?.localisedRows.map(row => [row.locale, row]),
  )
  const nextLocales = new Set(input.i18n.map(row => row.locale))
  for (const localised of input.i18n) {
    const prior = previousLocales.get(localised.locale)
    const content = divisionLocaleContent(localised)
    if (
      prior &&
      stableJsonStringify(divisionLocaleContent(prior)) === stableJsonStringify(content)
    )
      continue
    const owned = input.components.get(
      divisionHistoryKey(input.base.id, localised.locale),
    )
    if (owned) closures.push(owned)
    i18nRows.push({
      ...content,
      versionHash: await createHash(content),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }
  for (const prior of previousLocales.values()) {
    if (nextLocales.has(prior.locale)) continue
    const owned = input.components.get(divisionHistoryKey(input.base.id, prior.locale))
    if (owned) closures.push({ ...owned, omitted: true })
  }
  return { baseChanged, currentChanged, baseRows, i18nRows, closures }
}

/** A single handle is unambiguous; cross-shard replay requires explicit bindings. */
export async function identifyDivisionHistoryShards(
  plan: SnapshotReplayStep[],
  databases: Array<HarbourReadableDb & HarbourWritableDb>,
  named?: DivisionHistoryShard[],
): Promise<Map<string, DivisionHistoryShard>> {
  const required = new Set(
    plan.flatMap(step => step.shards.map(row => row.bindingName)),
  )
  if (!required.size) return new Map()
  if (named) {
    const result = new Map(named.map(shard => [shard.bindingName, shard]))
    if (result.size !== named.length)
      throw new Error('Duplicate Division history binding.')
    for (const binding of required)
      if (!result.has(binding))
        throw new Error(`Missing Division history binding ${binding}.`)
    return result
  }
  const unique = [...new Set(databases)]
  const [bindingName] = required
  const [db] = unique
  if (required.size === 1 && unique.length === 1 && bindingName && db) {
    return new Map([[bindingName, { bindingName, db }]])
  }
  throw new Error(
    'Cross-shard Division replay requires options.historyShards with explicit binding names.',
  )
}

/** Replay each independent component and validate its retained content against current. */
export async function loadDivisionHistoryBaseline(input: {
  plan: SnapshotReplayStep[]
  shards: ReadonlyMap<string, DivisionHistoryShard>
  current: ReadonlyMap<string, DivisionVersionSnapshot>
  baseHashInput: (row: DivisionBaseRecord) => unknown
}) {
  // Also validates complete ancestry and required bindings, including source-only deltas.
  const sourceResolutions = await resolveSnapshotSourceResolutions(
    input.plan,
    input.shards,
  )
  const components = new Map<string, DivisionHistoryComponent>()
  for (const step of input.plan) {
    const seen = new Set<string>()
    for (const binding of new Set(step.shards.map(row => row.bindingName))) {
      const shard = input.shards.get(binding)
      if (!shard) throw new Error(`Missing Division history binding ${binding}.`)
      let cursor: { recordType: string; recordId: string; locale: string } | undefined
      while (true) {
        const table = historySchema.snapshotVersionChanges
        const rows = await shard.db
          .select({
            recordType: table.recordType,
            recordId: table.recordId,
            locale: table.locale,
            versionHash: table.versionHash,
            operation: table.operation,
          })
          .from(table)
          .where(
            and(
              eq(table.snapshotId, step.snapshotId),
              inArray(table.recordType, ['division', 'divisionI18n']),
              cursor
                ? sql`(${table.recordType}, ${table.recordId}, ${table.locale}) > (${cursor.recordType}, ${cursor.recordId}, ${cursor.locale})`
                : undefined,
            ),
          )
          .orderBy(table.recordType, table.recordId, table.locale)
          .limit(512)
          .all()
        for (const row of rows) {
          if (row.recordType !== 'division' && row.recordType !== 'divisionI18n')
            continue
          if ((row.recordType === 'division') !== (row.locale === ''))
            throw new Error('Invalid Division component locale.')
          const key = divisionHistoryKey(row.recordId, row.locale)
          if (seen.has(key))
            throw new Error(
              `Ambiguous Division history component ${key} in ${step.snapshotId}.`,
            )
          seen.add(key)
          if (row.operation === 'delete') components.delete(key)
          else if (row.versionHash)
            components.set(key, {
              ...row,
              versionHash: row.versionHash,
              recordType: row.recordType,
              shard,
            })
          else throw new Error(`Missing Division history hash for ${key}.`)
        }
        cursor = rows.at(-1)
        if (rows.length < 512) break
      }
    }
  }
  const expected = new Set<string>()
  for (const row of input.current.values()) {
    expected.add(divisionHistoryKey(row.id))
    for (const localised of row.localisedRows)
      expected.add(divisionHistoryKey(row.id, localised.locale))
  }
  if (
    components.size !== expected.size ||
    [...expected].some(key => !components.has(key))
  )
    throw new Error(
      'Division parent history membership does not match its materialised current scope.',
    )
  for (const shard of input.shards.values()) {
    for (const recordType of ['division', 'divisionI18n'] as const) {
      const table =
        recordType === 'division'
          ? historySchema.divisions
          : historySchema.divisionsI18n
      const owned = [...components.values()].filter(
        row => row.shard === shard && row.recordType === recordType,
      )
      for (const batch of chunkArray(owned, 30)) {
        const rows = await shard.db
          .select()
          .from(table)
          .where(or(...batch.map(row => divisionComponentPredicate(row))))
          .all()
        if (rows.length !== batch.length)
          throw new Error('Missing retained Division history component content.')
        for (const row of rows) {
          const id = String(recordType === 'division' ? row.id : row.divisionId)
          const current = input.current.get(id)
          if (!current) throw new Error(`Missing current Division ${id}.`)
          const localised = current.localisedRows.find(
            item => item.locale === row.locale,
          )
          const equal =
            recordType === 'division'
              ? (await createHash(input.baseHashInput(row as DivisionBaseRecord))) ===
                current.versionHash
              : Boolean(localised) &&
                stableJsonStringify(
                  divisionLocaleContent(row as DivisionI18nPayload),
                ) === stableJsonStringify(localised && divisionLocaleContent(localised))
          if (!equal)
            throw new Error(
              `Division parent history content differs from current: ${id}/${row.locale ?? ''}.`,
            )
        }
      }
    }
  }
  return { components, sourceResolutions }
}

function divisionComponentPredicate(row: DivisionHistoryComponent) {
  if (row.recordType === 'division')
    return and(
      eq(historySchema.divisions.id, row.recordId),
      eq(historySchema.divisions.versionHash, row.versionHash),
    )
  return and(
    eq(historySchema.divisionsI18n.divisionId, row.recordId),
    eq(historySchema.divisionsI18n.locale, row.locale),
    eq(historySchema.divisionsI18n.versionHash, row.versionHash),
  )
}

/** Close exact predecessor components; only omissions need a deletion journal. */
export async function closeDivisionHistoryComponents(input: {
  activeDb: HarbourWritableDb
  snapshotId: string
  sourceReleaseId: string
  components: Array<DivisionHistoryComponent & { omitted?: boolean }>
  timestamp: string
}) {
  for (const shard of new Set(input.components.map(row => row.shard))) {
    const statements = []
    for (const recordType of ['division', 'divisionI18n'] as const) {
      const table =
        recordType === 'division'
          ? historySchema.divisions
          : historySchema.divisionsI18n
      const owned = input.components.filter(
        row => row.shard === shard && row.recordType === recordType,
      )
      for (const batch of chunkArray(owned, 30))
        statements.push(
          shard.db
            .update(table)
            .set({ isCurrent: false, updatedAt: input.timestamp })
            .where(
              and(
                eq(table.isCurrent, true),
                or(...batch.map(divisionComponentPredicate)),
              ),
            ),
        )
    }
    await runStatementsInGroupsWithWriteRetry(shard.db, statements)
  }
  for (const recordType of ['division', 'divisionI18n'] as const)
    await recordSnapshotVersionChanges(input.activeDb, {
      snapshotId: input.snapshotId,
      sourceReleaseId: input.sourceReleaseId,
      recordType,
      operation: 'delete',
      changes: input.components
        .filter(row => row.omitted && row.recordType === recordType)
        .map(row => ({ recordId: row.recordId, locale: row.locale })),
    })
}

export function changedDivisionSourceResolutions(
  previous: ReadonlyMap<string, ResolvedSnapshotSourceResolution>,
  rows: NewSourceResolution[],
  seen: Set<string>,
) {
  return rows.filter(row => {
    seen.add(row.sourceRecordId)
    const prior = previous.get(row.sourceRecordId)
    return (
      !prior ||
      prior.sourceVersionHash !== row.sourceVersionHash ||
      stableJsonStringify(prior.resolutions) !== stableJsonStringify(row.resolutions)
    )
  })
}

export function omittedDivisionSourceResolutions(
  previous: ReadonlyMap<string, ResolvedSnapshotSourceResolution>,
  seen: ReadonlySet<string>,
  snapshotId: string,
  sourceReleaseId: string,
): NewSourceResolution[] {
  return [...previous.values()]
    .filter(
      row =>
        !seen.has(row.sourceRecordId) &&
        !row.resolutions.decisions?.some(
          decision => decision.type === 'source_omission',
        ),
    )
    .map(row => ({
      snapshotId,
      sourceReleaseId,
      sourceRecordId: row.sourceRecordId,
      sourceVersionHash: row.sourceVersionHash,
      resolutions: { entities: {}, decisions: [{ type: 'source_omission' }] },
    }))
}
