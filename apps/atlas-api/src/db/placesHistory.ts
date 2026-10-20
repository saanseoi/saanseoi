import {
  readPlacePublicationDependencies,
  resolvePlaceAddressSnapshot,
  replayPlaceDivisionDefinitions,
} from '@repo/core/pipeline/services/places/dependencyReplay'
import { placeDivisionFieldNames } from '@repo/db'
import { parseI18nMeta } from '@repo/db'
import type { RequestedApiLocaleSelection } from '@repo/core/apiLocales'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import {
  groupResolvedVersionsByShard,
  historyVersionSelection,
  resolveSnapshotVersionState,
} from '@repo/core/pipeline/db/snapshotReplay.ts'
import { chunkArray } from '@repo/core/pipeline/utils.ts'
import type { HistoryDatabase } from '@repo/db'
import { and, asc, eq, historySchema, sql } from '@repo/db'
import {
  geographicFilterContext,
  matchesGeographicMembership,
} from '../lib/geographicFilterContext'

import { normalisePlaceBbox, type PlaceLocaleValue, type PlaceRecord } from './places'

type HistoryPlace = typeof historySchema.places.$inferSelect
type HistoryPlaceI18n = typeof historySchema.placesI18n.$inferSelect

function localeIsSelected(selection: RequestedApiLocaleSelection, locale: string) {
  return (
    selection.mode !== 'none' &&
    (selection.mode === 'all' || selection.locales.includes(locale))
  )
}

function mapPlaceLocale(row: HistoryPlaceI18n): PlaceLocaleValue {
  const stringArray = (value: unknown) => {
    const parsed =
      typeof value === 'string'
        ? (() => {
            try {
              return JSON.parse(value) as unknown
            } catch {
              return null
            }
          })()
        : value
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : null
  }

  return {
    name: row.name,
    nameVariant: stringArray(row.nameVariant),
    nameAlts: row.nameAlts,
    brandName: row.brandName,
    brandNameVariant: stringArray(row.brandNameVariant),
    brandNameAlts: row.brandNameAlts,
    freeformAddress: row.freeformAddress,
    accessHint: row.accessHint,
    meta: parseI18nMeta(row.meta),
  }
}

function recordedDivisionIds(row: HistoryPlace) {
  return [
    ...new Set(
      placeDivisionFieldNames.flatMap(field => (row[field] ? [row[field]!] : [])),
    ),
  ].sort()
}

type PlaceVersionRef = {
  snapshotId: string
  recordId: string
  locale: string
  versionHash: string
  shard: { bindingName: string; db: HistoryDatabase }
}

async function loadPlaceRows(versions: Iterable<PlaceVersionRef>) {
  const rows: HistoryPlace[] = []
  for (const shardVersions of groupResolvedVersionsByShard(
    versions as never,
  ).values()) {
    const first = shardVersions.at(0)
    if (!first) continue
    const expected = new Set(
      shardVersions.map(version => `${version.recordId}\u0000${version.versionHash}`),
    )
    const found = (
      await Promise.all(
        chunkArray(shardVersions, 256).map(versions =>
          first.shard.db
            .select()
            .from(historySchema.places)
            .where(historyVersionSelection(historySchema.places, versions))
            .all(),
        ),
      )
    ).flat() as HistoryPlace[]
    for (const row of found) {
      if (expected.has(`${row.id}\u0000${row.versionHash}`)) rows.push(row)
    }
  }
  return rows
}

async function loadPlaceI18nRows(versions: Iterable<PlaceVersionRef>) {
  const rows: HistoryPlaceI18n[] = []
  for (const shardVersions of groupResolvedVersionsByShard(
    versions as never,
  ).values()) {
    const first = shardVersions.at(0)
    if (!first) continue
    const expected = new Set(
      shardVersions.map(
        version =>
          `${version.recordId}\u0000${version.locale}\u0000${version.versionHash}`,
      ),
    )
    const found = (
      await Promise.all(
        chunkArray(shardVersions, 256).map(versions =>
          first.shard.db
            .select()
            .from(historySchema.placesI18n)
            .where(historyVersionSelection(historySchema.placesI18n, versions))
            .all(),
        ),
      )
    ).flat() as HistoryPlaceI18n[]
    for (const row of found) {
      if (expected.has(`${row.placeId}\u0000${row.locale}\u0000${row.versionHash}`)) {
        rows.push(row)
      }
    }
  }
  return rows
}

