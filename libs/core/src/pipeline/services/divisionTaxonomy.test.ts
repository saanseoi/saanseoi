import { expect, test } from 'bun:test'
import fixture from '../../../../../fixtures/meta/processing-rules/division-normalisation.json'
import { divisionLocaleBranches } from './divisionLocaleBranches'
import { selectBranch } from '../../provenance/branches'
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

test('locale fallbacks keep existing names and select only alternative variants', () => {
  const branches = divisionLocaleBranches(fixture.parameters)
  for (const locale of Object.keys(fixture.parameters.apiLocaleFallbacks)) {
    const rules = branches.filter(
      branch => branch.group === `Locale Normalisation: ${locale}`,
    )
    expect(rules.map(rule => rule.precedence)).toEqual(
      rules.map((_, index) => index + 1),
    )
    expect(new Set(rules.map(rule => JSON.stringify(rule.condition))).size).toBe(
      rules.length,
    )
    expect(
      selectBranch(rules, { [locale]: true, 'zh-hk': true, 'zh-cn': true }, 'none'),
    ).toBe(locale)
    expect(selectBranch(rules, {}, 'none')).toBe('none')
  }
  const traditional = branches.filter(
    branch => branch.group === 'Locale Normalisation: zh-hant',
  )
  expect(selectBranch(traditional, { 'zh-hk': true, 'zh-mo': true }, 'none')).toBe(
    'zh-hk',
  )
  const simplified = branches.filter(
    branch => branch.group === 'Locale Normalisation: zh-hans',
  )
  expect(selectBranch(simplified, { 'zh-cn': true, 'zh-sg': true }, 'none')).toBe(
    'zh-cn',
  )
})

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
  const city = policy.localityClasses.find(entry => entry.token === 'city')
  if (!city) throw new Error('Expected city locality class in fixture policy')
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
  const [firstLevelToken] = policy.levelTokens
  if (!firstLevelToken) throw new Error('Expected level token in fixture policy')
  firstLevelToken.level = -1
  expect(() => validateDivisionPolicy(policy)).toThrow('Invalid division taxonomy')
  firstLevelToken.level = 0
  policy.apiLocaleFallbacks['zh-hant'] = ['zh-hant']
  expect(() => validateDivisionPolicy(policy)).toThrow('locale priorities')
})
