import { expect, test } from 'bun:test'
import { assembleCuratedDivisions } from './assemble'
import { applyCuratedAreaContract } from './recordContract'
import { curateIslands, type IslandInventoryEntry } from '../islands/islandCuration'

const geometry = {
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
const island: IslandInventoryEntry = {
  id: 'selected-island',
  name: 'Selected island',
  areaKm2: 1,
  geometry,
  geometrySource: { sourceRecordId: 'PROTOMAPS:LAND:selected', componentIndexes: [2] },
  protomapsFeatureId: 'PROTOMAPS:LAND:selected',
}
const input = {
  divisions: [],
  names: [],
  areas: [],
  hierarchy: { entries: [] },
  estimatedAreas: { features: [] },
  islands: [island],
}

test('assembly retains the chosen source and component indexes without coordinate matching', () => {
  const result = assembleCuratedDivisions(input)
  applyCuratedAreaContract(result.areas)
  expect(result.areas[0]!.sources.protomaps).toEqual([
    {
      dataset: 'ds-hk-protomaps-island',
      recordId: 'PROTOMAPS:LAND:selected',
      contributions: ['geometry'],
      componentIndexes: [2],
    },
  ])
  expect(result.areas[0]!.sources.saanseoi[0].contributions).toEqual(['selection'])
  expect(JSON.parse(result.areas[0]!.geometry)).toEqual(geometry)
})

test('an authored drawing gets no inferred source even when its coordinates are identical', () => {
  const result = assembleCuratedDivisions({
    ...input,
    estimatedAreas: { features: [{ properties: { divisionId: island.id }, geometry }] },
  })
  applyCuratedAreaContract(result.areas)
  expect(result.areas[0]!.sources.protomaps).toBeUndefined()
  expect(result.areas[0]!.sources.saanseoi[0].contributions).toEqual(['geometry'])
})

test('named option corrections carry the option source through review and assembly', () => {
  const option = {
    ...island,
    geometryOptions: [
      {
        geometry,
        geometrySource: { sourceRecordId: 'OSM:a42' },
        sourceTags: { place: 'island' },
      },
    ],
  }
  const review = {
    curationPolicy: {
      version: 1,
      aliasGroups: [],
      actions: [
        {
          id: island.id,
          action: 'geometry-correction' as const,
          operation: 'use-named-basemap-geometry',
        },
      ],
    },
    entries: [{ ...option, decision: 'accepted' }],
  }
  const result = assembleCuratedDivisions({
    ...input,
    islands: [option],
    islandReview: review,
  })
  applyCuratedAreaContract(result.areas)
  expect(result.areas[0]!.sources.protomaps[0].recordId).toBe('OSM:a42')
  expect(result.areas[0]!.sources.protomaps[0].componentIndexes).toBeUndefined()
})

test('authored corrections clear selected geometry provenance even for identical coordinates', () => {
  const review = {
    curationPolicy: {
      version: 1,
      aliasGroups: [],
      actions: [{ id: island.id, action: 'geometry-correction' as const, geometry }],
    },
    entries: [{ ...island, decision: 'accepted' }],
  }
  expect(curateIslands([island], review).islands[0]!.geometrySource).toBeUndefined()
  const result = assembleCuratedDivisions({ ...input, islandReview: review })
  applyCuratedAreaContract(result.areas)
  expect(result.areas[0]!.sources.protomaps).toBeUndefined()
  expect(result.areas[0]!.sources.saanseoi[0].contributions).toEqual(['geometry'])
})
