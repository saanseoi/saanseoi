import { strict as assert } from 'node:assert'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-structured-components.json'
import { als3dHash } from './hkgovAls3d'
import {
  formatEnPremisesAddress,
  formatZhPremisesAddress,
} from './hkgovAlsNormalisation'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

/** Correct authored components without changing publisher assertions or identity keys. */
export function applyReviewedStructuredComponents(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  assert.equal(fixture.version, 1)
  if (version < fixture.sourceVersionFrom) return
  assert(
    version <= fixture.sourceVersionTo,
    `Structured components: release requires review`,
  )
  for (const rule of fixture.rules) {
    if (version > rule.sourceVersionTo) continue
    const candidates = rows.filter(
      row =>
        row.hkgovCsuId === rule.csu &&
        JSON.parse(row.engPremisesAddressJson!).BuildingName === rule.sourceName,
    )
    assert.equal(candidates.length, 1, `${rule.id}: unique named premise required`)
    const row = candidates[0]!
    const en = JSON.parse(row.engPremisesAddressJson!)
    const zh = JSON.parse(row.chiPremisesAddressJson!)
    const original = {
      BuildingCsuInformation: { CsuId: row.hkgovCsuId },
      ChiPremisesAddress: zh,
      EngPremisesAddress: en,
      GeoAddress: row.geoAddress,
    }
    assert(
      rule.hashes.includes(als3dHash([original, JSON.parse(row.geometry!)])),
      `${rule.id}: publisher evidence changed`,
    )
    const canonicalEn = structuredClone(en),
      canonicalZh = structuredClone(zh)
    const english = rule.components.en,
      chinese = rule.components['zh-hant']
    row.enBuildingName = canonicalEn.BuildingName = english.buildingName
    row.zhHantBuildingName = canonicalZh.BuildingName = chinese.buildingName
    row.enBlockDescriptor = english.blockDescriptor
    row.zhHantBlockDescriptor = chinese.blockDescriptor
    row.enBlockNumber = english.blockNumber
    row.zhHantBlockNumber = chinese.blockNumber
    row.blockDescriptorPrecedenceIndicator = 'Y'
    canonicalEn.EngBlock = {
      BlockDescriptor: english.blockDescriptor,
      BlockNo: english.blockNumber,
      BlockDescriptorPrecedenceIndicator: 'Y',
    }
    canonicalZh.ChiBlock = {
      BlockDescriptor: chinese.blockDescriptor,
      BlockNo: chinese.blockNumber,
    }
    // Keep estate membership, but avoid repeating the same name in display text.
    canonicalEn.EngEstate = { EstateName: row.enEstateName }
    canonicalZh.ChiEstate = { EstateName: row.zhHantEstateName }
    if (row.enEstateName?.toUpperCase() === english.buildingName?.toUpperCase())
      delete canonicalEn.EngEstate
    if (row.zhHantEstateName === chinese.buildingName) delete canonicalZh.ChiEstate
    row.enFormattedAddress = formatEnPremisesAddress(canonicalEn)
    row.zhHantFormattedAddress = formatZhPremisesAddress(canonicalZh)
    row.curatedGranularity = 'building'
    row.sources = JSON.stringify({
      ...JSON.parse(row.sources),
      hkgovAlsStructuredComponents: {
        id: rule.id,
        authority: fixture.authority,
        sourceVersion: version,
        curationFile: 'hkgov-dpo-address-structured-components.json',
        original,
      },
    })
  }
}
