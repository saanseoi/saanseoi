import { eq, and, currentSchema } from '@repo/db'
import {
  resolveAddress3dCoverage,
  validatePlaceAddress3dReference,
} from '@repo/db/address3d'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { stripAddress3d } from './placeAddressMatcher'

/** Only an explicit, single floor and flat token can establish unit identity. */
export async function matchPlaceAddress3d(
  db: HarbourReadableDb,
  snapshotId: string,
  address: { id: string; parentAddressId: string | null },
  texts: string[],
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
    const collection = await db
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
