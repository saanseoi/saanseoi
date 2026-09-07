import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import { requireDefined } from '@repo/core/requireDefined'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-upper-estate-complexes.json'
import { applyReviewedStreetEstateComplexes } from './hkgovAlsStreetEstateComplexes'
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
const normalise = (f: HkgovAlsFeature, version: string, index = 1) =>
  normaliseHkgovAlsFeature(
    f,
    'publisher.geojson',
    index,
    'test',
    version,
    maps,
    true,
    new Map(),
    new Map(),
    new Map(),
  )
test('upper estate addresses persist across all releases without consuming houses or car park', async () => {
  for (const release of (await readdir('data/hkgov/dpo/ALS'))
    .filter(r => /^\d{8}-.*ALS-GeoJSON$/.test(r))
    .sort()) {
    const version = `${release.slice(0, 4)}-${release.slice(4, 6)}-${release.slice(6, 8)}.0`
    for (const rule of fixture.rules) {
      const features = (
        await Bun.file(
          `data/hkgov/dpo/ALS/${release}/als_addresses_(${rule.district}_district).geojson`,
        ).json()
      ).features as HkgovAlsFeature[]
      const rows = features
        .filter(
          f =>
            f.properties?.Address?.PremisesAddress?.EngPremisesAddress?.EngEstate
              ?.EstateName === rule.estate,
        )
        .map((f, i) => normalise(f, version, i + 1))
      const untouched = structuredClone(
        rows.filter(r => rule.retainSourcePremise || r.hkgovCsuId !== rule.sourceCsu),
      )
      expect(applyReviewedStreetEstateComplexes(rows, version).complexCount).toBe(1)
      const estate = requireDefined(rows.find(r => r.hierarchyCuration === rule.id))
      expect(rows.filter(r => r !== estate)).toEqual(untouched)
      expect(estate.curatedGranularity).toBe('complex')
      expect(estate.geoAddress).toBeNull()
      expect(estate.hkgovCsuId).toBeNull()
      expect(estate.enStreetNumberFrom).toBe(rule.streetOverride?.number ?? '15')
      expect(estate.enBlockDescriptor).toBeNull()
      expect(
        JSON.parse(requireDefined(estate.engPremisesAddressJson)).EngBlock,
      ).toBeUndefined()
      const later = [
        normalise(
          requireDefined(
            features.find(
              f =>
                f.properties?.Address?.PremisesAddress?.EngPremisesAddress
                  ?.BuildingName,
            ),
          ),
          '2030-01-01.0',
        ),
      ]
      applyReviewedStreetEstateComplexes(later, '2030-01-01.0')
      expect(later.some(r => r.hierarchyCuration === rule.id)).toBe(true)
    }
  }
})
test('changed source evidence fails closed', () => {
  const rule = requireDefined(fixture.rules[0])
  const f = structuredClone(
    requireDefined(rule.evidence[0]).feature,
  ) as unknown as HkgovAlsFeature
  const row = normalise(f, '2024-07-25.0')
  row.geometry = JSON.stringify({ type: 'Point', coordinates: [0, 0] })
  expect(() => applyReviewedStreetEstateComplexes([row], '2024-07-25.0')).toThrow(
    'publisher alias changed',
  )
})
