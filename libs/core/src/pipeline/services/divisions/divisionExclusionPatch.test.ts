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

test('East Point and the level-6 Tai Hang duplicate retain guarded exclusions', () => {
  for (const [id, subtype, patchId] of [
    [
      'c982f940-8e30-4ae6-87d8-6fd73a335217',
      'neighborhood',
      'overture_hong_kong_east_point_causeway_bay_alias',
    ],
    [
      'a21076d4-1c2c-4a79-94d8-90c582a9bc5c',
      'microhood',
      'overture_hong_kong_tai_hang_microhood_excluded',
    ],
  ] as const) {
    const row = { id, subtype, class: null, admin_level: null }
    expect(applyDivisionExclusionPatch(row)?.id).toBe(patchId)
    expect(() =>
      applyDivisionExclusionPatch({
        ...row,
        subtype: subtype === 'microhood' ? 'neighborhood' : 'microhood',
      }),
    ).toThrow('guard mismatch')
  }
})

test('the level-6 Tsim Sha Tsui duplicate retains a guarded exclusion', () => {
  const row = {
    id: 'e55d9216-f534-4d89-9a2f-0f564de447cc',
    admin_level: null,
    class: null,
    subtype: 'microhood',
  }
  expect(applyDivisionExclusionPatch(row)?.id).toBe(
    'overture_hong_kong_tsim_sha_tsui_microhood_excluded',
  )
  expect(() => applyDivisionExclusionPatch({ ...row, subtype: 'macrohood' })).toThrow(
    'guard mismatch',
  )
})

test('historic Kau Pui Shek retains a guarded exclusion', () => {
  const row = {
    id: '7b98c68d-a4d0-46e6-bb2d-12b358c59001',
    admin_level: null,
    class: null,
    subtype: 'neighborhood',
  }
  expect(applyDivisionExclusionPatch(row)?.id).toBe(
    'overture_hong_kong_kau_pui_shek_historic_excluded',
  )
  expect(() => applyDivisionExclusionPatch({ ...row, subtype: 'microhood' })).toThrow(
    'guard mismatch',
  )
})

test('Kai Tak North retains a guarded exclusion', () => {
  const row = {
    id: 'c99e175c-ed9c-4e90-84de-7a506061fd16',
    admin_level: null,
    class: null,
    subtype: 'neighborhood',
  }
  expect(applyDivisionExclusionPatch(row)?.id).toBe(
    'overture_hong_kong_kai_tak_north_excluded',
  )
  expect(() => applyDivisionExclusionPatch({ ...row, subtype: 'microhood' })).toThrow(
    'guard mismatch',
  )
})

test('whole-island and island-group macrohoods retain guarded exclusions', () => {
  for (const [id, patchId] of [
    [
      '0eb68e06-4951-41ef-afe9-cbced12cd7e6',
      'overture_hong_kong_high_island_macrohood_excluded',
    ],
    [
      '13363714-2649-4066-935d-c24757ff2a86',
      'overture_hong_kong_po_toi_islands_macrohood_excluded',
    ],
    [
      '15de4c83-f54a-4eaa-b002-c88de1f8c310',
      'overture_hong_kong_soko_islands_macrohood_excluded',
    ],
    [
      '2a938b4b-1803-4e35-97ca-f4c4ed2ed108',
      'overture_hong_kong_lamma_island_macrohood_excluded',
    ],
    [
      'c81690db-fae9-4802-8745-fd6d96ca9f60',
      'overture_hong_kong_stonecutters_island_macrohood_excluded',
    ],
    [
      'd5ea5db9-fe81-4156-abeb-f00c0debb48a',
      'overture_hong_kong_lantau_macrohood_excluded',
    ],
  ] as const) {
    const row = { id, admin_level: null, class: null, subtype: 'macrohood' }
    expect(applyDivisionExclusionPatch(row)?.id).toBe(patchId)
    expect(() =>
      applyDivisionExclusionPatch({ ...row, subtype: 'neighborhood' }),
    ).toThrow('guard mismatch')
  }
})

test('visitor-attraction and campus-walkway POIs retain guarded exclusions', () => {
  for (const [id, patchId] of [
    [
      '0f959136-e10e-49b5-aa57-97672d01cb34',
      'overture_hong_kong_avenue_of_comic_stars_excluded',
    ],
    [
      'b41774d7-4162-4802-ae67-04f0a08f2911',
      'overture_hong_kong_sculpture_walk_excluded',
    ],
    [
      'abef14db-bd24-4e33-ac68-fe42562ffd8f',
      'overture_hong_kong_new_asia_college_mall_excluded',
    ],
    [
      'fc590c1d-dc3d-425e-8bc0-2ca30e3cc9b9',
      'overture_hong_kong_university_mall_primary_excluded',
    ],
    [
      '994c536c-cbb4-4448-b139-7b0a0fd7f7e9',
      'overture_hong_kong_university_mall_duplicate_excluded',
    ],
  ] as const) {
    const row = { id, admin_level: null, class: null, subtype: 'microhood' }
    expect(applyDivisionExclusionPatch(row)?.id).toBe(patchId)
    expect(() =>
      applyDivisionExclusionPatch({ ...row, subtype: 'neighborhood' }),
    ).toThrow('guard mismatch')
  }
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
