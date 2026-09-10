import { strict as assert } from 'node:assert'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-yau-yue-decisions.json'
import { als3dHash, type Als3dFeature } from './hkgovAls3d'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

const rule = fixture.suppression
const sourceFile = 'hkgov-dpo-address-yau-yue-decisions.json'

/** Remove the exact unnamed premise, not the named pump house or its inventory. */
export function suppressReviewedYueWanPremise(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  if (!rule.sourceVersions.includes(version)) return
  const selected = rows.filter(row =>
    [rule.csu, rule.ownerCsu].includes(row.hkgovCsuId ?? ''),
  )
  if (!selected.length) return
  const hashes = selected
    .map(row =>
      als3dHash([
        {
          BuildingCsuInformation: { CsuId: row.hkgovCsuId },
          ChiPremisesAddress: JSON.parse(row.chiPremisesAddressJson ?? 'null'),
          EngPremisesAddress: JSON.parse(row.engPremisesAddressJson ?? 'null'),
          GeoAddress: row.geoAddress,
        },
        JSON.parse(row.geometry ?? 'null'),
      ]),
    )
    .sort()
  assert(
    rule.assertions.some(
      epoch =>
        epoch.sourceVersions.includes(version) &&
        JSON.stringify(epoch.hashes) === JSON.stringify(hashes),
    ),
    `Yue Wan suppression ${rule.id}: source or named pump house changed at ${version}`,
  )
  const discarded = selected.find(row => row.hkgovCsuId === rule.csu)
  const retained = selected.find(row => row.hkgovCsuId === rule.ownerCsu)
  assert(discarded && retained, 'Yue Wan suppression: missing exact pair')
  retained.sources = JSON.stringify({
    ...JSON.parse(retained.sources),
    reviewedRemovedPremise: {
      id: rule.id,
      sourceFile,
      sourceVersion: version,
      authority: rule.authority,
      originalPremise: discarded,
      relationship:
        'separate unnamed source assertion removed by user; no inventory transfer',
    },
  })
  rows.splice(rows.indexOf(discarded), 1)
}

export function reviewedYueWan3dSuppression(feature: Als3dFeature, version: string) {
  if (
    !rule.sourceVersions.includes(version) ||
    feature.properties.Address.PremisesAddress.BuildingCsuInformation?.CsuId !==
      rule.csu
  )
    return
  assert(
    rule.threeAssertions.some(
      epoch =>
        epoch.sourceVersions.includes(version) &&
        (epoch.hashes as string[]).includes(als3dHash(feature)),
    ),
    'Yue Wan suppression: unexpected 3D assertion; review required',
  )
  return { id: rule.id, sourceFile, sourceVersion: version, reason: rule.authority }
}
