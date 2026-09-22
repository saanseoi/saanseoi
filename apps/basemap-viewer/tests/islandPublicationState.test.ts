import { expect, it } from 'vitest'
import { publishedIslandRows } from '/home/io/code/saanseoi/apps/basemap-viewer/src/local-review/division-areas/islandPublicationState'

const polygon = (x: number) => ({
  type: 'Polygon',
  coordinates: [
    [
      [x, 22],
      [x + 0.001, 22],
      [x + 0.001, 22.001],
      [x, 22.001],
      [x, 22],
    ],
  ],
})
it('uses the selected corrected geometry and removes excluded and merged aliases', () => {
  const rows: any[] = [
    {
      id: 'canonical',
      name: 'Canonical',
      point: [114, 22],
      areaKm2: 1,
      geometry: polygon(114),
    },
    {
      id: 'alias',
      name: 'Alias',
      point: [114.1, 22],
      areaKm2: 1,
      geometry: polygon(114.1),
    },
    {
      id: 'corrected',
      name: 'Old',
      point: [114.2, 22],
      areaKm2: 1,
      geometry: polygon(114.2),
      geometryOptions: [{ geometry: polygon(114.2), sourceTags: { place: 'islet' } }],
    },
    {
      id: 'excluded',
      name: 'Excluded',
      point: [114.3, 22],
      areaKm2: 1,
      geometry: polygon(114.3),
    },
  ]
  const state = publishedIslandRows(rows, {
    entries: [
      { id: 'canonical', name: 'Canonical', decision: 'accepted' },
      { id: 'alias', name: 'Alias', decision: 'accepted' },
      { id: 'corrected', name: 'Corrected', decision: 'rejected' },
      { id: 'excluded', name: 'Excluded', decision: 'accepted' },
    ],
    curationPolicy: {
      actions: [
        { id: 'canonical', action: 'merge' },
        { id: 'alias', action: 'merge' },
        {
          id: 'corrected',
          action: 'geometry-correction',
          operation: 'use-named-basemap-geometry',
          maxDistanceMetres: 500,
        },
        { id: 'excluded', action: 'exclude' },
      ],
      aliasGroups: [{ canonicalId: 'canonical', aliasIds: ['alias'] }],
    },
  })
  expect(state.map(row => row.id)).toEqual(['canonical', 'corrected'])
  expect(state[1]?.name).toBe('Corrected')
  expect(state[1]?.geometry).toEqual(polygon(114.2))
})
