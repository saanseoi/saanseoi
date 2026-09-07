import { strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-estate-component-gaps.json'
import { estateGapIdentity } from './hkgovAlsEstateGaps'
import {
  formatEnPremisesAddress,
  formatZhPremisesAddress,
} from './hkgovAlsNormalisation'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

export function restoreAlsEstateGaps(
  rows: PreparedHkgovAlsRow[],
  version: string,
  requireComplete = false,
) {
  const decisions = fixture.restorations.filter(d => d.versions.includes(version))
  const byCsu = new Map<string, typeof decisions>()
  for (const d of decisions) byCsu.set(d.csu, [...(byCsu.get(d.csu) ?? []), d])
  const seen = new Set<string>()
  let restored = 0
  for (const row of rows) {
    const candidates = byCsu.get(row.hkgovCsuId ?? '')
    if (!candidates) continue
    const en = JSON.parse(row.engPremisesAddressJson ?? '{}'),
      zh = JSON.parse(row.chiPremisesAddressJson ?? '{}')
    const identity = estateGapIdentity(row.hkgovCsuId!, en, zh)
    const d = candidates.find(d => d.identity === identity)
    if (!d) continue // A distinct supplied section or alternative address is not this rule's target.
    assert(
      !seen.has(identity),
      'Estate gap now has repeated occurrences; review required',
    )
    seen.add(identity)
    assert(!en.EngEstate && !zh.ChiEstate, 'Estate gap source changed; review required')
    assert.equal(row.enEstateName, null)
    assert.equal(row.zhHantEstateName, null)
    const e = {
      ...en,
      BuildingName: row.enBuildingName,
      EngBlock: {
        ...en.EngBlock,
        BlockDescriptor: row.enBlockDescriptor,
        BlockNo: row.enBlockNumber,
      },
    }
    const z = {
      ...zh,
      BuildingName: row.zhHantBuildingName,
      ChiBlock: {
        ...zh.ChiBlock,
        BlockDescriptor: row.zhHantBlockDescriptor,
        BlockNo: row.zhHantBlockNumber,
      },
    }
    assert.equal(
      row.enFormattedAddress,
      formatEnPremisesAddress(e),
      'Estate gap display requires review',
    )
    assert.equal(
      row.zhHantFormattedAddress,
      formatZhPremisesAddress(z),
      'Estate gap display requires review',
    )
    row.enEstateName = d.enEstate.EstateName
    row.zhHantEstateName = d.zhEstate.EstateName
    row.enFormattedAddress = formatEnPremisesAddress({ ...e, EngEstate: d.enEstate })
    row.zhHantFormattedAddress = formatZhPremisesAddress({
      ...z,
      ChiEstate: d.zhEstate,
    })
    row.sources = JSON.stringify({
      ...JSON.parse(row.sources),
      hkgovAlsEstateComponentGap: {
        policy: fixture.policy,
        ...d,
        targetSourceVersion: version,
        originalEstate: { en: null, 'zh-hant': null },
      },
    })
    restored++
  }
  if (requireComplete)
    for (const d of decisions)
      assert(
        seen.has(d.identity),
        `Estate gap ${d.id}: expected source target missing or changed; review required`,
      )
  return { restored }
}
