import { strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-2d-backfills.json'
import type { HkgovAlsSourceFeature, PreparedHkgovAlsRow } from './hkgovAlsTypes'

const sourceFile = 'hkgov-dpo-address-2d-backfills.json'

/** Preserve publisher premises, including unnamed records sharing a reviewed CSU. */
export function buildAls2dBackfillFeatures(
  features: HkgovAlsSourceFeature[],
  version: string,
): HkgovAlsSourceFeature[] {
  return fixture.backfills
    .filter(b => b.sourceVersions.includes(version))
    .map((b, index) => {
      const named = features.filter(({ feature }) => {
        const p = feature.properties?.Address?.PremisesAddress
        return (
          p?.BuildingCsuInformation?.CsuId === b.csu &&
          (p.EngPremisesAddress?.BuildingName || p.ChiPremisesAddress?.BuildingName)
        )
      })
      assert.equal(
        named.length,
        0,
        `ALS 2D backfill ${b.csu}: named source already present`,
      )
      return {
        feature: structuredClone(b.feature),
        sourceFile,
        featureIndexOneBased: index + 1,
      }
    })
}

export function labelAls2dBackfillRows(rows: PreparedHkgovAlsRow[]) {
  for (const row of rows) {
    if (row.sourceFile !== sourceFile) continue
    const decision = fixture.backfills.find(
      b => b.csu === row.hkgovCsuId && b.sourceVersions.includes(row.sourceVersion),
    )
    assert(decision, 'Missing reviewed ALS 2D backfill')
    row.sources = JSON.stringify({
      hkgovAlsAddressBackfill: {
        ...decision,
        targetSourceVersion: row.sourceVersion,
        evidenceSourceFile: decision.sourceFile,
        curationFile: sourceFile,
      },
    })
    row.identityMatchMethod = 'reviewed-address-backfill'
  }
}
