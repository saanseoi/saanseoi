import { expect, test } from 'bun:test'
import { buildSaanseoiDivisionSourceStats } from './saanseoiDivisionSourceStats'
import type { SourceChurnRecord } from './sourceChurn'

test('source counts and distributions share content-based churn, including removed-only groups and level zero', () => {
  const row = (kind: string, level: number, extra = {}): SourceChurnRecord => ({
    properties: {
      class: kind,
      level,
      names: { en: { name: 'Name' }, 'zh-hant': { name: '名稱' } },
      ...extra,
    },
  })
  const previous = new Map([
    ['stable', row('sar', 0, { version: 1 })],
    ['changed', row('village', 6)],
    ['removed', row('town', 3)],
  ])
  const current = new Map([
    ['stable', row('sar', 0, { version: 2 })],
    ['changed', row('hamlet', 5)],
    ['added', row('district', 2)],
  ])
  const stats = buildSaanseoiDivisionSourceStats(previous, current)
  const value = (
    measure: string,
    dimension: string | null = null,
    dimensionValue: string | null = null,
  ) =>
    stats.find(
      row =>
        row.category === 'changes' &&
        row.measure === measure &&
        row.dimension === dimension &&
        row.dimensionValue === dimensionValue,
    )?.value
  expect(value('count')).toBe(3)
  for (const measure of [
    'added_count',
    'changed_count',
    'removed_count',
    'unchanged_count',
  ]) {
    expect(value(measure)).toBe(1)
    for (const dimension of ['divisionType', 'level']) {
      expect(
        stats
          .filter(
            row =>
              row.category === 'changes' &&
              row.dimension === dimension &&
              row.measure === measure,
          )
          .reduce((sum, row) => sum + row.value, 0),
      ).toBe(1)
    }
  }
  expect(value('unchanged_count', 'level', '0')).toBe(1)
  expect(value('removed_count', 'divisionType', 'town')).toBe(1)
  expect(value('changed_count', 'divisionType', 'hamlet')).toBe(1)
  expect(stats.find(row => row.category === 'localised_records')?.value).toBe(6)
  expect(
    buildSaanseoiDivisionSourceStats(new Map(), current).find(
      row => row.measure === 'added_count' && !row.dimension,
    )?.value,
  ).toBe(3)
})

test('district membership counts each record once per district across repeated paths and counts the district itself', () => {
  const district = (id: string) => ({ id, class: 'district' })
  const rows = new Map<string, SourceChurnRecord>([
    ['d1', { properties: { class: 'district', level: 2 } }],
    [
      'place',
      {
        properties: JSON.stringify({
          class: 'village',
          level: 6,
          hierarchies: {
            administrative: [[district('d1')], [district('d1')], [district('d2')]],
          },
        }),
      },
    ],
  ])
  const stats = buildSaanseoiDivisionSourceStats(new Map(), rows)
  expect(
    stats
      .filter(row => row.dimension === 'district')
      .map(row => [row.dimensionValue, row.value]),
  ).toEqual([
    ['d1', 2],
    ['d2', 1],
  ])
})

test('internal containment evidence and name variants do not inflate public source churn', () => {
  const row = (evidence: string, variants: string[], fullContainment = true) => ({
    properties: {
      class: 'village',
      level: 6,
      names: { en: { name: 'Village', nameVariant: variants } },
      hierarchies: {
        full: [
          [
            {
              id: 'district',
              name: 'District',
              class: 'district',
              fullContainment,
              containmentGeometry: { ancestor: evidence },
            },
          ],
        ],
      },
    },
  })
  const previous = new Map([['one', row('old', ['Old'])]])
  const current = new Map([['one', row('new', ['New'])]])
  const baseline = structuredClone(previous)
  const stats = buildSaanseoiDivisionSourceStats(previous, current)
  expect(
    stats.find(row => row.measure === 'unchanged_count' && !row.dimension)?.value,
  ).toBe(1)
  expect(previous).toEqual(baseline)
  expect(
    buildSaanseoiDivisionSourceStats(
      previous,
      new Map([['one', row('new', ['New'], false)]]),
    ).find(row => row.measure === 'changed_count' && !row.dimension)?.value,
  ).toBe(1)
})
