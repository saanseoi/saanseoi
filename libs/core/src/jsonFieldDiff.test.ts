import { expect, test } from 'bun:test'
import { jsonFieldDiff } from './jsonFieldDiff'

test('shows only changed nested leaves, ignoring object key order', () => {
  expect(
    jsonFieldDiff(
      { names: { en: 'Old', zh: '名稱' }, id: 'same' },
      { id: 'same', names: { zh: '名稱', en: 'New' } },
    ),
  ).toEqual([
    {
      path: ['names', 'en'],
      beforeExists: true,
      afterExists: true,
      before: 'Old',
      after: 'New',
    },
  ])
})

test('distinguishes absent fields from null and preserves literal field keys', () => {
  expect(jsonFieldDiff({ 'a.b': null }, { 'c/d': null })).toEqual([
    {
      path: ['a.b'],
      beforeExists: true,
      afterExists: false,
      before: null,
      after: null,
    },
    {
      path: ['c/d'],
      beforeExists: false,
      afterExists: true,
      before: null,
      after: null,
    },
  ])
})

test('compares attribution leaves but keeps geometry and primitive arrays intact', () => {
  const changes = jsonFieldDiff(
    {
      sources: [{ name: 'same', ref: 'old' }],
      geometry: { coordinates: [1, 2] },
      names: ['a'],
    },
    {
      sources: [{ name: 'same', ref: 'new' }],
      geometry: { coordinates: [2, 3] },
      names: ['b'],
    },
  )
  expect(changes.map(change => change.path)).toEqual([
    ['geometry'],
    ['names'],
    ['sources', '0', 'ref'],
  ])
})
