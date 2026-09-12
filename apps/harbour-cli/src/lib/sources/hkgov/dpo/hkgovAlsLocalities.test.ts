import { requireDefined } from '@repo/core/requireDefined'
import { test, expect } from 'bun:test'
import { applyAlsLocalities } from './hkgovAlsLocalities'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'
const row = () =>
  ({
    hkgovCsuId: '3207937952T20200309',
    id: 'unchanged',
    engPremisesAddressJson: JSON.stringify({
      BuildingName: 'SING FAI HOUSE',
      EngEstate: { EstateName: 'FAI MING ESTATE' },
      EngStreet: { StreetName: 'FAI MING ROAD', BuildingNoFrom: '10' },
    }),
    chiPremisesAddressJson: JSON.stringify({
      BuildingName: '昇暉樓',
      ChiEstate: { EstateName: '暉明邨' },
      ChiStreet: { StreetName: '暉明路', BuildingNoFrom: '10' },
    }),
    enFormattedAddress: 'SING FAI HOUSE, FAI MING ESTATE, 10 FAI MING ROAD',
    zhHantFormattedAddress: '昇暉樓暉明邨10暉明路',
    sources: '{}',
  }) as PreparedHkgovAlsRow
test('backfills locality display and provenance without changing raw components or identity', () => {
  const r = row(),
    raw = r.engPremisesAddressJson
  expect(applyAlsLocalities([r], '2024-07-25.0').backfilled).toBe(1)
  expect(r.enFormattedAddress).toContain('10 FAI MING ROAD, FANLING')
  expect(r.zhHantFormattedAddress).toContain('粉嶺10暉明路')
  expect(r.engPremisesAddressJson).toBe(raw)
  expect(r.id).toBe('unchanged')
})
test('bounds dates and scope and refuses contradictory or unexpectedly missing source locality', () => {
  const r = row(),
    before = JSON.stringify(r)
  applyAlsLocalities([r], '2024-07-24.0')
  expect(JSON.stringify(r)).toBe(before)
  expect(() => applyAlsLocalities([r], '2025-04-26.0')).toThrow()
  const en = JSON.parse(requireDefined(r.engPremisesAddressJson))
  en.EngStreet.LocationName = 'SHEUNG SHUI'
  r.engPremisesAddressJson = JSON.stringify(en)
  expect(() => applyAlsLocalities([r], '2024-07-25.0')).toThrow()
  r.hkgovCsuId = 'other'
  expect(applyAlsLocalities([r], '2024-07-25.0').backfilled).toBe(0)
})
