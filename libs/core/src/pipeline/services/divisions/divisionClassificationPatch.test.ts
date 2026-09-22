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
  for (const cls of ['major_island', 'minor_island', 'islet', 'island_group']) {
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
    ['a60dba0a-41e2-4c84-ae70-05f647bd0e3a', 'macrohood'],
    ['4edbae57-59b3-4757-8e2c-526d48fd1d44', 'macrohood'],
    ['b15871ff-6563-4c34-b333-a58fec032fd6', 'microhood'],
    ['cc911334-7897-4c13-99a1-89c69677b51a', 'microhood'],
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

test('Causeway Bay retains East Point as guarded bilingual aliases', () => {
  const row = {
    id: 'af77229e-a369-422e-a664-7d97b4da08bb',
    subtype: 'macrohood',
    class: null,
    admin_level: null,
    names: {
      common: { en: 'Causeway Bay', 'zh-hant': '銅鑼灣' },
      primary: '銅鑼灣 Causeway Bay',
    },
  }
  const normalised = normaliseDivisionRow(row, {
    source: { source: 'overture', sourceVersion: '2026-08-19.0' },
  }).i18n
  expect(normalised.find(entry => entry.locale === 'en')).toMatchObject({
    name: 'Causeway Bay',
    nameAlts: 'East Point',
    nameVariant: ['Causeway Bay', 'East Point'],
  })
  expect(normalised.find(entry => entry.locale === 'zh-hant')).toMatchObject({
    name: '銅鑼灣',
    nameAlts: '東角',
    nameVariant: ['銅鑼灣', '東角'],
  })
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

test('Caroline Hill is a guarded level-6 microhood', () => {
  expect(
    applyDivisionClassificationPatch({
      id: 'dd472098-9bbe-42fb-b4bb-12682d4b68a4',
      admin_level: null,
      class: null,
      subtype: 'neighborhood',
    }),
  ).toMatchObject({ class: 'microhood', level: 6 })
  expect(() =>
    applyDivisionClassificationPatch({
      id: 'dd472098-9bbe-42fb-b4bb-12682d4b68a4',
      admin_level: null,
      class: null,
      subtype: 'macrohood',
    }),
  ).toThrow('guard mismatch')
})

test('Kwun Chung is a guarded level-6 microhood', () => {
  const row = {
    id: '1aae385b-4843-4ea9-b8b3-d3726764daf3',
    admin_level: null,
    class: null,
    subtype: 'neighborhood',
  }
  expect(applyDivisionClassificationPatch(row)).toMatchObject({
    class: 'microhood',
    level: 6,
  })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'macrohood' }),
  ).toThrow('guard mismatch')
})

test('Gun Club Hill is a guarded level-6 microhood', () => {
  const row = {
    id: 'ff78bc6d-3d7d-42df-80ec-350b21728027',
    admin_level: null,
    class: null,
    subtype: 'neighborhood',
  }
  expect(applyDivisionClassificationPatch(row)).toMatchObject({
    class: 'microhood',
    level: 6,
  })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'macrohood' }),
  ).toThrow('guard mismatch')
})

test('Mid-Levels West is a guarded level-5 neighbourhood', () => {
  const row = {
    id: '0a047469-9d4f-4101-ab9c-75560584888e',
    admin_level: null,
    class: null,
    subtype: 'microhood',
  }
  expect(applyDivisionClassificationPatch(row)).toMatchObject({
    class: 'neighbourhood',
    level: 5,
  })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'neighborhood' }),
  ).toThrow('guard mismatch')
})

test('Sham Wan is a guarded level-6 microhood', () => {
  const row = {
    id: 'cd521aae-5acd-4cca-8479-7713a584e1f2',
    admin_level: null,
    class: null,
    subtype: 'macrohood',
  }
  expect(applyDivisionClassificationPatch(row)).toMatchObject({
    class: 'microhood',
    level: 6,
  })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'microhood' }),
  ).toThrow('guard mismatch')
})

test('Brick Hill is a guarded level-6 microhood', () => {
  const row = {
    id: 'f47dbbad-7211-4f2c-8bb0-4425d5d83e3e',
    admin_level: null,
    class: null,
    subtype: 'neighborhood',
  }
  expect(applyDivisionClassificationPatch(row)).toMatchObject({
    class: 'microhood',
    level: 6,
  })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'macrohood' }),
  ).toThrow('guard mismatch')
})

