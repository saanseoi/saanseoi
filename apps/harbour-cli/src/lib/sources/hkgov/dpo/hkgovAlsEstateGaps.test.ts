import { test, expect } from 'bun:test'
import { boundedEstateGaps, estateGapIdentity } from './hkgovAlsEstateGaps'
import { restoreAlsEstateGaps } from './hkgovAlsEstateGapRestorations'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'
const named = {
  count: 1,
  enEstate: { EstateName: 'ESTATE' },
  zhEstate: { EstateName: '邨' },
}
const missing = { count: 1, enEstate: null, zhEstate: null }
test('finds only bounded continuous bilingual estate gaps', () => {
  expect(boundedEstateGaps([named, missing, missing, named])).toEqual([
    {
      from: 1,
      to: 2,
      before: 0,
      after: 3,
      enEstate: named.enEstate,
      zhEstate: named.zhEstate,
    },
  ])
  expect(boundedEstateGaps([missing, named])).toEqual([])
  expect(boundedEstateGaps([named, missing])).toEqual([])
  expect(boundedEstateGaps([named, missing, undefined, named])).toEqual([])
  expect(
    boundedEstateGaps([
      named,
      missing,
      { ...named, enEstate: { EstateName: 'OTHER' } },
    ]),
  ).toEqual([])
  expect(
    boundedEstateGaps([named, { ...missing, zhEstate: named.zhEstate }, named]),
  ).toEqual([])
  expect(boundedEstateGaps([named, { ...missing, count: 2 }, named])).toEqual([])
  expect(boundedEstateGaps([{ ...named, count: 2 }, missing, named])).toEqual([])
})
test('uses CSU together with all non-estate bilingual components, preserving sections and alternate addresses', () => {
  const key = estateGapIdentity(
    'csu',
    { BuildingName: 'A', EngStreet: { StreetName: 'ROAD' } },
    { BuildingName: '甲' },
  )
  expect(
    estateGapIdentity(
      'csu',
      {
        EngEstate: { EstateName: 'ESTATE' },
        EngStreet: { StreetName: 'ROAD' },
        BuildingName: 'A',
      },
      { BuildingName: '甲' },
    ),
  ).toBe(key)
  expect(
    estateGapIdentity(
      'csu',
      {
        BuildingName: 'A',
        EngBlock: { BlockNo: 'LOW' },
        EngStreet: { StreetName: 'ROAD' },
      },
      { BuildingName: '甲' },
    ),
  ).not.toBe(key)
  expect(
    estateGapIdentity(
      'csu',
      { BuildingName: 'A', EngStreet: { StreetName: 'OTHER' } },
      { BuildingName: '甲' },
    ),
  ).not.toBe(key)
  expect(
    estateGapIdentity(
      'csu',
      { BuildingName: 'A', EngStreet: { StreetName: 'ROAD' } },
      { BuildingName: '乙' },
    ),
  ).not.toBe(key)
})
test('fails closed when a scheduled source target is absent', () => {
  const row = {
    hkgovCsuId: '3631335059T20050430',
    enEstateName: null,
    zhHantEstateName: null,
    engPremisesAddressJson: JSON.stringify({ BuildingName: 'OTHER' }),
    chiPremisesAddressJson: JSON.stringify({ BuildingName: '其他' }),
    enFormattedAddress: 'OTHER',
    zhHantFormattedAddress: '其他',
    sources: '{}',
  } as PreparedHkgovAlsRow
  expect(() => restoreAlsEstateGaps([row], '2026-04-03.0', true)).toThrow(
    'expected source target missing',
  )
})

test('Golden Wheel restored estate gaps retain the named complex identity and raw source', async () => {
  const { readdir } = await import('node:fs/promises')
  const { normaliseHkgovAlsFeature } = await import('./hkgovAlsNormalisation')
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
  let restored = 0,
    named = 0
  for (const dir of (await readdir('data/hkgov/dpo/ALS'))
    .filter(d => d.endsWith('ALS-GeoJSON'))
    .sort()) {
    const version = `${dir.slice(0, 4)}-${dir.slice(4, 6)}-${dir.slice(6, 8)}.0`,
      file = 'als_addresses_(wan_chai_district).geojson'
    const data = await Bun.file(`data/hkgov/dpo/ALS/${dir}/${file}`).json()
    for (const [i, feature] of data.features.entries()) {
      if (
        feature.properties.Address.PremisesAddress.BuildingCsuInformation?.CsuId !==
        '3781216131T20200107'
      )
        continue
      const row = normaliseHkgovAlsFeature(
        feature,
        file,
        i + 1,
        'test',
        version,
        maps,
        true,
        new Map(),
        new Map(),
        new Map(),
      )
      const raw = [row.engPremisesAddressJson, row.chiPremisesAddressJson, row.geometry]
      const result = restoreAlsEstateGaps([row], version)
      if (result.restored || row.enEstateName === 'GOLDEN WHEEL PLAZA') {
        expect(row.id).toBe('ss-4198c868-12bb-5822-ae59-92afe91f68f2')
        expect(row.enEstateName).toBe('GOLDEN WHEEL PLAZA')
        expect(row.zhHantEstateName).toBe('金輪天地')
        expect([
          row.engPremisesAddressJson,
          row.chiPremisesAddressJson,
          row.geometry,
        ]).toEqual(raw)
        if (result.restored) restored++
        else named++
      }
    }
  }
  expect(restored).toBe(3)
  expect(named).toBeGreaterThan(0)
})
