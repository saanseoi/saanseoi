import { sourceBounds } from './hkgovAlsReviewValidation'
import { AssertionError, strict as assert } from 'node:assert'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-3d-suppressions.json'
import { als3dHash, type Als3dFeature } from './hkgovAls3d'
import { assertReviewedDuplicateEmptyInventories } from './hkgovAlsDuplicatePremiseGuards'
import { assertApprovedEmptyInventory } from './hkgovAlsApprovedEstateBatch'
import { approvedIssue3dSuppression } from './hkgovAlsApprovedIssueBatch'
import { reviewedYueWan3dSuppression } from './hkgovAlsYueWanSuppression'
import { reportAlsCurationGuard } from './hkgovAlsReviewIssue'

for (const rule of fixture.exactSuppressions) {
  assert.equal(
    rule.code,
    'suppress-exact-inventory',
    'Unknown exact inventory suppression code',
  )
  sourceBounds(rule)
  assert(/^[a-f0-9]{64}$/.test(rule.sourceHash), 'Invalid exact suppression hash')
}

/** Drop only the reviewed collection assertion, never its raw source or 2D address. */
export function als3dSuppression(feature: Als3dFeature, version: string, skip = false) {
  const yueWan = reviewedYueWan3dSuppression(feature, version)
  if (yueWan) return yueWan
  const approved = approvedIssue3dSuppression(feature, version)
  if (approved) return approved
  try {
    return resolveAls3dSuppression(feature, version, skip)
  } catch (error) {
    if (!skip || !(error instanceof AssertionError)) throw error
    reportAlsCurationGuard(
      version,
      'hkgov-dpo-address-3d-suppressions.json',
      `source-assertion:${als3dHash(feature)}`,
      error,
    )
    return undefined
  }
}

function resolveAls3dSuppression(
  feature: Als3dFeature,
  version: string,
  skip: boolean,
) {
  for (const rule of fixture.exactSuppressions) {
    if (
      version < rule.sourceVersionFrom ||
      version > rule.sourceVersionTo ||
      feature.properties.Address.PremisesAddress.BuildingCsuInformation?.CsuId !==
        rule.csu
    )
      continue
    assert.equal(
      rule.code,
      'suppress-exact-inventory',
      'Unknown exact inventory suppression code',
    )
    assert.equal(
      als3dHash(feature),
      rule.sourceHash,
      `ALS 3D suppression ${rule.id}: source evidence changed`,
    )
    return {
      dataset: 'saanseoi-address3d-suppression',
      id: rule.id,
      sourceVersion: version,
      reason: rule.reason,
    }
  }
  if (!skip) {
    assertReviewedDuplicateEmptyInventories(feature, version)
    assertApprovedEmptyInventory(feature, version)
  }
  const p = feature.properties.Address.PremisesAddress
  const en = p.EngPremisesAddress ?? {}
  const zh = p.ChiPremisesAddress ?? {}
  const rule = fixture.suppressions.find(
    rule =>
      version >= rule.sourceVersionFrom &&
      version <= rule.sourceVersionTo &&
      p.BuildingCsuInformation?.CsuId === rule.csu,
  )
  if (!rule) return undefined
  const suppression = {
    dataset: 'saanseoi-address3d-suppression',
    sourceFile: 'hkgov-dpo-address-3d-suppressions.json',
    fixtureVersion: fixture.version,
    ...rule,
    sourceVersion: version,
  }
  const message = `ALS 3D suppression ${rule.id}: source evidence changed`
  assert.equal(en.BuildingName ?? null, null, message)
  assert.equal(zh.BuildingName ?? null, null, message)
  assert.equal(en.EngBlock ?? null, null, message)
  assert.equal(zh.ChiBlock ?? null, null, message)
  assert.equal(en.EngEstate?.EstateName, rule.enEstate, message)
  assert.equal(zh.ChiEstate?.EstateName, rule.zhEstate, message)
  assert.equal(en.EngDistrict, 'KOWLOON CITY DISTRICT', message)
  assert.equal(zh.ChiDistrict, '九龍城區', message)
  assert.equal((p as typeof p & { GeoAddress?: string }).GeoAddress, rule.csu, message)
  assert.ok(
    rule.streets.some(
      street =>
        en.EngStreet?.StreetName === street.en &&
        zh.ChiStreet?.StreetName === street.zh &&
        en.EngStreet?.BuildingNoFrom === street.number &&
        zh.ChiStreet?.BuildingNoFrom === street.number &&
        !en.EngStreet?.BuildingNoTo &&
        !zh.ChiStreet?.BuildingNoTo,
    ),
    message,
  )
  assert.equal(feature.geometry.type, 'Point', message)
  assert.ok(
    rule.coordinates.some(
      point => JSON.stringify(point) === JSON.stringify(feature.geometry.coordinates),
    ),
    message,
  )
  assert.equal(en.Eng3dAddress?.length, rule.unitCount, message)
  assert.equal(zh.Chi3dAddress?.length, rule.unitCount, message)
  assert.equal(
    als3dHash([en.Eng3dAddress, zh.Chi3dAddress]),
    rule.inventoryHash,
    message,
  )
  return suppression
}
