import { expect, test } from 'bun:test'
import { jsonFieldDiff } from '@repo/core/jsonFieldDiff'
import { changeFields, recordSummary } from './sourceRecordChange.presentation'

test('large source diffs index change paths once rather than rescanning for every field', () => {
  const before = Object.fromEntries(
    Array.from({ length: 1000 }, (_, i) => [`field-${i}`, 'old']),
  )
  const after = Object.fromEntries(
    Array.from({ length: 1000 }, (_, i) => [`field-${i}`, 'new']),
  )
  let pathReads = 0
  const changes = jsonFieldDiff(before, after).map(change => ({
    ...change,
    get path() {
      pathReads += 1
      return change.path
    },
  }))
  const rows = changeFields(before, after, changes, true, true, 'absent')
  expect(rows).toHaveLength(1000)
  expect(rows[999]).toMatchObject({
    key: 'field-999',
    previousValue: 'old',
    value: 'new',
  })
  expect(pathReads).toBeLessThanOrEqual(changes.length)
})

test('indexed paths include replaced ancestors and preserve literal path segments', () => {
  const before = { 'a/b': { 'x.y': ['old', 'same'] }, untouched: { nested: 'hidden' } }
  const after = { 'a/b': { 'x.y': ['new', 'same'] }, untouched: { nested: 'hidden' } }
  const rows = changeFields(
    before,
    after,
    [
      {
        path: ['a/b'],
        beforeExists: true,
        afterExists: true,
        before: before['a/b'],
        after: after['a/b'],
      },
    ],
    true,
    true,
    'absent',
  )
  expect(rows.map(row => row.key)).toEqual(['a/b'])
  expect(rows[0]?.children?.[0]?.children).toEqual([
    { key: '[0]', previousValue: 'old', value: 'new' },
  ])
  expect(
    changeFields(
      before,
      after,
      [
        {
          path: [],
          beforeExists: true,
          afterExists: true,
          before,
          after,
        },
      ],
      true,
      true,
      'absent',
    ),
  ).toEqual(rows)
})

test('comparison keeps literal path keys, missing fields, nulls and empty containers distinct', () => {
  const before = { 'a/b': { 'x.y': null }, removed: 'value', empty: [], same: 'hidden' }
  const after = { 'a/b': { 'x.y': 'updated' }, added: null, empty: {}, same: 'hidden' }
  const rows = changeFields(
    before,
    after,
    jsonFieldDiff(before, after),
    true,
    true,
    'Not present',
  )
  expect(rows.map(row => row.key)).toEqual(['a/b', 'removed', 'empty', 'added'])
  expect(rows[0]?.children?.[0]).toMatchObject({
    key: 'x.y',
    previousValue: 'null',
    value: 'updated',
  })
  expect(rows[1]).toMatchObject({ previousValue: 'value', value: 'Not present' })
  expect(rows[2]).toMatchObject({ previousValue: '[]', value: '{}' })
  expect(rows[3]).toMatchObject({ previousValue: 'Not present', value: 'null' })
})

test('changed array entries retain their original indices', () => {
  const before = { names: [{ name: 'same' }, { name: 'old' }] }
  const after = { names: [{ name: 'same' }, { name: 'new' }] }
  const rows = changeFields(
    before,
    after,
    jsonFieldDiff(before, after),
    true,
    true,
    'absent',
  )
  expect(rows[0]?.children?.map(row => row.key)).toEqual(['[1]'])
  expect(rows[0]?.children?.[0]?.children?.[0]).toMatchObject({
    previousValue: 'old',
    value: 'new',
  })
})

test('summary selects localised publisher names and useful record context', () => {
  expect(
    recordSummary(
      { properties: { names: { en: 'Village', 'zh-Hant': '村' }, type: 'village' } },
      'zh-Hant',
      'id',
    ),
  ).toEqual({ name: '村', detail: 'village' })
})

test('Planning source record summary shows PPU, SPU, TPU and optional SB_VC codes', () => {
  expect(
    recordSummary({ properties: { ppu: 1, spu: 11, tpu: 111, sbVc: 2 } }, 'en', 'id'),
  ).toEqual({ name: 'PPU 1 · SPU 11 · TPU 111 · SB_VC 2', detail: '' })
  expect(
    recordSummary({ properties: { ppu: 1, spu: 11, tpu: 111 } }, 'en', 'id'),
  ).toEqual({ name: 'PPU 1 · SPU 11 · TPU 111', detail: '' })
})

