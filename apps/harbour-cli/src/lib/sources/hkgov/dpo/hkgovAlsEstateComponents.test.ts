import { collectAlsReviewIssues } from './hkgovAlsReviewIssue'
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

test('accepts the identical estate already carried forward, but rejects conflicting derived names', () => {
  const r = row()
  restoreAlsEstateComponents([r], '2026-04-03.0')
  expect(restoreAlsEstateComponents([r], '2026-04-03.0').restored).toBe(1)
  r.enEstateName = 'OTHER ESTATE'
  expect(() => restoreAlsEstateComponents([r], '2026-04-03.0')).toThrow()
})

test('a returned verified street treats absent and null range ends alike', () => {
  const r = {
    ...row(),
    hkgovCsuId: '3608735975T20210226',
    engPremisesAddressJson: JSON.stringify({
      BuildingName: 'HIN TIP HOUSE',
      EngStreet: { StreetName: 'CHOI TIP STREET', BuildingNoFrom: '11' },
    }),
    chiPremisesAddressJson: JSON.stringify({
      BuildingName: '蜆蝶樓',
      ChiStreet: { StreetName: '彩蝶街', BuildingNoFrom: '11' },
    }),
  } as PreparedHkgovAlsRow
  expect(restoreAlsEstateComponents([r], '2026-07-08.0').restored).toBe(0)
  r.engPremisesAddressJson = JSON.stringify({
    BuildingName: 'HIN TIP HOUSE',
    EngStreet: { StreetName: 'CHOI TIP STREET', BuildingNoFrom: '12' },
  })
  const before = JSON.stringify(r)
  collectAlsReviewIssues(issues => {
    expect(restoreAlsEstateComponents([r], '2026-07-08.0').restored).toBe(0)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toEqual(
      expect.objectContaining({
        code: 'street-component-conflict',
        record: JSON.parse(before),
        conflicts: expect.arrayContaining([{ actual: '12', expected: '11' }]),
      }),
    )
  })
  expect(JSON.stringify(r)).toBe(before)
})

test('restores missing street fields when supplied number and derived fields agree', () => {
  const r = {
    ...row(),
    hkgovCsuId: '3608735975T20210226',
    enStreetName: null,
    zhHantStreetName: null,
    enStreetNumberFrom: '11',
    zhHantStreetNumberFrom: '11',
    enStreetNumberTo: null,
    zhHantStreetNumberTo: null,
    engPremisesAddressJson: JSON.stringify({
      BuildingName: 'HIN TIP HOUSE',
      EngStreet: { BuildingNoFrom: '11' },
    }),
    chiPremisesAddressJson: JSON.stringify({
      BuildingName: '蜆蝶樓',
      ChiStreet: { BuildingNoFrom: '11' },
    }),
  } as PreparedHkgovAlsRow
  const raw = r.engPremisesAddressJson
  expect(restoreAlsEstateComponents([r], '2026-07-08.0').restored).toBe(1)
  expect(r.enStreetName).toBe('CHOI TIP STREET')
  expect(r.engPremisesAddressJson).toBe(raw)
  expect(
    JSON.parse(r.sources).hkgovAlsStreetComponentRestoration.originalStreet.en,
  ).toEqual({ BuildingNoFrom: '11' })
  r.enStreetNumberFrom = '12'
  const before = JSON.stringify(r)
  collectAlsReviewIssues(issues => {
    expect(restoreAlsEstateComponents([r], '2026-07-08.0').restored).toBe(0)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toEqual(
      expect.objectContaining({
        code: 'street-component-conflict',
        record: JSON.parse(before),
        conflicts: expect.arrayContaining([{ actual: '12', expected: '11' }]),
      }),
    )
  })
  expect(JSON.stringify(r)).toBe(before)
})
