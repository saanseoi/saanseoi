import { createHash } from 'node:crypto'
import { and, eq, inArray, historySchema, metaSchema } from '@repo/db'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import {
  resolveSnapshotVersionState,
  groupResolvedVersionsByShard,
} from '@repo/core/pipeline/db/snapshotReplay'
import { chunkArray } from '@repo/core/pipeline/utils'
import {
  buildChurnCounts,
  buildDivisionApiReleaseSetStatsRows,
  createLocaleStatsAccumulator,
  type StatsLocaleGroup,
} from '@repo/core/pipeline/services/metrics/releaseStats'
import { resolveDistrictId } from '@repo/core/pipeline/services/divisions/division'
import { planningDivisionContentHash } from '../pipeline/divisions/planningDivisionChurn'

export type DivisionHistoryTarget = { bindingName: string; db: unknown }
type Division = typeof historySchema.divisions.$inferSelect
type Name = typeof historySchema.divisionsI18n.$inferSelect
export type DivisionStatsSnapshot = { divisions: Division[]; names: Name[] }

export async function listDivisionStatsReleases(db: HarbourReadableDb) {
  const rows = await db
    .select({
      id: metaSchema.metaApiReleaseSets.id,
      code: metaSchema.metaApiReleaseSets.code,
      apiVersionId: metaSchema.metaApiReleaseSets.apiVersionId,
      domainCode: metaSchema.metaApiReleaseSets.domainCode,
      regionCode: metaSchema.metaApiReleaseSets.regionCode,
      cohortKey: metaSchema.metaApiReleaseSets.cohortKey,
      revision: metaSchema.metaApiReleaseSets.revision,
      snapshotId: metaSchema.metaSnapshots.id,
    })
    .from(metaSchema.metaApiReleaseSets)
    .innerJoin(
      metaSchema.metaApiVersions,
      eq(metaSchema.metaApiVersions.id, metaSchema.metaApiReleaseSets.apiVersionId),
    )
    .innerJoin(
      metaSchema.metaApiReleaseSetSnapshots,
      eq(
        metaSchema.metaApiReleaseSetSnapshots.apiReleaseSetId,
        metaSchema.metaApiReleaseSets.id,
      ),
    )
    .innerJoin(
      metaSchema.metaSnapshots,
      eq(metaSchema.metaSnapshots.id, metaSchema.metaApiReleaseSetSnapshots.snapshotId),
    )
    .where(
      and(
        eq(metaSchema.metaApiVersions.familyType, 'divisions'),
        inArray(metaSchema.metaApiReleaseSets.status, ['current', 'archived']),
        eq(metaSchema.metaApiReleaseSetSnapshots.role, 'primary'),
        eq(metaSchema.metaSnapshots.resourceType, 'division'),
        eq(metaSchema.metaSnapshots.status, 'published'),
      ),
    )
    .all()
  return rows.sort(
    (a, b) => a.cohortKey.localeCompare(b.cohortKey) || a.revision - b.revision,
  )
}

export function previousDivisionStatsRelease<
  T extends {
    id: string
    apiVersionId: string
    domainCode: string
    regionCode: string
  },
>(releases: T[], id: string) {
  const index = releases.findIndex(row => row.id === id)
  const release = releases[index]
  if (!release) throw new Error(`Published division API release set not found: ${id}`)
  return releases
    .slice(0, index)
    .findLast(
      row =>
        row.apiVersionId === release.apiVersionId &&
        row.domainCode === release.domainCode &&
        row.regionCode === release.regionCode,
    )
}

/** Replay membership, then fetch immutable content by identity AND hash, including names. */
export async function readDivisionStatsSnapshot(
  metaDb: HarbourReadableDb,
  targets: DivisionHistoryTarget[],
  snapshotId: string,
): Promise<DivisionStatsSnapshot> {
  const plan = await resolveSnapshotReplayPlan(metaDb, snapshotId)
  if (plan.some(step => step.shards.length === 0))
    throw new Error(`Missing history assignment for ${snapshotId}`)
  const shards = new Map(
    targets.map(target => [
      target.bindingName,
      { bindingName: target.bindingName, db: target.db as HarbourReadableDb },
    ]),
  )
  const state = await resolveSnapshotVersionState(plan, shards, [
    'division',
    'divisionI18n',
  ])
  const divisions: Division[] = []
  const names: Name[] = []
  for (const versions of groupResolvedVersionsByShard(state.values()).values()) {
    const first = versions[0]
    if (!first) continue
    const db = first.shard.db
    for (const type of ['division', 'divisionI18n']) {
      const expected = new Set(
        versions
          .filter(row => row.recordType === type)
          .map(row => JSON.stringify([row.recordId, row.locale, row.versionHash])),
      )
      const hashes = [
        ...new Set(
          versions.filter(row => row.recordType === type).map(row => row.versionHash),
        ),
      ]
      for (const batch of chunkArray(hashes, 90)) {
        if (type === 'division') {
          const rows = (await db
            .select()
            .from(historySchema.divisions)
            .where(inArray(historySchema.divisions.versionHash, batch))
            .all()) as Division[]
          for (const row of rows)
            if (expected.delete(JSON.stringify([row.id, '', row.versionHash])))
              divisions.push(row)
        } else {
          const rows = (await db
            .select()
            .from(historySchema.divisionsI18n)
            .where(inArray(historySchema.divisionsI18n.versionHash, batch))
            .all()) as Name[]
          for (const row of rows)
            if (
              expected.delete(
                JSON.stringify([row.divisionId, row.locale, row.versionHash]),
              )
            )
              names.push(row)
        }
      }
      if (expected.size)
        throw new Error(`Missing ${expected.size} ${type} versions for ${snapshotId}`)
    }
  }
  if (!divisions.length)
    throw new Error(
      `No replayable divisions for ${snapshotId}; refusing to publish empty stats`,
    )
  const ids = new Set(divisions.map(row => row.id))
  // A deleted division may retain an inherited name journal entry. Match the API's
  // identity join: only names belonging to live divisions contribute to stats.
  return { divisions, names: names.filter(row => ids.has(row.divisionId)) }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, canonical(value)]),
    )
  return value
}

