import { test, expect } from 'bun:test'
import { applyAlsEstateNames } from './hkgovAlsEstateNames'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

const row = () =>
  ({
    id: 'stable-id',
    canonicalId: 'stable-id',
    identityKey: 'stable-key',
    enEstateName: 'CHOI WAN (1) ESTATE',
    zhHantEstateName: '彩雲(一)邨',
    enFormattedAddress: 'SZE YU HOUSE, CHOI WAN (1) ESTATE, 45 CLEAR WATER BAY ROAD',
    zhHantFormattedAddress: '清水灣道45號彩雲(一)邨時雨樓',
    engPremisesAddressJson: JSON.stringify({
      EngEstate: { EstateName: 'CHOI WAN (1) ESTATE' },
    }),
    chiPremisesAddressJson: JSON.stringify({ ChiEstate: { EstateName: '彩雲(一)邨' } }),
    sources: JSON.stringify({ hkgovAls: { sourceFile: 'original.geojson' } }),
  }) as PreparedHkgovAlsRow

test('uses HA bilingual display names without changing source identity or raw names', () => {
  const r = row(),
    raw = r.engPremisesAddressJson
  applyAlsEstateNames([r], '2024-07-25.0')
  expect(r.enEstateName).toBe('Choi Wan (I) Estate')
  expect(r.zhHantEstateName).toBe('彩雲一邨')
  expect(r.enFormattedAddress).toContain('Choi Wan (I) Estate')
  expect(r.zhHantFormattedAddress).toContain('彩雲一邨')
  expect(r.engPremisesAddressJson).toBe(raw)
  expect(r.id).toBe('stable-id')
  expect(r.identityKey).toBe('stable-key')
  expect(JSON.parse(r.sources).hkgovAls.sourceFile).toBe('original.geojson')
})
test('bounds the decision and rejects contradictory Chinese names', () => {
  const r = row(),
    before = JSON.stringify(r)
  applyAlsEstateNames([r], '2024-07-24.0')
  expect(JSON.stringify(r)).toBe(before)
  r.chiPremisesAddressJson = JSON.stringify({ ChiEstate: { EstateName: '彩雲二邨' } })
  expect(() => applyAlsEstateNames([r], '2025-01-23.0')).toThrow(
    'bilingual source changed',
  )
  const other = row()
  other.engPremisesAddressJson = JSON.stringify({
    EngEstate: { EstateName: 'CHOI WAN (2) ESTATE' },
  })
  applyAlsEstateNames([other], '2025-01-23.0')
  expect(other.enEstateName).toBe('CHOI WAN (1) ESTATE')
})
