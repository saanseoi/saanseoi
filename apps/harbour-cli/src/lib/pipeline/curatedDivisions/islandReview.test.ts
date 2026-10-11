import { expect, test } from 'bun:test'
import { classifyIslandArea } from '@repo/db'
import { containsReviewPoint } from '@repo/core/pipeline/services/divisions/geographicReview'
import type { Polygon, MultiPolygon } from 'geojson'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadDivisionReviewInputs } from './reviewInputs'
import { divisionCuration } from '@repo/core/pipeline/services/divisions/curationInventory'
const root = resolve(import.meta.dir, '../../../../../..')
// Real-publisher integration checks require the retained archive cache. Unit tests use synthetic inputs.
const available = existsSync(
  resolve(
    root,
    '.local/division-review/archives/17e1ee223e0d0c5705c83e2e1b697bf123ab9b3aa55e38d6cb6597eb30357cb0',
  ),
)
const inputs = available ? await loadDivisionReviewInputs({ root }) : null
const islands = inputs?.islands ?? []
const hierarchy = inputs?.hierarchy ?? { entries: [] }
const integration = test.skipIf(!available)
integration(
  'the upstream tied-island outline includes Ma Shi Chau and excludes mainland Kowloon',
  () => {
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
  },
)

integration('curated island hierarchy classes agree with land area thresholds', () => {
  const classes = new Map(
    islands
      .filter(island => (island.areaKm2 ?? 0) > 0)
      .map(island => [
        island.id,
        divisionCuration.classifications.entries.find(
          row => row.divisionId === island.id,
        )?.class ?? classifyIslandArea(island.areaKm2!),
      ]),
  )
  for (const entry of hierarchy.entries) {
    if (classes.has(entry.divisionId))
      expect(entry.expectedClass).toBe(classes.get(entry.divisionId)!)
    for (const parent of Object.values(entry.hierarchies).flat(2))
      if (classes.has(parent.id)) expect(parent.class).toBe(classes.get(parent.id)!)
  }
})

integration(
  'current policy accepts 257 canonical islands and drops both point-only candidates',
  async () => {
    const { curateIslands, assertIslandCurationReady } = await import(
      '../islands/islandCuration'
    )
    const review = inputs!.islandReview
    const result = curateIslands(islands as any, review as any)
    expect(() => assertIslandCurationReady(result)).not.toThrow()
    expect(result.islands).toHaveLength(257)
    const accepted = new Set(result.islands.map(row => row.id))
    expect(accepted.has('BASEMAP:ISLAND:266c51869482fb83')).toBe(false)
    expect(accepted.has('BASEMAP:ISLAND:20b1ab86f2fddb31')).toBe(false)
    for (const island of islands.filter(row => accepted.has(row.id)))
      expect(island.areaKm2).toBeGreaterThan(0)
  },
)

test('unknown and invalid land areas cannot silently become a size class', () => {
  for (const area of [0, -1, NaN, Infinity])
    expect(() => classifyIslandArea(area)).toThrow('finite, positive')
})

integration(
  'editor geometry candidates retain usable bounds from their pinned source',
  () => {
    for (const island of islands)
      for (const option of island.geometryOptions ?? []) {
        expect(option.bounds).toHaveLength(4)
        expect(option.bounds!.every(Number.isFinite)).toBe(true)
        expect(option.bounds![0]).toBeLessThanOrEqual(option.bounds![2]!)
        expect(option.bounds![1]).toBeLessThanOrEqual(option.bounds![3]!)
      }
  },
)

integration(
  'Bun Sha Pui receives an interior label rather than a bounding-box midpoint',
  () => {
    const island = islands.find(row => row.name === 'Bun Sha Pui')!
    expect(island).toBeDefined()
    const point = island.point
    if (!point) throw new Error('Bun Sha Pui requires a representative point.')
    expect(containsReviewPoint(point, island.geometry as Polygon | MultiPolygon)).toBe(
      true,
    )
    const bounds = island.bounds
    if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite))
      throw new Error('Bun Sha Pui requires finite bounding coordinates.')
    expect(point).not.toEqual([
      (bounds[0]! + bounds[2]!) / 2,
      (bounds[1]! + bounds[3]!) / 2,
    ])
  },
)
