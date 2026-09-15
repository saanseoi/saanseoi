import { expect, test } from 'bun:test'
import { divisionClassificationRule } from './divisionClassificationPatch'

test('QA patches do not depend on a failed curation guard', () => {
  expect(divisionClassificationRule.declaration.review).toEqual({ kind: 'patch' })
})
import {
  applyDivisionClassificationPatch,
  divisionClassificationFixture,
  validateDivisionClassificationFixture,
} from './divisionClassificationPatch'
import { populationThousandsRule } from '../statistics/statisticRules'
import { normaliseDivisionRow } from './division'

test('classification patch checks admin level against the declared source schema', () => {
  const row = {
    id: divisionClassificationFixture.entries[0]!.divisionId,
    class: null,
    subtype: 'region',
  }
  const source = { source: 'overture' as const, sourceVersion: '2025-09-24.0' }
  expect(normaliseDivisionRow(row, { source }).base).toMatchObject({
    level: 4,
    class: 'macrohood',
  })
  for (const invalidRow of [
    { ...row, admin_level: 3 },
    { ...row, admin_level: null },
    { ...row, class: 'city' },
    { ...row, subtype: 'locality' },
  ]) {
    expect(() => applyDivisionClassificationPatch(invalidRow, source)).toThrow(
      'guard mismatch',
    )
  }
  for (const sourceVersion of ['2026-02-18.0', '2020-01-01.0']) {
    expect(() =>
      applyDivisionClassificationPatch(row, { ...source, sourceVersion }),
    ).toThrow('guard mismatch')
  }
  expect(() => applyDivisionClassificationPatch(row)).toThrow('guard mismatch')
})

test('classification patch blocks source drift and leaves unrelated identities alone', () => {
  const entry = divisionClassificationFixture.entries[0]!
  const row = { id: entry.divisionId, admin_level: 2, subtype: 'region' }
  expect(applyDivisionClassificationPatch(row)).toEqual({
    level: 4,
    class: 'macrohood',
  })
  expect(() => applyDivisionClassificationPatch({ ...row, admin_level: 3 })).toThrow(
    'guard mismatch',
  )
  expect(() =>
    applyDivisionClassificationPatch({ ...row, source: 'hkgov-landsd' }),
  ).toThrow('guard mismatch')
  expect(applyDivisionClassificationPatch({ id: 'unrelated' })).toBeNull()
  expect(() =>
    validateDivisionClassificationFixture({
      ...divisionClassificationFixture,
      entries: [entry, entry],
    }),
  ).toThrow('patch entry')
})

test('the registered scaling operation preserves precision beyond thousandths', () => {
  expect(populationThousandsRule.execute('1.2345')).toBe('1234.5')
  expect(populationThousandsRule.execute('-0.0001')).toBe('-0.1')
  expect(populationThousandsRule.execute('+243.3')).toBe('243300')
  expect(Object.isFrozen(populationThousandsRule.declaration.parameters)).toBe(true)
})

test('Lantau patch preserves its identity and clears its level without source mutation', () => {
  const row = {
    id: '3707878f-080b-42cf-aecf-89fef56a066a',
    subtype: 'locality',
    class: null,
    admin_level: null,
  }
  const original = structuredClone(row)
  expect(
    normaliseDivisionRow(row, {
      source: { source: 'overture', sourceVersion: '2026-08-19.0' },
    }).base,
  ).toMatchObject({
    id: row.id,
    category: 'landform',
    class: 'major_island',
    level: null,
  })
  expect(row).toEqual(original)
  expect(() => applyDivisionClassificationPatch({ ...row, subtype: 'region' })).toThrow(
    'guard mismatch',
  )
  expect(() => applyDivisionClassificationPatch({ ...row, admin_level: 1 })).toThrow(
    'guard mismatch',
  )
  for (const cls of ['major_island', 'minor_island', 'island_group']) {
    expect(
      normaliseDivisionRow({ id: 'physical-feature', class: cls, level: 4 }).base,
    ).toMatchObject({ category: 'landform', class: cls, level: null })
  }
})

test('Central and Western neighbourhood patches apply only to their reviewed Overture records', () => {
  const rows = [
    ['b56a6e1a-8519-4147-8dd4-342addf54c92', 'Kennedy Town'],
    ['183013ef-20f3-417d-8881-16c1e9a9f7e2', 'Shek Tong Tsui'],
    ['0058e21e-a916-4762-8da1-ba6694204a35', 'Sai Ying Pun'],
  ] as const

  for (const [id] of rows) {
    expect(
      normaliseDivisionRow(
        { id, subtype: 'macrohood', class: null, admin_level: null },
        { source: { source: 'overture', sourceVersion: '2026-08-19.0' } },
      ).base,
    ).toMatchObject({ id, category: 'hood', class: 'neighbourhood', level: 5 })
  }

  expect(() =>
    applyDivisionClassificationPatch({
      id: rows[0][0],
      subtype: 'macrohood',
      class: 'macrohood',
      admin_level: null,
    }),
  ).toThrow('guard mismatch')
})