test('Tai Shue Wan is a guarded level-6 hamlet locality', () => {
  const row = {
    id: '8da0dec7-a8dc-493d-b291-893fae29fc59',
    admin_level: null,
    class: null,
    subtype: 'macrohood',
  }
  expect(applyDivisionClassificationPatch(row)).toMatchObject({
    class: 'hamlet',
    level: 6,
  })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'microhood' }),
  ).toThrow('guard mismatch')
})

test('Wan Chai North and Wan Chai South are guarded level-5 neighbourhoods', () => {
  for (const id of [
    '04ad160c-ba32-44b8-8ab6-b7eaf7f5afe3',
    'b5f8964d-ed2e-4e3e-9708-038c79db43ea',
  ]) {
    const row = { id, admin_level: null, class: null, subtype: 'microhood' }
    expect(applyDivisionClassificationPatch(row)).toMatchObject({
      class: 'neighbourhood',
      level: 5,
    })
    expect(() =>
      applyDivisionClassificationPatch({ ...row, subtype: 'neighborhood' }),
    ).toThrow('guard mismatch')
  }
})

test('Tamar is a guarded level-6 microhood', () => {
  const row = {
    id: 'ae137810-8767-4c1d-a1d0-5adff0b633c8',
    admin_level: null,
    class: null,
    subtype: 'neighborhood',
  }
  expect(applyDivisionClassificationPatch(row)).toMatchObject({
    class: 'microhood',
    level: 6,
  })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'microhood' }),
  ).toThrow('guard mismatch')
})

test('Fort Street Area is a guarded level-6 microhood', () => {
  const row = {
    id: '3ba4e85e-0bae-43cc-9590-3dbdb3ed977b',
    admin_level: null,
    class: null,
    subtype: 'neighborhood',
  }
  expect(applyDivisionClassificationPatch(row)).toMatchObject({
    class: 'microhood',
    level: 6,
  })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'microhood' }),
  ).toThrow('guard mismatch')
})

test('Lok Kang Po and Mount Butler are guarded level-6 microhoods', () => {
  for (const [id, subtype] of [
    ['95528b81-7107-41c5-9a49-7d45a37b2b4b', 'neighborhood'],
    ['cf5e7340-5d2d-47a3-b2df-c1136901b146', 'macrohood'],
  ] as const) {
    const row = { id, admin_level: null, class: null, subtype }
    expect(applyDivisionClassificationPatch(row)).toMatchObject({
      class: 'microhood',
      level: 6,
    })
    expect(() =>
      applyDivisionClassificationPatch({ ...row, subtype: 'microhood' }),
    ).toThrow('guard mismatch')
  }
})

test('Shouson Hill is a guarded level-5 neighbourhood', () => {
  const row = {
    id: '1f358117-47ce-45c7-90a4-9e5538d0b884',
    admin_level: null,
    class: null,
    subtype: 'macrohood',
  }
  expect(applyDivisionClassificationPatch(row)).toMatchObject({
    class: 'neighbourhood',
    level: 5,
  })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'microhood' }),
  ).toThrow('guard mismatch')
})

test('Wong Nai Chung Gap is a guarded level-5 neighbourhood', () => {
  const row = {
    id: 'fbeb1745-0047-4831-b70e-d637decda7f7',
    admin_level: null,
    class: null,
    subtype: 'macrohood',
  }
  expect(applyDivisionClassificationPatch(row)).toMatchObject({
    class: 'neighbourhood',
    level: 5,
  })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'microhood' }),
  ).toThrow('guard mismatch')
})

test('Un Chau is a guarded level-6 microhood', () => {
  const row = {
    id: '3b473eb5-f4dc-4822-ad20-5e045544afa7',
    admin_level: null,
    class: null,
    subtype: 'neighborhood',
  }
  expect(applyDivisionClassificationPatch(row)).toMatchObject({
    class: 'microhood',
    level: 6,
  })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'microhood' }),
  ).toThrow('guard mismatch')
})

test("King's Park is a guarded level-5 neighbourhood", () => {
  const row = {
    id: 'fa7405e4-505c-499a-8114-9175bbaff368',
    admin_level: null,
    class: null,
    subtype: 'macrohood',
  }
  expect(applyDivisionClassificationPatch(row)).toMatchObject({
    class: 'neighbourhood',
    level: 5,
  })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'neighborhood' }),
  ).toThrow('guard mismatch')
})

