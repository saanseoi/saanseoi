import { test, expect } from 'bun:test'
import { restoreAlsEstateComponents } from './hkgovAlsEstateComponents'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'
const row = () =>
  ({
    id: 'stable',
    hkgovCsuId: '3392321845T20050430',
    enEstateName: null,
    zhHantEstateName: null,
    sources: '{}',
    engPremisesAddressJson: JSON.stringify({
      BuildingName: 'FORTUNE ESTATE CARPARK',
      EngStreet: { StreetName: 'HANG CHEUNG STREET', BuildingNoFrom: '8' },
    }),
    chiPremisesAddressJson: JSON.stringify({
      BuildingName: '幸福邨停車場',
      ChiStreet: { StreetName: '幸祥街', BuildingNoFrom: '8' },
    }),
  }) as PreparedHkgovAlsRow
test('restores only derived estate fields with provenance, retaining raw source and identity', () => {
  const r = row(),
    raw = r.engPremisesAddressJson
  expect(restoreAlsEstateComponents([r], '2026-04-03.0').restored).toBe(1)
  expect(r.enEstateName).toBe('FORTUNE ESTATE')
  expect(r.zhHantEstateName).toBe('幸福邨')
  expect(r.engPremisesAddressJson).toBe(raw)
  expect(r.id).toBe('stable')
})
test('bounds exact releases and CSU; contradictory source fields fail closed', () => {
  const r = row(),
    before = JSON.stringify(r)
  restoreAlsEstateComponents([r], '2026-07-22.0')
  expect(JSON.stringify(r)).toBe(before)
  const rawEn = r.engPremisesAddressJson
  if (!rawEn) throw new Error('Missing English source premise')
  const en = JSON.parse(rawEn)
  en.EngEstate = { EstateName: 'OTHER' }
  r.engPremisesAddressJson = JSON.stringify(en)
  expect(() => restoreAlsEstateComponents([r], '2026-04-03.0')).toThrow()
  r.hkgovCsuId = '3385421875T20050430'
  expect(restoreAlsEstateComponents([r], '2026-04-03.0').restored).toBe(0)
})

test('forward-applies an active estate correction with unverified provenance', () => {
  const r = row()
  const result = restoreAlsEstateComponents([r], '2026-09-01.0')
  expect(result).toEqual({
    applications: [
      {
        fixture: 'hkgov-dpo-address-estate-components.json',
        id: 'fortune-estate-carpark-estate-gap',
        verification: 'unverified',
      },
    ],
    restored: 1,
  })
  expect(JSON.parse(r.sources).hkgovAlsEstateComponentRestoration.curation).toEqual(
    expect.objectContaining({
      lastVerifiedSourceVersion: '2026-08-19.0',
      targetSourceVersion: '2026-09-01.0',
      verificationStatus: 'unverified',
    }),
  )
})

test('restores a reviewed bilingual street omission without changing raw ALS', () => {
  const r = {
    ...row(),
    hkgovCsuId: '3608735975T20210226',
    enStreetName: null,
    enStreetNumberFrom: null,
    enStreetNumberTo: null,
    zhHantStreetName: null,
    zhHantStreetNumberFrom: null,
    zhHantStreetNumberTo: null,
    engPremisesAddressJson: JSON.stringify({ BuildingName: 'HIN TIP HOUSE' }),
    chiPremisesAddressJson: JSON.stringify({ BuildingName: '蜆蝶樓' }),
  } as PreparedHkgovAlsRow
  const raw = r.engPremisesAddressJson

  const result = restoreAlsEstateComponents([r], '2026-08-19.0')

  expect(result.restored).toBe(1)
  expect(r.engPremisesAddressJson).toBe(raw)
  expect(r.enStreetName).toBe('CHOI TIP STREET')
  expect(r.enStreetNumberFrom).toBe('11')
  expect(r.zhHantStreetName).toBe('彩蝶街')
  expect(JSON.parse(r.sources).hkgovAlsStreetComponentRestoration.curation).toEqual(
    expect.objectContaining({
      applicationMode: 'until-revoked',
      lastVerifiedSourceVersion: '2026-08-19.0',
      verificationStatus: 'verified',
    }),
  )
})
