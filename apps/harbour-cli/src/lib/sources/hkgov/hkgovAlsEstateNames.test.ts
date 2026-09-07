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

test('retains Roman I for Hing Wah with estate-specific authority and raw provenance', () => {
  const r = row()
  r.enEstateName = 'HING WAH (I) ESTATE'
  r.zhHantEstateName = '興華(一)邨'
  r.enFormattedAddress = 'CHEUK WAH HSE, HING WAH (I) ESTATE, 11 WAN TSUI ROAD'
  r.zhHantFormattedAddress = '環翠道11號興華(一)邨卓華樓'
  r.engPremisesAddressJson = JSON.stringify({
    EngEstate: { EstateName: r.enEstateName },
  })
  r.chiPremisesAddressJson = JSON.stringify({
    ChiEstate: { EstateName: r.zhHantEstateName },
  })
  const original = { ...r }
  applyAlsEstateNames([r], '2026-08-19.0')
  expect(r.enEstateName).toBe('Hing Wah (I) Estate')
  expect(r.zhHantEstateName).toBe('興華一邨')
  expect(r.enFormattedAddress).toContain('Hing Wah (I) Estate')
  expect(r.zhHantFormattedAddress).toContain('興華一邨')
  expect(r.engPremisesAddressJson === original.engPremisesAddressJson).toBe(true)
  expect(r.chiPremisesAddressJson === original.chiPremisesAddressJson).toBe(true)
  expect(r.identityKey).toBe(original.identityKey)
  expect(r.canonicalId).toBe(original.canonicalId)
  expect(r.id).toBe(original.id)
  const sources = JSON.parse(r.sources)
  expect(sources.hkgovAls).toEqual(JSON.parse(original.sources).hkgovAls)
  expect(sources.hkgovHaEstateName.evidenceUrl).toEndWith('/PRH/15.json')
  expect(sources.hkgovHaEstateName.decision).toContain('Hing Wah (1) Estate')
  const sibling = {
    ...original,
    engPremisesAddressJson: JSON.stringify({
      EngEstate: { EstateName: 'HING WAH (II) ESTATE' },
    }),
  }
  const siblingBefore = JSON.stringify(sibling)
  applyAlsEstateNames([sibling], '2026-08-19.0')
  expect(JSON.stringify(sibling)).toBe(siblingBefore)
  const future = { ...original }
  applyAlsEstateNames([future], '2026-08-20.0')
  expect(future).toEqual(original)
})
