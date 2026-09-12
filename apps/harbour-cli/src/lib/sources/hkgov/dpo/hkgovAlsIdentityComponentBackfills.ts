import { strict as assert } from 'node:assert'
import { buildDeterministicUuidV5 } from '@repo/db'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-identity-component-backfills.json'
import { als3dHash } from './hkgovAls3d'
import {
  formatEnPremisesAddress,
  formatZhPremisesAddress,
} from './hkgovAlsNormalisation'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

const namespace = '6a0c2c1b-4522-5b1d-a1c8-1d37b3992777'

/** Restore reviewed identity components without changing the publisher payload. */
export function applyReviewedIdentityComponentBackfills(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  for (const rule of fixture.rules) {
    const assertion = rule.assertions.find(a => a.version === version)
    if (!assertion) continue
    const matches = rows.filter(row => row.hkgovCsuId === rule.csu)
    assert.equal(matches.length, 1, `${rule.id}: unique premise required`)
    const row = matches[0]!
    const en = JSON.parse(row.engPremisesAddressJson ?? '{}')
    const zh = JSON.parse(row.chiPremisesAddressJson ?? '{}')
    const geometry = JSON.parse(row.geometry ?? 'null')
    const original = {
      BuildingCsuInformation: { CsuId: row.hkgovCsuId },
      ChiPremisesAddress: zh,
      EngPremisesAddress: en,
      GeoAddress: row.geoAddress,
    }
    assert.equal(
      als3dHash([original, geometry]),
      assertion.hash,
      `${rule.id}: source evidence changed`,
    )

    const canonicalEn = structuredClone(en)
    const canonicalZh = structuredClone(zh)
    if (rule.enName) canonicalEn.BuildingName = rule.enName
    else delete canonicalEn.BuildingName
    if (rule.zhName) canonicalZh.BuildingName = rule.zhName
    else delete canonicalZh.BuildingName
    if (rule.enEstate) {
      canonicalEn.EngEstate = { EstateName: rule.enEstate }
      row.enEstateName = rule.enEstate
    }
    if (rule.zhEstate) {
      canonicalZh.ChiEstate = { EstateName: rule.zhEstate }
      row.zhHantEstateName = rule.zhEstate
    }
    if (rule.blockNumber) {
      canonicalEn.EngBlock = {
        ...canonicalEn.EngBlock,
        BlockDescriptor: 'BLK',
        BlockNo: rule.blockNumber,
        BlockDescriptorPrecedenceIndicator: 'Y',
      }
      canonicalZh.ChiBlock = {
        ...canonicalZh.ChiBlock,
        BlockDescriptor: '座',
        BlockNo: rule.blockNumber,
      }
      row.enBlockDescriptor = 'BLK'
      row.zhHantBlockDescriptor = '座'
      row.enBlockNumber = rule.blockNumber
      row.zhHantBlockNumber = rule.blockNumber
      row.blockDescriptorPrecedenceIndicator = 'Y'
    }
    row.enBuildingName = rule.enName ?? null
    row.zhHantBuildingName = rule.zhName ?? null
    row.enFormattedAddress = formatEnPremisesAddress(canonicalEn)
    row.zhHantFormattedAddress = formatZhPremisesAddress(canonicalZh)
    row.curatedGranularity = rule.granularity as 'complex' | 'building' | 'section'
    row.identityAlias = row.id
    row.id =
      row.canonicalId =
      row.identityBuildingId =
        rule.canonicalId ?? `ss-${buildDeterministicUuidV5(namespace, rule.id)}`
    row.identityKey =
      row.identityContinuityKey = `reviewed-identity-component-backfill:${rule.id}`
    row.identityMatchMethod = 'reviewed-identity-component-backfill'
    row.identitySummary = {
      ...row.identitySummary,
      estateName: row.enEstateName,
      buildingName: row.enBuildingName,
    }
    row.sources = JSON.stringify({
      ...JSON.parse(row.sources ?? '{}'),
      hkgovAlsIdentityComponentBackfill: {
        id: rule.id,
        authority: rule.authority,
        sourceVersion: version,
        original,
      },
    })
  }
}
