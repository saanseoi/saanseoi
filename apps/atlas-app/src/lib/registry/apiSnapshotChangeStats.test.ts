import { expect, test } from 'bun:test'
import { selectSnapshotChangeStats } from './apiSnapshotChangeStats'
const churn = (
  changed: number,
  dimension: string | null = null,
  dimensionValue: string | null = null,
) =>
  [
    { measure: 'count', value: 100 },
    { measure: 'added_count', value: 1 },
    { measure: 'changed_count', value: changed },
    { measure: 'removed_count', value: 2 },
    { measure: 'unchanged_count', value: 99 - changed },
  ].map(row => ({
    ...row,
    category: 'changes',
    unit: 'count',
    dimension,
    dimensionValue,
  }))
test('primary release-set statistics use published ungrouped churn', () => {
  const result = selectSnapshotChangeStats(
    [...churn(12), ...churn(40, 'district', 'one')],
    'place',
    true,
  )
  expect(result.find(row => row.measure === 'changed_count')?.value).toBe(12)
  expect(result.find(row => row.category === 'records')?.value).toBe(100)
})
test('address components use their own table breakdown and lookups cannot inherit primary counts', () => {
  const stats = [
    ...churn(12),
    ...churn(3, 'table', 'address2d'),
    ...churn(4, 'table', 'address3d'),
  ]
  expect(
    selectSnapshotChangeStats(stats, 'address', true).find(
      row => row.measure === 'changed_count',
    )?.value,
  ).toBe(3)
  expect(
    selectSnapshotChangeStats(stats, 'address3d', false).find(
      row => row.measure === 'changed_count',
    )?.value,
  ).toBe(4)
  expect(selectSnapshotChangeStats(stats, 'division', false)).toEqual([])
  expect(selectSnapshotChangeStats(stats, 'address', false)).toEqual([])
})
test('missing published counts are not silently presented as zero', () => {
  expect(
    selectSnapshotChangeStats(
      churn(12).filter(row => row.measure !== 'changed_count'),
      'place',
      true,
    ),
  ).toEqual([])
})

test('a selected supplementary variant reads its saved resource counts instead of primary churn', () => {
  const stats = [
    ...churn(12),
    ...churn(3, 'table', 'address2d'),
    ...churn(7, 'resource', 'address:overture-places'),
  ]
  const selected = selectSnapshotChangeStats(stats, 'address', false, 'overture-places')
  expect(selected.find(row => row.measure === 'changed_count')?.value).toBe(7)
  expect(
    selectSnapshotChangeStats(stats, 'address', true, 'hkgov-dpo').find(
      row => row.measure === 'changed_count',
    )?.value,
  ).toBe(3)
  expect(selectSnapshotChangeStats(stats, 'address', false, 'another')).toEqual([])
})

test('All sums each saved variant measure without counting the primary aggregate again', () => {
  const stats = [
    ...churn(12),
    ...churn(3, 'table', 'address2d'),
    ...churn(4, 'resource', 'address:hkgov-dpo'),
    ...churn(7, 'resource', 'address:overture-places'),
  ]
  const all = selectSnapshotChangeStats(stats, 'address', true, [
    'hkgov-dpo',
    'overture-places',
  ])
  expect(
    Object.fromEntries(
      all
        .filter(row => row.category === 'changes')
        .map(row => [row.measure, row.value]),
    ),
  ).toEqual({
    count: 200,
    added_count: 2,
    changed_count: 11,
    removed_count: 4,
    unchanged_count: 187,
  })
  expect(all.find(row => row.category === 'records')?.value).toBe(200)
  expect(
    selectSnapshotChangeStats(
      stats.filter(row => row.dimensionValue !== 'address:overture-places'),
      'address',
      true,
      ['hkgov-dpo', 'overture-places'],
    ),
  ).toEqual(selectSnapshotChangeStats(stats, 'address', true, 'hkgov-dpo'))
})

test('non-address selections without resource rows use the full primary statistics', () => {
  const variants = ['curated', 'upstream']
  for (const stats of [churn(12), [...churn(12), ...churn(7, 'table', 'division')]]) {
    expect(selectSnapshotChangeStats(stats, 'division', true, variants)).toEqual(
      selectSnapshotChangeStats(stats, 'division', true),
    )
    expect(selectSnapshotChangeStats(stats, 'division', true, [])).toEqual([])
  }
  expect(selectSnapshotChangeStats(churn(12), 'division', false, variants)).toEqual([])
  expect(
    selectSnapshotChangeStats(
      [...churn(12), ...churn(3, 'table', 'address2d')],
      'address',
      true,
      variants,
    ),
  ).toEqual(selectSnapshotChangeStats(churn(3, 'table', 'address2d'), 'address', true))
})

test('All sums available variants while rejecting incomplete variant measures', () => {
  const variants = ['curated', 'upstream']
  expect(
    selectSnapshotChangeStats(
      [...churn(12), ...churn(7, 'resource', 'division:curated')],
      'division',
      true,
      variants,
    ),
  ).toEqual(selectSnapshotChangeStats(churn(7), 'division', true))
  expect(
    selectSnapshotChangeStats(
      [
        ...churn(12),
        ...churn(7, 'resource', 'division:curated').filter(
          row => row.measure !== 'count',
        ),
      ],
      'division',
      true,
      variants,
    ),
  ).toEqual([])
})

test('All combines primary fallback and available supplementary counts once', () => {
  const stats = [
    ...churn(12),
    ...churn(3, 'table', 'address2d'),
    ...churn(50, 'district', 'one'),
    ...churn(7, 'resource', 'address:overture-places'),
  ]
  const selected = selectSnapshotChangeStats(stats, 'address', true, [
    'hkgov-dpo',
    'overture-places',
    'missing',
    'overture-places',
  ])
  expect(selected.find(row => row.category === 'records')?.value).toBe(200)
  expect(selected.find(row => row.measure === 'changed_count')?.value).toBe(10)
})