test.each([
  [{ dcZhHant: '北區', dcEn: 'North' }, '北區 North'],
  [{ estateZhHant: '華富邨', estateEn: 'Wah Fu Estate' }, '華富邨 Wah Fu Estate'],
  [{ newtownZhHant: '沙田', newtownEn: 'Sha Tin' }, '沙田 Sha Tin'],
  [{ newTownZhHant: '沙田', newTownEn: 'Sha Tin' }, '沙田 Sha Tin'],
  [{ hmaZhHant: '中環', hmaEn: 'Central' }, '中環 Central'],
  [{ areaZhHant: '九龍', areaEn: 'Kowloon' }, '九龍 Kowloon'],
  [
    { bgZhHant: '樓群', bgEn: 'Building group', hmaZhHant: '中環', hmaEn: 'Central' },
    '樓群 Building group',
  ],
  [{ dcZhHant: null, dcEn: ' North ' }, 'North'],
  [{ dcZhHant: '北區', dcEn: '  ' }, '北區'],
  [{ hmaZhHant: 'HMA001', hmaEn: 'HMA001' }, 'HMA001'],
] as const)(
  'statistics headers use the supplied geography names: %j',
  (properties, expected) => {
    for (const locale of ['en', 'zh-Hant', 'zh-Hans']) {
      expect(recordSummary({ properties }, locale, 'source-id').name).toBe(expected)
    }
  },
)

test('publisher summaries cover official place names, streets and localised name suffixes', () => {
  expect(
    recordSummary(
      {
        properties: {
          placeNames: [
            { nameZhHant: '別名', nameEn: 'Alias', nameStatus: 'Alias' },
            { nameZhHant: '山', nameEn: 'Hill', nameStatus: 'Official' },
          ],
        },
      },
      'en',
      'id',
    ).name,
  ).toBe('山 Hill')
  expect(
    recordSummary(
      { properties: { nameZhHant: '中西區', nameEn: 'Central and Western' } },
      'en',
      'id',
    ).name,
  ).toBe('中西區 Central and Western')
  expect(
    recordSummary({ properties: { roadName: 'FU MEI STREET' } }, 'en', 'id').name,
  ).toBe('FU MEI STREET')
  expect(
    recordSummary({ properties: { stEngnm: 'QUEEN’S ROAD' } }, 'en', 'id').name,
  ).toBe('QUEEN’S ROAD')
  expect(
    recordSummary(
      { properties: { names: { common: { en: 'Village', 'zh-Hant': '村' } } } },
      'zh-Hant',
      'id',
    ).name,
  ).toBe('村')
  expect(
    recordSummary(
      { properties: { names: { 'zh-hant': '村', en: 'Village' } } },
      'zh-Hant',
      'id',
    ).name,
  ).toBe('村')
})

test('unnamed records use source codes and retain the unique ID as the final fallback', () => {
  expect(
    recordSummary({ properties: { bg: '001', hma: '002' } }, 'en', 'id').name,
  ).toBe('BG 001')
  expect(recordSummary({ properties: { objectId: 0 } }, 'en', 'id').name).toBe(
    'Object 0',
  )
  expect(
    recordSummary({ properties: { dcEn: ' ', objectId: null } }, 'en', 'unique-id')
      .name,
  ).toBe('unique-id')
})

test('coarse nested-array differences omit equal ancestors and equal object values', () => {
  const before = {
    hierarchies: [[{ name: 'Country' }, { name: 'Old', subtype: 'locality' }]],
  }
  const after = {
    hierarchies: [[{ name: 'Country' }, { name: 'New', subtype: 'locality' }]],
  }
  const rows = changeFields(
    before,
    after,
    jsonFieldDiff(before, after),
    true,
    true,
    'absent',
  )
  expect(rows[0]?.children?.[0]?.children?.map(row => row.key)).toEqual(['[1]'])
  expect(rows[0]?.children?.[0]?.children?.[0]?.children).toEqual([
    { key: 'name', previousValue: 'Old', value: 'New' },
  ])
})

