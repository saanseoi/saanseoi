import { expect, test } from 'bun:test'
import { assembleCuratedDivisions } from './assemble'
import { createFullContainmentAnnotator } from '@repo/core/pipeline/services/divisions/fullContainment.ts'
import { containmentGeometryHash } from '@repo/core/pipeline/services/divisions/containmentGeometry.ts'
import type { Polygon } from 'geojson'
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
    {
      id: 'source',
      divisionId: 'hood',
      geometry: JSON.stringify(polygon),
      variant: 'overture',
    },
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
  expect(input.areas[0]!.geometry).toBe(JSON.stringify(polygon))
})
test('source coverage remains the fallback for divisions without drawings', () => {
  expect(
    assembleCuratedDivisions({ ...input, stubs: { features: [] } }).areas[0]!.geometry,
  ).toBe(JSON.stringify(polygon))
})
test('withheld review drawings never become published areas or divisions', () => {
  const original = assembleCuratedDivisions(input)
  const result = assembleCuratedDivisions({
    ...input,
    stubs: {
      ...input.stubs,
      withheld: [
        {
          feature: { properties: { divisionId: 'withheld' }, geometry: polygon },
          reason: 'Excluded by curator.',
        },
      ],
    },
  })
  expect(result).toEqual(original)
})
test('publication recomputes containment after drawings replace the reviewed geometry', () => {
  const parent = structuredClone(polygon) as Polygon
  const child: Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [0.5, 0],
        [0.5, 0.5],
        [0, 0.5],
        [0, 0],
      ],
    ],
  }
  const reviewed = createFullContainmentAnnotator(
    new Map([
      ['hood', [child]],
      ['parent', [parent]],
    ]),
  )('hood', { full: [[{ id: 'parent', name: null, class: 'district' }]] })
  expect(reviewed.full[0]![0]!.full_containment).toBe(true)
  const replacement: Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
        [0, 0],
      ],
    ],
  }
  const result = assembleCuratedDivisions({
    ...input,
    divisions: [...input.divisions, { id: 'parent', class: 'district', level: 2 }],
    hierarchy: { entries: [{ ...hierarchy.entries[0], hierarchies: reviewed }] },
    areas: [
      { id: 'parent-area', divisionId: 'parent', geometry: JSON.stringify(parent) },
    ],
    stubs: {
      features: [{ properties: { divisionId: 'hood' }, geometry: replacement }],
    },
  })
  const published = JSON.parse(result.divisions.find(d => d.id === 'hood')!.hierarchies)
    .full[0][0]
  expect(published.full_containment).toBe(false)
  expect(published.containment_geometry.division).toBe(
    containmentGeometryHash([replacement]),
  )
  expect(reviewed.full[0]![0]!.full_containment).toBe(true)
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
        areaKm2: 20,
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
        areaKm2: 20,
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

for (const [areaKm2, expectedClass] of [
  [0.009999, 'islet'],
  [0.01, 'minor_island'],
  [0.010001, 'minor_island'],
  [9.999999, 'minor_island'],
  [10, 'major_island'],
] as const) {
  test(`island assembly classifies ${areaKm2} km² as ${expectedClass}`, () => {
    const result = assembleCuratedDivisions({
      ...input,
      islands: [{ id: 'small-island', name: 'Small Island', areaKm2 }],
    })
    expect(
      result.divisions.find(row => row.id === result.aliases['small-island']),
    ).toMatchObject({ class: expectedClass, category: 'landform', level: null })
  })
}
test('matched island identity and ancestor labels follow the area classification', () => {
  const result = assembleCuratedDivisions({
    ...input,
    divisions: [
      ...input.divisions,
      { id: 'existing', class: 'minor_island', level: null },
    ],
    islands: [
      {
        id: 'review-islet',
        name: 'Islet',
        areaKm2: 0.005,
        matches: [{ id: 'existing' }],
      },
    ],
    hierarchy: {
      entries: [
        {
          ...hierarchy.entries[0],
          hierarchies: { full: [[{ id: 'review-islet', class: 'minor_island' }]] },
        },
        { divisionId: 'existing', expectedClass: 'islet', hierarchies: { full: [] } },
      ],
    },
  })
  expect(result.aliases['review-islet']).toBe('existing')
  expect(result.divisions.find(row => row.id === 'existing')?.class).toBe('islet')
  expect(JSON.parse(result.divisions[0]!.hierarchies).full[0][0]).toEqual({
    id: 'existing',
    class: 'islet',
    full_containment: null,
  })
})
test('existing islets are matched without creating another identity', () => {
  const result = assembleCuratedDivisions({
    ...input,
    divisions: [...input.divisions, { id: 'existing', class: 'islet', level: null }],
    islands: [
      {
        id: 'review-islet',
        name: 'Islet',
        areaKm2: 0.005,
        matches: [{ id: 'existing' }],
      },
    ],
  })
  expect(result.aliases['review-islet']).toBe('existing')
  expect(result.divisions).toHaveLength(2)
})

