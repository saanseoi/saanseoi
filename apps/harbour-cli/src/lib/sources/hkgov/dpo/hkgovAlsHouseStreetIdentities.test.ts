import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-house-street-identities.json'
import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import {
  applyReviewedHouseStreetIdentities,
  linkReviewedHouseStreetParents,
} from './hkgovAlsHouseStreetIdentities'
import { applyReviewedStreetEstateComplexes } from './hkgovAlsStreetEstateComplexes'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import type { HkgovAlsFeature, PreparedHkgovAlsRow } from './hkgovAlsTypes'
const maps = {
  areaByEn: new Map(),
  areaByZh: new Map(),
  ambiguousAreaEn: new Set<string>(),
  ambiguousAreaZh: new Set<string>(),
  countryId: null,
  districtByEn: new Map(),
  districtByZh: new Map(),
  ambiguousDistrictEn: new Set<string>(),
  ambiguousDistrictZh: new Set<string>(),
  snapshotId: 'test',
}

test('all30 approved houses retain distinct house, road and parent address fields', async () => {
  const identities = new Map<string, Set<string>>()
  for (const dir of (await readdir('data/hkgov/dpo/ALS'))
    .filter(d => d.endsWith('ALS-GeoJSON'))
    .sort()) {
    const version = `${dir.slice(0, 4)}-${dir.slice(4, 6)}-${dir.slice(6, 8)}.0`
    const file = 'als_addresses_(southern_district).geojson'
    const data = await Bun.file(`data/hkgov/dpo/ALS/${dir}/${file}`).json()
    const rows: PreparedHkgovAlsRow[] = data.features
      .filter((f: HkgovAlsFeature) =>
        fixture.rules.some(
          r =>
            r.csu ===
            f.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId,
        ),
      )
      .map((f: HkgovAlsFeature, i: number) =>
        normaliseHkgovAlsFeature(
          f,
          file,
          i + 1,
          'test',
          version,
          maps,
          true,
          new Map(),
          new Map(),
          new Map(),
        ),
      )
    const raw = new Map(
      rows.map(r => [
        r.hkgovCsuId,
        { en: r.engPremisesAddressJson, geometry: r.geometry },
      ]),
    )
    applyReviewedHouseStreetIdentities(rows, version)
    applyReviewedStreetEstateComplexes(rows, version)
    linkReviewedHouseStreetParents(rows, version)
    const parent = rows.find(r => r.curatedGranularity === 'complex')!
    expect(parent.enStreetName).toBe('PAK PAT SHAN ROAD')
    expect(parent.enStreetNumberFrom).toBe('18')
    expect(parent.enBlockNumber).toBeNull()
    expect(parent.hkgovCsuId).toBeNull()
    for (const rule of fixture.rules) {
      const row = rows.find(r => r.hkgovCsuId === rule.csu)!
      expect(row.curatedGranularity).toBe('building')
      expect(row.enBlockNumber).toBe(rule.houseNumber)
      expect(row.enStreetNumberFrom).toBe(rule.streetNumber)
      expect(row.enStreetName).toBe(rule.enStreet)
      expect(row.parentAddressId).toBe(parent.id)
      expect(row.engPremisesAddressJson).toBe(raw.get(rule.csu)!.en)
      expect(row.geometry).toBe(raw.get(rule.csu)!.geometry)
      const ids = identities.get(rule.id) ?? new Set<string>()
      ids.add(row.id)
      identities.set(rule.id, ids)
    }
  }
  expect(identities.size).toBe(20)
  for (const ids of identities.values()) expect(ids.size).toBe(1)
})
