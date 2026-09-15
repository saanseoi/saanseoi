import { expect, test } from 'bun:test'
import { assembleCuratedDivisions } from './assemble'
const polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
}
const hierarchy = {
  entries: [
    {
      divisionId: 'hood',
      expectedClass: 'neighbourhood',
      hierarchies: { administrative: [], locality: [], full: [], landform: [] },
    },
  ],
}
const input = {
  divisions: [{ id: 'hood', class: 'neighbourhood', level: 5 }],
  names: [],
  areas: [
    { id: 'source', divisionId: 'hood', geometry: 'source', variant: 'overture' },
  ],
  hierarchy,
  stubs: { features: [{ properties: { divisionId: 'hood' }, geometry: polygon }] },
  islands: [],
}
test('reviewed geometry replaces source coverage without moving any vertex', () => {
  const result = assembleCuratedDivisions(input)
  expect(result.areas).toHaveLength(1)
  expect(result.areas[0]!.variant).toBe('saanseoi')
  expect(JSON.parse(result.areas[0]!.geometry)).toEqual(polygon)
  expect(input.areas[0]!.geometry).toBe('source')
})
test('source coverage remains the fallback for divisions without drawings', () => {
  expect(
    assembleCuratedDivisions({ ...input, stubs: { features: [] } }).areas[0]!.geometry,
  ).toBe('source')
})
test('island reference IDs become canonical identities in the hierarchy', () => {
  const result = assembleCuratedDivisions({
    ...input,
    hierarchy: {
      entries: [
        {
          ...hierarchy.entries[0],
          hierarchies: { full: [[{ id: 'review-island', class: 'major_island' }]] },
        },
      ],
    },
    islands: [
      {
        id: 'review-island',
        name: 'Island',
        areaKm2: 2,
        geometry: polygon,
        point: [0.5, 0.5],
      },
    ],
  })
  const island = result.aliases['review-island']
  expect(result.divisions.some(d => d.id === island)).toBe(true)
  expect(JSON.parse(result.divisions[0]!.hierarchies).full[0][0]!.id).toBe(island)
  expect(result.areas.some(a => a.divisionId === island)).toBe(true)
})
test('unknown ancestry blocks publication', () => {
  expect(() =>
    assembleCuratedDivisions({
      ...input,
      hierarchy: {
        entries: [
          { ...hierarchy.entries[0], hierarchies: { full: [[{ id: 'missing' }]] } },
        ],
      },
    }),
  ).toThrow('Missing ancestor')
})

test('invalid rings block assembly', () => {
  expect(() =>
    assembleCuratedDivisions({
      ...input,
      stubs: {
        features: [
          {
            properties: { divisionId: 'hood' },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                ],
              ],
            },
          },
        ],
      },
    }),
  ).toThrow('Invalid polygon rings')
})
test('an island geometry correction removes mainland ancestry', () => {
  const result = assembleCuratedDivisions({
    ...input,
    hierarchy: {
      entries: [
        {
          ...hierarchy.entries[0],
          point: [2, 2],
          hierarchies: { full: [[{ id: 'island', class: 'major_island' }]] },
        },
      ],
    },
    islands: [
      {
        id: 'island',
        name: 'Island',
        areaKm2: 2,
        geometry: polygon,
        restrictHierarchyToGeometry: true,
      },
    ],
  })
  expect(JSON.parse(result.divisions[0]!.hierarchies).full).toEqual([])
})
test('self-intersecting polygons block assembly', () => {
  expect(() =>
    assembleCuratedDivisions({
      ...input,
      stubs: {
        features: [
          {
            properties: { divisionId: 'hood' },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [1, 1],
                  [1, 0],
                  [0, 1],
                  [0, 0],
                ],
              ],
            },
          },
        ],
      },
    }),
  ).toThrow('Invalid polygon topology')
})
test('reviewed classification upgrades an existing native microhood during assembly', () => {
  const result = assembleCuratedDivisions({
    ...input,
    divisions: [{ id: 'hood', category: 'hood', class: 'microhood', level: 6 }],
    classificationPatches: [
      {
        divisionId: 'hood',
        expected: { subtype: 'microhood' },
        replacement: { class: 'neighbourhood', level: 5 },
      },
    ],
  })
  expect(result.divisions[0]!.class).toBe('neighbourhood')
  expect(result.divisions[0]!.level).toBe(5)
})

test('excluded divisions cannot reappear through stale drawings or island inventory', () => {
  const result = assembleCuratedDivisions({
    ...input,
    excludedIds: ['hood', 'review-island'],
    islands: [{ id: 'review-island', name: 'Excluded island', geometry: polygon }],
  })
  expect(result.divisions).toHaveLength(0)
  expect(result.names).toHaveLength(0)
  expect(result.areas).toHaveLength(0)
})
