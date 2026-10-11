import { query } from '$app/server'
import { error } from '@sveltejs/kit'
import { z } from 'zod'
import { eq, historySchema, metaSchema, sql } from '@repo/db'
import { getRegistryApi, resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  resolveSnapshotVersionState,
  type ReplayShard,
} from '@repo/core/pipeline/db/snapshotReplay.ts'
import type { RegistryApi } from './types'
import { getHistoryDb, getMetaDb } from './server'
import { compareSnapshotRecords, snapshotContent } from './apiSnapshotChanges'

const tables = {
  division: [historySchema.divisions, historySchema.divisionsI18n, 'divisionId'],
  divisionArea: [historySchema.divisionAreas],
  divisionBoundary: [historySchema.divisionBoundaries],
  divisionStatistic: [historySchema.divisionStatistics],
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
        .select()
        .from(snapshots)
        .where(eq(snapshots.id, id))
        .get()
      if (snapshot?.status !== 'published') error(404, 'Retained snapshot unavailable.')
      const definition = tables[snapshot.resourceType as keyof typeof tables]
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
      const versions = await resolveSnapshotVersionState(plan, shards, [
        snapshot.resourceType,
        `${snapshot.resourceType}I18n`,
      ])
      return { resourceType: snapshot.resourceType, definition, shards, versions }
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
    async function materialise(state: typeof before) {
      const { definition, shards, versions, resourceType } = state
      const records = new Map<string, Record<string, unknown>>()
      for (const version of versions.values()) {
        if (version.recordType === resourceType && !candidates.has(version.recordId))
          records.set(version.recordId, {})
      }
      // JSON tuples keep each batch to one parameter and pin ID, hash and locale together.
      for (const shard of shards.values()) {
        for (const translated of [false, true]) {
          const table = translated ? definition[1] : definition[0]
          if (!table) continue
          const wanted = [...versions.values()].filter(
            version =>
              candidates.has(version.recordId) &&
              version.shard.bindingName === shard.bindingName &&
              version.recordType === `${resourceType}${translated ? 'I18n' : ''}`,
          )
          const idColumn = translated
            ? (table as unknown as Record<string, typeof historySchema.divisions.id>)[
                definition[2]!
              ]
            : (table as typeof historySchema.divisions).id
          for (let start = 0; start < wanted.length; start += 50) {
            const tuples = wanted
              .slice(start, start + 50)
              .map(version => [version.recordId, version.versionHash, version.locale])
            const rows = await shard.db
              .select()
              .from(table)
              .where(
                translated
                  ? sql`(${idColumn}, ${table.versionHash}, ${(table as typeof historySchema.divisionsI18n).locale}) in (select json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]') from json_each(${JSON.stringify(tuples)}))`
                  : sql`(${idColumn}, ${table.versionHash}) in (select json_extract(value, '$[0]'), json_extract(value, '$[1]') from json_each(${JSON.stringify(tuples)}))`,
              )
              .all()
            if (rows.length !== tuples.length)
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
    const [oldRecords, newRecords] = await Promise.all([
      materialise(before),
      materialise(after),
    ])
    const comparison = compareSnapshotRecords(oldRecords, newRecords)
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
