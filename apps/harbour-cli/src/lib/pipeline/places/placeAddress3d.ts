import { eq, and, currentSchema } from '@repo/db'
import {
  resolveAddress3dCoverage,
  validatePlaceAddress3dReference,
} from '@repo/db/address3d'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { stripAddress3d } from './placeAddressMatcher'

type CollectionLoader = (
  snapshotId: string,
  ownerId: string,
) => ReturnType<typeof loadCollection>

/** Bounded invocation-local cache, including concurrent requests and missing owners. */
export type PlaceAddress3dReadObserver = (
  snapshotId: string,
  ownerId: string,
  collection: Awaited<ReturnType<typeof loadCollection>>,
) => void

export function createPlaceAddress3dMatcher(
  db: HarbourReadableDb,
  onRead?: PlaceAddress3dReadObserver,
) {
  const cache = new Map<
    string,
    { promise: ReturnType<typeof loadCollection>; bytes: number }
  >()
  let bytes = 0
  const trim = () => {
    while (cache.size > 128 || bytes > 16 * 1024 * 1024) {
      const first = cache.entries().next().value
      if (!first) break
      cache.delete(first[0])
      bytes -= first[1].bytes
    }
  }
  const load: CollectionLoader = (snapshotId, ownerId) => {
    const key = JSON.stringify([snapshotId, ownerId])
    const existing = cache.get(key)
    if (existing) {
      cache.delete(key)
      cache.set(key, existing)
      return existing.promise
    }
    const entry = {
      promise: loadCollection(db, snapshotId, ownerId),
      bytes: 0,
    }
    entry.promise = entry.promise.then(
      collection => {
        onRead?.(snapshotId, ownerId, collection)
        if (cache.get(key) === entry) {
          entry.bytes = Buffer.byteLength(JSON.stringify(collection ?? null))
          bytes += entry.bytes
          trim()
        }
        return collection
      },
      error => {
        if (cache.get(key) === entry) cache.delete(key)
        throw error
      },
    )
    cache.set(key, entry)
    trim()
    return entry.promise
  }
  return (
    snapshotId: string,
    address: { id: string; parentAddressId: string | null },
    texts: string[],
    observer?: PlaceAddress3dReadObserver,
  ) =>
    matchPlaceAddress3d(db, snapshotId, address, texts, async (snapshot, owner) => {
      const collection = await load(snapshot, owner)
      observer?.(snapshot, owner, collection)
      return collection
    })
}

/** Only an explicit, single floor and flat token can establish unit identity. */
export async function matchPlaceAddress3d(
  db: HarbourReadableDb,
  snapshotId: string,
  address: { id: string; parentAddressId: string | null },
  texts: string[],
  load: CollectionLoader = (snapshot, owner) => loadCollection(db, snapshot, owner),
) {
  const pairs = texts.flatMap(text => {
    const parts = stripAddress3d(text).address3dParts
    const floors = parts.filter(part => part.kind === 'floor')
    const units = parts.filter(part => part.kind === 'unit')
    const floor = floors[0]
    const unit = units[0]
    return floors.length === 1 &&
      units.length === 1 &&
      floor?.floorType === 'floor' &&
      unit?.unitType === 'flat' &&
      floor.floorRef &&
      unit.unitRef
      ? [{ floorRef: floor.floorRef, unitRef: unit.unitRef }]
      : []
  })
  if (!pairs.length || new Set(pairs.map(pair => JSON.stringify(pair))).size !== 1)
    return null
  const pair = pairs[0]
  if (!pair) return null
  for (const ownerId of [address.id, address.parentAddressId].filter(
    (id): id is string => Boolean(id),
  )) {
    const collection = await load(snapshotId, ownerId)
    if (!collection) continue
    const coverage = resolveAddress3dCoverage(address, [collection])
    if (coverage.kind === 'none') continue
    const matches = collection.units.filter(
      unit =>
        unit.unitType === 'F' &&
        unit.floorType === 'F' &&
        unit.floorRef === pair.floorRef &&
        unit.unitRef === pair.unitRef,
    )
    const unit = matches[0]
    if (matches.length !== 1 || !unit) return null
    validatePlaceAddress3dReference({
      address,
      collection,
      unitId: unit.id,
      membership: coverage.membership,
    })
    return {
      address3dId: collection.id,
      address3dUnitId: unit.id,
      address3dMembership: coverage.membership,
    }
  }
  return null
}

export async function loadCollection(
  db: HarbourReadableDb,
  snapshotId: string,
  ownerId: string,
) {
  return db
    .select({
      id: currentSchema.address3d.id,
      address2dId: currentSchema.address3d.address2dId,
      unresolvedSectionIds: currentSchema.address3d.unresolvedSectionIds,
      units: currentSchema.address3d.units,
    })
    .from(currentSchema.address3d)
    .where(
      and(
        eq(currentSchema.address3d.snapshotId, snapshotId),
        eq(currentSchema.address3d.address2dId, ownerId),
      ),
    )
    .get()
}
