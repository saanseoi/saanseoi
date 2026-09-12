import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import { applyReviewedBuildingOverrides } from './hkgovAlsBuildingOverrides'
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
test('Kawada II all30: preserve building identity and raw complex assertions', async () => {
  const ids = new Set<string>()
  let releases = 0
  for (const dir of (await readdir('data/hkgov/dpo/ALS'))
    .filter(d => d.endsWith('ALS-GeoJSON'))
    .sort()) {
    const version = `${dir.slice(0, 4)}-${dir.slice(4, 6)}-${dir.slice(6, 8)}.0`,
      file = 'als_addresses_(north_district).geojson'
    const data = await Bun.file(`data/hkgov/dpo/ALS/${dir}/${file}`).json()
    const feature = data.features.find(
      (f: HkgovAlsFeature) =>
        f.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId ===
        '3278439581T20200914',
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
    const raw = [row.engPremisesAddressJson, row.chiPremisesAddressJson, row.geometry]
    const drift = structuredClone(row)
    drift.geometry = JSON.stringify({ type: 'Point', coordinates: [114, 22] })
    expect(() => applyReviewedBuildingOverrides([drift], version)).toThrow(
      'source evidence changed',
    )
    applyReviewedBuildingOverrides([row], version)
    expect(row.enBuildingName).toBe('KAWADA PLAZA II')
    expect(row.zhHantBuildingName).toBe('川田工貿廣場2期')
    expect(row.enEstateName).toBeNull()
    expect(row.curatedGranularity).toBe('building')
    expect(row.enFormattedAddress).not.toContain('ON LOK TSUEN')
    expect([
      row.engPremisesAddressJson,
      row.chiPremisesAddressJson,
      row.geometry,
    ]).toEqual(raw)
    ids.add(row.id)
    releases++
  }
  expect(releases).toBe(30)
  expect(ids.size).toBe(1)
})
