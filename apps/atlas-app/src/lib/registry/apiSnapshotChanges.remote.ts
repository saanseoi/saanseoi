import { getRegistryApi, resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  historyVersionSelection,
  type ReplayShard,
  type ResolvedSnapshotVersion,
  resolveSnapshotVersionState,
} from '@repo/core/pipeline/db/snapshotReplay.ts'
import { eq, historySchema, metaSchema } from '@repo/db'
import { error } from '@sveltejs/kit'
import { z } from 'zod'
import { query } from '$app/server'
import { readStatisticSnapshotRecords } from '@repo/core/pipeline/services/statistics/statisticSnapshotRecords.ts'
import {
  compareSnapshotRecords,
  compareStatisticSnapshots,
  snapshotContent,
  snapshotRecordType,
} from './apiSnapshotChanges'
import { getHistoryDb, getMetaDb } from './server'
import type { RegistryApi } from './types'

const tables = {
  division: [historySchema.divisions, historySchema.divisionsI18n, 'divisionId'],
  divisionArea: [historySchema.divisionAreas],
  divisionBoundary: [historySchema.divisionBoundaries],
  divisionStatistic: [historySchema.statsRecords],
  place: [historySchema.places, historySchema.placesI18n, 'placeId'],
  street: [historySchema.streets, historySchema.streetsI18n, 'streetId'],
  address2d: [historySchema.address2d, historySchema.address2dI18n, 'addressId'],
  address3d: [historySchema.address3d, historySchema.address3dI18n, 'address3dId'],
} as const

