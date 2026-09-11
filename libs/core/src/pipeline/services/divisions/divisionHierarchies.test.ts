import { expect, test } from 'bun:test'
import {
  materialiseDivisionHierarchies,
  type ClassifiedAncestor,
} from './divisionHierarchies'

const entry = (id: string, type: string): ClassifiedAncestor => ({
  division_id: id,
  class: type,
  i18n: { en: { name: id }, 'zh-hant': { name: id } },
})
const ids = (paths: Array<Array<{ id: string }>>) =>
  paths.map(path => path.map(entry => entry.id))

test('materialises independent administrative, locality and full paths', () => {
  const paths = materialiseDivisionHierarchies('self', [
    [
      entry('sar', 'sar'),
      entry('area', 'area'),
      entry('district', 'district'),
      entry('city', 'city'),
      entry('macro', 'macrohood'),
      entry('self', 'microhood'),
    ],
  ])
  expect(ids(paths.administrative)).toEqual([['sar', 'area', 'district']])
  expect(ids(paths.locality)).toEqual([['city', 'macro']])
  expect(ids(paths.full)).toEqual([['sar', 'area', 'district', 'macro']])
  expect(paths.locality[0]?.[0]).toEqual({ id: 'city', name: 'city', class: 'city' })
})

test('preserves branch correlation instead of multiplying district and hood paths', () => {
  const result = materialiseDivisionHierarchies(
    'self',
    ['a', 'b'].map(id => [
      entry('sar', 'sar'),
      entry('area', 'area'),
      entry(`district-${id}`, 'district'),
      entry('town', 'town'),
      entry(`macro-${id}`, 'macrohood'),
    ]),
  )
  expect(ids(result.full)).toEqual([
    ['sar', 'area', 'district-a', 'town', 'macro-a'],
    ['sar', 'area', 'district-b', 'town', 'macro-b'],
  ])
})

test('selects the nearest locality, retains non-city localities and deduplicates paths', () => {
  const path = [
    entry('town', 'town'),
    entry('village', 'village'),
    entry('micro', 'microhood'),
  ]
  const result = materialiseDivisionHierarchies('self', [path, path])
  expect(ids(result.locality)).toEqual([['village', 'micro']])
  expect(ids(result.full)).toEqual([['village', 'micro']])
})

test('supports a hood without a locality and rejects duplicate ancestors', () => {
  expect(
    ids(
      materialiseDivisionHierarchies('self', [[entry('park', 'macrohood')]]).locality,
    ),
  ).toEqual([['park']])
  expect(() =>
    materialiseDivisionHierarchies('self', [[entry('a', 'town'), entry('a', 'town')]]),
  ).toThrow('duplicate')
  expect(materialiseDivisionHierarchies('self', [])).toEqual({
    administrative: [],
    locality: [],
    full: [],
  })
})
