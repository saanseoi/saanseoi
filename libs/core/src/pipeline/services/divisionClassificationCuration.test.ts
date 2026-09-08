import { expect, test } from 'bun:test'
import {
  applyDivisionClassificationCuration,
  divisionClassificationFixture,
  validateDivisionClassificationFixture,
} from './divisionClassificationCuration'
import { populationThousandsRule } from './statisticRules'

test('classification curation blocks source drift and leaves unrelated identities alone', () => {
  const entry = divisionClassificationFixture.entries[0]!
  const row = { id: entry.divisionId, admin_level: 2, subtype: 'region' }
  expect(applyDivisionClassificationCuration(row)).toEqual({
    level: 4,
    type: 'macrohood',
  })
  expect(() => applyDivisionClassificationCuration({ ...row, admin_level: 3 })).toThrow(
    'guard mismatch',
  )
  expect(() =>
    applyDivisionClassificationCuration({ ...row, source: 'hkgov-landsd' }),
  ).toThrow('guard mismatch')
  expect(applyDivisionClassificationCuration({ id: 'unrelated' })).toBeNull()
  expect(() =>
    validateDivisionClassificationFixture({
      ...divisionClassificationFixture,
      entries: [entry, entry],
    }),
  ).toThrow('curation entry')
})

test('the registered scaling operation preserves precision beyond thousandths', () => {
  expect(populationThousandsRule.execute('1.2345')).toBe('1234.5')
  expect(populationThousandsRule.execute('-0.0001')).toBe('-0.1')
  expect(populationThousandsRule.execute('+243.3')).toBe('243300')
  expect(Object.isFrozen(populationThousandsRule.declaration.parameters)).toBe(true)
})
