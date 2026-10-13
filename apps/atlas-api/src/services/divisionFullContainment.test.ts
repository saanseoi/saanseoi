import { expect, test } from 'bun:test'
import { divisionHierarchyContent } from '@repo/core/pipeline/services/divisions/divisionHierarchyContent.ts'
import { createFullContainmentAnnotator } from '@repo/core/pipeline/services/divisions/fullContainment.ts'
import { containsReviewPoint } from '@repo/core/pipeline/services/divisions/geographicReview.ts'
import type { MultiPolygon, Polygon } from 'geojson'
import { createDivisionResolver } from './divisionGeocoding'
import { area, division, entry } from './geocoding.fixtures'

function fixture() {
  const areas = [
    area('root'),
    area('west', 0, 5),
    area('east', 5, 10),
    area('village', 0, 4),
  ]
  const records = [
    division('root'),
    division('west'),
    division('east'),
    division('village', 'locality', {
      full: [
        [entry('root'), entry('west')],
        [entry('root'), entry('east')],
      ],
    }),
  ]
  records[3]!.division.class = 'village'
  const annotate = createFullContainmentAnnotator(
    new Map(areas.map(a => [a.divisionId, [a.geometry as Polygon | MultiPolygon]])),
  )
  for (const record of records)
    record.division.hierarchies = annotate(
      record.division.id,
      record.division.hierarchies!,
    )
  const calls: string[] = []
  for (const record of records) {
    record.division.hierarchies = divisionHierarchyContent(record.division.hierarchies)
  }
  const options = {
    containsPoint: ((point, geometry) => {
      calls.push(areas.find(a => a.geometry === geometry)!.divisionId)
      return containsReviewPoint(point, geometry)
    }) as typeof containsReviewPoint,
  }
  return { areas, records, calls, options }
}

test('full containment annotations preserve coordinate-selected alternatives', () => {
  const { areas, records, calls, options } = fixture()
  const result = createDivisionResolver(records, areas, options).resolve([2, 2])
  expect(calls).toEqual(['root', 'west', 'village'])
  expect(result.path).toEqual(['root', 'west', 'village'])
  expect(result.memberships.find(member => member.id === 'west')?.evidence).toBe(
    'containment',
  )
  const baseline = structuredClone(records)
  for (const record of baseline)
    for (const paths of Object.values(record.division.hierarchies!))
      for (const path of paths)
        for (const ancestor of path) delete ancestor.full_containment
  expect(result).toEqual(createDivisionResolver(baseline, areas).resolve([2, 2]))
})

test('a point outside the child still checks its ancestors', () => {
  const { areas, records, calls, options } = fixture()
  const result = createDivisionResolver(records, areas, options).resolve([4.5, 2])
  expect(result.matchedDivisionIds).toEqual(['root', 'west'])
  expect(calls).toEqual(['root', 'west'])
})

test.each(['root', 'village'])(
  'changed %s geometry is checked independently of containment annotations',
  id => {
    const { areas, records, calls, options } = fixture()
    const target = areas.find(a => a.divisionId === id)!
    const geometry = target.geometry as Polygon
    geometry.coordinates.push([
      [1, 1],
      [3, 1],
      [3, 3],
      [1, 3],
      [1, 1],
    ])
    const result = createDivisionResolver(records, areas, options).resolve([2, 2])
    expect(result.matchedDivisionIds).not.toContain(id)
    expect(calls).toContain('root')
  },
)

test('a bare true flag, absent polygon or named identity supplies no shortcut', () => {
  const { areas, records, calls, options } = fixture()
  createDivisionResolver(records, areas, options).resolve([2, 2])
  expect(calls).toContain('root')
  expect(calls).toContain('west')
  const named = fixture()
  const result = createDivisionResolver(
    named.records,
    named.areas,
    named.options,
  ).resolveNamed('village', [8, 2])
  expect(named.calls).toContain('root')
  expect(result.memberships.map(member => member.id)).not.toContain('west')
  const missing = createDivisionResolver(
    named.records,
    named.areas.filter(a => a.divisionId !== 'west'),
  ).resolve([2, 2])
  expect(missing.coverage.missingAncestorIds).toContain('west')
})

test('partial overlap and shared boundaries retain both candidate parents', () => {
  const { records, areas } = fixture()
  areas[3] = area('village', 0, 10)
  const annotate = createFullContainmentAnnotator(
    new Map(areas.map(a => [a.divisionId, [a.geometry as Polygon]])),
  )
  records[3]!.division.hierarchies = annotate(
    'village',
    records[3]!.division.hierarchies!,
  )
  const result = createDivisionResolver(records, areas).resolve([5, 2])
  expect(result.status).toBe('ambiguous')
  expect(result.alternatives).toEqual([
    ['root', 'east', 'village'],
    ['root', 'west', 'village'],
  ])
})
