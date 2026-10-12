import { expect, test } from 'bun:test'
import { validateOperationExplanation } from './fieldLineageExplanation'
import { currentFieldRule } from './fieldLineageCurrentRules'

test('structured explanations reject unknown operations and malformed branches', () => {
  for (const result of [
    {
      kind: 'operation',
      operation: 'invented',
      input: { kind: 'read', path: 'geometry' },
    },
    { kind: 'choice', branches: [], otherwise: { kind: 'literal', value: null } },
    { kind: 'read', path: '' },
    {
      kind: 'choice',
      branches: [
        {
          when: { input: 'geometry', test: 'perhaps' },
          value: { kind: 'literal', value: 1 },
        },
      ],
      otherwise: { kind: 'literal', value: null },
    },
  ])
    expect(() => validateOperationExplanation({ version: 1, result })).toThrow()
})

test('curated projections follow archive field names and include source identity input', () => {
  const inputs = (field: string) =>
    currentFieldRule('division', field, 'ds-hk-saanseoi-division')?.inputs
  expect(inputs('attributes.i18n.en.name')).toEqual(['record.names.en.name'])
  expect(inputs('attributes.level')).toEqual(['record.class'])
  expect(inputs('attributes.identifiers.wikidata.id')).toEqual([
    'record.identifiers.wikidata.id',
  ])
  expect(inputs('attributes.sources')).toEqual(['record.sources', 'record.id'])
})
