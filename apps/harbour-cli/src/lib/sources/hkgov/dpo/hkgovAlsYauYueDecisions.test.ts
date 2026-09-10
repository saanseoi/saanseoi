import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import { requireDefined } from '@repo/core/requireDefined'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-yau-yue-decisions.json'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { applyReviewedStreetEstateComplexes } from './hkgovAlsStreetEstateComplexes'
import { suppressReviewedYueWanPremise } from './hkgovAlsYueWanSuppression'
import { applyAls3dCorrections } from './hkgovAls3dCorrections'
import { readAls3dFeatures } from './hkgovAls3d'
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
const normalise = (f: HkgovAlsFeature, v: string, i = 1) =>
  normaliseHkgovAlsFeature(
    f,
    'publisher.geojson',
    i,
    'test',
    v,
    maps,
    true,
    new Map(),
    new Map(),
    new Map(),
  )
const releases = () =>
  readdir('data/hkgov/dpo/ALS').then(rs =>
    rs.filter(r => /^\d{8}-.*ALS-GeoJSON$/.test(r)).sort(),
  )
const version = (r: string) => `${r.slice(0, 4)}-${r.slice(4, 6)}-${r.slice(6, 8)}.0`
test('all30 estate addresses, Yau Lai parents and Yue Wan exact removal preserve unrelated premises', async () => {
  for (const release of await releases())
    for (const rule of fixture.rules) {
      const v = version(release)
      const features = (
        await Bun.file(
          `data/hkgov/dpo/ALS/${release}/als_addresses_(${rule.district}_district).geojson`,
        ).json()
      ).features as HkgovAlsFeature[]
      const rows = features
        .filter(
          f =>
            f.properties?.Address?.PremisesAddress?.EngPremisesAddress?.EngEstate
              ?.EstateName === rule.estate ||
            (rule.estate === 'YUE WAN ESTATE' &&
              f.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId ===
                fixture.suppression.ownerCsu),
        )
        .map((f, i) => normalise(f, v, i + 1))
      const originals = structuredClone(rows)
      applyReviewedStreetEstateComplexes(rows, v)
      suppressReviewedYueWanPremise(rows, v)
      const estate = requireDefined(rows.find(r => r.hierarchyCuration === rule.id))
      expect(estate.curatedGranularity).toBe('complex')
      expect(estate.geoAddress).toBeNull()
      expect(estate.hkgovCsuId).toBeNull()
      expect(estate.enStreetNumberFrom).toBe(
        rule.estate === 'YAU LAI ESTATE'
          ? '9'
          : rule.estate === 'YAU OI ESTATE'
            ? '3'
            : '365',
      )
      expect(rows.some(r => r.hkgovCsuId === rule.sourceCsu)).toBe(false)
      for (const before of originals.filter(
        r =>
          r.hkgovCsuId !== rule.sourceCsu && r.hkgovCsuId !== fixture.suppression.csu,
      )) {
        const after = requireDefined(rows.find(r => r.id === before.id))
        if (rule.estate === 'YAU LAI ESTATE')
          expect(after.parentAddressId).toBe(estate.id)
        const { sources: _as, parentAddressId: _ap, ...actual } = after,
          { sources: _bs, parentAddressId: _bp, ...expected } = before
        expect(actual).toEqual(expected)
      }
      if (rule.estate === 'YUE WAN ESTATE') {
        expect(rows.some(r => r.hkgovCsuId === fixture.suppression.csu)).toBe(false)
        const pump = requireDefined(
          rows.find(r => r.hkgovCsuId === fixture.suppression.ownerCsu),
        )
        expect(
          JSON.parse(pump.sources).reviewedRemovedPremise.originalPremise.hkgovCsuId,
        ).toBe(fixture.suppression.csu)
      }
    }
})
test('changed pump identity fails closed', () => {
  const e = requireDefined(fixture.suppression.evidence[0])
  const rows = e.features.map((f, i) =>
    normalise(f as unknown as HkgovAlsFeature, e.version, i + 1),
  )
  const pump = requireDefined(
    rows.find(r => r.hkgovCsuId === fixture.suppression.ownerCsu),
  )
  pump.geometry = '{"type":"Point","coordinates":[0,0]}'
  expect(() => suppressReviewedYueWanPremise(rows, e.version)).toThrow(
    'source or named pump house changed',
  )
})
test('Yiu Cheong all30 inventories start merged at272 with raw evidence unchanged', async () => {
  for (const release of await releases()) {
    let found = false
    for await (const { feature } of readAls3dFeatures(
      `data/hkgov/dpo/ALS/${release}/als_addresses_3d_(public_rental_housing).geojson`,
    )) {
      if (
        feature.properties.Address.PremisesAddress.EngPremisesAddress?.BuildingName !==
        'YIU CHEONG HSE'
      )
        continue
      found = true
      const original = structuredClone(feature),
        result = applyAls3dCorrections(feature, version(release))
      expect(feature).toEqual(original)
      for (const [loc, prefix] of [
        [result.feature.properties.Address.PremisesAddress.EngPremisesAddress, 'Eng'],
        [result.feature.properties.Address.PremisesAddress.ChiPremisesAddress, 'Chi'],
      ] as const) {
        const units = prefix === 'Eng' ? loc?.Eng3dAddress : loc?.Chi3dAddress
        expect(units).toHaveLength(272)
        for (const flat of ['212', '213', '412'])
          expect(
            units?.filter(
              u => (prefix === 'Eng' ? u.EngUnit?.UnitNo : u.ChiUnit?.UnitNo) === flat,
            ),
          ).toHaveLength(1)
      }
      break
    }
    expect(found).toBe(true)
  }
}, 60000)