export const getApiSnapshotChanges = query(
  z.object({
    fromSnapshot: z.string().min(1),
    toSnapshot: z.string().min(1),
    offset: z.number().int().min(0).default(0),
    type: z.enum(['added', 'changed', 'removed']).optional(),
  }),
  async input => {
    const db = getMetaDb()
    const snapshots = metaSchema.metaSnapshots
    async function read(id: string) {
      const snapshot = await db
        .select({
          status: snapshots.status,
          resourceType: metaSchema.metaSnapshotLineages.resourceType,
        })
        .from(snapshots)
        .innerJoin(
          metaSchema.metaSnapshotLineages,
          eq(snapshots.snapshotLineageId, metaSchema.metaSnapshotLineages.id),
        )
        .where(eq(snapshots.id, id))
        .get()
      if (snapshot?.status !== 'published') error(404, 'Retained snapshot unavailable.')
      const recordType = snapshotRecordType(snapshot.resourceType)
      const definition = tables[recordType as keyof typeof tables]
      if (!definition) error(404, 'Changes unavailable for this resource type.')
      const plan = await resolveSnapshotReplayPlan(
        db as unknown as HarbourReadableDb,
        id,
      )
      const shards = new Map<string, ReplayShard>()
      for (const step of plan)
        for (const assignment of step.shards) {
          if (!shards.has(assignment.bindingName))
            shards.set(assignment.bindingName, {
              bindingName: assignment.bindingName,
              db: getHistoryDb(assignment.bindingName) as unknown as HarbourReadableDb,
            })
        }
      const statistics =
        snapshot.resourceType === 'divisionStatistic'
          ? await readStatisticSnapshotRecords(
              db as unknown as HarbourReadableDb,
              [...shards.values()].map(shard => shard.db),
              id,
            )
          : undefined
      const versions = statistics
        ? new Map<string, ResolvedSnapshotVersion>()
        : await resolveSnapshotVersionState(plan, shards, [
            recordType,
            `${recordType}I18n`,
          ])
      const versionsById = new Map<string, ResolvedSnapshotVersion[]>()
      for (const version of versions.values()) {
        const entries = versionsById.get(version.recordId) ?? []
        entries.push(version)
        versionsById.set(version.recordId, entries)
      }
      return {
        versionsById,
        resourceType: snapshot.resourceType,
        recordType,
        definition,
        shards,
        versions,
        statistics,
      }
    }
    const [before, after] = await Promise.all([
      read(input.fromSnapshot),
      read(input.toSnapshot),
    ])
    if (before.resourceType !== after.resourceType)
      error(400, 'Compare the same resource type.')
    // Equal immutable versions need no content read, including every locale.
    const candidates = new Set<string>()
    for (const key of new Set([...before.versions.keys(), ...after.versions.keys()])) {
      const old = before.versions.get(key)
      const next = after.versions.get(key)
      if (old?.versionHash !== next?.versionHash)
        candidates.add((old ?? next)!.recordId)
    }
    async function materialise(state: typeof before, ids: string[]) {
      const { definition, shards, versionsById, recordType } = state
      const records = new Map<string, Record<string, unknown>>()
      const versions = ids.flatMap(id => versionsById.get(id) ?? [])
      // JSON tuples keep each batch to one parameter and pin ID, hash and locale together.
      for (const shard of shards.values()) {
        for (const translated of [false, true]) {
          const table = translated ? definition[1] : definition[0]
          if (!table) continue
          const wanted = versions.filter(
            version =>
              version.shard.bindingName === shard.bindingName &&
              version.recordType === `${recordType}${translated ? 'I18n' : ''}`,
          )
          for (let start = 0; start < wanted.length; start += 1000) {
            const batch = wanted.slice(start, start + 1000)
            const rows = await shard.db
              .select()
              .from(table)
              .where(historyVersionSelection(table, batch))
              .all()
            if (rows.length !== batch.length)
              error(409, 'Retained snapshot content is incomplete.')
            for (const raw of rows) {
              const row = raw as Record<string, unknown>
              const recordId = String(row[translated ? definition[2]! : 'id'])
              const record = records.get(recordId) ?? {}
              if (translated) {
                const {
                  locale,
                  [definition[2]!]: _id,
                  ...content
                } = snapshotContent(row)
                record.translations = {
                  ...((record.translations as object) ?? {}),
                  [String(locale)]: content,
                }
              } else Object.assign(record, snapshotContent(row))
              records.set(recordId, record)
            }
          }
        }
      }
      return records
    }
    if (before.statistics && after.statistics) {
      const comparison = compareStatisticSnapshots(before.statistics, after.statistics)
      const records = comparison.records.filter(
        record => !input.type || record.type === input.type,
      )
      const end = input.offset + 25
      return {
        counts: comparison.counts,
        total: comparison.total,
        records: records.slice(input.offset, end),
        nextOffset: end < records.length ? end : null,
      }
    }
    // Compare bounded batches; retain only the requested page, not every payload
    // and field diff in a large release-wide revision.
    const counts = { added: 0, changed: 0, removed: 0, unchanged: 0 }
    let total = 0
    for (const version of after.versions.values()) {
      if (version.recordType !== after.recordType) continue
      total++
      if (!candidates.has(version.recordId)) counts.unchanged++
    }
    const records: ReturnType<typeof compareSnapshotRecords>['records'] = []
    let matching = 0
    const ids = [...candidates].sort()
    for (let start = 0; start < ids.length; start += 1000) {
      const batch = ids.slice(start, start + 1000)
      const [oldRecords, newRecords] = await Promise.all([
        materialise(before, batch),
        materialise(after, batch),
      ])
      const comparison = compareSnapshotRecords(oldRecords, newRecords)
      for (const key of ['added', 'changed', 'removed', 'unchanged'] as const)
        counts[key] += comparison.counts[key]
      for (const record of comparison.records) {
        if (input.type && record.type !== input.type) continue
        if (matching >= input.offset && records.length < 25) records.push(record)
        matching++
      }
    }
    const end = input.offset + 25
    return { counts, total, records, nextOffset: end < matching ? end : null }
  },
)

export const getApiReleaseResources = query(
  z.object({
    familyType: z.string().min(1),
    releaseCode: z.string().min(1),
  }),
  async ({ familyType, releaseCode }) => {
    const api = (await getRegistryApi(getMetaDb(), familyType, {
      releaseCode,
    })) as RegistryApi | null
    return (
      api?.releases
        ?.find(release => release.code === releaseCode)
        ?.apiReleaseSetSnapshots?.map(resource => ({
          snapshotId: resource.snapshotId,
          variant: resource.variant,
          role: resource.role,
          snapshot: {
            id: resource.snapshot.id,
            resourceType: resource.snapshot.resourceType,
            code: resource.snapshot.code,
          },
        })) ?? []
    )
  },
)
