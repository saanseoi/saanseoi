import { expect, test } from 'bun:test'
import { curatedRecordSources } from '@repo/core/pipeline/services/sources/curatedRecordSources'
import {
  buildAdministrativeAreas,
  partitionAdministrativeArea,
} from './administrativeAreas'
import { assembleCuratedDivisions } from './assemble'
import { applyCuratedAreaContract } from './recordContract'
const rectangle = (x: number, y: number, w = 1, h = 1) => ({
  type: 'Polygon',
  coordinates: [
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
      [x, y],
    ],
  ],
})
const native = (id: string, geometry: unknown) => ({
  sourceRecordId: `area:${id}`,
  properties: { divisionId: id, isTerritorial: true },
  sourceGeometry: geometry,
})
const input = {
  divisions: [{ id: 'sar', class: 'sar' }],
  names: [],
  overture: [
    native('sar', {
      type: 'MultiPolygon',
      coordinates: [rectangle(0, 0, 2, 2).coordinates, rectangle(4, 0).coordinates],
    }),
  ],
  land: [
    {
      sourceRecordId: 'coast',
      properties: { kind: 'coastline-land' },
      sourceGeometry: rectangle(-1, -1, 7, 2),
    },
  ],
  overtureRelease: 'overture-pinned',
  landRelease: 'protomaps-pinned',
}
test('territory and land retain disconnected components and exact ingredient provenance', () => {
  const rows = buildAdministrativeAreas(input)
  const territorial = rows.find(r => r.isTerritorial)!,
    land = rows.find(r => r.isLand)!
  expect(JSON.parse(territorial.geometry).coordinates).toHaveLength(2)
  expect(JSON.parse(land.geometry).coordinates).toHaveLength(2)
  expect(JSON.parse(territorial.bbox)).toEqual([0, 0, 5, 2])
  expect(JSON.parse(land.bbox)).toEqual([0, 0, 5, 1])
  expect(JSON.parse(land.sources).protomaps[0]).toMatchObject({
    record_id: 'coast',
    dataset: 'ds-hk-protomaps-island',
    contributions: ['land-mask'],
  })
  expect(JSON.parse(territorial.sources).protomaps).toBeUndefined()
  expect(territorial.identifiers).toBeNull()
  expect(land.identifiers).toBeNull()
  expect(JSON.parse(territorial.sources).saanseoi[0].method).toBe(
    'overture-territorial',
  )
  expect(JSON.parse(land.sources).saanseoi[0].method).toBe(
    'intersect-territory-with-coastline-land',
  )
  expect(territorial.id).not.toBe(land.id)
  expect(buildAdministrativeAreas(input)).toEqual(rows)
  applyCuratedAreaContract(rows)
  for (const row of rows)
    expect(
      curatedRecordSources(row.sources, row.id).some(
        source => source.publisher === 'saanseoi',
      ),
    ).toBe(false)
})
test('Area territories are unions of every constituent Overture district', () => {
  const names = [
    'Yau Tsim Mong District',
    'Sham Shui Po District',
    'Kowloon City District',
    'Wong Tai Sin District',
    'Kwun Tong District',
  ]
  const rows = buildAdministrativeAreas({
    ...input,
    divisions: [
      { id: 'kowloon', class: 'area' },
      ...names.map((_, i) => ({ id: String(i), class: 'district' })),
    ],
    names: [
      { divisionId: 'kowloon', locale: 'en', name: 'Kowloon' },
      ...names.map((name, i) => ({ divisionId: String(i), locale: 'en', name })),
    ],
    overture: names.map((_, i) => native(String(i), rectangle(i, 0))),
  })
  const area = rows.find(r => r.divisionId === 'kowloon' && r.isTerritorial)!
  expect(JSON.parse(area.bbox)).toEqual([0, 0, 5, 1])
  expect(JSON.parse(area.sources).overture).toHaveLength(5)
})
test('missing territorial inputs or coastline masks fail rather than using editor shapes', () => {
  expect(() => buildAdministrativeAreas({ ...input, overture: [] })).toThrow(
    'Missing Overture territorial',
  )
  expect(() => buildAdministrativeAreas({ ...input, land: [] })).toThrow(
    'no coastline land mask',
  )
})
test('administrative editor estimatedAreas cannot replace either generated representation', () => {
  const administrativeAreas = buildAdministrativeAreas(input)
  const result = assembleCuratedDivisions({
    divisions: input.divisions,
    names: [],
    areas: [],
    administrativeAreas,
    hierarchy: { entries: [] },
    estimatedAreas: {
      features: [{ properties: { divisionId: 'sar' }, geometry: rectangle(50, 50) }],
    },
    islands: [],
  })
  expect(result.areas).toHaveLength(2)
  expect(result.areas.map(r => r.geometry)).toEqual(
    administrativeAreas.map(r => r.geometry),
  )
})

test('territorial land flags remain independent of the derived land-only representation', () => {
  const rows = buildAdministrativeAreas({
    ...input,
    overture: input.overture.map(row => ({
      ...row,
      properties: { ...row.properties, isLand: true },
    })),
  })
  expect(rows.find(row => row.isTerritorial)).toMatchObject({
    type: 'mixed',
    isLand: 1,
    isTerritorial: 1,
  })
  expect(rows.find(row => !row.isTerritorial)).toMatchObject({
    type: 'land',
    isLand: 1,
    isTerritorial: 0,
  })
})

test('storage partitioning preserves every polygon and hole without simplification', () => {
  const coordinates = Array.from(
    { length: 8 },
    (_, index) => rectangle(index * 2, 0).coordinates,
  )
  coordinates[0]!.push(rectangle(0.2, 0.2, 0.2, 0.2).coordinates[0]!.slice().reverse())
  const geometry = { type: 'MultiPolygon', coordinates }
  const row = {
    id: 'original',
    divisionId: 'sar',
    geometry: JSON.stringify(geometry),
    identifiers: '{}',
    isLand: 1,
    isTerritorial: 0,
  }
  const parts = partitionAdministrativeArea(row, 250)
  expect(parts.length).toBeGreaterThan(1)
  expect(parts.flatMap(part => JSON.parse(part.geometry).coordinates)).toEqual(
    coordinates,
  )
  expect(parts.every(part => Buffer.byteLength(part.geometry) <= 250)).toBe(true)
  expect(new Set(parts.map(part => part.id)).size).toBe(parts.length)
  for (const [index, part] of parts.entries()) {
    expect(part.identifiers).toBe('{}')
    expect(JSON.parse(part.sources).saanseoi[0]).toMatchObject({
      method: 'existing-polygon-components',
      geometryPartition: { of: row.id, part: index + 1, count: parts.length },
    })
  }
  expect(partitionAdministrativeArea(row, 250)).toEqual(parts)
  applyCuratedAreaContract(parts)
  for (const part of parts)
    expect(curatedRecordSources(part.sources, part.id)).toEqual([])
})