test('Hong Kong neighbourhood and name patches apply only to their reviewed Overture records', () => {
  const rows = [
    ['fc40613a-be4e-408f-9414-deae675850a7', 'macrohood'],
    ['65a273eb-ce61-40db-ba4c-2f2f7fe496e0', 'microhood'],
    ['e5322b23-24d0-46d7-affb-cae30cc883a8', 'microhood'],
    ['5e49486b-7b8d-43ab-b2ad-4c22a50bf9ac', 'macrohood'],
    ['a60dba0a-41e2-4c84-ae70-05f647bd0e3a', 'macrohood'],
    ['4edbae57-59b3-4757-8e2c-526d48fd1d44', 'macrohood'],
  ] as const
  for (const [id, subtype] of rows) {
    expect(
      normaliseDivisionRow(
        { id, subtype, class: null, admin_level: null },
        { source: { source: 'overture', sourceVersion: '2026-08-19.0' } },
      ).base,
    ).toMatchObject({ id, category: 'hood', class: 'neighbourhood', level: 5 })
  }
  expect(
    normaliseDivisionRow(
      {
        id: '34eee784-7afc-41ec-aced-9f84eb92adec',
        subtype: 'macrohood',
        class: null,
        admin_level: null,
        names: {
          primary: '柴灣區 Chai Wan District',
          common: { en: 'Chai Wan District' },
        },
      },
      { source: { source: 'overture', sourceVersion: '2026-08-19.0' } },
    ).i18n.find(row => row.locale === 'en'),
  ).toMatchObject({ name: 'Chai Wan' })
})

test('Ngong Ping patch demotes only the reviewed Overture town to a village', () => {
  const row = {
    id: 'b14eba1a-b366-461d-a3ce-1d4c878fb997',
    subtype: 'locality',
    class: 'town',
    admin_level: null,
  }
  expect(
    normaliseDivisionRow(row, {
      source: { source: 'overture', sourceVersion: '2026-08-19.0' },
    }).base,
  ).toMatchObject({ id: row.id, category: 'locality', class: 'village', level: 5 })
  expect(() => applyDivisionClassificationPatch({ ...row, class: 'village' })).toThrow(
    'guard mismatch',
  )
})

test('Tsat Tsz Mui retains Braemar Point as a guarded English alias', () => {
  const row = {
    id: '12699b10-1e67-4994-8ecb-4716d86a3550',
    subtype: 'neighborhood',
    class: null,
    admin_level: null,
    names: {
      common: { en: 'Tsat Tsz Mui' },
      primary: '七姊妹 Tsat Tsz Mui',
    },
  }
  expect(
    normaliseDivisionRow(row, {
      source: { source: 'overture', sourceVersion: '2026-08-19.0' },
    }).i18n.find(entry => entry.locale === 'en'),
  ).toMatchObject({
    name: 'Tsat Tsz Mui',
    nameAlts: 'Braemar Point',
    nameVariant: ['Tsat Tsz Mui', 'Braemar Point'],
  })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'macrohood' }),
  ).toThrow('guard mismatch')
})

test('Hong Kong neighbourhood classifications preserve the source guard', () => {
  const rows = [
    ['1f79f23d-d33d-4528-b4b7-0b3bb302d71c', 'neighborhood'],
    ['ff8e1c52-ac5d-42a4-a411-454cfd71912e', 'macrohood'],
    ['84768e85-9a98-442f-896c-ccc9a8d2314c', 'microhood'],
    ['5db55200-4e24-41bf-93e4-8b5610145dea', 'macrohood'],
    ['4cc6dd9f-b978-4b45-ab50-cc2c8a268df1', 'microhood'],
    ['727f042f-399e-4f10-a282-2ce3eeabe8a9', 'microhood'],
    ['d23375f4-b681-4899-8cb9-ce1a0454ac58', 'macrohood'],
    ['567176ef-d8f0-4209-a06f-90530d4b7eb2', 'microhood'],
    ['4901c4fd-c5d4-473a-a374-8ee068a56acf', 'microhood'],
    ['62e48e67-a079-4fa5-b76f-baf1ec109179', 'macrohood'],
    ['cce58df1-e153-4c73-b68e-d83764b017ad', 'macrohood'],
    ['bf07573f-396b-4bfc-9a3f-60b61e083d6d', 'macrohood'],
    ['21ed82b0-c4f1-42f6-b79f-5c94363e4239', 'macrohood'],
  ] as const

  for (const [id, subtype] of rows) {
    expect(
      normaliseDivisionRow(
        { id, subtype, class: null, admin_level: null },
        { source: { source: 'overture', sourceVersion: '2026-08-19.0' } },
      ).base,
    ).toMatchObject({ id, category: 'hood', class: 'neighbourhood', level: 5 })
  }

  expect(() =>
    applyDivisionClassificationPatch({
      id: 'ff8e1c52-ac5d-42a4-a411-454cfd71912e',
      subtype: 'microhood',
      class: null,
      admin_level: null,
    }),
  ).toThrow('guard mismatch')
})

test('West Kowloon is a guarded level-4 macrohood', () => {
  const row = {
    id: 'c389923d-1dca-44af-8abe-4ac5a9d90b0b',
    subtype: 'neighborhood',
    class: null,
    admin_level: null,
  }
  expect(
    normaliseDivisionRow(row, {
      source: { source: 'overture', sourceVersion: '2026-08-19.0' },
    }).base,
  ).toMatchObject({ category: 'hood', class: 'macrohood', level: 4 })
  expect(row.subtype).toBe('neighborhood')
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'microhood' }),
  ).toThrow('guard mismatch')
})
