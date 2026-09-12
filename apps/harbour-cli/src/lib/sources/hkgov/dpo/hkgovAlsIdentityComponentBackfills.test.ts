import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import { applyReviewedIdentityComponentBackfills } from './hkgovAlsIdentityComponentBackfills'
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

const targets = [
  ['sham_shui_po', '3303221884T20230524'],
  ['wan_chai', '3778515545T20050430'],
  ['yau_tsim_mong', '3458318302T20090317'],
  ['sai_kung', '4582321076T20050430'],
  ['sai_kung', '4580821079T20050430'],
  ['sai_kung', '4579421082T20050430'],
  ['sai_kung', '4578121087T20050430'],
] as const

test('reviewed identity components remain stable across retained releases', async () => {
  const ids = new Map<string, string>()
  let releases = 0
  for (const dir of (await readdir('data/hkgov/dpo/ALS'))
    .filter(d => d.endsWith('ALS-GeoJSON'))
    .sort()) {
    const version = `${dir.slice(0, 4)}-${dir.slice(4, 6)}-${dir.slice(6, 8)}.0`
    const rows = []
    for (const [district, csu] of targets) {
      const file = `als_addresses_(${district}_district).geojson`
      const data = await Bun.file(`data/hkgov/dpo/ALS/${dir}/${file}`).json()
      const feature = data.features.find(
        (candidate: HkgovAlsFeature) =>
          candidate.properties?.Address?.PremisesAddress?.BuildingCsuInformation
            ?.CsuId === csu,
      )
      if (!feature) continue
      rows.push(
        normaliseHkgovAlsFeature(
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
        ),
      )
    }
    const raw = rows.map(row => [
      row.engPremisesAddressJson,
      row.chiPremisesAddressJson,
      row.geometry,
    ])
    applyReviewedIdentityComponentBackfills(rows, version)
    expect(
      rows.map(row => [
        row.engPremisesAddressJson,
        row.chiPremisesAddressJson,
        row.geometry,
      ]),
    ).toEqual(raw)
    for (const row of rows) {
      const previous = ids.get(row.hkgovCsuId!)
      if (previous) expect(row.id).toBe(previous)
      ids.set(row.hkgovCsuId!, row.id)
    }
    const shun = rows.find(row => row.hkgovCsuId === '3303221884T20230524')
    expect(shun?.enBuildingName).toBe('Transitional Housing - Shun Ting Terraced Home')
    expect(shun?.zhHantBuildingName).toBe('過渡性房屋 - 順庭居')
    const taiHang = rows.find(row => row.hkgovCsuId === '3778515545T20050430')
    expect(taiHang?.enBuildingName).toBe('TAI HANG FIRE DRAGON HERITAGE CENTRE')
    expect(taiHang?.zhHantBuildingName).toBe('大坑火龍文化館')
    const union = rows.find(row => row.hkgovCsuId === '3458318302T20090317')
    if (union) {
      expect(union.enEstateName).toBe('UNION SQUARE')
      expect(union.zhHantEstateName).toBe('UNION SQUARE')
      expect(union.curatedGranularity).toBe('complex')
      expect(union.enBuildingName).toBeNull()
      expect(union.enPhaseName).toBeNull()
    }
    for (const block of ['1', '2', '3', '4']) {
      const row = rows.find(
        candidate =>
          candidate.enBlockNumber === block &&
          candidate.enEstateName === 'BOUGAINVILEA GARDENS',
      )
      if (!row) continue
      expect(row.enBuildingName).toBeNull()
      expect(row.zhHantBuildingName).toBeNull()
      expect(row.zhHantBlockNumber).toBe(block)
    }
    releases++
  }
  expect(releases).toBe(30)
  expect(ids.size).toBe(7)
})
