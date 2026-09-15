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

test('B Block is excluded only when its reviewed source assertion matches', () => {
  const row = {
    id: 'cbfab9fe-5b9a-493d-b710-2cfd0a2ba6db',
    subtype: 'microhood',
    class: null,
    admin_level: null,
  }
  expect(
    applyDivisionExclusionPatch(row, {
      source: 'overture',
      sourceVersion: '2026-08-19.0',
    })?.id,
  ).toBe('overture_hong_kong_b_block_excluded')
  expect(() =>
    applyDivisionExclusionPatch({ ...row, subtype: 'neighborhood' }),
  ).toThrow('guard mismatch')
})

test('Kap Ma Kum Tong exclusion retains its reviewed source guard', () => {
  const row = {
    id: '4694b2f9-3257-411a-91e1-421ad4fdbf45',
    subtype: 'macrohood',
    class: null,
    admin_level: null,
  }
  expect(applyDivisionExclusionPatch(row)?.id).toBe(
    'overture_hong_kong_kap_ma_kum_tong_excluded',
  )
  expect(() => applyDivisionExclusionPatch({ ...row, subtype: 'village' })).toThrow(
    'guard mismatch',
  )
  expect(
    applyDivisionExclusionPatch({ ...row, id: '639974f6-d055-45cf-bb8a-004c3d3af188' }),
  ).toBeNull()
})
