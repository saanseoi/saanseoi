import { requireDefined } from '@repo/core/requireDefined'
import { strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-nested-premises.json'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

/** Nest reviewed commercial premises without merging same-CSU records or unit inventories. */
export function applyAlsNestedPremises(rows: PreparedHkgovAlsRow[], version: string) {
  for (const d of fixture.relationships) {
    if (!d.sourceVersions.includes(version)) continue
    const children = rows.filter(
      r => r.hkgovCsuId === d.child.csu && r.enBuildingName === d.child.enName,
    )
    if (!children.length) continue
    assert.equal(children.length, 1)
    const child = requireDefined(children[0])
    const parents = rows.filter(
      r => r.hkgovCsuId === d.parent.csu && r.enBuildingName === d.parent.enName,
    )
    const sourceEstates = rows.filter(
      r => r.hkgovCsuId === d.estate.csu && !r.enBuildingName && !r.zhHantBuildingName,
    )
    assert.equal(parents.length, 1, 'Nested premise: missing or ambiguous plaza')
    assert.equal(
      sourceEstates.length,
      1,
      'Nested premise: missing or ambiguous estate source',
    )
    const parent = requireDefined(parents[0]),
      sourceEstate = requireDefined(sourceEstates[0])
    assert.equal(child.zhHantBuildingName, d.child.zhName)
    assert.equal(parent.zhHantBuildingName, d.parent.zhName)
    for (const r of [parent, sourceEstate]) {
      assert.equal(r.enEstateName, d.estate.enName)
      assert.equal(r.zhHantEstateName, d.estate.zhName)
    }
    for (const r of [child, parent, sourceEstate]) {
      assert.equal(r.enStreetName, d.enStreetName)
      assert.equal(r.zhHantStreetName, d.zhStreetName)
      assert.equal(r.enStreetNumberFrom, d.streetNumber)
      assert.equal(r.zhHantStreetNumberFrom, d.streetNumber)
    }
    assert.deepEqual(
      JSON.parse(requireDefined(child.geometry)).coordinates,
      d.childCoordinates,
    )
    const complexes = rows.filter(
      r => r.curatedGranularity === 'complex' && r.enEstateName === d.estate.enName,
    )
    assert(complexes.length <= 1)
    const estate = complexes[0] ?? sourceEstate
    assert(new Set([child.id, parent.id, estate.id]).size === 3)
    child.parentAddressId = parent.id
    parent.parentAddressId = estate.id
    for (const r of [child, parent]) {
      r.sources = JSON.stringify({
        ...JSON.parse(r.sources),
        hkgovAlsNestedPremise: { ...d, parentAddressId: r.parentAddressId },
      })
      r.hierarchyCuration = d.id
    }
  }
}
