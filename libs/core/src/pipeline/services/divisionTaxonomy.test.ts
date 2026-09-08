import { expect, test } from 'bun:test'
import fixture from '../../../../../fixtures/meta/processing-rules/division-normalisation.json'
import {
  divisionLevel,
  divisionType,
  hierarchyClassification,
  validateDivisionPolicy,
} from './divisionTaxonomy'

const hints = {
  subtype: '',
  class: '',
  adminLevel: '',
  hasParent: false,
  isHongKongArea: false,
}

test('taxonomy consumes fixture mappings, precedence and fallbacks', () => {
  const policy = structuredClone(fixture.parameters)
  validateDivisionPolicy(policy)
  for (const entry of policy.localityClasses) {
    const input = { ...hints, subtype: 'locality', class: entry.token }
    expect(divisionLevel(policy, input)).toBe(entry.level)
    expect(divisionType(policy, input)).toBe(entry.type)
  }
  expect(divisionLevel(policy, { ...hints, subtype: 'subdistrict' })).toBe(2)
  expect(
    divisionType(policy, { ...hints, subtype: 'dependency', class: 'microhood' }),
  ).toBe('sar')
  expect(
    divisionType(policy, { ...hints, subtype: 'country', isHongKongArea: true }),
  ).toBe('area')
  expect(divisionLevel(policy, hints)).toBe(0)
  expect(divisionLevel(policy, { ...hints, hasParent: true })).toBe(1)
  const city = policy.localityClasses.find(entry => entry.token === 'city')!
  city.level = 3
  city.type = 'town'
  expect(divisionLevel(policy, { ...hints, subtype: 'locality', class: 'city' })).toBe(
    3,
  )
  expect(divisionType(policy, { ...hints, subtype: 'locality', class: 'city' })).toBe(
    'town',
  )
  policy.levelTokens.unshift({ token: 'subdistrict', level: 3 })
  expect(divisionLevel(policy, { ...hints, subtype: 'subdistrict' })).toBe(3)
})

test('hierarchy uses the same policy and still requires locality lookup', () => {
  for (const entry of fixture.parameters.hierarchySubtypes) {
    expect(hierarchyClassification(fixture.parameters, entry.token)).toEqual(entry)
  }
  expect(() => hierarchyClassification(fixture.parameters, 'locality')).toThrow(
    'without a class',
  )
  expect(() => hierarchyClassification(fixture.parameters, 'unknown')).toThrow(
    'Unsupported',
  )
})

test('invalid taxonomy and locale policies fail before registration', () => {
  const policy = structuredClone(fixture.parameters)
  policy.levelTokens[0]!.level = -1
  expect(() => validateDivisionPolicy(policy)).toThrow('Invalid division taxonomy')
  policy.levelTokens[0]!.level = 0
  policy.apiLocaleFallbacks.en = []
  expect(() => validateDivisionPolicy(policy)).toThrow('locale priorities')
})
