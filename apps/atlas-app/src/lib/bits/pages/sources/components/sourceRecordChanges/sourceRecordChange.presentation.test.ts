import { expect, test } from 'bun:test'
import { jsonFieldDiff } from '@repo/core/jsonFieldDiff'
import { changeFields, recordSummary } from './sourceRecordChange.presentation'

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
