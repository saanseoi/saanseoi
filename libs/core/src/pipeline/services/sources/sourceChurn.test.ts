import { expect, test } from 'bun:test'
import { buildSourceChurnCounts, type SourceChurnRecord } from './sourceChurn'

test('publisher churn includes excluded records, retained shard records and ignores observation metadata', () => {
  const row = (name: string, version = 1) => ({
    properties: { name, subtype: 'plaza', version },
    sourceGeometry: { type: 'Point', coordinates: [114, 22] },
  })
  // Baseline assembled from both retained year shards, including canonical exclusions.
  const previous = new Map([
    ['old-shard', row('Retained')],
    ['updated', row('Before')],
    ['removed', row('Removed')],
    ['metadata', row('Stable')],
  ])
  const current = new Map<string, SourceChurnRecord>([
    ['old-shard', row('Retained')],
    ['updated', row('After')],
    ['added', row('Added')],
    [
      'metadata',
      {
        properties: JSON.stringify(row('Stable', 2).properties),
        sourceGeometry: JSON.stringify(row('Stable').sourceGeometry),
      },
    ],
  ])
  const result = buildSourceChurnCounts(previous, current)
  expect(result.totals).toEqual({
    count: 4,
    added_count: 1,
    changed_count: 1,
    removed_count: 1,
    unchanged_count: 2,
  })
  expect(result.byType.get('plaza')).toEqual(result.totals)
  expect(buildSourceChurnCounts(new Map(), current).totals.added_count).toBe(4)
})

test('geometry changes count but object key order does not', () => {
  const previous = new Map([
    ['one', { properties: { a: 1, b: 2 }, sourceGeometry: null }],
  ])
  expect(
    buildSourceChurnCounts(
      previous,
      new Map([
        [
          'one',
          {
            properties: { b: 2, a: 1 },
          },
        ],
      ]),
    ).totals.unchanged_count,
  ).toBe(1)
  expect(
    buildSourceChurnCounts(
      previous,
      new Map([
        [
          'one',
          {
            properties: { a: 1, b: 2 },
            sourceGeometry: { coordinates: [1, 2] },
          },
        ],
      ]),
    ).totals.changed_count,
  ).toBe(1)
})
