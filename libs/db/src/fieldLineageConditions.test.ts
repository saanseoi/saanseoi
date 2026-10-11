import { expect, test } from 'bun:test'
import { evaluateFieldLineageCondition as evaluate } from './fieldLineageConditions'

test('null is an explicit value; missing context and unknown policy cannot cause a fallback', () => {
  expect(
    evaluate({ kind: 'compare', input: 'value', operator: 'exists' }, { value: null }),
  ).toBe(true)
  expect(
    evaluate(
      { kind: 'compare', input: 'value', operator: 'exists' },
      { value: undefined },
    ),
  ).toBe(false)
  expect(() =>
    evaluate({ kind: 'compare', input: 'value', operator: 'eq', value: null }, {}),
  ).toThrow('Missing lineage condition input')
  expect(() =>
    evaluate({ kind: 'unresolved', reason: 'No retained mapping' }, {}),
  ).toThrow('Unresolved')
})

test('conditional applicability short-circuits and evaluates retained predicates with named inputs', () => {
  const rule = {
    store: 'lineageRuleDefinitions' as const,
    definitionId: 'retained-rule',
    operationCode: 'review',
    ruleId: 'review',
  }
  expect(
    evaluate(
      {
        kind: 'all',
        conditions: [
          { kind: 'compare', input: 'profile', operator: 'in', value: ['map', 'full'] },
          { kind: 'unresolved', reason: 'not reached' },
        ],
      },
      { profile: 'compact' },
    ),
  ).toBe(false)
  expect(
    evaluate(
      { kind: 'predicate', definition: rule, arguments: { id: 'recordId' } },
      { recordId: 'division' },
      (definition, args) =>
        definition.definitionId === 'retained-rule' && args.id === 'division',
    ),
  ).toBe(true)
  expect(() =>
    evaluate({ kind: 'predicate', definition: rule, arguments: {} }, {}),
  ).toThrow('No evaluator')
})
