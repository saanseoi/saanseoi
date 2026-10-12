import { expect, test } from 'bun:test'
import { IdentifiersSchema } from './identifiers'

test('identifier schema accepts grouped values and rejects flat or malformed identifiers', () => {
  expect(
    IdentifiersSchema.safeParse({
      'hkgov-dpo': { csuId: '000123', geoAddress: '001ABC' },
      saanseoi: { curationId: 'estate-01' },
      'hkgov-landsd': { geoNameId: ['001', 2] },
    }).success,
  ).toBe(true)
  for (const identifiers of [
    { 'ALS:CsuId': '000123' },
    { 'SS:curationId': 'estate-01' },
    { 'hkgov-dpo': { CsuId: '000123' } },
    { 'hkgov-dpo': { csuId: true } },
    { 'hkgov-dpo': { csuId: { id: '000123' } } },
  ])
    expect(IdentifiersSchema.safeParse(identifiers).success).toBe(false)
})
