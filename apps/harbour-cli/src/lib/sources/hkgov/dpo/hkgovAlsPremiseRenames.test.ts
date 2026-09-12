import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import { applyReviewedPremiseRenames } from './hkgovAlsPremiseRenames'
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

test('all30 named hotel records use Dash with one identity, raw names and unnamed addresses preserved', async () => {
  const ids = new Set<string>()
  let releases = 0
  for (const dir of (await readdir('data/hkgov/dpo/ALS'))
    .filter(d => d.endsWith('ALS-GeoJSON'))
    .sort()) {
    const version = `${dir.slice(0, 4)}-${dir.slice(4, 6)}-${dir.slice(6, 8)}.0`
    const file = 'als_addresses_(yau_tsim_mong_district).geojson'
    const data = await Bun.file(`data/hkgov/dpo/ALS/${dir}/${file}`).json()
    const features: HkgovAlsFeature[] = data.features.filter((f: HkgovAlsFeature) =>
      ['3606917731T20050430', '3607017731P20060311'].includes(
        f.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId ?? '',
      ),
    )
    const rows = features.map((f, i) =>
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
    const unnamed = rows.filter(r => !r.enBuildingName)
    const before = JSON.stringify(unnamed)
    const named = rows.find(r => r.enBuildingName)!
    const rawEn = named.engPremisesAddressJson
    const rawZh = named.chiPremisesAddressJson
    const changed = structuredClone(rows)
    changed.find(r => r.enBuildingName)!.geometry = JSON.stringify({
      type: 'Point',
      coordinates: [114, 22],
    })
    expect(() => applyReviewedPremiseRenames(changed, version)).toThrow(
      'publisher evidence changed',
    )
    applyReviewedPremiseRenames(rows, version)
    expect(named.enBuildingName).toBe('DASH LIVING ON PRAT')
    expect(named.zhHantBuildingName).toBe('一尚酒店香港尖沙咀店')
    expect(named.enFormattedAddress).not.toContain('BUTTERFLY')
    expect(named.engPremisesAddressJson).toBe(rawEn)
    expect(named.chiPremisesAddressJson).toBe(rawZh)
    expect(JSON.stringify(unnamed)).toBe(before)
    ids.add(named.id)
    releases++
  }
  expect(releases).toBe(30)
  expect(ids.size).toBe(1)
})
