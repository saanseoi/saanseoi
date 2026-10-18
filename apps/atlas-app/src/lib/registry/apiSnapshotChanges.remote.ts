import { getRegistryApi, resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  historyVersionSelection,
  type ReplayShard,
  type ResolvedSnapshotVersion,
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
import { iterateSnapshotVersions } from './snapshotChangeVersions'
import type { RegistryApi } from './types'

// Read only enough candidate contents to fill a page and determine has-more.
const CHANGE_BATCH_SIZE = 64
const PAYLOAD_VERSION_WINDOW = 4096

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
    async function read(id: string, identical = false) {
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
      const plan = identical
        ? []
        : await resolveSnapshotReplayPlan(db as unknown as HarbourReadableDb, id)
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
        !identical && snapshot.resourceType === 'divisionStatistic'
          ? await readStatisticSnapshotRecords(
              db as unknown as HarbourReadableDb,
              [...shards.values()].map(shard => shard.db),
              id,
            )
          : undefined
      return {
        plan,
        resourceType: snapshot.resourceType,
        recordType,
        definition,
        shards,
        statistics,
      }
    }
    if (input.fromSnapshot === input.toSnapshot) {
      await read(input.toSnapshot, true)
      return { records: [], nextOffset: null }
    }
    const [before, after] = await Promise.all([
      read(input.fromSnapshot),
      read(input.toSnapshot),
    ])
    if (before.resourceType !== after.resourceType)
      error(400, 'Compare the same resource type.')
    async function materialise(
      state: typeof before,
      versions: ResolvedSnapshotVersion[],
    ) {
      const { definition, shards, recordType } = state
      const records = new Map<string, Record<string, unknown>>()
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
          for (let start = 0; start < wanted.length; start += PAYLOAD_VERSION_WINDOW) {
            const batch = wanted.slice(start, start + PAYLOAD_VERSION_WINDOW)
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
        records: records.slice(input.offset, end),
        nextOffset: end < records.length ? end : null,
      }
    }
    const records: ReturnType<typeof compareSnapshotRecords>['records'] = []
    let matching = 0
    const oldStream = iterateSnapshotVersions(
      before.plan,
      before.shards,
      before.recordType,
      before.definition,
    )
    const newStream = iterateSnapshotVersions(
      after.plan,
      after.shards,
      after.recordType,
      after.definition,
    )
    let [old, next] = await Promise.all([oldStream.next(), newStream.next()])
    let oldVersions: ResolvedSnapshotVersion[] = []
    let newVersions: ResolvedSnapshotVersion[] = []
    let candidates = 0
    async function flush() {
      if (!candidates) return
      const [oldRecords, newRecords] = await Promise.all([
        materialise(before, oldVersions),
        materialise(after, newVersions),
      ])
      const comparison = compareSnapshotRecords(oldRecords, newRecords)
      for (const record of comparison.records) {
        if (input.type && record.type !== input.type) continue
        if (matching >= input.offset && records.length < 25) records.push(record)
        matching++
        if (matching > input.offset + 25) break
      }
      oldVersions = []
      newVersions = []
      candidates = 0
    }
    while (!old.done || !next.done) {
      const id = old.done
        ? next.value!.id
        : next.done
          ? old.value.id
          : old.value.id < next.value.id
            ? old.value.id
            : next.value.id
      const oldRows = !old.done && old.value.id === id ? old.value.versions : []
      const newRows = !next.done && next.value.id === id ? next.value.versions : []
      const hashes = new Map(
        oldRows.map(version => [
          `${version.recordType}\u0000${version.locale}`,
          version.versionHash,
        ]),
      )
      const equal =
        oldRows.length === newRows.length &&
        newRows.every(
          version =>
            hashes.get(`${version.recordType}\u0000${version.locale}`) ===
            version.versionHash,
        )
      if (!equal) {
        oldVersions.push(...oldRows)
        newVersions.push(...newRows)
        candidates++
        if (candidates === CHANGE_BATCH_SIZE) {
          await flush()
          if (matching > input.offset + 25) break
        }
      }
      const advanceOld = !old.done && old.value.id === id
      const advanceNew = !next.done && next.value.id === id
      const advanced = await Promise.all([
        advanceOld ? oldStream.next() : old,
        advanceNew ? newStream.next() : next,
      ])
      ;[old, next] = advanced
    }
    await flush()
    const end = input.offset + 25
    return { records, nextOffset: end < matching ? end : null }
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
