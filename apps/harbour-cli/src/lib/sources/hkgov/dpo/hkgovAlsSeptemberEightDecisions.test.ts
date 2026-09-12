import { expect, test } from 'bun:test'
import { requireDefined } from '@repo/core/requireDefined'
import { readAls3dFeatures } from './hkgovAls3d'
import { applyAls3dCorrections, publisherInventoryHash } from './hkgovAls3dCorrections'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { applyReviewedComplexPromotions } from './hkgovAlsComplexPromotions'
import { applyReviewedSchoolReconciliations } from './hkgovAlsSchoolReconciliations'
import type { HkgovAlsFeature, DivisionLookupMaps } from './hkgovAlsTypes'
const maps: DivisionLookupMaps = {
  areaByEn: new Map(),
  areaByZh: new Map(),
  ambiguousAreaEn: new Set(),
  ambiguousAreaZh: new Set(),
  countryId: null,
  districtByEn: new Map(),
  districtByZh: new Map(),
  ambiguousDistrictEn: new Set(),
  ambiguousDistrictZh: new Set(),
  snapshotId: 'test',
}
test('Tsui Heng starts with both approved mergers and preserves publisher evidence', async () => {
  let found = false
  for await (const { feature } of readAls3dFeatures(
    'data/hkgov/dpo/ALS/20240725-1048-ALS-GeoJSON/als_addresses_3d_(public_rental_housing).geojson',
  )) {
    if (
      feature.properties.Address.PremisesAddress.EngPremisesAddress?.BuildingName !==
      'TSUI HENG HOUSE'
    )
      continue
    found = true
    const original = structuredClone(feature),
      result = applyAls3dCorrections(feature, '2024-07-25.0')
    expect(feature).toEqual(original)
    expect(
      result.feature.properties.Address.PremisesAddress.EngPremisesAddress
        ?.Eng3dAddress,
    ).toHaveLength(756)
    expect(
      result.feature.properties.Address.PremisesAddress.ChiPremisesAddress
        ?.Chi3dAddress,
    ).toHaveLength(756)
    expect(publisherInventoryHash(result.feature)).toBe(
      'aad9394901c6b3ae068f1d0ae485027702e09063d5b4c989184c7ff37f43c364',
    )
    requireDefined(
      feature.properties.Address.PremisesAddress.ChiPremisesAddress,
    ).BuildingName = 'WRONG'
    expect(() => applyAls3dCorrections(feature, '2024-07-25.0')).toThrow(
      'source changed',
    )
    break
  }
  expect(found).toBe(true)
})
test('Youth College campus label stays dated rather than being backfilled by neighbouring curations', async () => {
  for (const [release, version, en, zh] of [
    ['20260722-1931-ALS-GeoJSON', '2026-07-22.0', 'YOUTH COLLEGE', '青年學院'],
    [
      '20260819-1047-ALS-GeoJSON',
      '2026-08-19.0',
      'YOUTH COLLEGE (TSEUNG KWAN O)',
      '青年學院(將軍澳)',
    ],
  ] as const) {
    const features = (
      await Bun.file(
        `data/hkgov/dpo/ALS/${release}/als_addresses_(sai_kung_district).geojson`,
      ).json()
    ).features as HkgovAlsFeature[]
    const feature = requireDefined(
      features.find(
        f =>
          f.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId ===
          '4361820309T20050430',
      ),
    )
    const rows = [
      normaliseHkgovAlsFeature(
        feature,
        'publisher.geojson',
        1,
        'test',
        requireDefined(version),
        maps,
        true,
        new Map(),
        new Map(),
        new Map(),
      ),
    ]
    applyReviewedSchoolReconciliations(rows, requireDefined(version))
    applyReviewedComplexPromotions(rows, requireDefined(version))
    expect(requireDefined(rows[0]).enBuildingName).toBe(en)
    expect(requireDefined(rows[0]).zhHantBuildingName).toBe(zh)
    expect(requireDefined(rows[0]).hkgovCsuId).toBe('4361820309T20050430')
  }
})
