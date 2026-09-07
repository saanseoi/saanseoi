import { strict as assert } from 'node:assert'
import { buildDeterministicUuidV5 } from '@repo/db'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-premise-consolidations.json'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

const NAMESPACE = '3fc33c3e-2837-4fc7-a331-439be8c2c981'

/** Explicit cross-CSU curation; raw source identities are evidence, not merge rules. */
export function applyAlsPremiseConsolidations(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  for (const decision of fixture.decisions) {
    const release = decision.releases.find(r => r.version === version)
    if (!release) continue
    const candidates = rows
      .filter(r => r.hkgovCsuId && decision.csus.includes(r.hkgovCsuId))
      .sort((a, b) => a.hkgovCsuId!.localeCompare(b.hkgovCsuId!))
    if (!candidates.length) continue
    const evidence = candidates.map(r => ({
      csu: r.hkgovCsuId,
      geoAddress: r.geoAddress,
      geometry: JSON.parse(r.geometry ?? 'null'),
      en: JSON.parse(r.engPremisesAddressJson ?? 'null'),
      zh: JSON.parse(r.chiPremisesAddressJson ?? 'null'),
    }))
    assert.deepEqual(
      evidence,
      release.expected,
      `Premise consolidation ${decision.id}: source changed; review required`,
    )
    const named = candidates.filter(r => r.enBuildingName === decision.enBuildingName)
    assert.equal(named.length, 1)
    const owner = named[0]!
    assert(owner.zhHantBuildingName && owner.zhHantFormattedAddress)
    const sourceEvidence = candidates.map(r => ({
      addressId: r.id,
      canonicalId: r.canonicalId,
      identityKey: r.identityKey,
      csu: r.hkgovCsuId,
      geoAddress: r.geoAddress,
      geometry: JSON.parse(r.geometry ?? 'null'),
      sources: JSON.parse(r.sources),
      engPremisesAddress: JSON.parse(r.engPremisesAddressJson!),
      chiPremisesAddress: JSON.parse(r.chiPremisesAddressJson!),
    }))
    const id = `ss-${buildDeterministicUuidV5(NAMESPACE, decision.id)}`
    owner.zhHantFormattedAddress = owner.zhHantFormattedAddress.replace(
      owner.zhHantBuildingName,
      decision.zhBuildingName,
    )
    owner.zhHantBuildingName = decision.zhBuildingName
    owner.identityAlias = owner.id
    owner.id = owner.canonicalId = owner.identityBuildingId = id
    owner.identityKey = owner.identityContinuityKey = `reviewed-premise:${decision.id}`
    owner.identityMatchMethod = 'reviewed-premise-consolidation'
    owner.curatedGranularity = 'building'
    const { releases, ...provenance } = decision
    owner.sources = JSON.stringify({
      ...JSON.parse(owner.sources),
      hkgovAlsPremiseConsolidation: {
        ...provenance,
        sourceVersion: version,
        sourceEvidence,
      },
    })
    const discarded = new Set(candidates.filter(r => r !== owner))
    rows.splice(0, rows.length, ...rows.filter(r => !discarded.has(r)))
  }
}
