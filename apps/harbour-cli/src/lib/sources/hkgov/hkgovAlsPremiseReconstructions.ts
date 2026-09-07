import { requireDefined } from '@repo/core/requireDefined'
import { strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-premise-reconstructions.json'
import type { HkgovAlsSourceFeature, PreparedHkgovAlsRow } from './hkgovAlsTypes'

const curationFile = 'hkgov-dpo-address-premise-reconstructions.json'

export type AlsPremiseReconstructionProvenance = {
  evidence: { sourceVersion: string }
  originalAssertions: HkgovAlsSourceFeature[]
  [key: string]: unknown
}

/** Replace only reviewed named premises; preserve independent unnamed CSU assertions. */
export function reconstructAlsPremises(
  features: HkgovAlsSourceFeature[],
  version: string,
) {
  const provenance = new Map<string, AlsPremiseReconstructionProvenance>()
  for (const d of fixture.reconstructions) {
    const release = d.releases.find(r => r.version === version)
    if (!release) continue
    const candidates = features.filter(({ feature }) => {
      const p = feature.properties?.Address?.PremisesAddress
      const csu = p?.BuildingCsuInformation?.CsuId
      return (
        csu === d.oldCsu ||
        p?.EngPremisesAddress?.BuildingName === d.enName ||
        (csu === d.newCsu &&
          (p?.EngPremisesAddress?.BuildingName || p?.ChiPremisesAddress?.BuildingName))
      )
    })
    const scopePremises = features.filter(
      s =>
        s.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation
          ?.CsuId === d.scopePremiseCsu,
    )
    if (!candidates.length && !scopePremises.length) continue
    assert.equal(
      scopePremises.length,
      1,
      `Reconstruction ${d.id}: missing or ambiguous scope premise`,
    )
    assert.deepEqual(
      candidates.map(s => s.feature),
      release.expected,
      `Reconstruction ${d.id}: publisher source changed`,
    )
    const evidence = structuredClone(d.evidence.feature)
    const reconstructed: HkgovAlsSourceFeature = {
      feature: {
        ...evidence,
        geometry: {
          ...evidence.geometry,
          coordinates: [
            requireDefined(evidence.geometry.coordinates[0]),
            requireDefined(evidence.geometry.coordinates[1]),
          ],
        },
      },
      sourceFile: curationFile,
      featureIndexOneBased: 1,
    }
    const discarded = new Set(candidates)
    features.splice(
      0,
      features.length,
      ...features.filter(s => !discarded.has(s)),
      reconstructed,
    )
    const { releases, ...decision } = d
    provenance.set(d.newCsu, {
      ...decision,
      targetSourceVersion: version,
      originalAssertions: candidates,
    })
  }
  return provenance
}

export function labelAlsPremiseReconstructions(
  rows: PreparedHkgovAlsRow[],
  provenance: Map<string, AlsPremiseReconstructionProvenance>,
) {
  for (const row of rows) {
    if (row.sourceFile !== curationFile) continue
    assert(
      row.hkgovCsuId && provenance.has(row.hkgovCsuId),
      'Reconstruction provenance missing',
    )
    row.sources = JSON.stringify({
      hkgovAlsPremiseReconstruction: provenance.get(row.hkgovCsuId),
    })
    row.identityMatchMethod = 'reviewed-premise-reconstruction'
  }
}
