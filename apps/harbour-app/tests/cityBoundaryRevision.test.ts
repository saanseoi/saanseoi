import { expect, test } from 'vitest'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js'
import fixture from '../../../fixtures/meta/curations/saanseoi-division/division-geometry.json'
import type { SaanseoiEstimatedAreas } from '../../../libs/core/src/pipeline/services/divisions/geographicReview'
import {
  CITY_BOUNDARY_IDS,
  revisedCityBoundaries,
} from '../src/tools/division-areas/cityBoundaryRevision'

const seed = { ...fixture, cohort: 'test' } as SaanseoiEstimatedAreas

test('Hong Kong city excludes Tai Long Wan, Cape Collinson and Tai Tam Gap with two land components', () => {
  const reader = new GeoJSONReader(new GeometryFactory())
  const city = seed.features.find(
    f => f.properties.divisionId === CITY_BOUNDARY_IDS[1],
  )!
  for (const id of [
    '931ea57a-8db5-4f9d-9b99-31fadef286c5',
    'ss-d8e22301-6c35-509e-aa53-9c437457891d',
    'ss-e0b47921-ffd5-5ee6-9d70-c29d74b7092e',
  ]) {
    const excluded = seed.features.find(f => f.properties.divisionId === id)!
    expect(
      OverlayOp.intersection(
        reader.read(city.geometry),
        reader.read(excluded.geometry),
      ).getArea(),
    ).toBeLessThan(1e-15)
  }
  expect(city.geometry.type).toBe('MultiPolygon')
  expect(city.geometry.coordinates).toHaveLength(2)
})

test('replaces stale saved cities and preserves unrelated browser drawings and backup input', () => {
  const current = structuredClone(seed)
  for (const feature of current.features) {
    if (CITY_BOUNDARY_IDS.includes(feature.properties.divisionId as never))
      feature.geometry = structuredClone(
        feature.properties.geometryOriginalDrawing as typeof feature.geometry,
      )
    else feature.properties.browserEdit = 'preserve'
  }
  const before = structuredClone(current)
  const next = revisedCityBoundaries(current, seed)
  expect(current).toEqual(before)
  for (const feature of next.features) {
    const id = feature.properties.divisionId
    expect(feature).toEqual(
      (CITY_BOUNDARY_IDS.includes(id as never) ? seed : before).features.find(
        f => f.properties.divisionId === id,
      ),
    )
  }
  expect(next.withheld).toEqual(before.withheld)
  expect(revisedCityBoundaries(next, seed)).toBe(next)
  const hongKong = next.features.find(
    f => f.properties.divisionId === CITY_BOUNDARY_IDS[1],
  )!
  expect(hongKong.geometry.type).toBe('MultiPolygon')
  expect(hongKong.geometry.coordinates).toHaveLength(2)
})

test('does not replace properties on city drawings already using the revised geometry', () => {
  const current = structuredClone(seed)
  current.features.find(
    f => f.properties.divisionId === CITY_BOUNDARY_IDS[0],
  )!.properties.browserEdit = 'preserve'
  expect(revisedCityBoundaries(current, seed)).toBe(current)
})

test('requires both city fixtures before changing saved work', () => {
  expect(() => revisedCityBoundaries(seed, { ...seed, features: [] })).toThrow(
    'Missing revised city boundary',
  )
})

test('the Kowloon-only revision preserves subsequent Hong Kong edits', () => {
  const current = structuredClone(seed)
  for (const feature of current.features.filter(f =>
    CITY_BOUNDARY_IDS.includes(f.properties.divisionId as never),
  ))
    feature.geometry = structuredClone(
      feature.properties.geometryOriginalDrawing as typeof feature.geometry,
    )
  const next = revisedCityBoundaries(current, seed, [CITY_BOUNDARY_IDS[0]])
  expect(
    next.features.find(f => f.properties.divisionId === CITY_BOUNDARY_IDS[1]),
  ).toEqual(
    current.features.find(f => f.properties.divisionId === CITY_BOUNDARY_IDS[1]),
  )
  const reader = new GeoJSONReader(new GeometryFactory())
  const kowloon = reader.read(
    next.features.find(f => f.properties.divisionId === CITY_BOUNDARY_IDS[0])!.geometry,
  )
  for (const id of [
    'd3ec706f-f6f0-414d-9e8b-193e73c90c1c', // Lei Yue Mun
    '33a3a221-2046-4fbd-a85b-4496ea198ff4', // Clear Water Bay
  ]) {
    const rural = reader.read(
      seed.features.find(f => f.properties.divisionId === id)!.geometry,
    )
    expect(OverlayOp.intersection(kowloon, rural).getArea()).toBeLessThan(1e-15)
  }
})
