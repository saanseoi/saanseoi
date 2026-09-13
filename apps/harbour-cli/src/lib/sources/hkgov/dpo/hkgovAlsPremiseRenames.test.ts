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

test('all30 reviewed renames preserve stable identities, raw assertions and unnamed addresses', async () => {
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
    const eastFile = 'als_addresses_(tuen_mun_district).geojson'
    const eastData = await Bun.file(`data/hkgov/dpo/ALS/${dir}/${eastFile}`).json()
    const eastFeatures = eastData.features.filter(
      (f: HkgovAlsFeature) =>
        f.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId ===
        '1514928761T20050430',
    )
    expect(eastFeatures.length).toBe(1)
    const east = normaliseHkgovAlsFeature(
      eastFeatures[0],
      eastFile,
      1,
      'test',
      version,
      maps,
      true,
      new Map(),
      new Map(),
      new Map(),
    )
    const eastRaw = [
      east.engPremisesAddressJson,
      east.chiPremisesAddressJson,
      east.geometry,
    ]
    rows.push(east)
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
    expect(east.id).toBe('ss-37a5cd54-c595-52e9-a918-9104b32e8b01')
    expect(east.enBuildingName).toBe(
      'CHINA RESOURCES LOGISTICS EAST ASIA INDUSTRIAL BUILDING',
    )
    expect(east.zhHantBuildingName).toBe('華潤物流東亞工業大廈')
    expect([
      east.engPremisesAddressJson,
      east.chiPremisesAddressJson,
      east.geometry,
    ]).toEqual(eastRaw)
    const drifted = structuredClone(rows)
    drifted.find(r => r.hkgovCsuId === '1514928761T20050430')!.geometry =
      JSON.stringify({ type: 'Point', coordinates: [114, 22] })
    expect(() => applyReviewedPremiseRenames(drifted, version)).toThrow(
      'publisher evidence changed',
    )
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
