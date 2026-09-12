import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import { applyReviewedBlockDetailBackfills } from './hkgovAlsBlockDetailBackfills'
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
test('Ban Tip all30: fill four omitted blocks, retain present detail and a single identity', async () => {
  const ids = new Set<string>()
  let releases = 0,
    filled = 0
  for (const dir of (await readdir('data/hkgov/dpo/ALS'))
    .filter(d => d.endsWith('ALS-GeoJSON'))
    .sort()) {
    const version = `${dir.slice(0, 4)}-${dir.slice(4, 6)}-${dir.slice(6, 8)}.0`,
      file = 'als_addresses_(tai_po_district).geojson'
    const data = await Bun.file(`data/hkgov/dpo/ALS/${dir}/${file}`).json()
    const feature = data.features.find(
      (f: HkgovAlsFeature) =>
        f.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId ===
        '3589035783T20210226',
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
    const raw = [row.engPremisesAddressJson, row.chiPremisesAddressJson, row.geometry],
      before = row.enFormattedAddress,
      hasBlock = !!row.enBlockNumber
    const drift = structuredClone(row)
    drift.geometry = JSON.stringify({ type: 'Point', coordinates: [114, 22] })
    expect(() => applyReviewedBlockDetailBackfills([drift], version)).toThrow(
      'source evidence changed',
    )
    applyReviewedBlockDetailBackfills([row], version)
    expect(row.enBlockNumber).toBe('1')
    expect(row.zhHantBlockNumber).toBe('1')
    expect([
      row.engPremisesAddressJson,
      row.chiPremisesAddressJson,
      row.geometry,
    ]).toEqual(raw)
    if (hasBlock) expect(row.enFormattedAddress).toBe(before)
    else {
      expect(row.enFormattedAddress).toContain('BLK 1')
      filled++
    }
    ids.add(row.id)
    releases++
  }
  expect(releases).toBe(30)
  expect(filled).toBe(4)
  expect(ids.size).toBe(1)
})