export async function listReplayedPlaceRecords(args: {
  divisionSnapshotId: string
  historyDbsByBinding: Record<string, HistoryDatabase>
  localeSelection: RequestedApiLocaleSelection
  metaDb: unknown
  snapshotId: string
  recordIds?: string[]
  resolveDivisions?: boolean
}): Promise<PlaceRecord[]> {
  const shards = new Map(
    Object.entries(args.historyDbsByBinding).map(([bindingName, db]) => [
      bindingName,
      { bindingName, db },
    ]),
  )
  const plan = await resolveSnapshotReplayPlan(args.metaDb as never, args.snapshotId)
  const versions = await resolveSnapshotVersionState(
    plan,
    shards as never,
    ['place', ...(args.localeSelection.mode === 'none' ? [] : ['placeI18n'])],
    args.recordIds,
  )
  const places = await loadPlaceRows(
    [...versions.values()].filter(version => version.recordType === 'place') as never,
  )
  const localised = await loadPlaceI18nRows(
    [...versions.values()].filter(
      version =>
        version.recordType === 'placeI18n' &&
        localeIsSelected(args.localeSelection, version.locale),
    ) as never,
  )
  const selected = await readPlacePublicationDependencies(
    args.metaDb as never,
    args.snapshotId,
  )
  const definitions =
    args.resolveDivisions === false
      ? {}
      : await replayPlaceDivisionDefinitions(
          args.metaDb as never,
          shards as never,
          selected.division,
          places.flatMap(recordedDivisionIds),
        )
  const localisedByPlace = new Map<string, Record<string, PlaceLocaleValue>>()
  for (const row of localised) {
    const values = localisedByPlace.get(row.placeId) ?? {}
    values[row.locale] = mapPlaceLocale(row)
    localisedByPlace.set(row.placeId, values)
  }

  return places
    .filter(row => matchesGeographicMembership(recordedDivisionIds(row)))
    .map(row => {
      const i18n = Object.fromEntries(
        Object.entries(localisedByPlace.get(row.id) ?? {}).filter(([locale]) =>
          localeIsSelected(args.localeSelection, locale),
        ),
      )
      return {
        place: {
          ...row,
          addressSnapshotId: resolvePlaceAddressSnapshot(selected, row.addressRole),
          lng: row.geometry!.coordinates[0],
          lat: row.geometry!.coordinates[1],

          snapshotId: args.snapshotId,
          bbox: normalisePlaceBbox(row.bbox),
        },
        i18n,
        divisionDefinitions: Object.fromEntries(
          recordedDivisionIds(row).flatMap(id =>
            definitions[id] ? [[id, definitions[id]]] : [],
          ),
        ),
        divisionIds: args.resolveDivisions === false ? [] : recordedDivisionIds(row),
      } as PlaceRecord
    })
}

/** Keyset batches bound journal and content memory, including deleted IDs. */
export async function listReplayedPlacePage(
  args: Parameters<typeof listReplayedPlaceRecords>[0] & {
    id?: string
    limit: number
    offset: number
    basicCategory?: string
    taxonomyPrimary?: string
    operatingStatus?: string
    divisionId?: string
  },
): Promise<{ records: PlaceRecord[]; hasMore: boolean }> {
  const plan = await resolveSnapshotReplayPlan(args.metaDb as never, args.snapshotId)
  const pageIds: string[] = []
  let total = 0
  let hasMore = false
  let after: string | undefined
  outer: for (;;) {
    let candidates: string[] = []
    for (const step of plan) {
      for (const assignment of step.shards) {
        const db = args.historyDbsByBinding[assignment.bindingName]
        if (!db)
          throw new Error(`Unavailable history binding ${assignment.bindingName}.`)
        const journal = historySchema.historyEvents
        const rows = await db
          .selectDistinct({ id: journal.recordId })
          .from(journal)
          .where(
            and(
              eq(journal.snapshotId, step.snapshotId),
              eq(journal.recordType, 'place'),
              args.id ? eq(journal.recordId, args.id) : undefined,
              after === undefined ? undefined : sql`${journal.recordId} > ${after}`,
            ),
          )
          .orderBy(asc(journal.recordId))
          .limit(100)
          .all()
        candidates = [...new Set([...candidates, ...rows.map(row => row.id)])]
          .sort()
          .slice(0, 100)
      }
    }
    if (candidates.length === 0) break
    const records = await listReplayedPlaceRecords({
      ...args,
      recordIds: candidates,
      resolveDivisions: Boolean(args.divisionId || geographicFilterContext()),
      localeSelection: { mode: 'none', locales: [] },
    })
    const byId = new Map(records.map(record => [record.place.id, record]))
    for (const id of candidates) {
      const record = byId.get(id)
      if (
        !record ||
        !matchesGeographicMembership(record.divisionIds) ||
        (args.basicCategory && record.place.basicCategory !== args.basicCategory) ||
        (args.taxonomyPrimary &&
          record.place.taxonomyPrimary !== args.taxonomyPrimary) ||
        (args.operatingStatus &&
          record.place.operatingStatus !== args.operatingStatus) ||
        (args.divisionId && !record.divisionIds.includes(args.divisionId))
      )
        continue
      if (total >= args.offset) {
        if (pageIds.length === args.limit) {
          hasMore = true
          break outer
        }
        pageIds.push(id)
      }
      total++
    }
    after = candidates.at(-1)
  }
  const records = pageIds.length
    ? await listReplayedPlaceRecords({ ...args, recordIds: pageIds })
    : []
  const byId = new Map(records.map(record => [record.place.id, record]))
  return { records: pageIds.flatMap(id => byId.get(id) ?? []), hasMore }
}