test('Hung Hom Bay is a guarded level-5 neighbourhood', () => {
  const row = {
    id: '36ba2e79-8bae-45a5-8814-6499842f5ca2',
    admin_level: null,
    class: null,
    subtype: 'microhood',
  }
  expect(applyDivisionClassificationPatch(row)).toMatchObject({
    class: 'neighbourhood',
    level: 5,
  })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'neighborhood' }),
  ).toThrow('guard mismatch')
})

test('Kai Tak precincts retain guarded reviewed levels and names', () => {
  for (const [id, level, classification, nameEn] of [
    ['f9caa794-68b4-4e8d-92c7-44ebafa5352f', 5, 'neighbourhood', undefined],
    ['34c93412-e95a-4aa0-8a1e-d5d780386512', 6, 'microhood', 'Kai Tak Runway Precinct'],
    ['e173143c-e3f1-4f3d-9d31-b1bf22faaf3c', 6, 'microhood', 'Kai Tak South Apron'],
  ] as const) {
    const row = { id, admin_level: null, class: null, subtype: 'microhood' }
    expect(applyDivisionClassificationPatch(row)).toMatchObject({
      class: classification,
      level,
      ...(nameEn ? { nameEn } : {}),
    })
    expect(() =>
      applyDivisionClassificationPatch({ ...row, subtype: 'neighborhood' }),
    ).toThrow('guard mismatch')
  }
})

test('Kau Pui Lung is a guarded level-6 microhood', () => {
  const row = {
    id: 'f3a5d2ab-5e5c-4217-a72c-f736bc04d0d6',
    admin_level: null,
    class: null,
    subtype: 'neighborhood',
  }
  expect(applyDivisionClassificationPatch(row)).toMatchObject({
    class: 'microhood',
    level: 6,
  })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'microhood' }),
  ).toThrow('guard mismatch')
})

test('Ma Tau Wai, Ma Tau Kok and Tai Wo Ping are guarded level-5 neighbourhoods', () => {
  for (const id of [
    '4efceb9d-8751-4396-8a22-351bb90dd8fa',
    '5bc42e3a-b7de-485c-a651-57fb3b02957d',
    'ffe094bc-3d49-4f8a-a1d4-4c625cc495f0',
  ]) {
    const row = { id, admin_level: null, class: null, subtype: 'macrohood' }
    expect(applyDivisionClassificationPatch(row)).toMatchObject({
      class: 'neighbourhood',
      level: 5,
    })
    expect(() =>
      applyDivisionClassificationPatch({ ...row, subtype: 'neighborhood' }),
    ).toThrow('guard mismatch')
  }
})

test('Wang Tau Hom is a guarded level-5 neighbourhood', () => {
  const row = {
    id: 'a0a99bd7-7336-4390-97cc-d61dd553697c',
    admin_level: null,
    class: null,
    subtype: 'macrohood',
  }
  expect(
    normaliseDivisionRow(row, {
      source: { source: 'overture', sourceVersion: '2026-08-19.0' },
    }).base,
  ).toMatchObject({ id: row.id, category: 'hood', class: 'neighbourhood', level: 5 })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'microhood' }),
  ).toThrow('guard mismatch')
})

test('Wong Tai Sin retains Chuk Yuen and Chuk Un as guarded aliases', () => {
  const row = {
    id: '86823bb1-885a-409d-91e7-8f491a6f275d',
    admin_level: null,
    class: null,
    subtype: 'macrohood',
    names: {
      common: { en: 'Wong Tai Sin', 'zh-hant': '黃大仙' },
      primary: '黃大仙 Wong Tai Sin',
    },
  }
  const normalised = normaliseDivisionRow(row, {
    source: { source: 'overture', sourceVersion: '2026-08-19.0' },
  }).i18n
  expect(normalised.find(entry => entry.locale === 'en')).toMatchObject({
    name: 'Wong Tai Sin',
    nameAlts: 'Chuk Yuen|Chuk Un',
    nameVariant: ['Wong Tai Sin', 'Chuk Yuen', 'Chuk Un'],
  })
  expect(normalised.find(entry => entry.locale === 'zh-hant')).toMatchObject({
    name: '黃大仙',
    nameAlts: '竹園',
    nameVariant: ['黃大仙', '竹園'],
  })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'microhood' }),
  ).toThrow('guard mismatch')
})

