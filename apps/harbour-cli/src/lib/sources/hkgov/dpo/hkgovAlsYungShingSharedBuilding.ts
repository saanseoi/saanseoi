import { strict as assert } from 'node:assert'
import { buildDeterministicUuidV5 } from '@repo/db'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-yung-shing-shared-building.json'
import { als3dHash, type Als3dFeature } from './hkgovAls3d'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

const sourceFile = 'hkgov-dpo-address-yung-shing-shared-building.json'
const physicalBuildingId = `ss-${buildDeterministicUuidV5('71c00c8c-f7ea-562a-8754-2d26a9a2eccd', fixture.id)}`

/** Two valid street-address records refer to one physical building and collection. */
export function applyYungShingSharedBuilding(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  const ownership = new Map<
    string,
    { ownerId: string; physicalBuildingId: string; unresolvedSectionIds: string[] }
  >()
  if (!fixture.sourceVersions.includes(version)) return ownership
  const candidates = rows.filter(row => row.hkgovCsuId === fixture.csu)
  if (!candidates.length) return ownership
  const hashes = candidates
    .map(row =>
      als3dHash([
        {
          BuildingCsuInformation: { CsuId: row.hkgovCsuId },
          ChiPremisesAddress: JSON.parse(row.chiPremisesAddressJson ?? 'null'),
          EngPremisesAddress: JSON.parse(row.engPremisesAddressJson ?? 'null'),
          GeoAddress: row.geoAddress,
        },
        JSON.parse(row.geometry ?? 'null'),
      ]),
    )
    .sort()
  assert(
    fixture.assertions2d.some(
      epoch =>
        epoch.sourceVersions.includes(version) &&
        JSON.stringify(epoch.hashes) === JSON.stringify(hashes),
    ),
    'Yung Shing shared building: source addresses changed',
  )
  const owner = candidates.find(
    row => row.enStreetName === 'FAI MING ROAD' && row.enStreetNumberFrom === '8',
  )
  assert(owner, 'Yung Shing shared building: inventory anchor missing')
  const validAddresses = candidates.map(row => ({
    addressId: row.id,
    en: row.enFormattedAddress,
    zh: row.zhHantFormattedAddress,
  }))
  for (const row of candidates) {
    row.curatedGranularity = 'building'
    row.hierarchyCuration = fixture.id
    row.identityBuildingId = physicalBuildingId
    row.sources = JSON.stringify({
      ...JSON.parse(row.sources),
      hkgovAlsSharedBuilding: {
        id: fixture.id,
        sourceFile,
        sourceVersion: version,
        authority: fixture.authority,
        physicalBuildingId,
        inventoryOwnerAddressId: owner.id,
        validAddresses,
      },
    })
    ownership.set(row.id, {
      ownerId: owner.id,
      physicalBuildingId,
      unresolvedSectionIds: [],
    })
  }
  return ownership
}

export function assertYungShingSharedInventory(feature: Als3dFeature, version: string) {
  if (
    !fixture.sourceVersions.includes(version) ||
    feature.properties.Address.PremisesAddress.BuildingCsuInformation?.CsuId !==
      fixture.csu
  )
    return
  assert(
    fixture.assertions3d.some(
      epoch =>
        epoch.sourceVersions.includes(version) &&
        epoch.hashes.includes(als3dHash(feature)),
    ),
    'Yung Shing shared building: source inventory changed',
  )
}
