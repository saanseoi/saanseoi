import { sourceEpochs } from './hkgovAlsReviewValidation'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-estate-range-hierarchies.json'
import { requireDefined } from '@repo/core/requireDefined'
import { strict as assert } from 'node:assert'
import { buildDeterministicUuidV5 } from '@repo/db'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

for (const rule of fixture.rules) {
  assert.equal(rule.code, 'derive-estate-range', 'Unknown estate range operation')
  sourceEpochs(rule)
  for (const epoch of rule.epochs)
    assert(
      Number.isSafeInteger(epoch.assertionCount) && epoch.assertionCount > 0,
      'Invalid source assertion count',
    )
}

/** Keep source range assertions for 3D lookup, then remove their canonical 2D aliases. */
export function applyReviewedEstateRanges(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  const ownership = new Map<
    string,
    { ownerId: string; physicalBuildingId: string; unresolvedSectionIds: string[] }
  >()
  for (const rule of fixture.rules) {
    assert.equal(rule.code, 'derive-estate-range', 'Unknown estate range operation')
    if (
      version < rule.sourceVersionFrom ||
      version > rule.sourceVersionTo ||
      !rows.some(r => r.enEstateName === rule.selector.enEstateName)
    )
      continue
    const epoch = rule.epochs.filter(e => e.sourceVersionFrom <= version).at(-1)
    assert(epoch, `${rule.id}: missing reviewed source epoch`)
    const owners = rule.buildings.map(({ csu, enName: en, zhName: zh, number }) => {
      const matches = rows.filter(r => r.hkgovCsuId === csu)
      const direct = matches.filter(r => !r.enStreetNumberTo)
      assert.equal(direct.length, 1, `${rule.id} ${en}: specific owner changed`)
      const owner = requireDefined(direct[0])
      for (const r of matches) {
        for (const [key, expected] of Object.entries(rule.targetGuard))
          assert.equal(
            r[key as keyof PreparedHkgovAlsRow],
            expected,
            `${rule.id}: ${key} changed`,
          )
        assert.equal(r.enBuildingName, en)
        assert.equal(r.zhHantBuildingName, zh)
        assert.equal(r.enStreetNumberFrom, r === owner ? number : rule.fromNumber)
        assert.equal(r.zhHantStreetNumberFrom, r.enStreetNumberFrom)
        assert.equal(r.enStreetNumberTo, r === owner ? null : rule.toNumber)
        assert.equal(r.zhHantStreetNumberTo, r.enStreetNumberTo)
        if (r !== owner) {
          assert.equal(r.geometry, owner.geometry)
          r.hierarchyCuration = rule.aliasCuration
        }
        ownership.set(r.id, {
          ownerId: owner.id,
          physicalBuildingId: owner.id,
          unresolvedSectionIds: [],
        })
      }
      assert.equal(
        matches.length,
        epoch.assertionCount,
        `${rule.id}: publisher range epoch changed`,
      )
      owner.sources = JSON.stringify({
        ...JSON.parse(owner.sources),
        [rule.provenanceKey]: {
          authority: rule.authority,
          sourceVersion: version,
          rangeAssertions: matches.filter(r => r !== owner).map(r => ({ ...r })),
        },
      })
      return owner
    })
    const template = requireDefined(owners[0])
    const id = `ss-${buildDeterministicUuidV5(rule.uuidNamespace, rule.id)}`
    const complex: PreparedHkgovAlsRow = {
      ...template,
      id,
      canonicalId: id,
      hkgovCsuId: null,
      geoAddress: null,
      enBuildingName: null,
      zhHantBuildingName: null,
      enStreetNumberFrom: rule.fromNumber,
      zhHantStreetNumberFrom: rule.fromNumber,
      enStreetNumberTo: rule.toNumber,
      zhHantStreetNumberTo: rule.toNumber,
      enFormattedAddress: rule.enFormattedAddress,
      zhHantFormattedAddress: rule.zhHantFormattedAddress,
      curatedGranularity: 'complex',
      hierarchyCuration: rule.id,
      identifiers: JSON.stringify({ curationId: rule.id }),
      sources: JSON.stringify({
        [rule.provenanceKey]: {
          curationId: rule.id,
          sourceVersion: version,
          derivedFrom: owners.map(r => r.id),
          evidence: rule.evidence,
        },
      }),
      sourceFile: rule.curationFile,
      sourceFeatureIndexOneBased: 0,
      engPremisesAddressJson: null,
      chiPremisesAddressJson: null,
      identityAlias: null,
      identityBuildingId: id,
      identityKey: id,
      identityContinuityKey: id,
      identityMatchMethod: 'reviewed-address-hierarchy',
      identityNumberFrom: null,
      identityNumberTo: null,
    }
    rows.push(complex)
    for (const owner of owners) {
      owner.parentAddressId = id
      owner.curatedGranularity = 'building'
      owner.hierarchyCuration = rule.id
    }
  }
  return ownership
}
