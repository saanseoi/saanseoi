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

test('South Bay Garden is excluded only when its reviewed source assertion matches', () => {
  const row = {
    id: '1deda0f6-c887-4987-8d29-74ae24b90780',
    subtype: 'neighborhood',
    class: null,
    admin_level: null,
  }
  expect(applyDivisionExclusionPatch(row)?.id).toBe(
    'overture_hong_kong_south_bay_garden_excluded',
  )
  expect(() => applyDivisionExclusionPatch({ ...row, subtype: 'microhood' })).toThrow(
    'guard mismatch',
  )
})

test('Shek Pai Wan is excluded only when its reviewed source assertion matches', () => {
  const row = {
    id: '5b44a59f-8a88-4b7f-addc-d74b79aad31a',
    subtype: 'microhood',
    class: null,
    admin_level: null,
  }
  expect(applyDivisionExclusionPatch(row)?.id).toBe(
    'overture_hong_kong_shek_pai_wan_excluded',
  )
  expect(() =>
    applyDivisionExclusionPatch({ ...row, subtype: 'neighborhood' }),
  ).toThrow('guard mismatch')
})

test('reviewed Hong Kong curation exclusions retain their source guards', () => {
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
    [
      'f9d753ff-a601-4345-84dd-31ea8b0c23de',
      'microhood',
      'overture_hong_kong_expo_promenade_excluded',
    ],
    [
      'f2c19edf-36b7-4078-b101-95ae60b0193f',
      'microhood',
      'overture_hong_kong_east_wing_forecourt_excluded',
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
