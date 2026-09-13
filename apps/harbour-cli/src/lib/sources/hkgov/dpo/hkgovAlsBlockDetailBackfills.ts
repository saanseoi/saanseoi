import { strict as assert } from 'node:assert'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-block-detail-backfills.json'
import { als3dHash } from './hkgovAls3d'
import {
  formatEnPremisesAddress,
  formatZhPremisesAddress,
} from './hkgovAlsNormalisation'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

/** Approved component completion and identity continuity, separate from house retention. */
export function applyReviewedBlockDetailBackfills(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  for (const rule of fixture.rules) {
    const evidence = rule.assertions.find(a => a.version === version)
    if (!evidence) continue
    const candidates = rows.filter(r => r.hkgovCsuId === rule.csu)
    assert.equal(candidates.length, 1, `${rule.id}: unique premise required`)
    const row = candidates[0]!
    const en = JSON.parse(row.engPremisesAddressJson!),
      zh = JSON.parse(row.chiPremisesAddressJson!)
    const original = {
      BuildingCsuInformation: { CsuId: row.hkgovCsuId },
      ChiPremisesAddress: zh,
      EngPremisesAddress: en,
      GeoAddress: row.geoAddress,
    }
    assert.equal(
      als3dHash([original, JSON.parse(row.geometry!)]),
      evidence.hash,
      `${rule.id}: source evidence changed`,
    )
    const filled = !row.enBlockNumber && !row.zhHantBlockNumber
    if (filled) {
      const canonicalEn = {
        ...en,
        BuildingName: row.enBuildingName,
        EngBlock: {
          BlockDescriptor: 'BLK',
          BlockNo: rule.blockNumber,
          BlockDescriptorPrecedenceIndicator: 'Y',
        },
      }
      const canonicalZh = {
        ...zh,
        BuildingName: row.zhHantBuildingName,
        ChiBlock: { BlockDescriptor: '座', BlockNo: rule.blockNumber },
      }
      row.enBlockDescriptor = 'BLK'
      row.zhHantBlockDescriptor = '座'
      row.enBlockNumber = row.zhHantBlockNumber = rule.blockNumber
      row.blockDescriptorPrecedenceIndicator = 'Y'
      row.enFormattedAddress = formatEnPremisesAddress(canonicalEn)
      row.zhHantFormattedAddress = formatZhPremisesAddress(canonicalZh)
    } else {
      assert.equal(
        row.enBlockNumber,
        rule.blockNumber,
        `${rule.id}: conflicting English block`,
      )
      assert.equal(
        row.zhHantBlockNumber,
        rule.blockNumber,
        `${rule.id}: conflicting Chinese block`,
      )
    }
    row.identityAlias = row.id
    row.id = row.canonicalId = row.identityBuildingId = rule.canonicalId
    row.identityKey = row.identityContinuityKey = `reviewed-block-detail:${rule.id}`
    row.identityMatchMethod = 'reviewed-block-detail'
    row.sources = JSON.stringify({
      ...JSON.parse(row.sources),
      hkgovAlsBlockDetailBackfill: {
        id: rule.id,
        authority: rule.authority,
        sourceVersion: version,
        filled,
        original,
      },
    })
  }
}