function churnSnapshot(snapshot: DivisionStatsSnapshot, group: 'class' | 'level') {
  const names = new Map<string, unknown[]>()
  for (const row of snapshot.names) {
    const values = names.get(row.divisionId) ?? []
    values.push([row.locale, row.name, row.nameAlts, row.nameVariant, row.nameRules])
    names.set(row.divisionId, values)
  }
  return new Map(
    snapshot.divisions.map(row => [
      row.id,
      {
        id: row.id,
        type: String(row[group] ?? 'unknown'),
        parentId: null,
        geometry: null,
        localisedRows: [],
        churnHash: createHash('sha256')
          .update(
            JSON.stringify([
              planningDivisionContentHash(row),
              (names.get(row.id) ?? [])
                .map(value => JSON.stringify(canonical(value)))
                .sort(),
            ]),
          )
          .digest('hex'),
      },
    ]),
  )
}

export function buildDivisionStatsFromSnapshots(
  current: DivisionStatsSnapshot,
  previous: DivisionStatsSnapshot = { divisions: [], names: [] },
) {
  const byDivisionType = new Map<string, number>()
  const byLevel = new Map<string, number>()
  const byDistrict = new Map<string, number>()
  const increment = (map: Map<string, number>, key: string) =>
    map.set(key, (map.get(key) ?? 0) + 1)
  for (const row of current.divisions) {
    increment(byDivisionType, row.class)
    if (row.level != null) increment(byLevel, String(row.level))
    const district = resolveDistrictId(row)
    if (district) increment(byDistrict, district)
  }
  const localeStats = createLocaleStatsAccumulator()
  localeStats.total = current.divisions.length
  const seen = new Map<Map<StatsLocaleGroup, number>, Set<string>>()
  const add = (
    map: Map<StatsLocaleGroup, number>,
    locale: StatsLocaleGroup,
    id: string,
  ) => {
    const keys = seen.get(map) ?? new Set<string>()
    const key = `${locale}:${id}`
    if (!keys.has(key)) map.set(locale, (map.get(locale) ?? 0) + 1)
    keys.add(key)
    seen.set(map, keys)
  }
  for (const row of current.names) {
    const locale =
      row.locale === 'en'
        ? 'en'
        : ['zh', 'zh-hant', 'zh-hk', 'zh-mo', 'zh-tw'].includes(row.locale)
          ? 'zh-hant'
          : ['zh-hans', 'zh-cn', 'zh-sg'].includes(row.locale)
            ? 'zh-hans'
            : null
    if (!locale) continue
    if (row.name != null) {
      add(localeStats.count, locale, row.divisionId)
      const provenance =
        row.nameProvenance ?? (row.isLocaleInferred ? 'inferred' : 'provided')
      add(
        provenance === 'inferred'
          ? localeStats.inferredCoverage
          : provenance === 'ai-translated'
            ? localeStats.aiTranslatedCoverage
            : provenance === 'human-translated'
              ? localeStats.humanTranslatedCoverage
              : localeStats.providedCoverage,
        locale,
        row.divisionId,
      )
    }
    if (row.nameAlts != null) add(localeStats.altCoverage, locale, row.divisionId)
  }
  const churn = buildChurnCounts(
    churnSnapshot(previous, 'class'),
    churnSnapshot(current, 'class'),
  )
  const levels = buildChurnCounts(
    churnSnapshot(previous, 'level'),
    churnSnapshot(current, 'level'),
  )
  return buildDivisionApiReleaseSetStatsRows({
    divisionCount: current.divisions.length,
    divisionI18nCount: current.names.length,
    byDivisionType,
    byLevel,
    byDistrict,
    localeStats,
    churn: {
      totals: churn.totals,
      byDivisionType: churn.byType,
      byLevel: levels.byType,
    },
  })
}

export async function buildDivisionApiStats(
  metaDb: HarbourReadableDb,
  targets: DivisionHistoryTarget[],
  apiReleaseSetId: string,
) {
  const releases = await listDivisionStatsReleases(metaDb)
  const previous = previousDivisionStatsRelease(releases, apiReleaseSetId)
  const release = releases.find(row => row.id === apiReleaseSetId)
  if (!release)
    throw new Error(`Published division API release set not found: ${apiReleaseSetId}`)
  const currentRows = await readDivisionStatsSnapshot(
    metaDb,
    targets,
    release.snapshotId,
  )
  const previousRows = previous
    ? await readDivisionStatsSnapshot(metaDb, targets, previous.snapshotId)
    : undefined
  return buildDivisionStatsFromSnapshots(currentRows, previousRows)
}
