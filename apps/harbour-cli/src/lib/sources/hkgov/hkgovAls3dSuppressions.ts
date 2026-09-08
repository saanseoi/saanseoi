import { AssertionError, strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-3d-suppressions.json'
import { als3dHash, type Als3dFeature } from './hkgovAls3d'
import { assertKoYeeEmptyInventory } from './hkgovAlsKoYeeDuplicate'
import { assertApprovedEmptyInventory } from './hkgovAlsApprovedEstateBatch'
import { approvedIssue3dSuppression } from './hkgovAlsApprovedIssueBatch'
import { reviewedYueWan3dSuppression } from './hkgovAlsYueWanSuppression'
import { reportAlsCurationGuard } from './hkgovAlsReviewIssue'

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
  if (
    version >= '2024-07-25.0' &&
    version <= '2025-01-23.0' &&
    feature.properties.Address.PremisesAddress.BuildingCsuInformation?.CsuId ===
      '3864823026T20050430'
  ) {
    assert.equal(
      als3dHash(feature),
      '0f1e35cee47833b7cc9001ca39a0b4dcef1727ab445d92836d9aedf10783a4ed',
      'ALS 3D suppression tsz-lok-phase-3-unnamed-inventory: source evidence changed',
    )
    return {
      dataset: 'saanseoi-address3d-suppression',
      id: 'tsz-lok-phase-3-unnamed-inventory',
      sourceVersion: version,
      reason:
        'Approved suppression of the redundant unnamed 633-expression inventory. Preserve its raw provenance and every named building inventory; no shared physical flats or additional building are inferred.',
    }
  }
  if (
    version >= '2026-07-22.0' &&
    version <= '2026-08-19.0' &&
    feature.properties.Address.PremisesAddress.BuildingCsuInformation?.CsuId ===
      '3532121484T20121220'
  ) {
    assert.equal(
      als3dHash(feature),
      'fcfd494831ac14fd6d8aac02d46e34f3c93c8972b7ddc72654ce2f69bd0ef4d0',
      'ALS 3D suppression shek-kip-mei-phase-2-unnamed-inventory: source evidence changed',
    )
    return {
      dataset: 'saanseoi-address3d-suppression',
      id: 'shek-kip-mei-phase-2-unnamed-inventory',
      sourceVersion: version,
      reason:
        'Reviewed unnamed 780-unit assertion is not an additional building inventory. Preserve both named houses and their separate 779-unit inventories; retain this rejected assertion as raw provenance.',
    }
  }
  if (!skip) {
    assertKoYeeEmptyInventory(feature, version)
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
