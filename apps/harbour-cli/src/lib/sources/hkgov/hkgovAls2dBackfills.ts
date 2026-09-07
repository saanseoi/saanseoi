import { requireDefined } from '@repo/core/requireDefined'
import { strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-2d-backfills.json'
import {
  curationProvenance,
  resolveHkgovAlsCurationVerification,
  type HkgovAlsCurationApplication,
} from './hkgovAlsCurationLifecycle'
import type { HkgovAlsSourceFeature, PreparedHkgovAlsRow } from './hkgovAlsTypes'

const sourceFile = 'hkgov-dpo-address-2d-backfills.json'

type Backfill = (typeof fixture.backfills)[number] & {
  application?: HkgovAlsCurationApplication
}

function backfillsForVersion(version: string) {
  return (fixture.backfills as Backfill[]).flatMap(decision => {
    const verification = resolveHkgovAlsCurationVerification(
      version,
      decision.sourceVersions,
      decision.application,
    )
    return verification ? [{ decision, verification }] : []
  })
}

/** Preserve publisher premises, including unnamed records sharing a reviewed CSU. */
export function buildAls2dBackfillFeatures(
  features: HkgovAlsSourceFeature[],
  version: string,
): HkgovAlsSourceFeature[] {
  return backfillsForVersion(version).map(({ decision: b }, index) => {
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
      feature: {
        ...structuredClone(b.feature),
        geometry: {
          ...b.feature.geometry,
          coordinates: [
            requireDefined(b.feature.geometry.coordinates[0]),
            requireDefined(b.feature.geometry.coordinates[1]),
          ] as [number, number],
        },
      },
      sourceFile,
      featureIndexOneBased: index + 1,
    }
  })
}

export function labelAls2dBackfillRows(rows: PreparedHkgovAlsRow[]) {
  for (const row of rows) {
    if (row.sourceFile !== sourceFile) continue
    const match = backfillsForVersion(row.sourceVersion).find(
      ({ decision }) => decision.csu === row.hkgovCsuId,
    )
    assert(match, 'Missing reviewed ALS 2D backfill')
    const { decision, verification } = match
    row.sources = JSON.stringify({
      hkgovAlsAddressBackfill: {
        ...decision,
        targetSourceVersion: row.sourceVersion,
        evidenceSourceFile: decision.sourceFile,
        curationFile: sourceFile,
        curation: curationProvenance({
          application: decision.application,
          id: decision.id ?? decision.csu,
          sourceVersion: row.sourceVersion,
          verification,
        }),
      },
    })
    row.identityMatchMethod = 'reviewed-address-backfill'
  }
}
