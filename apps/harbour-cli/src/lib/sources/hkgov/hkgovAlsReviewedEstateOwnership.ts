import { strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-reviewed-estate-ownership.json'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

const curationFile = 'hkgov-dpo-address-reviewed-estate-ownership.json'
const inBounds = (version: string) =>
  version >= fixture.sourceVersionFrom && version <= fixture.sourceVersionTo

/** Rejected Phase 2 address assertions belong only to Hung Yat's source provenance. */
export function suppressHungHomPhase2Aliases(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  if (!inBounds(version)) return 0
  const rule = fixture.hungHom
  const aliases = rows.filter(row => row.enEstateName === 'HUNG HOM ESTATE PHASE 2')
  if (!aliases.length) return 0
  const owners = rows.filter(
    row =>
      row.hkgovCsuId === rule.ownerCsu &&
      [rule.ownerName, `${rule.ownerName} (BLK 1)`].includes(row.enBuildingName ?? ''),
  )
  assert.equal(owners.length, 1, 'Hung Hom: unique Hung Yat owner required')
  const owner = owners[0]!
  assert.equal(
    owner.zhHantBuildingName,
    owner.enBuildingName === rule.ownerName
      ? rule.ownerZhName
      : `${rule.ownerZhName}(第1座)`,
  )
  assert.equal(owner.geoAddress, rule.geoAddress)
  assert.equal(owner.enEstateName, 'HUNG HOM ESTATE')
  assert.equal(owner.zhHantEstateName, '紅磡邨')
  assert.equal(owner.enBlockNumber, '1')
  assert.equal(owner.zhHantBlockNumber, '1')
  assert.equal(owner.enStreetName, 'TAI WAN ROAD')
  assert.equal(owner.zhHantStreetName, '大環道')
  assert.equal(owner.enStreetNumberFrom, '28')
  assert.equal(owner.zhHantStreetNumberFrom, '28')
  assert.equal(owner.enStreetNumberTo, null)
  assert.equal(owner.zhHantStreetNumberTo, null)
  const earlier = version < '2026-04-03.0'
  assert.equal(aliases.length, earlier ? 2 : 1, 'Hung Hom: alias epoch changed')
  const addresses: string[] = []
  for (const row of aliases) {
    assert.equal(row.hkgovCsuId, rule.aliasCsu)
    assert.equal(row.geoAddress, rule.geoAddress)
    assert.equal(row.zhHantEstateName, '紅磡邨第二期')
    assert.equal(row.enBuildingName, null)
    assert.equal(row.zhHantBuildingName, null)
    assert.equal(row.enBlockNumber, null)
    assert.equal(row.zhHantBlockNumber, null)
    assert.equal(row.enDistrict, 'KOWLOON CITY DISTRICT')
    assert.equal(row.zhHantDistrict, '九龍城區')
    assert.equal(row.enStreetNumberTo, null)
    assert.equal(row.zhHantStreetNumberTo, null)
    const taiWan = row.enStreetName === 'TAI WAN ROAD'
    assert.equal(row.enStreetName, taiWan ? 'TAI WAN ROAD' : 'DYER AVENUE')
    assert.equal(row.zhHantStreetName, taiWan ? '大環道' : '戴亞街')
    assert.equal(row.enStreetNumberFrom, taiWan ? '28' : '9')
    assert.equal(row.zhHantStreetNumberFrom, row.enStreetNumberFrom)
    addresses.push(row.enStreetName!)
    assert.deepEqual(JSON.parse(row.geometry!), {
      type: 'Point',
      coordinates: earlier ? rule.earlierCoordinates : rule.coordinates,
    })
    assert.equal(row.geometry, owner.geometry)
  }
  assert.deepEqual(
    addresses.sort(),
    earlier ? ['DYER AVENUE', 'TAI WAN ROAD'] : ['TAI WAN ROAD'],
  )
  owner.sources = JSON.stringify({
    ...JSON.parse(owner.sources),
    hkgovAlsHungHomPhase2: {
      ...rule,
      curationFile,
      sourceVersion: version,
      suppressedAddresses: aliases.map(row => ({ ...row })),
      inventoryPolicy:
        'Use only the named house inventory; rejected unnamed 780-unit assertions remain suppressed.',
    },
  })
  for (const alias of aliases) rows.splice(rows.indexOf(alias), 1)
  return aliases.length
}

/** Use the reviewed publisher estate record, not a synthetic or building-level alias. */
export function applyKoYeeEstateOwnership(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  const ownership = new Map<
    string,
    { ownerId: string; physicalBuildingId: string; unresolvedSectionIds: string[] }
  >()
  if (!inBounds(version)) return ownership
  const estateRows = rows.filter(row => row.enEstateName === 'KO YEE ESTATE')
  if (!estateRows.length) return ownership
  const rule = fixture.koYee
  const candidates = estateRows.filter(row => row.geoAddress === rule.geoAddress)
  assert.equal(candidates.length, 1, 'Ko Yee: unique estate address required')
  const estate = candidates[0]!
  assert.equal(estate.hkgovCsuId, rule.csu)
  assert.equal(estate.enBuildingName, null)
  assert.equal(estate.zhHantBuildingName, null)
  assert.equal(estate.enDistrict, 'KWUN TONG DISTRICT')
  assert.equal(estate.zhHantDistrict, '觀塘區')
  assert.deepEqual(JSON.parse(estate.geometry!), {
    type: 'Point',
    coordinates: version < '2026-04-03.0' ? rule.earlierCoordinates : rule.coordinates,
  })
  const children = rule.buildings.map(([csu, en, zh]) => {
    const matches = estateRows.filter(
      row => row.hkgovCsuId === csu && row.enBuildingName === en,
    )
    assert.equal(matches.length, 1, `Ko Yee: unique ${en} required`)
    assert.equal(matches[0]!.zhHantBuildingName, zh)
    return matches[0]!
  })
  for (const row of [estate, ...children]) {
    assert.equal(row.zhHantEstateName, '高怡邨')
    assert.equal(row.enStreetName, 'KO CHIU ROAD')
    assert.equal(row.zhHantStreetName, '高超道')
    assert.equal(row.enStreetNumberFrom, '28')
    assert.equal(row.zhHantStreetNumberFrom, '28')
    assert.equal(row.enStreetNumberTo, null)
    assert.equal(row.zhHantStreetNumberTo, null)
    assert.equal(row.enBlockNumber, null)
    assert.equal(row.zhHantBlockNumber, null)
  }
  estate.curatedGranularity = 'complex'
  estate.hierarchyCuration = rule.id
  estate.sources = JSON.stringify({
    ...JSON.parse(estate.sources),
    hkgovAlsKoYeeEstate: { ...rule, curationFile, sourceVersion: version },
  })
  for (const child of children) {
    child.parentAddressId = estate.id
    child.curatedGranularity = 'building'
    child.hierarchyCuration = rule.id
    ownership.set(child.id, {
      ownerId: child.id,
      physicalBuildingId: child.id,
      unresolvedSectionIds: [],
    })
  }
  return ownership
}
