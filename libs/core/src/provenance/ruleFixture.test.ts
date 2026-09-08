import { expect, test } from 'bun:test'
import declaration from '../../../../fixtures/meta/processing-rules/censtatd-population-thousands-to-persons.json'
import { ruleDeclarationFromFixture } from './ruleFixture'
import { registerRule } from './auditTypes'
import { populationThousandsRule } from '../pipeline/services/statisticRules'

test('JSON fixture declarations are validated and frozen with their execution parameters', () => {
  expect(declaration).toEqual(populationThousandsRule.declaration)
  expect(populationThousandsRule.execute('1.2345')).toBe('1234.5')
  const fixture = structuredClone(declaration)
  const rule = registerRule(
    ruleDeclarationFromFixture(fixture),
    (value: number, parameters) => value * parameters.factor,
  )
  fixture.parameters.factor = 10
  fixture.summary = 'Edited outside the registered definition'
  expect(rule.execute(2)).toBe(2000)
  expect(rule.declaration.summary).toBe(declaration.summary)
  expect(Object.isFrozen(rule.declaration.parameters)).toBe(true)
  expect(() =>
    ruleDeclarationFromFixture({ ...declaration, scope: 'unknown' }),
  ).toThrow('Invalid processing rule')
  expect(() =>
    ruleDeclarationFromFixture({ ...declaration, parameters: { factor: Number.NaN } }),
  ).toThrow('finite JSON')
})
