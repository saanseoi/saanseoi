import { expect, test } from 'bun:test'
import { canonicalIdentifiers } from './canonicalIdentifiers'

test('groups publisher identifiers without changing values or source objects', () => {
  const source = {
    hkgovPland: { ppu: '2', spu: '26', tpu: '263', subunit: '9' },
    hkgovLandsd: { geoNameId: '001' },
    hkgovCsuId: '000123',
    geoAddress: '001ABC',
    curationId: 'estate-01',
  }
  const before = structuredClone(source)
  const expected = {
    'hkgov-pland': { ppu: '2', spu: '26', tpu: '263', subunit: '9' },
    'hkgov-landsd': { geoNameId: '001' },
    'hkgov-dpo': { csuId: '000123', geoAddress: '001ABC' },
    saanseoi: { curationId: 'estate-01' },
  }
  expect(canonicalIdentifiers(source)).toEqual(expected)
  expect(canonicalIdentifiers(JSON.stringify(source))).toEqual(expected)
  expect(canonicalIdentifiers(expected)).toEqual(expected)
  expect(source).toEqual(before)
})

test('rejects conflicting CSU identifiers and malformed values', () => {
  expect(() =>
    canonicalIdentifiers({
      hkgovCsuId: '001',
      'hkgov-dpo': { csuId: '002' },
    }),
  ).toThrow('Conflicting')
  for (const value of [true, { id: '001' }]) {
    expect(() => canonicalIdentifiers({ 'hkgov-dpo': { csuId: value } })).toThrow()
  }
})
