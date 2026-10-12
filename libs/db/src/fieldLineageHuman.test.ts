import { expect, test } from 'bun:test'
import { curatedPreparationField, validateHumanOperation } from './fieldLineageHuman'

test('human operations reject ambiguous kinds and malformed field effects', () => {
  const valid = {
    kind: 'copy',
    title: 'Publisher value',
    description: 'Keep the value unchanged.',
  }
  expect(() => validateHumanOperation(valid)).not.toThrow()
  for (const change of [
    { kind: 'transform' },
    { fieldScope: { fields: [], otherwiseInput: 'record' } },
    { fieldScope: { fields: ['geometry'], otherwiseInput: '' } },
  ])
    expect(() => validateHumanOperation({ ...valid, ...change })).toThrow()
})
