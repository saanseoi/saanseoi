import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import {
  applyReviewedHouseStreetIdentities,
  linkReviewedHouseStreetParents,
} from './hkgovAlsHouseStreetIdentities'
import { applyReviewedStreetEstateComplexes } from './hkgovAlsStreetEstateComplexes'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import type { HkgovAlsFeature } from './hkgovAlsTypes'
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

test('all30 House 20 identities keep the house, street number and parent street address distinct', async () => {
  const ids = new Set<string>(),
    parents = new Set<string>()
  for (const dir of (await readdir('data/hkgov/dpo/ALS'))
    .filter(d => d.endsWith('ALS-GeoJSON'))
    .sort()) {
    const version = `${dir.slice(0, 4)}-${dir.slice(4, 6)}-${dir.slice(6, 8)}.0`
    const file = 'als_addresses_(southern_district).geojson'
    const data = await Bun.file(`data/hkgov/dpo/ALS/${dir}/${file}`).json()
    const feature: HkgovAlsFeature = data.features.find(
      (f: HkgovAlsFeature) =>
        f.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId ===
        '4134310230T20050430',
    )
    const row = normaliseHkgovAlsFeature(
      feature,
      file,
      1,
      'test',
      version,
      maps,
      true,
      new Map(),
      new Map(),
      new Map(),
    )
    const raw = row.engPremisesAddressJson,
      point = row.geometry
    const rows = [row]
    applyReviewedHouseStreetIdentities(rows, version)
    applyReviewedStreetEstateComplexes(rows, version)
    linkReviewedHouseStreetParents(rows, version)
    const parent = rows.find(r => r.curatedGranularity === 'complex')!
    expect(row.curatedGranularity).toBe('building')
    expect(row.enBlockNumber).toBe('20')
    expect(row.enStreetNumberFrom).toBe('20')
    expect(row.enStreetName).toBe('PALM DRIVE')
    expect(row.enEstateName).toBe('THE REDHILL PENINSULA')
    expect(row.engPremisesAddressJson).toBe(raw)
    expect(row.geometry).toBe(point)
    expect(row.parentAddressId).toBe(parent.id)
    expect(parent.enStreetName).toBe('PAK PAT SHAN ROAD')
    expect(parent.enStreetNumberFrom).toBe('18')
    expect(parent.enBlockNumber).toBeNull()
    expect(parent.hkgovCsuId).toBeNull()
    ids.add(row.id)
    parents.add(parent.id)
  }
  expect(ids.size).toBe(1)
  expect(parents.size).toBe(1)
})