test('Fung Wong New Village is a guarded level-6 microhood', () => {
  const row = {
    id: '88c81c19-2b74-4e32-8ad8-bbf1a7912cd9',
    admin_level: null,
    class: null,
    subtype: 'neighborhood',
  }
  expect(
    normaliseDivisionRow(row, {
      source: { source: 'overture', sourceVersion: '2026-08-19.0' },
    }).base,
  ).toMatchObject({ id: row.id, category: 'hood', class: 'microhood', level: 6 })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'microhood' }),
  ).toThrow('guard mismatch')
})

test('Ping Shek is a guarded level-6 microhood', () => {
  const row = {
    id: '3faa142e-9926-43c8-af50-0432674c1218',
    admin_level: null,
    class: null,
    subtype: 'macrohood',
  }
  expect(
    normaliseDivisionRow(row, {
      source: { source: 'overture', sourceVersion: '2026-08-19.0' },
    }).base,
  ).toMatchObject({ id: row.id, category: 'hood', class: 'microhood', level: 6 })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'microhood' }),
  ).toThrow('guard mismatch')
})

test('Kai Tak Grid Neighbourhood is a guarded level-6 microhood', () => {
  const row = {
    id: '4042756d-e611-41b6-8094-2d38b4e613c3',
    admin_level: null,
    class: null,
    subtype: 'neighborhood',
  }
  expect(
    normaliseDivisionRow(row, {
      source: { source: 'overture', sourceVersion: '2026-08-19.0' },
    }).base,
  ).toMatchObject({ id: row.id, category: 'hood', class: 'microhood', level: 6 })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'microhood' }),
  ).toThrow('guard mismatch')
})

test('Bluff Head is a guarded level-5 neighbourhood', () => {
  const row = {
    id: 'c1a8152b-ebb8-4ac4-92ec-9a1d27bf6421',
    admin_level: null,
    class: null,
    subtype: 'microhood',
  }
  expect(applyDivisionClassificationPatch(row)).toMatchObject({
    class: 'neighbourhood',
    level: 5,
  })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'neighborhood' }),
  ).toThrow('guard mismatch')
})

test('Tai Long Wan and Cape D’Aguilar use their reviewed levels', () => {
  for (const [id, level, classification] of [
    ['931ea57a-8db5-4f9d-9b99-31fadef286c5', 4, 'macrohood'],
    ['3dba1059-d30d-47e9-8a19-89d43c7db8d0', 5, 'neighbourhood'],
  ] as const) {
    const row = { id, admin_level: null, class: null, subtype: 'macrohood' }
    expect(applyDivisionClassificationPatch(row)).toMatchObject({
      class: classification,
      level,
    })
    expect(() =>
      applyDivisionClassificationPatch({ ...row, subtype: 'microhood' }),
    ).toThrow('guard mismatch')
  }
})

test('Hok Tsui Tsuen is a guarded level-6 hamlet with its reviewed English name', () => {
  const row = {
    id: '45285648-a223-4780-af58-129b6f3b3540',
    admin_level: null,
    class: 'village',
    subtype: 'locality',
  }
  expect(applyDivisionClassificationPatch(row)).toMatchObject({
    class: 'hamlet',
    level: 6,
    nameEn: 'Hok Tsui Tsuen',
    nameAltsEn: ['Hok Tsui Village'],
  })
  expect(() => applyDivisionClassificationPatch({ ...row, class: 'hamlet' })).toThrow(
    'guard mismatch',
  )
})

test('Tai Tam Tuk is a guarded level-5 neighbourhood', () => {
  const row = {
    id: 'a0883d47-ea3d-48c0-ab37-feae33f4e969',
    admin_level: null,
    class: null,
    subtype: 'microhood',
  }
  expect(applyDivisionClassificationPatch(row)).toMatchObject({
    class: 'neighbourhood',
    level: 5,
  })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'neighborhood' }),
  ).toThrow('guard mismatch')
})

test('Tai Hang, Central and Happy Valley Mid-Levels are guarded level-5 neighbourhoods', () => {
  for (const id of [
    '593026eb-279a-4755-ab5d-9c7c685f4501',
    'cd1f2665-d2d3-4a05-b386-e992030cbd5c',
    'd39ae65a-e6cc-4dcd-9186-3b041c3d1b9c',
  ]) {
    const row = { id, admin_level: null, class: null, subtype: 'microhood' }
    expect(applyDivisionClassificationPatch(row)).toMatchObject({
      class: 'neighbourhood',
      level: 5,
    })
    expect(() =>
      applyDivisionClassificationPatch({ ...row, subtype: 'neighborhood' }),
    ).toThrow('guard mismatch')
  }
})