test('island curation removes rejected identities, drawings and ancestry', async () => {
  const { default: review } = await import(
    '../../../../../../fixtures/meta/curations/saanseoi-island-review.json'
  )
  const { default: inventory } = await import(
    '../../../../../../fixtures/divisions/hk/island-areas.json'
  )
  const ids = ['BASEMAP:ISLAND:266c51869482fb83', 'BASEMAP:ISLAND:20b1ab86f2fddb31']
  const rejected = inventory.filter(row => ids.includes(row.id))
  const result = assembleCuratedDivisions({
    ...input,
    islandReview: {
      ...review,
      entries: review.entries.filter(row => ids.includes(row.id)),
    } as any,
    islands: rejected,
    divisions: [
      ...input.divisions,
      ...ids.map(id => ({ id, class: 'minor_island', level: null })),
    ],
    names: ids.map(divisionId => ({ divisionId, locale: 'en', name: 'Rejected' })),
    areas: ids.map(divisionId => ({ id: `area:${divisionId}`, divisionId })),
    hierarchy: {
      entries: [
        {
          ...hierarchy.entries[0],
          hierarchies: { full: [ids.map(id => ({ id, class: 'minor_island' }))] },
        },
        ...ids.map(divisionId => ({
          divisionId,
          expectedClass: 'minor_island',
          hierarchies: { full: [] },
        })),
      ],
    },
    stubs: {
      features: ids.map(divisionId => ({
        properties: { divisionId },
        geometry: polygon,
      })),
    },
  })
  expect(result.divisions.map(row => row.id)).toEqual(['hood'])
  expect(result.areas).toEqual([])
  expect(result.names).toEqual([])
  expect(result.aliases).toEqual({})
  expect(JSON.parse(result.divisions[0]!.hierarchies).full).toEqual([])
})

test('merged island references resolve to the accepted canonical island', () => {
  const islands = ['canonical', 'alias'].map(id => ({
    id,
    name: id,
    geometry: polygon,
    areaKm2: 0.1,
  }))
  const result = assembleCuratedDivisions({
    ...input,
    islands,
    islandReview: {
      curationPolicy: {
        version: 1,
        actions: islands.map(row => ({ id: row.id, action: 'merge' })),
        aliasGroups: [
          { canonicalId: 'canonical', aliasIds: ['alias'], reason: 'Same island' },
        ],
      },
      entries: islands.map(row => ({
        ...row,
        decision: row.id === 'canonical' ? 'accepted' : 'rejected',
      })),
    },
    hierarchy: {
      entries: [
        {
          ...hierarchy.entries[0],
          hierarchies: { full: [[{ id: 'alias', class: 'minor_island' }]] },
        },
      ],
    },
    stubs: {
      features: [
        {
          properties: { divisionId: 'alias' },
          geometry: { type: 'Polygon', coordinates: [] },
        },
      ],
    },
  })
  expect(result.aliases.alias).toBe(result.aliases.canonical)
  expect(result.divisions).toHaveLength(2)
  expect(
    result.areas.filter(row => row.divisionId === result.aliases.canonical),
  ).toHaveLength(1)
  expect(JSON.parse(result.divisions[0]!.hierarchies).full[0][0].id).toBe(
    result.aliases.canonical,
  )
})

test('new geometry for a no-geometry decision blocks assembly for review', () => {
  const island = {
    id: 'point-only',
    name: 'Point Only',
    geometry: polygon,
    areaKm2: 0.1,
  }
  expect(() =>
    assembleCuratedDivisions({
      ...input,
      islands: [island],
      islandReview: {
        curationPolicy: {
          version: 1,
          actions: [{ id: island.id, action: 'no-geometry', reviewRequired: false }],
          aliasGroups: [],
        },
        entries: [{ ...island, decision: 'accepted' }],
      },
    }),
  ).toThrow('geometry appeared')
})

test('Ap Lei Chau and Ap Lei Pai publish their separately reviewed island polygons', async () => {
  const { default: inventory } = await import(
    '../../../../../../fixtures/divisions/hk/island-areas.json'
  )
  const { default: review } = await import(
    '../../../../../../fixtures/meta/curations/saanseoi-island-review.json'
  )
  const ids = ['LANDSD:PLACE_NAME:28', 'LANDSD:PLACE_NAME:30']
  const islands = inventory.filter(row => ids.includes(row.id))
  const result = assembleCuratedDivisions({
    ...input,
    islands,
    hierarchy: {
      entries: [
        ...input.hierarchy.entries,
        {
          divisionId: 'LANDSD:PLACE_NAME:30',
          expectedClass: 'major_island',
          hierarchies: { full: [] },
        },
      ],
    },
    islandReview: {
      ...review,
      entries: review.entries.filter(row => ids.includes(row.id)),
      curationPolicy: {
        ...review.curationPolicy,
        aliasGroups: [],
        actions: review.curationPolicy.actions.filter(row => ids.includes(row.id)),
      },
    } as any,
  })
  for (const island of islands) {
    const id = result.aliases[island.id]
    const published = result.areas.find(row => row.divisionId === id)!
    expect(JSON.parse(published.geometry)).toEqual(island.geometryOptions![0]!.geometry)
    expect(JSON.parse(published.geometry)).not.toEqual(island.geometry)
  }
  const pai = result.divisions.find(row => row.id === result.aliases[ids[1]!])!
  expect(pai.class).toBe('minor_island')
})
