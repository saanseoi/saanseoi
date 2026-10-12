import { expect, test } from 'bun:test'
import { applyConfidentAlsContinuity } from './hkgovAlsConfidentContinuity'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'
const row = (id: string, patch: Partial<PreparedHkgovAlsRow> = {}) =>
  ({
    id,
    canonicalId: id,
    hkgovCsuId: 'csu',
    sourceVersion: '2025-12-16.0',
    sources: '{}',
    geometry: '{"type":"Point","coordinates":[114.1,22.3]}',
    enBuildingName: 'NAMED BUILDING',
    zhHantBuildingName: '大廈',
    enEstateName: null,
    zhHantEstateName: null,
    enStreetName: 'EXAMPLE ROAD',
    zhHantStreetName: '示例路',
    enStreetNumberFrom: '12',
    zhHantStreetNumberFrom: '12',
    engPremisesAddressJson: JSON.stringify({
      EngStreet: { StreetName: 'EXAMPLE ROAD', BuildingNoFrom: '12' },
    }),
    chiPremisesAddressJson: JSON.stringify({
      ChiStreet: { StreetName: '示例路', BuildingNoFrom: '12' },
    }),
    enFormattedAddress: id,
    zhHantFormattedAddress: id,
    ...patch,
  }) as PreparedHkgovAlsRow
test('restores omitted bilingual names with an unchanged publisher, number and point', () => {
  const old = row('old'),
    current = row('new', { enBuildingName: null, zhHantBuildingName: null })
  expect(applyConfidentAlsContinuity([current], [old], '2026-02-04.0').get('new')).toBe(
    'old',
  )
  expect(current.enBuildingName).toBe('NAMED BUILDING')
  expect(current.zhHantBuildingName).toBe('大廈')
  expect(current.curatedGranularity).toBe('building')
  expect(current.engPremisesAddressJson).toBe(old.engPremisesAddressJson)
})
test('numbered house becomes a street address while bilingual estate survives', () => {
  const old = row('old', {
    enBuildingName: 'MAPLE DRIVE',
    zhHantBuildingName: '紅楓徑',
    enEstateName: 'THE GREEN',
    zhHantEstateName: '歌賦嶺',
    enBlockDescriptor: 'HOUSE',
    enBlockNumber: '25',
  })
  const current = row('new', {
    enBuildingName: null,
    zhHantBuildingName: null,
    enStreetName: null,
    zhHantStreetName: null,
    enStreetNumberFrom: null,
    zhHantStreetNumberFrom: null,
    enVillageName: 'MAPLE DRIVE',
    zhHantVillageName: '紅楓徑',
    enVillageNumberFrom: '25',
    zhHantVillageNumberFrom: '25',
    engPremisesAddressJson: '{}',
    chiPremisesAddressJson: '{}',
  })
  applyConfidentAlsContinuity([current], [old], '2026-02-04.0')
  expect(current.id).toBe('old')
  expect(current.enStreetName).toBe('MAPLE DRIVE')
  expect(current.enEstateName).toBe('THE GREEN')
  expect(current.zhHantEstateName).toBe('歌賦嶺')
  expect(current.curatedGranularity).toBe('unknown')
  expect(current.enVillageName).toBeNull()
})
test('ambiguous predecessors, different house numbers, site parts and changed names stay unresolved', () => {
  for (const patch of [
    { enStreetNumberFrom: '13' },
    { geometry: '{"type":"Point","coordinates":[114.2,22.3]}' },
    { enBuildingName: 'REPLACEMENT', zhHantBuildingName: '新樓' },
  ]) {
    const current = row('new', patch)
    expect(
      applyConfidentAlsContinuity([current], [row('old')], '2026-02-04.0').size,
    ).toBe(0)
  }
  const current = row('new', { enBuildingName: null, zhHantBuildingName: null })
  expect(
    applyConfidentAlsContinuity([current], [row('a'), row('b')], '2026-02-04.0').size,
  ).toBe(0)
  expect(
    applyConfidentAlsContinuity(
      [current],
      [row('old', { enBuildingName: 'PODIUM' })],
      '2026-02-04.0',
    ).size,
  ).toBe(0)
  expect(
    applyConfidentAlsContinuity([current], [row('old')], '2025-12-16.0').size,
  ).toBe(0)
})

test('estate context survives later releases that repeat the publisher street-only record', () => {
  const previous = row('retained', {
    curatedGranularity: 'unknown',
    enBuildingName: null,
    zhHantBuildingName: null,
    enEstateName: 'THE GREEN',
    zhHantEstateName: '歌賦嶺',
    enStreetName: 'MAPLE DRIVE',
    zhHantStreetName: '紅楓徑',
    enStreetNumberFrom: '25',
    zhHantStreetNumberFrom: '25',
  })
  const current = row('publisher', {
    enBuildingName: null,
    zhHantBuildingName: null,
    enStreetName: null,
    zhHantStreetName: null,
    enStreetNumberFrom: null,
    zhHantStreetNumberFrom: null,
    enVillageName: 'MAPLE DRIVE',
    zhHantVillageName: '紅楓徑',
    enVillageNumberFrom: '25',
    zhHantVillageNumberFrom: '25',
    engPremisesAddressJson: '{}',
    chiPremisesAddressJson: '{}',
  })
  expect(
    applyConfidentAlsContinuity([current], [previous], '2026-04-03.0').get('publisher'),
  ).toBe('retained')
  expect(current.enEstateName).toBe('THE GREEN')
  expect(current.curatedGranularity).toBe('unknown')
})
