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
