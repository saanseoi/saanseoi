import { expect, test } from 'bun:test'
import type { Json } from '@repo/core/provenance'
import { retainedBranchGroups } from './auditBranchRows'

test('omits inactive classification groups but preserves applied and unrecorded groups', () => {
  const declaration: Json = {
    branches: [
      'Level Classification',
      'Type Classification',
      'Locale Normalisation: en',
    ].map((group, index) => ({
      id: String(index),
      group,
      precedence: 1,
      condition: { all: [] },
      result: 'value',
    })),
  }
  expect(
    retainedBranchGroups(declaration, {
      '0': { matched: 0, changed: 0 },
      '1': { matched: 0, changed: 0 },
      '2': { matched: 1613, changed: 0 },
    }).map(group => group.locale),
  ).toEqual(['en'])
  expect(retainedBranchGroups(declaration)).toHaveLength(3)
})

test('locale tables omit shadowed checks but preserve recorded activity', () => {
  const declaration: Json = {
    branches: [
      {
        id: 'existing',
        group: 'Locale Normalisation: zh-hant',
        precedence: 1,
        condition: { field: 'zh-hant', equals: true },
        result: 'zh-hant',
      },
      {
        id: 'duplicate',
        group: 'Locale Normalisation: zh-hant',
        precedence: 3,
        condition: { field: 'zh-hant', equals: true },
        result: 'zh-hant',
      },
    ],
  }
  expect(retainedBranchGroups(declaration)[0]?.rows.map(row => row.id)).toEqual([
    'existing',
  ])
  expect(retainedBranchGroups(declaration)[0]?.explanation).toContain(
    'Keep an existing zh-hant name',
  )
  expect(
    retainedBranchGroups(declaration, { duplicate: { matched: 1, changed: 0 } })[0]
      ?.rows,
  ).toHaveLength(2)
})

test('area condition displays the names retained with the release', () => {
  const declaration: Json = {
    parameters: { hongKongAreaNames: ['kowloon', '九龍'] },
    branches: [
      {
        id: 'type.hong-kong-area',
        group: 'Type Classification',
        precedence: 1,
        condition: { field: 'isHongKongArea', equals: true },
        result: 'area',
      },
    ],
  }
  const condition = retainedBranchGroups(declaration)[0]?.rows[0]?.condition
  expect(condition).toContain('`kowloon`, `九龍`')
  expect(condition).not.toContain('isHongKongArea')
  expect(condition).not.toContain('hong kong island')
})

test('historical parameters do not manufacture retained conditions or precedence', () => {
  expect(
    retainedBranchGroups({
      parameters: { subtypeLevels: [{ token: 'country', level: 0 }] },
    }),
  ).toEqual([])
})

test('missing counters stay unrecorded; retained zero and nonzero remain distinct', () => {
  const declaration: Json = {
    branches: [
      {
        id: 'a',
        group: 'Level',
        precedence: 2,
        condition: { field: 'subtype', equals: 'country' },
        result: 0,
      },
      { id: 'b', group: 'Level', precedence: 1, condition: { all: [] }, result: 1 },
    ],
  }
  const group = retainedBranchGroups(declaration, { a: { matched: 0, changed: 0 } })[0]
  if (!group) throw new Error('Expected one retained branch group')
  const rows = group.rows
  expect(rows.map(row => row.id)).toEqual(['b', 'a'])
  expect(rows[0]?.matched).toBeUndefined()
  expect(rows[0]?.changed).toBeUndefined()
  expect(rows[1]?.matched).toBe(0)
  expect(rows[1]?.changed).toBe(0)
  expect(
    retainedBranchGroups(declaration, { a: { matched: 8, changed: 3 } })[0]?.rows[1],
  ).toMatchObject({ matched: 8, changed: 3 })
})
