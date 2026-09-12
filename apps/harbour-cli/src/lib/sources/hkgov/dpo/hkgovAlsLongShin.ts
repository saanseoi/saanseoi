import { requireDefined } from '@repo/core/requireDefined'
import { strict as assert } from 'node:assert'
import { buildDeterministicUuidV5 } from '@repo/db'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

const estate = 'LONG SHIN ESTATE'
const buildings = [
  ['2272633682T20151209', 'SHIN LEUNG HOUSE', '善良樓', '11'],
  ['2271133599T20151209', 'SHIN OI HOUSE', '善愛樓', '11'],
  ['2262033581T20151210', 'SHIN YUNG HOUSE', '善勇樓', '12'],
] as const

/** Keep source range assertions for 3D lookup, then remove their canonical 2D aliases. */
export function applyLongShinHierarchy(rows: PreparedHkgovAlsRow[], version: string) {
  const ownership = new Map<
    string,
    { ownerId: string; physicalBuildingId: string; unresolvedSectionIds: string[] }
  >()
  if (
    version < '2024-07-25.0' ||
    version > '2026-08-19.0' ||
    !rows.some(r => r.enEstateName === estate)
  )
    return ownership
  const owners = buildings.map(([csu, en, zh, number]) => {
    const matches = rows.filter(r => r.hkgovCsuId === csu)
    const direct = matches.filter(r => !r.enStreetNumberTo)
    assert.equal(direct.length, 1, `Long Shin ${en}: specific owner changed`)
    const owner = requireDefined(direct[0])
    for (const r of matches) {
      assert.equal(r.enEstateName, estate)
      assert.equal(r.zhHantEstateName, '朗善邨')
      assert.equal(r.enDistrict, 'YUEN LONG DISTRICT')
      assert.equal(r.enBuildingName, en)
      assert.equal(r.zhHantBuildingName, zh)
      assert.equal(r.enStreetName, 'YAU SHIN STREET')
      assert.equal(r.zhHantStreetName, '友善街')
      assert.equal(r.enBlockNumber, null)
      assert.equal(r.zhHantBlockNumber, null)
      assert.equal(r.enStreetNumberFrom, r === owner ? number : '11')
      assert.equal(r.zhHantStreetNumberFrom, r.enStreetNumberFrom)
      assert.equal(r.enStreetNumberTo, r === owner ? null : '12')
      assert.equal(r.zhHantStreetNumberTo, r.enStreetNumberTo)
      if (r !== owner) {
        assert.equal(r.geometry, owner.geometry)
        r.hierarchyCuration = 'long-shin-range-alias'
      }
      ownership.set(r.id, {
        ownerId: owner.id,
        physicalBuildingId: owner.id,
        unresolvedSectionIds: [],
      })
    }
    assert.equal(
      matches.length,
      version < '2026-04-03.0' ? 2 : 1,
      'Long Shin: publisher range epoch changed',
    )
    owner.sources = JSON.stringify({
      ...JSON.parse(owner.sources),
      hkgovAlsLongShin: {
        authority:
          'User decision, 2026-09-07: 11–12 belongs to the estate; retain specific building addresses.',
        sourceVersion: version,
        rangeAssertions: matches.filter(r => r !== owner).map(r => ({ ...r })),
      },
    })
    return owner
  })
  const template = requireDefined(owners[0])
  const id = `ss-${buildDeterministicUuidV5(
    'b2da2675-daca-5920-a99e-c4d562a4c950',
    'long-shin-estate',
  )}`
  const complex: PreparedHkgovAlsRow = {
    ...template,
    id,
    canonicalId: id,
    hkgovCsuId: null,
    geoAddress: null,
    enBuildingName: null,
    zhHantBuildingName: null,
    enStreetNumberFrom: '11',
    zhHantStreetNumberFrom: '11',
    enStreetNumberTo: '12',
    zhHantStreetNumberTo: '12',
    enFormattedAddress: 'LONG SHIN ESTATE, 11–12 YAU SHIN STREET',
    zhHantFormattedAddress: '友善街11–12號朗善邨',
    curatedGranularity: 'complex',
    hierarchyCuration: 'long-shin-estate',
    identifiers: JSON.stringify({ curationId: 'long-shin-estate' }),
    sources: JSON.stringify({
      hkgovAlsLongShin: {
        curationId: 'long-shin-estate',
        sourceVersion: version,
        derivedFrom: owners.map(r => r.id),
        evidence:
          'Publisher building range alternatives identify the estate address, not additional unit owners.',
      },
    }),
    sourceFile: 'hkgov-dpo-address-hierarchies.json',
    sourceFeatureIndexOneBased: 0,
    engPremisesAddressJson: null,
    chiPremisesAddressJson: null,
    identityAlias: null,
    identityBuildingId: id,
    identityKey: id,
    identityContinuityKey: id,
    identityMatchMethod: 'reviewed-address-hierarchy',
    identityNumberFrom: null,
    identityNumberTo: null,
  }
  rows.push(complex)
  for (const owner of owners) {
    owner.parentAddressId = id
    owner.curatedGranularity = 'building'
    owner.hierarchyCuration = 'long-shin-estate'
  }
  return ownership
}
