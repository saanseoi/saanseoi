import { expect, test } from 'bun:test'
import {
  applyDivisionClassificationCuration,
  divisionClassificationFixture,
  validateDivisionClassificationFixture,
} from './divisionClassificationCuration'
import { populationThousandsRule } from './statisticRules'
import { normaliseDivisionRow } from './division'

test('classification curation checks admin level against the declared source schema', () => {
  const row = {
    id: divisionClassificationFixture.entries[0]!.divisionId,
    class: null,
    subtype: 'region',
  }
  const source = { source: 'overture' as const, sourceVersion: '2025-09-24.0' }
  expect(normaliseDivisionRow(row, { source }).base).toMatchObject({
    level: 4,
    type: 'macrohood',
  })
  for (const invalidRow of [
    { ...row, admin_level: 3 },
    { ...row, admin_level: null },
    { ...row, class: 'city' },
    { ...row, subtype: 'locality' },
  ]) {
    expect(() => applyDivisionClassificationCuration(invalidRow, source)).toThrow(
      'guard mismatch',
    )
  }
  for (const sourceVersion of ['2026-02-18.0', '2020-01-01.0']) {
    expect(() =>
      applyDivisionClassificationCuration(row, { ...source, sourceVersion }),
    ).toThrow('guard mismatch')
  }
  expect(() => applyDivisionClassificationCuration(row)).toThrow('guard mismatch')
})

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
