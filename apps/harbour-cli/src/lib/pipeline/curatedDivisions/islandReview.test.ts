import { expect, test } from 'bun:test'
import { classifyIslandArea } from '@repo/db'
import { containsReviewPoint } from '@repo/core/pipeline/services/divisions/geographicReview'
import type { Polygon, MultiPolygon } from 'geojson'
import islands from '../../../../../../fixtures/divisions/hk/island-areas.json'
import hierarchy from '../../../../../../fixtures/divisions/hk/geographic-hierarchy-patch.json'

test('the upstream tied-island outline includes Ma Shi Chau and excludes mainland Kowloon', () => {
  const island = islands.find(row => row.id === 'LANDSD:PLACE_NAME:1030')!
  const geometry = island.geometry as Polygon | MultiPolygon
  expect(containsReviewPoint([114.22984244758044, 22.45445184267817], geometry)).toBe(
    true,
  )
  expect(containsReviewPoint([114.1989697, 22.3359905], geometry)).toBe(false)
  for (const entry of hierarchy.entries) {
    if (!entry.point || containsReviewPoint(entry.point, geometry)) continue
    expect(
      Object.values(entry.hierarchies)
        .flat(2)
        .some(parent => parent.id === island.id),
    ).toBe(false)
  }
})

test('reviewed island hierarchy classes agree with land area thresholds', () => {
  const classes = new Map(
    islands
      .filter(island => island.areaKm2 > 0)
      .map(island => [island.id, classifyIslandArea(island.areaKm2)]),
  )
  for (const entry of hierarchy.entries) {
    if (classes.has(entry.divisionId))
      expect(entry.expectedClass).toBe(classes.get(entry.divisionId)!)
    for (const parent of Object.values(entry.hierarchies).flat(2))
      if (classes.has(parent.id)) expect(parent.class).toBe(classes.get(parent.id)!)
  }
})

test('current policy accepts 254 canonical islands and drops both point-only candidates', async () => {
  const { curateIslands, assertIslandCurationReady } = await import(
    '../islands/islandCuration'
  )
  const { default: review } = await import(
    '../../../../../../fixtures/meta/curations/saanseoi-island-review.json'
  )
  const result = curateIslands(islands as any, review as any)
  expect(() => assertIslandCurationReady(result)).not.toThrow()
  expect(result.islands).toHaveLength(254)
  const accepted = new Set(result.islands.map(row => row.id))
  expect(accepted.has('BASEMAP:ISLAND:266c51869482fb83')).toBe(false)
  expect(accepted.has('BASEMAP:ISLAND:20b1ab86f2fddb31')).toBe(false)
  for (const island of islands.filter(row => accepted.has(row.id)))
    expect(island.areaKm2).toBeGreaterThan(0)
})

test('unknown and invalid land areas cannot silently become a size class', () => {
  for (const area of [0, -1, NaN, Infinity])
    expect(() => classifyIslandArea(area)).toThrow('finite, positive')
})

integration(
  'Bun Sha Pui receives an interior label rather than a bounding-box midpoint',
  () => {
    const island = islands.find(row => row.name === 'Bun Sha Pui')!
    expect(island).toBeDefined()
    expect(
      containsReviewPoint(island.point, island.geometry as Polygon | MultiPolygon),
    ).toBe(true)
    const bounds = island.bounds!
    expect(island.point).not.toEqual([
      (bounds[0]! + bounds[2]!) / 2,
      (bounds[1]! + bounds[3]!) / 2,
    ])
  },
)
