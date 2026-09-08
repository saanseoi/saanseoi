import { expect, test } from 'bun:test'
import type { Json } from '@repo/core/provenance'
import { retainedBranchGroups } from './retainedAuditBranchRows'

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
