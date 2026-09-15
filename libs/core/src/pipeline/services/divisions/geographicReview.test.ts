import { expect, test } from 'bun:test'
import {
  containsReviewPoint,
  deriveHierarchyPatch,
  validateStubAreas,
  type ReviewDivision,
  type ReviewInventory,
  type ReviewArea,
  type StubAreas,
} from './geographicReview'
const empty = () => ({ administrative: [], locality: [], landform: [], full: [] })
const division = (id: string, level: number, category = 'hood'): ReviewDivision => ({
  id,
  level,
  category,
  class: level === 5 ? 'neighbourhood' : level === 6 ? 'microhood' : 'district',
  names: { en: id },
  point: [2, 2],
  hierarchies: empty(),
})
const square = (id: string, size: number, variant = 'stub'): ReviewArea => ({
  type: 'Feature',
  properties: { divisionId: id, variant },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [size, 0],
        [size, size],
        [0, size],
        [0, 0],
      ],
    ],
  },
})
const inventory: ReviewInventory = {
  schemaVersion: 1,
  region: 'hk',
  domain: 'geographic',
  cohort: 'test',
  releaseSet: 'test',
  divisions: [
    division('district', 2, 'administrative'),
    division('large', 5),
    division('small', 5),
    division('child', 6),
  ],
}
const stubs = (features: ReviewArea[]): StubAreas => ({
  type: 'FeatureCollection',
  schemaVersion: 1,
  region: 'hk',
  domain: 'geographic',
  cohort: 'test',
  variant: 'stub',
  features,
})
test('point evidence assigns level 6 without needing a level-6 polygon, with deterministic overlap resolution', () => {
  const features = [square('large', 8), square('small', 4)]
  const derive = (fs: ReviewArea[]) =>
    deriveHierarchyPatch(
      inventory,
      [square('district', 10, 'overture')],
      stubs(fs),
      false,
    ).entries.find(e => e.divisionId === 'child')!
  const result = derive(features)
  expect(result.parentIds).toContain('small')
  expect(result.parentIds).not.toContain('large')
  expect(result.competingParentIds).toEqual(['large'])
  expect(result.hierarchies.full[0]!.map(d => d.id)).toEqual(['district', 'small'])
  expect(derive(features.toReversed())).toEqual(result)
  expect(() => validateStubAreas(stubs([square('child', 1)]), inventory)).not.toThrow()
})
test('editor export annotates every hierarchy projection from the current drawings', () => {
  const derive = (features: ReviewArea[]) =>
    deriveHierarchyPatch(
      inventory,
      [square('district', 10, 'overture')],
      stubs(features),
      false,
    ).entries.find(entry => entry.divisionId === 'child')!
  const result = derive([square('small', 4), square('child', 3)])
  for (const paths of Object.values(result.hierarchies))
    for (const path of paths)
      for (const entry of path) {
        expect(entry.full_containment).toBe(true)
        expect(entry.containment_geometry?.division).toMatch(/^sha256:/)
      }
  expect(
    derive([square('small', 4), square('child', 6)]).hierarchies.locality![0]![0]!
      .full_containment,
  ).toBe(false)
  expect(
    derive([square('small', 4)]).hierarchies.locality![0]![0]!.full_containment,
  ).toBeNull()
})
test('holes, boundaries and disconnected polygon parts have defined point membership', () => {
  const geometry = square('x', 10).geometry
  if (geometry.type !== 'Polygon') throw Error()
  geometry.coordinates.push([
    [3, 3],
    [7, 3],
    [7, 7],
    [3, 7],
    [3, 3],
  ])
  expect(containsReviewPoint([2, 2], geometry)).toBe(true)
  expect(containsReviewPoint([5, 5], geometry)).toBe(false)
  expect(containsReviewPoint([3, 5], geometry)).toBe(true)
  expect(containsReviewPoint([20, 20], geometry)).toBe(false)
  expect(
    containsReviewPoint([2, 2], {
      type: 'MultiPolygon',
      coordinates: [geometry.coordinates],
    }),
  ).toBe(true)
})
test('invalid imports do not pass validation and missing geometry remains explicit for every division', () => {
  const invalid = stubs([square('small', 4)])
  invalid.features[0]!.geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [4, 4],
        [0, 4],
        [4, 0],
        [0, 0],
      ],
    ],
  }
  expect(() => validateStubAreas(invalid, inventory)).toThrow('intersects')
  expect(() => validateStubAreas({ ...stubs([]), cohort: 'other' }, inventory)).toThrow(
    'cohort',
  )
  const patch = deriveHierarchyPatch(inventory, [], stubs([]), false)
  expect(patch.entries).toHaveLength(inventory.divisions.length)
  expect(patch.entries.every(entry => entry.status === 'unresolved')).toBe(true)
  expect(
    deriveHierarchyPatch(inventory, [], stubs([]), true).entries.every(
      entry => entry.status === 'provisional',
    ),
  ).toBe(true)
})

test('ignores a non-polygon reference feature at runtime', () => {
  const pointReference = {
    type: 'Feature',
    properties: { divisionId: 'district', variant: 'point-only' },
    geometry: { type: 'Point', coordinates: [2, 2] },
  } as unknown as ReviewArea

  expect(
    deriveHierarchyPatch(inventory, [pointReference], stubs([]), false),
  ).toMatchObject({
    entries: expect.arrayContaining([
      expect.objectContaining({ divisionId: 'child', status: 'unresolved' }),
    ]),
  })
})

test('detailed source rings retain all vertices and still reject crossings', () => {
  const feature = square('district', 1)
  const ring = Array.from({ length: 12000 }, (_, i) => {
    const angle = (i * 2 * Math.PI) / 12000
    return [114 + Math.cos(angle) * 0.1, 22 + Math.sin(angle) * 0.1]
  })
  ring.push([...ring[0]!])
  feature.geometry = { type: 'Polygon', coordinates: [ring] }
  expect(() => validateStubAreas(stubs([feature]), inventory)).not.toThrow()
  expect(ring).toHaveLength(12001)
  ;[ring[100], ring[6100]] = [ring[6100]!, ring[100]!]
  expect(() => validateStubAreas(stubs([feature]), inventory)).toThrow('intersects')
})
