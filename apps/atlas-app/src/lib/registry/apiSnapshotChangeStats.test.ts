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
