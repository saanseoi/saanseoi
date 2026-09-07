import { requireDefined } from '@repo/core/requireDefined'
import { strict as assert } from 'node:assert'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'
import type { Als3dFeature } from './hkgovAls3d'

export function assertKoYeeEmptyInventory(feature: Als3dFeature, version: string) {
  const p = feature.properties.Address.PremisesAddress
  if (
    version < '2024-07-25.0' ||
    version > '2026-07-10.0' ||
    p.BuildingCsuInformation?.CsuId !== '4286117561T20050430'
  )
    return
  assert.equal(
    p.EngPremisesAddress?.Eng3dAddress?.length ?? 0,
    0,
    'Ko Yee duplicate: English inventory is no longer empty',
  )
  assert.equal(
    p.ChiPremisesAddress?.Chi3dAddress?.length ?? 0,
    0,
    'Ko Yee duplicate: Chinese inventory is no longer empty',
  )
}

/** The other unnamed Ko Yee row has a different point and GeoAddress; retain it. */
export function suppressKoYeeDuplicate(rows: PreparedHkgovAlsRow[], version: string) {
  if (version < '2024-07-25.0' || version > '2026-07-10.0') return 0
  const estateRows = rows.filter(row => row.enEstateName === 'KO YEE ESTATE')
  if (!estateRows.length) return 0
  const owner = estateRows.filter(
    row =>
      row.hkgovCsuId === '4291717546T20050430' &&
      row.enBuildingName === 'KO SHING HOUSE',
  )
  const aliases = estateRows.filter(row => row.hkgovCsuId === '4286117561T20050430')
  assert.equal(owner.length, 1, 'Ko Yee duplicate: named owner changed')
  assert.equal(aliases.length, 1, 'Ko Yee duplicate: unnamed alias changed')
  const retained = requireDefined(owner[0])
  const duplicate = requireDefined(aliases[0])
  assert.equal(retained.zhHantBuildingName, '高盛樓')
  for (const row of [retained, duplicate]) {
    assert.equal(row.zhHantEstateName, '高怡邨')
    assert.equal(row.enStreetName, 'KO CHIU ROAD')
    assert.equal(row.zhHantStreetName, '高超道')
    assert.equal(row.enStreetNumberFrom, '28')
    assert.equal(row.zhHantStreetNumberFrom, '28')
    assert.equal(row.geoAddress, '4286117561T20050430')
    assert.equal(row.enBlockNumber, null)
    assert.equal(row.zhHantBlockNumber, null)
  }
  assert.equal(duplicate.enBuildingName, null)
  assert.equal(duplicate.zhHantBuildingName, null)
  const point = version < '2026-04-03.0' ? [114.24114, 22.29688] : [114.24086, 22.29696]
  for (const row of [retained, duplicate])
    assert.deepEqual(JSON.parse(requireDefined(row.geometry)), {
      type: 'Point',
      coordinates: point,
    })
  retained.sources = JSON.stringify({
    ...JSON.parse(retained.sources),
    hkgovAlsKoYeeDuplicate: {
      authority:
        'User decision, 2026-09-07: collapse reviewed Ko Shing variants and backfill current coordinates.',
      targetSourceVersion: version,
      evidenceSourceVersion: '2026-08-19.0',
      suppressedAddress: { ...duplicate },
    },
  })
  rows.splice(rows.indexOf(duplicate), 1)
  return 1
}
