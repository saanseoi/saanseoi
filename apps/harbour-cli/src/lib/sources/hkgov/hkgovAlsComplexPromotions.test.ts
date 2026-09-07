import { requireDefined } from '@repo/core/requireDefined'
import { expect, test } from 'bun:test'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-complex-promotions.json'
import { applyReviewedComplexPromotions } from './hkgovAlsComplexPromotions'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import type { DivisionLookupMaps, HkgovAlsFeature } from './hkgovAlsTypes'

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
const rule = requireDefined(fixture.promotions[0])
const directories: Record<string, string> = {
  '2024-07-25.0': '20240725-1048-ALS-GeoJSON',
  '2024-07-31.0': '20240731-1054-ALS-GeoJSON',
  '2024-08-21.0': '20240821-1044-ALS-GeoJSON',
  '2024-08-25.0': '20240825-1042-ALS-GeoJSON',
  '2024-08-28.0': '20240828-1021-ALS-GeoJSON',
  '2024-09-01.0': '20240901-1030-ALS-GeoJSON',
  '2024-09-02.0': '20240902-1020-ALS-GeoJSON',
  '2024-09-03.0': '20240903-1049-ALS-GeoJSON',
  '2024-10-18.0': '20241018-1048-ALS-GeoJSON',
  '2024-11-13.0': '20241113-1041-ALS-GeoJSON',
  '2024-12-12.0': '20241212-1050-ALS-GeoJSON',
  '2025-01-23.0': '20250123-1031-ALS-GeoJSON',
  '2025-02-25.0': '20250225-1050-ALS-GeoJSON',
  '2025-03-21.0': '20250321-1021-ALS-GeoJSON',
  '2025-04-26.0': '20250426-1053-ALS-GeoJSON',
  '2025-05-22.0': '20250522-1029-ALS-GeoJSON',
  '2025-06-20.0': '20250620-1033-ALS-GeoJSON',
  '2025-08-13.0': '20250813-1053-ALS-GeoJSON',
  '2025-08-28.0': '20250828-2008-ALS-GeoJSON',
  '2025-09-03.0': '20250903-1043-ALS-GeoJSON',
  '2025-11-04.0': '20251104-1033-ALS-GeoJSON',
  '2025-12-16.0': '20251216-1038-ALS-GeoJSON',
  '2026-02-04.0': '20260204-1057-ALS-GeoJSON',
  '2026-04-03.0': '20260403-1056-ALS-GeoJSON',
  '2026-04-22.0': '20260422-1040-ALS-GeoJSON',
  '2026-04-25.0': '20260425-1038-ALS-GeoJSON',
  '2026-07-08.0': '20260708-1050-ALS-GeoJSON',
  '2026-07-10.0': '20260710-1054-ALS-GeoJSON',
  '2026-07-22.0': '20260722-1931-ALS-GeoJSON',
  '2026-08-19.0': '20260819-1047-ALS-GeoJSON',
}

async function rowsFor(version: string) {
  const file = `data/hkgov/dpo/ALS/${directories[version]}/als_addresses_(sai_kung_district).geojson`
  const features = (await Bun.file(file).json()).features as HkgovAlsFeature[]
  return features.flatMap((feature, index) => {
    const p = feature.properties?.Address?.PremisesAddress
    return p?.BuildingCsuInformation?.CsuId === rule.csu &&
      (p.EngPremisesAddress?.BuildingName === rule.buildingName ||
        p.EngPremisesAddress?.EngEstate?.EstateName === rule.estate)
      ? [
          normaliseHkgovAlsFeature(
            feature,
            'als_addresses_(sai_kung_district).geojson',
            index + 1,
            'test',
            version,
            maps,
            true,
            new Map(),
            new Map(),
            new Map(),
          ),
        ]
      : []
  })
}

test('promotes only blockless Pik Lam and backfills the latest complex point', async () => {
  for (const version of rule.sourceVersions) {
    const rows = await rowsFor(version)
    const blockOneBefore = structuredClone(
      requireDefined(rows.find(row => row.enBlockNumber === '1')),
    )
    applyReviewedComplexPromotions(rows, version)
    expect(rows).toHaveLength(2)
    const complex = requireDefined(
      rows.find(row => row.curatedGranularity === 'complex'),
    )
    const blockOne = requireDefined(rows.find(row => row.enBlockNumber === '1'))
    expect(JSON.parse(requireDefined(complex.geometry)).coordinates).toEqual(
      rule.coordinates,
    )
    expect(complex.enBuildingName).toBeNull()
    expect(complex.enStreetName).toBe('TSUI LAM ROAD')
    expect(complex.enStreetNumberFrom).toBe('11')
    expect(blockOne.hkgovCsuId).toBe(rule.csu)
    expect(blockOne.enBlockNumber).toBe('1')
    expect(blockOne).toEqual(blockOneBefore)
    expect(
      JSON.parse(complex.sources).hkgovAlsComplexPromotion.sourceEvidence,
    ).toHaveLength(1)
  }
})

test('fails closed when Pik Lam blockless source evidence changes', async () => {
  const rows = await rowsFor('2026-08-19.0')
  const blockless = requireDefined(rows.find(row => row.enBlockNumber === null))
  blockless.geometry = JSON.stringify({ type: 'Point', coordinates: [0, 0] })
  expect(() => applyReviewedComplexPromotions(rows, '2026-08-19.0')).toThrow(
    'source changed',
  )
})
