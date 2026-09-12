import { strict as assert } from 'node:assert'
import { buildDeterministicUuidV5 } from '@repo/db'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-house-street-identities.json'
import { als3dHash } from './hkgovAls3d'
import {
  formatEnPremisesAddress,
  formatZhPremisesAddress,
} from './hkgovAlsNormalisation'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

/** Explicit reviewed mappings never infer a street number from a house number. */
export function applyReviewedHouseStreetIdentities(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  for (const rule of fixture.rules) {
    const assertion = rule.assertions.find(a => a.version === version)
    if (!assertion) continue
    const matches = rows.filter(r => r.hkgovCsuId === rule.csu)
    assert.equal(matches.length, 1, `${rule.id}: unique house required`)
    const row = matches[0]!
    const en = JSON.parse(row.engPremisesAddressJson!),
      zh = JSON.parse(row.chiPremisesAddressJson!)
    const original = {
      BuildingCsuInformation: { CsuId: row.hkgovCsuId },
      ChiPremisesAddress: zh,
      EngPremisesAddress: en,
      GeoAddress: row.geoAddress,
    }
    assert(
      assertion.hashes.includes(als3dHash([original, JSON.parse(row.geometry!)])),
      `${rule.id}: source evidence changed`,
    )
    const canonicalEn = structuredClone(en),
      canonicalZh = structuredClone(zh)
    delete canonicalEn.EngVillage
    delete canonicalZh.ChiVillage
    canonicalEn.EngEstate = { EstateName: rule.estate }
    canonicalZh.ChiEstate = { EstateName: rule.zhEstate }
    canonicalEn.EngBlock = {
      BlockDescriptor: 'HOUSE',
      BlockNo: rule.houseNumber,
      BlockDescriptorPrecedenceIndicator: 'Y',
    }
    canonicalZh.ChiBlock = { BlockDescriptor: '洋房', BlockNo: rule.houseNumber }
    canonicalEn.EngStreet = {
      StreetName: rule.enStreet,
      BuildingNoFrom: rule.streetNumber,
    }
    canonicalZh.ChiStreet = {
      StreetName: rule.zhStreet,
      BuildingNoFrom: rule.streetNumber,
    }
    row.enEstateName = rule.estate
    row.zhHantEstateName = rule.zhEstate
    row.enBlockNumber = row.zhHantBlockNumber = rule.houseNumber
    row.enBlockDescriptor = 'HOUSE'
    row.zhHantBlockDescriptor = '洋房'
    row.blockDescriptorPrecedenceIndicator = 'Y'
    row.enStreetName = rule.enStreet
    row.zhHantStreetName = rule.zhStreet
    row.enStreetNumberFrom = row.zhHantStreetNumberFrom = rule.streetNumber
    row.enStreetNumberTo = row.zhHantStreetNumberTo = null
    row.enVillageName = row.zhHantVillageName = null
    row.enVillageNumberFrom =
      row.enVillageNumberTo =
      row.zhHantVillageNumberFrom =
      row.zhHantVillageNumberTo =
        null
    row.enFormattedAddress = formatEnPremisesAddress(canonicalEn)
    row.zhHantFormattedAddress = formatZhPremisesAddress(canonicalZh)
    row.identityAlias = row.id
    row.id =
      row.canonicalId =
      row.identityBuildingId =
        `ss-${buildDeterministicUuidV5('6e7c2e9f-dd17-5d55-ae29-0e6f18e1662b', rule.id)}`
    row.identityKey = row.identityContinuityKey = `reviewed-house-street:${rule.id}`
    row.identityMatchMethod = 'reviewed-house-street'
    row.identitySummary = {
      ...row.identitySummary,
      estateName: rule.estate,
      streetName: rule.enStreet,
      streetNumberFrom: rule.streetNumber,
    }
    row.curatedGranularity = 'building'
    row.sources = JSON.stringify({
      ...JSON.parse(row.sources),
      hkgovAlsHouseStreetIdentity: {
        id: rule.id,
        authority: rule.authority,
        sourceVersion: version,
        original,
      },
    })
  }
}
export function linkReviewedHouseStreetParents(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  for (const rule of fixture.rules) {
    if (!rule.assertions.some(a => a.version === version)) continue
    const house = rows.find(r => r.identityKey === `reviewed-house-street:${rule.id}`)
    const parent = rows.find(r => r.hierarchyCuration === rule.parentRuleId)
    assert(house && parent, `${rule.id}: house and complex required`)
    house.parentAddressId = parent.id
  }
}
