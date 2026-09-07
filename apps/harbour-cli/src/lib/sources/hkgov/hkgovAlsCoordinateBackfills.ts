import { requireDefined } from '@repo/core/requireDefined'
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
      if ('expectedPremises' in decision && decision.expectedPremises) {
        assert.deepEqual(
          {
            BuildingCsuInformation: { CsuId: row.hkgovCsuId },
            ChiPremisesAddress: JSON.parse(row.chiPremisesAddressJson ?? '{}'),
            EngPremisesAddress: JSON.parse(row.engPremisesAddressJson ?? '{}'),
            GeoAddress: row.geoAddress,
          },
          decision.expectedPremises,
          `ALS coordinate backfill ${decision.id}: source identity changed`,
        )
        if ('blockNumber' in decision && decision.blockNumber) {
          assert(
            row.enBlockNumber === null || row.enBlockNumber === decision.blockNumber,
            `ALS coordinate backfill ${decision.id}: English block changed`,
          )
          assert(
            row.zhHantBlockNumber === null ||
              row.zhHantBlockNumber === decision.blockNumber,
            `ALS coordinate backfill ${decision.id}: Chinese block changed`,
          )
        }
      }
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
    const row = requireDefined(candidates[0])
    const publisherGeometry = JSON.parse(row.geometry ?? 'null')
    const derivedGeometry = {
      ...publisherGeometry,
      coordinates: [...decision.currentCoordinates],
    }
    row.geometry = JSON.stringify(derivedGeometry)
    if ('expectedPremises' in decision && decision.expectedPremises) {
      row.identitySummary = {
        ...row.identitySummary,
        longitude: requireDefined(decision.currentCoordinates[0]).toFixed(5),
        latitude: requireDefined(decision.currentCoordinates[1]).toFixed(5),
      }
    }
    if ('blockNumber' in decision && decision.blockNumber) {
      if (!row.enBlockNumber && row.enBuildingName)
        row.enFormattedAddress =
          row.enFormattedAddress?.replace(
            row.enBuildingName,
            `${row.enBuildingName}, BLOCK ${decision.blockNumber}`,
          ) ?? null
      if (!row.zhHantBlockNumber && row.zhHantBuildingName)
        row.zhHantFormattedAddress =
          row.zhHantFormattedAddress?.replace(
            row.zhHantBuildingName,
            `${row.zhHantBuildingName}第${decision.blockNumber}座`,
          ) ?? null
      row.enBlockNumber = row.zhHantBlockNumber = decision.blockNumber
      row.enBlockDescriptor = 'BLOCK'
      row.zhHantBlockDescriptor = '座'
      row.identitySummary = {
        ...row.identitySummary,
        blockNumber: decision.blockNumber,
        blockDescriptor: 'BLOCK',
      }
    }
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
