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

test('Culture Plaza, Happy Valley and Chai Wan exclusions retain their source guards', () => {
  const cases = [
    [
      '37e9807f-5404-461c-ba18-db54e942a898',
      'microhood',
      'overture_hong_kong_culture_plaza_excluded',
    ],
    [
      '8c62eda7-887c-40a0-84f2-5d3569d34b94',
      'microhood',
      'overture_hong_kong_happy_valley_microhood_excluded',
    ],
    [
      '5e49486b-7b8d-43ab-b2ad-4c22a50bf9ac',
      'macrohood',
      'overture_hong_kong_chai_wan_neighbourhood_excluded',
    ],
  ] as const
  for (const [id, subtype, patchId] of cases) {
    const row = { id, subtype, class: null, admin_level: null }
    expect(applyDivisionExclusionPatch(row)?.id).toBe(patchId)
    expect(() =>
      applyDivisionExclusionPatch({ ...row, subtype: 'neighborhood' }),
    ).toThrow('guard mismatch')
  }
})
