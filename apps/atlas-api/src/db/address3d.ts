import {
  and,
  eq,
  inArray,
  sql,
  currentSchema,
  historySchema,
  type CurrentDatabase,
  type HistoryDatabase,
} from '@repo/db'
import {
  resolveAddress3dCoverage,
  type Address3dCollectionMetadata,
} from '@repo/db/address3d'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import { resolveSnapshotVersionState } from '@repo/core/pipeline/db/snapshotReplay.ts'
import type { AddressRecord } from './addresses'

export async function attachAddress3dCoverage(args: {
  records: AddressRecord[]
  currentDb: CurrentDatabase
  metaDb: unknown
  historyDbsByBinding?: Record<string, HistoryDatabase>
}) {
  const snapshots = new Set(args.records.map(record => record.address.snapshotId))
  for (const snapshotId of snapshots) {
    const ownerIds = [
      ...new Set(
        args.records
          .filter(record => record.address.snapshotId === snapshotId)
          .flatMap(record => [
            record.address.id,
            ...(record.address.parentAddressId ? [record.address.parentAddressId] : []),
          ]),
      ),
    ]
    const collections: Address3dCollectionMetadata[] = []
    if (args.historyDbsByBinding) {
      const shards = new Map(
        Object.entries(args.historyDbsByBinding).map(([bindingName, db]) => [
          bindingName,
          { bindingName, db },
        ]),
      )
      const plan = await resolveSnapshotReplayPlan(args.metaDb as never, snapshotId)
      const collectionIds = new Set<string>()
      for (const binding of new Set(
        plan.flatMap(step => step.shards.map(shard => shard.bindingName)),
      )) {
        const db = args.historyDbsByBinding[binding]
        if (!db) throw new Error(`Missing Address3D history shard ${binding}`)
        const rows = await db
          .selectDistinct({ id: historySchema.address3d.id })
          .from(historySchema.address3d)
          .where(
            sql`${historySchema.address3d.address2dId} in (select value from json_each(${JSON.stringify(ownerIds)}))`,
          )
          .all()
        for (const row of rows) collectionIds.add(row.id)
      }
      const state = await resolveSnapshotVersionState(
        plan,
        shards as never,
        ['address3d'],
        [...collectionIds],
      )
      const byShard = new Map<string, Array<{ id: string; hash: string }>>()
      for (const row of state.values())
        byShard.set(row.shard.bindingName, [
          ...(byShard.get(row.shard.bindingName) ?? []),
          { id: row.recordId, hash: row.versionHash },
        ])
      for (const [bindingName, versions] of byShard) {
        const db = args.historyDbsByBinding[bindingName]
        if (!db) throw new Error(`Missing Address3D history shard ${bindingName}`)
        for (let i = 0; i < versions.length; i += 90) {
          const batch = versions.slice(i, i + 90)
          const selected = new Set(batch.map(row => `${row.id}:${row.hash}`))
          const rows = await db
            .select({
              id: historySchema.address3d.id,
              address2dId: historySchema.address3d.address2dId,
              unresolvedSectionIds: historySchema.address3d.unresolvedSectionIds,
              versionHash: historySchema.address3d.versionHash,
            })
            .from(historySchema.address3d)
            .where(
              inArray(
                historySchema.address3d.versionHash,
                batch.map(row => row.hash),
              ),
            )
            .all()
          collections.push(
            ...rows.filter(row => selected.has(`${row.id}:${row.versionHash}`)),
          )
        }
      }
    } else {
      collections.push(
        ...(await args.currentDb
          .select({
            id: currentSchema.address3d.id,
            address2dId: currentSchema.address3d.address2dId,
            unresolvedSectionIds: currentSchema.address3d.unresolvedSectionIds,
          })
          .from(currentSchema.address3d)
          .where(
            and(
              sql`${currentSchema.address3d.snapshotId} = (select ${currentSchema.addressPublicationState.scopeId} from ${currentSchema.addressPublicationState} where ${currentSchema.addressPublicationState.status} = 'current' and ${currentSchema.addressPublicationState.snapshotId} = ${snapshotId})`,
              sql`${currentSchema.address3d.address2dId} in (select value from json_each(${JSON.stringify(ownerIds)}))`,
            ),
          )
          .all()),
      )
    }
    for (const record of args.records) {
      if (record.address.snapshotId === snapshotId)
        record.address3dCoverage = resolveAddress3dCoverage(record.address, collections)
    }
  }
}

