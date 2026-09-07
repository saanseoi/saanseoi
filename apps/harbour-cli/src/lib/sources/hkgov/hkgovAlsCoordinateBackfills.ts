import { AssertionError, strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-coordinate-backfills.json'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

const curationFile = 'hkgov-dpo-address-coordinate-backfills.json'

/** Apply a reviewed current point only to the explicitly bounded historic source rows. */
export function backfillAlsCoordinates(
  rows: PreparedHkgovAlsRow[],
  version: string,
  skipCurationChecks = false,
) {
  let backfilled = 0
  for (const decision of fixture.backfills) {
    if (version < decision.sourceVersionFrom || version > decision.sourceVersionTo)
      continue
    const candidates = rows.filter(
      row =>
        row.hkgovCsuId === decision.csu &&
        (JSON.parse(row.engPremisesAddressJson ?? '{}').EngEstate?.EstateName ??
          row.enEstateName) === decision.estate &&
        row.enBuildingName === decision.enBuildingName,
    )
    try {
      assert.equal(
        candidates.length,
        1,
        `ALS coordinate backfill ${decision.id}: source target missing or ambiguous`,
      )
      const row = candidates[0]
      assert(row, `ALS coordinate backfill ${decision.id}: source target missing`)
      const publisherGeometry = JSON.parse(row.geometry ?? 'null')
      assert.equal(
        publisherGeometry?.type,
        'Point',
        `ALS coordinate backfill ${decision.id}: source geometry changed`,
      )
      assert.deepEqual(
        publisherGeometry.coordinates,
        decision.previousCoordinates,
        `ALS coordinate backfill ${decision.id}: source point changed`,
      )
    } catch (error) {
      if (!skipCurationChecks || !(error instanceof AssertionError)) throw error
      continue
    }
    const row = candidates[0]!
    const publisherGeometry = JSON.parse(row.geometry ?? 'null')
    const derivedGeometry = {
      ...publisherGeometry,
      coordinates: [...decision.currentCoordinates],
    }
    row.geometry = JSON.stringify(derivedGeometry)
    row.sources = JSON.stringify({
      ...JSON.parse(row.sources),
      hkgovAlsCoordinateBackfill: {
        ...decision,
        curationFile,
        targetSourceVersion: version,
        publisherGeometry,
        derivedGeometry,
      },
    })
    backfilled++
  }
  return { backfilled }
}
