import { expect, test } from 'bun:test'
import {
  protomapsSourceBundle,
  protomapsSourceRecords,
  sourceNames,
} from './protomapsIslands'

const landBorder = [
  {
    geometry: {
      type: 'LineString',
      coordinates: [
        [2, 0],
        [2, 1],
      ],
    },
  },
]

const geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
}
test('source extraction retains unnamed features, native IDs and every explicit locale', () => {
  const rows = protomapsSourceRecords(
    [
      {
        id: 'w1',
        geometry,
        properties: {
          place: 'island',
          name: 'Bilingual label',
          'name:en': 'Island',
          'name:zh-Hant': '島',
        },
      },
      { id: 'w2', geometry, properties: { place: 'islet' } },
      {
        id: 'n3',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { place: 'island', 'name:zh': '島' },
      },
    ],
    [{ geometry }],
    landBorder,
  )
  expect(rows).toHaveLength(4)
  expect(rows.find(r => r.sourceRecordId === 'OSM:w1')?.properties.names).toEqual({
    en: 'Island',
    'zh-Hant': '島',
  })
  expect(rows.find(r => r.sourceRecordId === 'OSM:w2')?.properties.names).toEqual({})
  expect(rows.find(r => r.sourceRecordId === 'OSM:n3')?.sourceGeometry.type).toBe(
    'Point',
  )
  expect(
    rows.find(r => r.properties.kind === 'coastline-land')?.sourceRecordId,
  ).toMatch(/^PROTOMAPS:LAND:[a-f0-9]{64}$/)
  expect(sourceNames({ name: 'Unspecified language' })).toEqual({})
})
test('source identities are independent of names and reject conflicting native records', () => {
  const first = protomapsSourceRecords(
    [{ id: 'w1', geometry, properties: { place: 'island', name: 'A' } }],
    [],
    landBorder,
  )
  const second = protomapsSourceRecords(
    [{ id: 'w1', geometry, properties: { place: 'island', name: 'B' } }],
    [],
    landBorder,
  )
  expect(first[0]?.sourceRecordId).toBe(second[0]?.sourceRecordId)
  expect(() =>
    protomapsSourceRecords(
      [
        { id: 'w1', geometry, properties: { place: 'island', name: 'A' } },
        { id: 'w1', geometry, properties: { place: 'island', name: 'B' } },
      ],
      [],
      landBorder,
    ),
  ).toThrow('Conflicting source feature')
})

test('coastline extraction excludes mainland and preserves detached islands and point contacts', () => {
  const polygon = (west: number, south: number, east: number, north: number) => ({
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  })
  const mainland = polygon(0, 0, 2, 2)
  const island = polygon(3, 0, 4, 1)
  const pointContact = polygon(2, 2, 3, 3)
  const border = [
    {
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 2],
          [2, 2],
        ],
      },
    },
  ]
  const rows = protomapsSourceRecords(
    [],
    [
      { geometry: mainland },
      { geometry: island },
      { geometry: pointContact },
      {
        geometry: {
          type: 'MultiPolygon',
          coordinates: [mainland.coordinates, island.coordinates],
        },
      },
    ],
    border,
  )
  expect(rows).toHaveLength(3)
  expect(rows.map(row => row.sourceGeometry)).toContainEqual(island)
  expect(rows.map(row => row.sourceGeometry)).toContainEqual(pointContact)
  expect(rows.map(row => row.sourceGeometry)).toContainEqual({
    type: 'MultiPolygon',
    coordinates: [island.coordinates],
  })
  expect(rows.map(row => row.sourceGeometry)).not.toContainEqual(mainland)
  const unchanged = protomapsSourceRecords([], [{ geometry: island }], border)
  expect(rows.find(row => row.sourceGeometry === island)?.sourceRecordId).toBe(
    unchanged[0]!.sourceRecordId,
  )
})

test('island extraction refuses missing or invalid land-border evidence', () => {
  expect(() => protomapsSourceRecords([], [{ geometry }], [])).toThrow(
    'requires the regional land border',
  )
  expect(() => protomapsSourceRecords([], [], [{ geometry }])).toThrow(
    'must contain lines',
  )
})

test('mixed coastline components are retained once and island membership references their original indexes', () => {
  const mixed = {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ],
      ],
      [
        [
          [3, 0],
          [4, 0],
          [4, 1],
          [3, 1],
          [3, 0],
        ],
      ],
    ],
  }
  const border = [
    {
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 2],
          [2, 2],
        ],
      },
    },
  ]
  const bundle = protomapsSourceBundle([], [{ geometry: mixed }], border)
  expect(bundle.records).toHaveLength(1)
  expect(bundle.records[0]!.sourceGeometry).toBe(mixed)
  expect(bundle.islandSelections).toEqual([
    { sourceRecordId: bundle.records[0]!.sourceRecordId, componentIndexes: [1] },
  ])
  expect(JSON.stringify(bundle.islandSelections)).not.toContain('coordinates')
  const islands = protomapsSourceRecords([], [{ geometry: mixed }], border)
  expect(islands[0]!.sourceRecordId).toBe(bundle.records[0]!.sourceRecordId)
  expect(islands[0]!.sourceGeometry).toEqual({
    type: 'MultiPolygon',
    coordinates: [mixed.coordinates[1]],
  })
})
