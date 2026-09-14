import { expect, test } from 'bun:test'
import {
  applyDivisionExclusionPatch,
  divisionExclusionFixture,
  validateDivisionExclusionFixture,
} from './divisionExclusionPatch'

test('Central District exclusion accepts only its reviewed Overture source assertion', () => {
  const row = {
    id: 'f9321bdb-1e1e-49e6-89c8-662f988b29a3',
    subtype: 'macrohood',
    class: null,
    admin_level: null,
  }
  expect(
    applyDivisionExclusionPatch(row, {
      source: 'overture',
      sourceVersion: '2026-08-19.0',
    })?.id,
  ).toBe('overture_hong_kong_central_district_excluded')
  expect(() => applyDivisionExclusionPatch({ ...row, subtype: 'microhood' })).toThrow(
    'guard mismatch',
  )
  expect(() =>
    validateDivisionExclusionFixture({
      ...divisionExclusionFixture,
      entries: [
        divisionExclusionFixture.entries[0],
        divisionExclusionFixture.entries[0],
      ],
    }),
  ).toThrow('patch entry')
})
