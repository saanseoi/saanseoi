import { expect, test } from 'bun:test'
import {
  buildEstateChronology,
  type SourceGroup,
  type SourceReport,
} from './als-estate-timeline'

const group: SourceGroup = {
  estate: 'PUBLIC',
  building: 'HOUSE',
  csu: 'csu',
  district: 'DISTRICT',
  unitCount: 1,
  inventoryCount: 1,
  reviewReasons: [],
  occurrences: [
    {
      featureIndexOneBased: 1,
      coordinates: [114, 22],
      unitCount: 1,
      inventoryHash: 'hash',
    },
  ],
}
const report = (release: string, groups: SourceGroup[] = [group]): SourceReport => ({
  release,
  estates2d: [
    { name: 'PUBLIC', records: 1, buildingCount: 1 },
    { name: 'PRIVATE', records: 1, buildingCount: 1 },
  ],
  groups,
})

test('sorts earliest first, includes historical and empty 3D estates, excludes 2D-only names', () => {
  const result = buildEstateChronology([
    report('03', []),
    report('01'),
    report('02', [{ ...group, estate: 'EMPTY', unitCount: 0, occurrences: [] }]),
  ])
  expect(result.estates.map(row => row.name)).toEqual(['PUBLIC', 'EMPTY'])
  expect(result.excluded2dOnly.map(row => row.name)).toEqual(['PRIVATE'])
  expect(result.estates[0]?.sourceReleases3d).toEqual(['01'])
  expect(
    result.estates[0]?.timeline.map(row => [row.release, row.kind, row.present3d]),
  ).toEqual([
    ['01', 'baseline', true],
    ['02', 'change', false],
  ])
})

test('ignores feature and object ordering but retains repeated assertions, unit changes and reappearance', () => {
  const reordered = {
    ...group,
    occurrences: [{ ...group.occurrences[0]!, featureIndexOneBased: 900 }],
  }
  const changed = {
    ...group,
    occurrences: [{ ...group.occurrences[0]!, inventoryHash: 'changed' }],
  }
  const result = buildEstateChronology([
    report('01'),
    report('02', [reordered]),
    report('03', [changed]),
    report('04', []),
    report('05'),
    report('06', [group, group]),
  ]).estates[0]!
  expect(result.timeline.map(row => row.release)).toEqual([
    '01',
    '03',
    '04',
    '05',
    '06',
  ])
  expect(result.timeline[1]?.changed).toHaveLength(1)
  expect(result.timeline[2]?.removed).toHaveLength(1)
  expect(result.timeline[3]?.added).toHaveLength(1)
  expect(result.timeline[4]?.changed[0]?.after.assertions).toHaveLength(2)
})

test('tracks 2D count changes without claiming a full component diff and refuses duplicate releases', () => {
  const later = report('02')
  later.estates2d[0]!.records = 2
  const timeline = buildEstateChronology([report('01'), later]).estates[0]!.timeline
  expect(timeline[1]?.records2d).toBe(2)
  expect(timeline[1]?.changed).toEqual([])
  expect(timeline[1]?.requiresChangeReview).toBe(true)
  expect(() => buildEstateChronology([report('01'), report('01')])).toThrow('unique')
})

test('records coordinate-only updates without treating them as an ownership dispute', () => {
  const moved = {
    ...group,
    occurrences: [{ ...group.occurrences[0]!, coordinates: [114.001, 22] }],
  }
  const event = buildEstateChronology([report('01'), report('02', [moved])]).estates[0]!
    .timeline[1]!
  expect(event.changed[0]?.fields).toEqual(['coordinates'])
  expect(event.requiresChangeReview).toBe(false)
})
