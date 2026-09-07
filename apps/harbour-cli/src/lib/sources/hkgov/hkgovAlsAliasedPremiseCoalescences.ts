import { AssertionError, strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-aliased-premise-coalescences.json'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

const curationFile = 'hkgov-dpo-address-aliased-premise-coalescences.json'

/**
 * Coalesce reviewed cross-CSU aliases only when their structured building
 * identity, point and bilingual source assertions still agree.
 */
export function coalesceAlsAliasedPremises(
  rows: PreparedHkgovAlsRow[],
  version: string,
  skipCurationChecks = false,
) {
  const ownerIdByAliasId = new Map<string, string>()
  for (const decision of fixture.coalescences) {
    if (version < decision.sourceVersionFrom || version > decision.sourceVersionTo)
      continue
    const owners = rows.filter(row => row.hkgovCsuId === decision.owner.csu)
    const aliases = rows.filter(row => row.hkgovCsuId === decision.aliasCsu)
    try {
      assert.equal(owners.length, 1, `ALS alias ${decision.id}: owner changed`)
      assert.equal(aliases.length, 1, `ALS alias ${decision.id}: alias changed`)
      const owner = owners[0]
      const alias = aliases[0]
      if (!owner || !alias)
        throw new Error(`ALS alias ${decision.id}: premise is missing`)
      const ownerEn = JSON.parse(owner.engPremisesAddressJson ?? 'null')
      const ownerZh = JSON.parse(owner.chiPremisesAddressJson ?? 'null')
      const aliasEn = JSON.parse(alias.engPremisesAddressJson ?? 'null')
      const aliasZh = JSON.parse(alias.chiPremisesAddressJson ?? 'null')

      assert.equal(ownerEn?.BuildingName, decision.owner.enBuildingName)
      assert.equal(ownerZh?.BuildingName, decision.owner.zhHantBuildingName)
      assert.equal(aliasEn?.BuildingName ?? null, null)
      assert.equal(aliasZh?.BuildingName ?? null, null)
      assert.equal(ownerEn?.EngBlock ?? null, null)
      assert.equal(ownerZh?.ChiBlock ?? null, null)
      assert.equal(aliasEn?.EngBlock?.BlockDescriptor, 'BLK')
      assert.equal(aliasEn?.EngBlock?.BlockNo, decision.blockRef)
      assert.equal(aliasZh?.ChiBlock?.BlockDescriptor, '座')
      assert.equal(aliasZh?.ChiBlock?.BlockNo, decision.blockRef)
      assert.equal(alias.enBlockDescriptor, 'BLK')
      assert.equal(alias.enBlockNumber, decision.blockRef)
      assert.equal(alias.zhHantBlockDescriptor, '座')
      assert.equal(alias.zhHantBlockNumber, decision.blockRef)
      for (const row of [owner, alias]) {
        assert.equal(row.enEstateName, decision.estate)
        assert.equal(row.zhHantEstateName, decision.zhEstate)
        assert.equal(row.enStreetName, 'TIN SHUI ROAD')
        assert.equal(row.zhHantStreetName, '天瑞路')
        assert.equal(row.enStreetNumberFrom, '88')
        assert.equal(row.zhHantStreetNumberFrom, '88')
      }
      assert.equal(
        owner.geometry,
        alias.geometry,
        `ALS alias ${decision.id}: point changed`,
      )
    } catch (error) {
      if (!skipCurationChecks || !(error instanceof AssertionError)) throw error
      // A stale curation must not merge or rewrite the publisher assertions.
      continue
    }

    const owner = owners[0]!
    const alias = aliases[0]!
    const aliasEn = JSON.parse(alias.engPremisesAddressJson ?? 'null')
    const aliasZh = JSON.parse(alias.chiPremisesAddressJson ?? 'null')

    owner.sources = JSON.stringify({
      ...JSON.parse(owner.sources ?? '{}'),
      hkgovAlsAliasedPremiseCoalescence: {
        ...decision,
        curationFile,
        sourceVersion: version,
        suppressedAddress: {
          addressId: alias.id,
          canonicalId: alias.canonicalId,
          identityKey: alias.identityKey,
          geometry: JSON.parse(alias.geometry ?? 'null'),
          sources: JSON.parse(alias.sources ?? '{}'),
          engPremisesAddress: aliasEn,
          chiPremisesAddress: aliasZh,
        },
      },
    })
    ownerIdByAliasId.set(alias.id, owner.id)
  }
  return ownerIdByAliasId
}
