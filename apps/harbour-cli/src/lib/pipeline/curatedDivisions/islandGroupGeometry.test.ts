import { expect, test } from 'bun:test'
import { deriveIslandGroupGeometry } from './islandGroupGeometry'
import { containsReviewPoint } from '@repo/core/pipeline/services/divisions/geographicReview'
import type { Polygon } from 'geojson'
const box = (w: number, s: number, e: number, n: number): Polygon => ({
  type: 'Polygon',
  coordinates: [
    [
      [w, s],
      [e, s],
      [e, n],
      [w, n],
      [w, s],
    ],
  ],
})
const definition = {
  divisionId: 'group',
  seedMemberIds: ['a', 'b'],
  include: [] as string[],
  exclude: [] as string[],
}
const islands = [
  { id: 'a', class: 'minor_island', geometry: box(0, 0, 1, 1) },
  { id: 'b', class: 'minor_island', geometry: box(4, 4, 5, 5) },
  { id: 'inside', class: 'islet', geometry: box(2, 2, 3, 3) },
  { id: 'edge', class: 'islet', geometry: box(0, 3, 1, 4) },
  { id: 'crossing', class: 'minor_island', geometry: box(4, 1, 6, 2) },
  { id: 'hood', class: 'neighbourhood', geometry: box(1, 1, 2, 2) },
  { id: 'outside', class: 'islet', geometry: box(8, 8, 9, 9) },
]
test('fixed seed bounds include whole islands and boundary contact but exclude crossing geometry and other classes', () => {
  const result = deriveIslandGroupGeometry([definition], islands)[0]!
  expect(result.seedBounds).toEqual([0, 0, 5, 5])
  expect(result.memberIds).toEqual(['a', 'b', 'edge', 'inside'])
  expect(containsReviewPoint([2.5, 2.5], result.geometry)).toBe(true)
  expect(containsReviewPoint([3.5, 3.5], result.geometry)).toBe(false)
  expect(deriveIslandGroupGeometry([definition], islands.toReversed())).toEqual([
    result,
  ])
})
test('overrides do not expand the seed envelope or cascade membership', () => {
  const result = deriveIslandGroupGeometry(
    [{ ...definition, include: ['outside'], exclude: ['inside'] }],
    islands,
  )[0]!
  expect(result.seedBounds).toEqual([0, 0, 5, 5])
  expect(result.memberIds).toEqual(['a', 'b', 'edge', 'outside'])
  expect(result.memberIds).not.toContain('crossing')
})
test('missing seeds, conflicting overrides and invalid geometry block derivation', () => {
  expect(() =>
    deriveIslandGroupGeometry([{ ...definition, seedMemberIds: ['missing'] }], islands),
  ).toThrow('Missing island-group member')
  expect(() =>
    deriveIslandGroupGeometry(
      [{ ...definition, include: ['a'], exclude: ['a'] }],
      islands,
    ),
  ).toThrow('Conflicting')
  const bad: Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [1, 1],
        [0, 1],
        [1, 0],
        [0, 0],
      ],
    ],
  }
  expect(() =>
    deriveIslandGroupGeometry(
      [definition],
      [
        ...islands.filter(row => row.id !== 'a'),
        { id: 'a', class: 'islet', geometry: bad },
      ],
    ),
  ).toThrow('Invalid island-group member')
})
test('source member IDs resolve to canonical identities without copying geometry', () => {
  const result = deriveIslandGroupGeometry(
    [{ ...definition, seedMemberIds: ['source-a', 'b'] }],
    islands,
    id => (id === 'source-a' ? 'a' : id),
  )[0]!
  expect(result.memberIds).toContain('a')
  expect(result.memberIds).not.toContain('source-a')
})