test('translation insertion aligns by language and retains identifying context', () => {
  const before = {
    rules: [
      { language: 'ko', value: '동구' },
      { language: 'es', value: 'Old' },
    ],
  }
  const after = {
    rules: [
      { language: 'ja', value: 'トンキョイ' },
      { language: 'ko', value: '동구' },
      { language: 'es', value: 'New' },
    ],
  }
  const rows = changeFields(
    before,
    after,
    jsonFieldDiff(before, after),
    true,
    true,
    'absent',
  )
  expect(rows[0]?.children?.map(row => row.key)).toEqual([
    '[language="es"]',
    '[language="ja"]',
  ])
  expect(rows[0]?.children?.[0]?.children).toEqual([
    { key: 'language', previousValue: 'es', value: 'es' },
    { key: 'value', previousValue: 'Old', value: 'New' },
  ])
  expect(rows[0]?.children?.[1]?.children).toContainEqual({
    key: 'language',
    previousValue: 'absent',
    value: 'ja',
  })
})

test('reordering translations alone produces no visible differences', () => {
  const before = {
    names: {
      rules: [
        { language: 'en', value: 'Name' },
        { language: 'ja', value: '名前' },
      ],
    },
  }
  const after = { names: { rules: [...before.names.rules].reverse() } }
  expect(
    changeFields(before, after, jsonFieldDiff(before, after), true, true, 'absent'),
  ).toEqual([])
})

test('translation removal and full mode keep languages correctly paired', () => {
  const before = {
    rules: [
      { language: 'en', value: 'Name' },
      { language: 'ja', value: '名前' },
    ],
  }
  const after = { rules: [before.rules[1]] }
  const diff = jsonFieldDiff(before, after)
  const rows = changeFields(before, after, diff, true, true, 'absent')
  expect(rows[0]?.children?.map(row => row.key)).toEqual(['[language="en"]'])
  expect(rows[0]?.children?.[0]?.children).toContainEqual({
    key: 'value',
    previousValue: 'Name',
    value: 'absent',
  })
  const full = changeFields(before, after, diff, false, true, 'absent')
  expect(full[0]?.children?.[1]?.children).toContainEqual({
    key: 'value',
    previousValue: '名前',
    value: '名前',
  })
})

test('repeated languages use variants and ignore reordering of exact matches', () => {
  const before = {
    rules: [
      { language: 'en', variant: 'short', value: 'Old' },
      { language: 'en', variant: 'alternate', value: 'Other' },
    ],
  }
  const after = { rules: [before.rules[1], { ...before.rules[0], value: 'New' }] }
  const rows = changeFields(
    before,
    after,
    jsonFieldDiff(before, after),
    true,
    true,
    'absent',
  )
  expect(rows[0]?.children).toHaveLength(1)
  expect(rows[0]?.children?.[0]?.children).toEqual([
    { key: 'language', previousValue: 'en', value: 'en' },
    { key: 'variant', previousValue: 'short', value: 'short' },
    { key: 'value', previousValue: 'Old', value: 'New' },
  ])
  const ambiguous = {
    rules: [
      { language: 'en', value: 'One' },
      { language: 'en', value: 'Two' },
    ],
  }
  const swapped = { rules: [...ambiguous.rules].reverse() }
  expect(
    changeFields(
      ambiguous,
      swapped,
      jsonFieldDiff(ambiguous, swapped),
      true,
      true,
      'absent',
    ),
  ).toEqual([])
})

test('reordered name rules with missing languages and repeated locales show only the changed value and identity', () => {
  const before = {
    properties: {
      names: {
        rules: [
          { value: '東角山 East Point Hill' },
          { language: 'en', value: 'East Point Hill' },
          { language: 'zh', value: '東角山' },
          { language: 'zh', value: '鵝頭山' },
          { language: null, value: 'Unlabelled' },
        ],
      },
    },
  }
  const after = {
    properties: {
      names: {
        rules: [
          before.properties.names.rules[1],
          before.properties.names.rules[2],
          { language: 'zh', value: '鵝頭嶺' },
          before.properties.names.rules[4],
          before.properties.names.rules[0],
        ],
      },
    },
  }
  const rows = changeFields(
    before,
    after,
    jsonFieldDiff(before, after),
    true,
    true,
    'absent',
  )
  const rules = rows[0]?.children?.[0]?.children?.[0]
  expect(rules?.key).toBe('rules')
  expect(rules?.children).toHaveLength(1)
  expect(rules?.children?.[0]?.children).toEqual([
    { key: 'language', previousValue: 'zh', value: 'zh' },
    { key: 'value', previousValue: '鵝頭山', value: '鵝頭嶺' },
  ])
})

