import { expect, test } from 'bun:test'
import {
  assertIslandCurationReady,
  curateIslands,
  type IslandInventoryEntry,
  type IslandReviewFixture,
} from './islandCuration.ts'

const polygon = (size = 1) => ({
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
})

const entry = (
  id: string,
  name: string,
  overrides: Partial<IslandInventoryEntry> = {},
): IslandInventoryEntry => ({
  id,
  name,
  zh: `${name} 中文`,
  areaKm2: 1,
  geometry: polygon(),
  coverage: 'landsd-gazetteer',
  source: 'LandsD Place Name',
  sourceRelease: '2026-06-10.0',
  ...overrides,
})

test('emits accepted islands and merges aliases with source evidence', () => {
  const canonical = entry('landsd:1', 'Ping Chau')
  const alias = entry('basemap:1', 'Tung Ping Chau', {
    coverage: 'basemap-only',
    source: 'OpenStreetMap',
    sourceRelease: 'refresh-hk-2026-09-01',
  })
  const review: IslandReviewFixture = {
    curationPolicy: {
      version: 1,
      actions: [
        { id: alias.id, action: 'merge' },
        { id: canonical.id, action: 'merge' },
      ],
      aliasGroups: [
        { canonicalId: canonical.id, aliasIds: [alias.id], reason: 'alias' },
      ],
    },
    entries: [
      { ...canonical, decision: 'accepted' },
      { ...alias, decision: 'rejected' },
    ],
  }

  const result = curateIslands([canonical, alias], review)
  expect(result.ready).toBe(true)
  expect(result.islands).toHaveLength(1)
  expect(result.islands[0]?.names.alternativesEn).toEqual(['Tung Ping Chau'])
  expect(result.islands[0]?.sourceProperties.gazetteer.landsdPlaceName).toBe(true)
  expect(result.islands[0]?.sources).toHaveLength(2)
})

test('blocks an uncurated basemap name and geometry gained by a no-geometry candidate', () => {
  const reviewed = entry('basemap:reviewed', 'North Rock', {
    coverage: 'basemap-only',
    geometry: { type: 'Point', coordinates: [114, 22] },
    areaKm2: 0,
  })
  const newName = entry('basemap:new', 'New Rock', { coverage: 'basemap-only' })
  const review: IslandReviewFixture = {
    curationPolicy: {
      version: 1,
      actions: [{ id: reviewed.id, action: 'no-geometry' }],
      aliasGroups: [],
    },
    entries: [{ ...reviewed, decision: 'rejected' }],
  }

  const result = curateIslands([reviewed, newName], review)
  expect(result.uncuratedBasemap).toEqual([{ id: newName.id, name: newName.name }])
  expect(result.gainedGeometry).toEqual([])
  expect(result.ready).toBe(false)

  const polygonised = { ...reviewed, geometry: polygon(), areaKm2: 0.1 }
  const polygonisedResult = curateIslands([polygonised, newName], review)
  expect(polygonisedResult.gainedGeometry).toEqual([
    { id: reviewed.id, name: reviewed.name },
  ])
  expect(() => assertIslandCurationReady(polygonisedResult)).toThrow(
    'geometry appeared',
  )
})

test('requires polygon geometry for every emitted island', () => {
  const candidate = entry('landsd:point', 'Point Island', {
    geometry: { type: 'Point', coordinates: [114, 22] },
  })
  expect(() =>
    curateIslands([candidate], {
      entries: [{ ...candidate, decision: 'accepted' }],
    }),
  ).toThrow('has no polygon geometry')
})

test('selects the single named basemap geometry inside the review radius', () => {
  const locatedPolygon = (longitude: number, latitude: number, size: number) => ({
    type: 'Polygon',
    coordinates: [
      [
        [longitude, latitude],
        [longitude + size, latitude],
        [longitude + size, latitude + size],
        [longitude, latitude + size],
        [longitude, latitude],
      ],
    ],
  })
  const candidate = entry('landsd:tai-chau', 'Tai Chau', {
    point: [114.35, 22.25],
    geometryOptions: [
      {
        geometry: locatedPolygon(114.35, 22.25, 0.001),
        sourceTags: { place: 'islet' },
      },
      {
        geometry: locatedPolygon(114.5, 22.5, 0.001),
        sourceTags: { place: 'islet' },
      },
    ],
  })
  const review: IslandReviewFixture = {
    curationPolicy: {
      version: 1,
      actions: [
        {
          id: candidate.id,
          action: 'geometry-correction',
          operation: 'use-named-basemap-geometry',
          maxDistanceMetres: 500,
        },
      ],
      aliasGroups: [],
    },
    entries: [{ ...candidate, decision: 'rejected' }],
  }

  const result = curateIslands([candidate], review)
  expect(result.ready).toBe(true)
  expect(result.islands[0]?.areaKm2).toBeLessThan(0.02)
})

test('uses a reviewed geometry override and retains reviewed alternative names', () => {
  const candidate = entry('landsd:kiu-tau', 'Kiu Tau', {
    alternativesEn: ['Kiu Tau Teng'],
  })
  const reviewedGeometry = polygon(0.25)
  const review: IslandReviewFixture = {
    curationPolicy: {
      version: 1,
      actions: [
        {
          id: candidate.id,
          action: 'geometry-correction',
          operation: 'retain-kiu-tau-polygons',
          geometry: reviewedGeometry,
        },
      ],
      aliasGroups: [],
    },
    entries: [{ ...candidate, decision: 'rejected' }],
  }

  const result = curateIslands([candidate], review)
  expect(result.ready).toBe(true)
  expect(result.islands[0]?.geometry).toEqual(reviewedGeometry)
  expect(result.islands[0]?.names.alternativesEn).toEqual(['Kiu Tau Teng'])
  expect(result.islands[0]?.sources.at(-1)?.source).toBe('OpenStreetMap coastline')
})