test('Lai Wan retains its reviewed level-6 name over the Overture source name', () => {
  const row = {
    id: '58dfd8c7-96de-4569-bd24-e206ef66f2d7',
    subtype: 'microhood',
    class: null,
    admin_level: null,
    names: {
      common: { en: 'Lai Chi Kok Bay', 'zh-hant': '荔灣' },
      primary: '荔灣 Lai Chi Kok Bay',
    },
  }
  const normalised = normaliseDivisionRow(row, {
    source: { source: 'overture', sourceVersion: '2026-08-19.0' },
  })
  expect(normalised.base).toMatchObject({ class: 'microhood', level: 6 })
  expect(normalised.i18n.find(entry => entry.locale === 'en')).toMatchObject({
    name: 'Lai Wan',
  })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'neighborhood' }),
  ).toThrow('guard mismatch')
})

test('Kowloon Bay Business Area is a guarded level-5 neighbourhood', () => {
  const row = {
    id: '04b38a49-a2ae-4d50-af49-b740a7611563',
    subtype: 'microhood',
    class: null,
    admin_level: null,
  }
  expect(
    normaliseDivisionRow(row, {
      source: { source: 'overture', sourceVersion: '2026-08-19.0' },
    }).base,
  ).toMatchObject({ category: 'hood', class: 'neighbourhood', level: 5 })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'neighborhood' }),
  ).toThrow('guard mismatch')
})

test('Jordan Valley is a guarded level-5 neighbourhood', () => {
  const row = {
    id: '45205c80-66bb-4b37-a728-410caa92d4c5',
    subtype: 'macrohood',
    class: null,
    admin_level: null,
  }
  expect(
    normaliseDivisionRow(row, {
      source: { source: 'overture', sourceVersion: '2026-08-19.0' },
    }).base,
  ).toMatchObject({ category: 'hood', class: 'neighbourhood', level: 5 })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'microhood' }),
  ).toThrow('guard mismatch')
})

test('Crocodile Hill is a guarded level-6 microhood', () => {
  const row = {
    id: 'd37b7c80-ac49-4082-8d0c-50eb262ee03d',
    subtype: 'neighborhood',
    class: null,
    admin_level: null,
  }
  expect(
    normaliseDivisionRow(row, {
      source: { source: 'overture', sourceVersion: '2026-08-19.0' },
    }).base,
  ).toMatchObject({ category: 'hood', class: 'microhood', level: 6 })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'microhood' }),
  ).toThrow('guard mismatch')
})

test('Sai Tso Wan and Cha Kwo Ling are guarded level-5 neighbourhoods', () => {
  for (const id of [
    'd6412be6-0272-4678-8270-2290161920b5',
    '08ee37c9-4104-4e04-a7f4-efd5fc96f471',
  ]) {
    const row = { id, subtype: 'macrohood', class: null, admin_level: null }
    expect(
      normaliseDivisionRow(row, {
        source: { source: 'overture', sourceVersion: '2026-08-19.0' },
      }).base,
    ).toMatchObject({ category: 'hood', class: 'neighbourhood', level: 5 })
    expect(() =>
      applyDivisionClassificationPatch({ ...row, subtype: 'microhood' }),
    ).toThrow('guard mismatch')
  }
})

test('Lei Yue Mun retains Lei Yue Mun Villages as guarded bilingual aliases', () => {
  const row = {
    id: 'd3ec706f-f6f0-414d-9e8b-193e73c90c1c',
    subtype: 'macrohood',
    class: null,
    admin_level: null,
    names: {
      primary: '鯉魚門 Lei Yue Mun',
      common: { en: 'Lei Yue Mun', 'zh-hant': '鯉魚門' },
    },
  }
  const normalised = normaliseDivisionRow(row, {
    source: { source: 'overture', sourceVersion: '2026-08-19.0' },
  }).i18n
  expect(normalised.find(entry => entry.locale === 'en')).toMatchObject({
    name: 'Lei Yue Mun',
    nameAlts: 'Lei Yue Mun Villages',
    nameVariant: ['Lei Yue Mun', 'Lei Yue Mun Villages'],
  })
  expect(normalised.find(entry => entry.locale === 'zh-hant')).toMatchObject({
    name: '鯉魚門',
    nameAlts: '鯉魚門村',
    nameVariant: ['鯉魚門', '鯉魚門村'],
  })
  expect(() =>
    applyDivisionClassificationPatch({ ...row, subtype: 'microhood' }),
  ).toThrow('guard mismatch')
})
