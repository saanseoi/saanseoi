import { strict as assert } from 'node:assert'
import { buildDeterministicUuidV5 } from '@repo/db'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-premise-renames.json'
import { als3dHash } from './hkgovAls3d'
import {
  formatEnPremisesAddress,
  formatZhPremisesAddress,
} from './hkgovAlsNormalisation'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

/** Reviewed renames change canonical names while preserving publisher assertions. */
export function applyReviewedPremiseRenames(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  for (const rule of fixture.rules) {
    const assertion = rule.assertions.find(a => a.version === version)
    if (!assertion) continue
    const candidates = rows.filter(
      r =>
        rule.csus.includes(r.hkgovCsuId ?? '') &&
        rule.sourceNames.includes(r.enBuildingName ?? ''),
    )
    assert.equal(candidates.length, 1, `${rule.id}: unique named premise required`)
    const row = candidates[0]!
    const en = JSON.parse(row.engPremisesAddressJson!)
    const zh = JSON.parse(row.chiPremisesAddressJson!)
    const geometry = JSON.parse(row.geometry!)
    const premise = {
      BuildingCsuInformation: { CsuId: row.hkgovCsuId },
      ChiPremisesAddress: zh,
      EngPremisesAddress: en,
      GeoAddress: row.geoAddress,
    }
    assert(
      assertion.hashes.includes(als3dHash([premise, geometry])),
      `${rule.id}: publisher evidence changed`,
    )
    const original = {
      id: row.id,
      en: structuredClone(en),
      zh: structuredClone(zh),
      geometry,
    }
    en.BuildingName = row.enBuildingName = rule.enName
    zh.BuildingName = row.zhHantBuildingName = rule.zhName
    row.enFormattedAddress = formatEnPremisesAddress(en)
    row.zhHantFormattedAddress = formatZhPremisesAddress(zh)
    row.identityAlias = row.id
    row.id =
      row.canonicalId =
      row.identityBuildingId =
        ('canonicalId' in rule ? rule.canonicalId : undefined) ??
        `ss-${buildDeterministicUuidV5('6e7c2e9f-dd17-5d55-ae29-0e6f18e1662b', rule.id)}`
    row.identityKey = row.identityContinuityKey = `reviewed-premise-rename:${rule.id}`
    row.identityMatchMethod = 'reviewed-premise-rename'
    row.identitySummary = { ...row.identitySummary, buildingName: rule.enName }
    row.curatedGranularity = 'building'
    row.sources = JSON.stringify({
      ...JSON.parse(row.sources),
      hkgovAlsPremiseRename: {
        id: rule.id,
        authority: rule.authority,
        sourceVersion: version,
        curationFile: 'hkgov-dpo-address-premise-renames.json',
        original,
      },
    })
  }
}
