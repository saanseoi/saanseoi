import { strict as assert } from 'node:assert'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-unnamed-premise-suppressions.json'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'
import { suppressKoYeeDuplicate } from './hkgovAlsKoYeeDuplicate'
import { suppressLinTsuiVariants } from './hkgovAlsLinTsui'
import { suppressHungHomPhase2Aliases } from './hkgovAlsReviewedEstateOwnership'
import { suppressApprovedEstateDuplicates } from './hkgovAlsApprovedEstateBatch'

const curationFile = 'hkgov-dpo-address-unnamed-premise-suppressions.json'

/** Suppress only a fully reviewed unnamed duplicate; CSU alone is never sufficient. */
export function suppressAlsUnnamedPremises(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  let suppressed =
    suppressKoYeeDuplicate(rows, version) +
    suppressLinTsuiVariants(rows) +
    suppressHungHomPhase2Aliases(rows, version) +
    suppressApprovedEstateDuplicates(rows, version)
  for (const decision of fixture.suppressions) {
    if (version < decision.sourceVersionFrom || version > decision.sourceVersionTo)
      continue
    const owner = rows.filter(
      row =>
        row.hkgovCsuId === decision.owner.csu &&
        row.enEstateName === decision.estate &&
        row.zhHantEstateName === decision.zhHantEstateName &&
        row.enBuildingName === decision.owner.enBuildingName &&
        row.zhHantBuildingName === decision.owner.zhHantBuildingName,
    )
    const duplicates = rows.filter(
      row =>
        row.hkgovCsuId === decision.duplicate.csu &&
        row.enBuildingName === null &&
        row.zhHantBuildingName === null &&
        row.enBlockNumber === null &&
        row.zhHantBlockNumber === null,
    )
    assert.equal(owner.length, 1, `Unnamed premise ${decision.id}: owner changed`)
    assert.equal(
      duplicates.length,
      1,
      `Unnamed premise ${decision.id}: duplicate changed`,
    )
    const duplicate = duplicates[0]
    assert(duplicate, `Unnamed premise ${decision.id}: duplicate is missing`)
    const geometry = JSON.parse(duplicate.geometry ?? 'null')
    assert.equal(duplicate.enEstateName, decision.estate)
    assert.equal(duplicate.zhHantEstateName, decision.zhHantEstateName)
    assert.equal(duplicate.enBuildingName, null)
    assert.equal(duplicate.zhHantBuildingName, null)
    assert.equal(duplicate.enBlockNumber, null)
    assert.equal(duplicate.zhHantBlockNumber, null)
    assert.equal(duplicate.enStreetNumberFrom, decision.duplicate.streetNumber)
    assert.equal(duplicate.zhHantStreetNumberFrom, decision.duplicate.streetNumber)
    assert(decision.duplicate.enStreetNames.includes(duplicate.enStreetName))
    assert(decision.duplicate.zhHantStreetNames.includes(duplicate.zhHantStreetName))
    assert.equal(geometry?.type, 'Point')
    assert(
      decision.duplicate.coordinates.some(
        point => JSON.stringify(point) === JSON.stringify(geometry.coordinates),
      ),
      `Unnamed premise ${decision.id}: source point changed`,
    )
    const retained = owner[0]
    assert(retained, `Unnamed premise ${decision.id}: owner is missing`)
    retained.sources = JSON.stringify({
      ...JSON.parse(retained.sources),
      hkgovAlsUnnamedPremiseSuppression: {
        ...decision,
        curationFile,
        targetSourceVersion: version,
        suppressedAddress: {
          addressId: duplicate.id,
          canonicalId: duplicate.canonicalId,
          geometry,
          sources: JSON.parse(duplicate.sources),
          engPremisesAddress: JSON.parse(duplicate.engPremisesAddressJson ?? 'null'),
          chiPremisesAddress: JSON.parse(duplicate.chiPremisesAddressJson ?? 'null'),
        },
      },
    })
    rows.splice(rows.indexOf(duplicate), 1)
    suppressed++
  }
  return { suppressed }
}