/** Fetch a collection only when an Address request explicitly opts into units. */
export async function getAddress3dCollection(args: {
  currentDb: CurrentDatabase
  metaDb: unknown
  historyDbsByBinding?: Record<string, HistoryDatabase>
  snapshotId: string
  collectionId: string
}) {
  if (!args.historyDbsByBinding) {
    const collection = await args.currentDb
      .select()
      .from(currentSchema.address3d)
      .where(
        and(
          sql`${currentSchema.address3d.snapshotId} = (select ${currentSchema.addressPublicationState.scopeId} from ${currentSchema.addressPublicationState} where ${currentSchema.addressPublicationState.status} = 'current' and ${currentSchema.addressPublicationState.snapshotId} = ${args.snapshotId})`,
          eq(currentSchema.address3d.id, args.collectionId),
        ),
      )
      .get()
    if (!collection) return null
    const i18n = await args.currentDb
      .select()
      .from(currentSchema.address3dI18n)
      .where(
        and(
          sql`${currentSchema.address3dI18n.snapshotId} = (select ${currentSchema.addressPublicationState.scopeId} from ${currentSchema.addressPublicationState} where ${currentSchema.addressPublicationState.status} = 'current' and ${currentSchema.addressPublicationState.snapshotId} = ${args.snapshotId})`,
          eq(currentSchema.address3dI18n.address3dId, args.collectionId),
        ),
      )
      .all()
    return {
      collection: { ...collection, snapshotId: args.snapshotId },
      i18n: i18n.map(row => ({ ...row, snapshotId: args.snapshotId })),
    }
  }
  const shards = new Map(
    Object.entries(args.historyDbsByBinding).map(([bindingName, db]) => [
      bindingName,
      { bindingName, db },
    ]),
  )
  const state = await resolveSnapshotVersionState(
    await resolveSnapshotReplayPlan(args.metaDb as never, args.snapshotId),
    shards as never,
    ['address3d', 'address3dI18n'],
    [args.collectionId],
  )
  const version = [...state.values()].find(
    row => row.recordType === 'address3d' && row.recordId === args.collectionId,
  )
  if (!version) return null
  const db = args.historyDbsByBinding[version.shard.bindingName]
  if (!db) throw new Error('Missing Address3D history shard')
  const collection = await db
    .select()
    .from(historySchema.address3d)
    .where(
      and(
        eq(historySchema.address3d.id, args.collectionId),
        eq(historySchema.address3d.versionHash, version.versionHash),
      ),
    )
    .get()
  if (!collection) throw new Error('Address3D replay points to absent content')
  const i18n: Array<typeof historySchema.address3dI18n.$inferSelect> = []
  for (const localisedVersion of [...state.values()]
    .filter(
      row => row.recordType === 'address3dI18n' && row.recordId === args.collectionId,
    )
    .sort((left, right) => left.locale.localeCompare(right.locale))) {
    const localeDb = args.historyDbsByBinding[localisedVersion.shard.bindingName]
    if (!localeDb)
      throw new Error(
        `Missing Address3D locale history shard ${localisedVersion.shard.bindingName}`,
      )
    const localised = await localeDb
      .select()
      .from(historySchema.address3dI18n)
      .where(
        and(
          eq(historySchema.address3dI18n.address3dId, args.collectionId),
          eq(historySchema.address3dI18n.versionHash, localisedVersion.versionHash),
          eq(historySchema.address3dI18n.locale, localisedVersion.locale),
        ),
      )
      .get()
    if (!localised)
      throw new Error(
        `Address3D replay points to absent ${localisedVersion.locale} content`,
      )
    i18n.push(localised)
  }
  return { collection, i18n }
}