test('missing and null languages remain distinct and retain context on changed entries', () => {
  const before = { rules: [{ value: 'Missing' }, { language: null, value: 'Old' }] }
  const after = { rules: [{ language: null, value: 'New' }, before.rules[0]] }
  const rows = changeFields(
    before,
    after,
    jsonFieldDiff(before, after),
    true,
    true,
    'absent',
  )
  expect(rows[0]?.children).toHaveLength(1)
  expect(rows[0]?.children?.[0]?.children).toEqual([
    { key: 'language', previousValue: 'null', value: 'null' },
    { key: 'value', previousValue: 'Old', value: 'New' },
  ])
})

test('ambiguous repeated-language edits are not paired arbitrarily and preserve multiplicity', () => {
  const before = {
    rules: [
      { language: 'en', value: 'One' },
      { language: 'en', value: 'Two' },
    ],
  }
  const after = {
    rules: [
      { language: 'en', value: 'Three' },
      { language: 'en', value: 'Four' },
    ],
  }
  const rows = changeFields(
    before,
    after,
    jsonFieldDiff(before, after),
    true,
    true,
    'absent',
  )
  expect(rows[0]?.children).toHaveLength(4)
  const values = rows[0]?.children?.flatMap(
    row => row.children?.filter(child => child.key === 'value') ?? [],
  )
  expect(values).toEqual([
    { key: 'value', previousValue: 'One', value: 'absent' },
    { key: 'value', previousValue: 'Two', value: 'absent' },
    { key: 'value', previousValue: 'absent', value: 'Three' },
    { key: 'value', previousValue: 'absent', value: 'Four' },
  ])
  const duplicates = { rules: [before.rules[0], before.rules[0]] }
  const single = { rules: [before.rules[0]] }
  expect(
    changeFields(
      duplicates,
      single,
      jsonFieldDiff(duplicates, single),
      true,
      true,
      'absent',
    )[0]?.children,
  ).toHaveLength(1)
})

test('assembled record summaries select locale-keyed translations', () => {
  const record = {
    class: 'village',
    translations: { en: { name: 'Village' }, 'zh-Hant': { name: '村' } },
  }
  expect(recordSummary(record, 'zh-Hant', 'id')).toEqual({
    name: '村',
    detail: 'village',
  })
  expect(recordSummary(record, 'zh-Hans', 'id').name).toBe('Village')
})

test('district statistics headers pair publisher names with the reference year in every locale', () => {
  for (const locale of ['en', 'zh-Hant', 'zh-Hans'])
    for (const year of ['2025', 2025])
      expect(
        recordSummary(
          { properties: { dcZhHant: '北區', dcEn: 'North', year } },
          locale,
          'record-id',
        ).name,
      ).toBe('北區 North - 2025')
  expect(
    recordSummary({ properties: { dcEn: 'North', year: '2025' } }, 'en', 'id').name,
  ).toBe('North - 2025')
  expect(
    recordSummary(
      { properties: { dcZhHant: '北區', dcEn: 'North', year: null } },
      'en',
      'id',
    ).name,
  ).toBe('北區 North')
  expect(
    recordSummary(
      { properties: { dcZhHant: '北區', dcEn: 'North', year: ' ' } },
      'en',
      'id',
    ).name,
  ).toBe('北區 North')
  expect(
    recordSummary(
      {
        properties: {
          estateZhHant: '華富邨',
          estateEn: 'Wah Fu Estate',
          dcEn: 'Southern',
          year: '2021',
        },
      },
      'en',
      'id',
    ).name,
  ).toBe('華富邨 Wah Fu Estate')
})
