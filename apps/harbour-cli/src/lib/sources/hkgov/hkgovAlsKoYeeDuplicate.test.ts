import { expect, test } from 'bun:test'
import { suppressKoYeeDuplicate } from './hkgovAlsKoYeeDuplicate'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

function rows() {
  const common = {
    enEstateName: 'KO YEE ESTATE',
    zhHantEstateName: '高怡邨',
    enStreetName: 'KO CHIU ROAD',
    zhHantStreetName: '高超道',
    enStreetNumberFrom: '28',
    zhHantStreetNumberFrom: '28',
    geoAddress: '4286117561T20050430',
    enBlockNumber: null,
    zhHantBlockNumber: null,
    geometry: JSON.stringify({ type: 'Point', coordinates: [114.24114, 22.29688] }),
    sources: '{}',
  }
  return [
    {
      ...common,
      id: 'owner',
      hkgovCsuId: '4291717546T20050430',
      enBuildingName: 'KO SHING HOUSE',
      zhHantBuildingName: '高盛樓',
    },
    {
      ...common,
      id: 'duplicate',
      hkgovCsuId: '4286117561T20050430',
      enBuildingName: null,
      zhHantBuildingName: null,
    },
    {
      ...common,
      id: 'unresolved',
      hkgovCsuId: '4291717546T20050430',
      enBuildingName: null,
      zhHantBuildingName: null,
      geoAddress: '4290617573T20050430',
      geometry: JSON.stringify({ type: 'Point', coordinates: [114.24128, 22.29708] }),
    },
  ] as PreparedHkgovAlsRow[]
}

test('Ko Yee retains the distinct unnamed assertion and all suppressed publisher evidence', () => {
  const input = rows()
  const original = structuredClone(input[1])
  expect(suppressKoYeeDuplicate(input, '2024-07-25.0')).toBe(1)
  expect(input.map(row => row.id)).toEqual(['owner', 'unresolved'])
  expect(
    JSON.parse(input[0]!.sources).hkgovAlsKoYeeDuplicate.suppressedAddress,
  ).toEqual(original)
})

test('Ko Yee fails closed on point or GeoAddress drift and leaves later releases alone', () => {
  for (const change of [
    { geoAddress: 'different' },
    { geometry: JSON.stringify({ type: 'Point', coordinates: [0, 0] }) },
  ]) {
    const input = rows()
    Object.assign(input[1]!, change)
    expect(() => suppressKoYeeDuplicate(input, '2024-07-25.0')).toThrow()
    expect(input).toHaveLength(3)
  }
  const input = rows().filter(row => row.id !== 'duplicate')
  expect(suppressKoYeeDuplicate(input, '2026-08-19.0')).toBe(0)
})
