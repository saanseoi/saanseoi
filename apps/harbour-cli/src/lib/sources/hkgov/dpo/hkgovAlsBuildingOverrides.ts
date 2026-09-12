import { strict as assert } from 'node:assert'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-building-overrides.json'
import { als3dHash } from './hkgovAls3d'
import {
  formatEnPremisesAddress,
  formatZhPremisesAddress,
} from './hkgovAlsNormalisation'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

export function applyReviewedBuildingOverrides(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  for (const rule of fixture.rules) {
    const evidence = rule.assertions.find(a => a.version === version)
    if (!evidence) continue
    const matches = rows.filter(r => r.hkgovCsuId === rule.csu)
    assert.equal(matches.length, 1, `${rule.id}: unique premise required`)
    const row = matches[0]!
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
    const e = structuredClone(en),
      z = structuredClone(zh)
    delete e.EngEstate
    delete z.ChiEstate
    e.BuildingName = row.enBuildingName = rule.enName
    z.BuildingName = row.zhHantBuildingName = rule.zhName
    row.enEstateName = row.zhHantEstateName = null
    row.enFormattedAddress = formatEnPremisesAddress(e)
    row.zhHantFormattedAddress = formatZhPremisesAddress(z)
    row.curatedGranularity = 'building'
    row.identityAlias = row.id
    row.id = row.canonicalId = row.identityBuildingId = rule.canonicalId
    row.identityKey =
      row.identityContinuityKey = `reviewed-building-override:${rule.id}`
    row.identityMatchMethod = 'reviewed-building-override'
    row.identitySummary = {
      ...row.identitySummary,
      buildingName: rule.enName,
      estateName: null,
    }
    row.sources = JSON.stringify({
      ...JSON.parse(row.sources),
      hkgovAlsBuildingOverride: {
        id: rule.id,
        authority: rule.authority,
        sourceVersion: version,
        original,
      },
    })
  }
}
