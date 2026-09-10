import { requireDefined } from '@repo/core/requireDefined'
import { strict as assert } from 'node:assert'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-estate-component-gaps.json'
import {
  curationProvenance,
  resolveHkgovAlsCurationVerification,
  type HkgovAlsCurationApplication,
} from './hkgovAlsCurationLifecycle'
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
  const application = fixture.application as HkgovAlsCurationApplication
  const decisions = fixture.restorations.flatMap(d => {
    const verification = resolveHkgovAlsCurationVerification(
      version,
      d.versions,
      application,
    )
    return verification ? [{ decision: d, verification }] : []
  })
  const byCsu = new Map<string, typeof decisions>()
  for (const d of decisions)
    byCsu.set(d.decision.csu, [...(byCsu.get(d.decision.csu) ?? []), d])
  const seen = new Set<string>()
  let restored = 0
  const applications: Array<{
    fixture: 'hkgov-dpo-address-estate-component-gaps.json'
    id: string
    verification: 'unverified' | 'verified'
  }> = []
  for (const row of rows) {
    const candidates = byCsu.get(row.hkgovCsuId ?? '')
    if (!candidates) continue
    const en = JSON.parse(row.engPremisesAddressJson ?? '{}'),
      zh = JSON.parse(row.chiPremisesAddressJson ?? '{}')
    const identity = estateGapIdentity(requireDefined(row.hkgovCsuId), en, zh)
    const match = candidates.find(d => d.decision.identity === identity)
    if (!match) continue // A distinct supplied section or alternative address is not this rule's target.
    const { decision: d, verification } = match
    assert(
      !seen.has(identity),
      'Estate gap now has repeated occurrences; review required',
    )
    seen.add(identity)
    if (
      en.EngEstate?.EstateName === d.enEstate.EstateName &&
      zh.ChiEstate?.EstateName === d.zhEstate.EstateName
    ) {
      continue
    }
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
        curation: curationProvenance({
          application,
          id: d.id,
          sourceVersion: version,
          verification,
        }),
        originalEstate: { en: null, 'zh-hant': null },
      },
    })
    restored++
    applications.push({
      fixture: 'hkgov-dpo-address-estate-component-gaps.json',
      id: d.id,
      verification,
    })
  }
  if (requireComplete)
    for (const d of decisions)
      assert(
        seen.has(d.decision.identity),
        `Estate gap ${d.decision.id}: expected source target missing or changed; review required`,
      )
  return { applications, restored }
}
