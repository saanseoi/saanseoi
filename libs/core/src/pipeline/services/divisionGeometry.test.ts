import { describe, expect, test } from 'bun:test'

import {
  normalizeDivisionAreaGeometryRow,
  normalizeDivisionBoundaryGeometryRow,
} from './divisionGeometry'

const polygon = {
  type: 'Polygon' as const,
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

describe('division geometry normalization', () => {
  test('only performs expensive topology validation when requested', () => {
    const selfIntersectingPolygon = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [0, 4],
          [4, 4],
          [3, 5],
          [0, 0],
        ],
      ],
    }
    const row = {
      class: 'land',
      division_id: 'division-1',
      geometry: selfIntersectingPolygon,
      id: 'area-1',
      is_land: true,
      is_territorial: false,
    }

    expect(normalizeDivisionAreaGeometryRow(row)).not.toBeNull()
    expect(() =>
      normalizeDivisionAreaGeometryRow(row, 'overture', {
        validateGeometry: true,
      }),
    ).toThrow('contains a self-intersecting ring')
  })

  test('derives mixed Overture type from both land and territorial flags', () => {
    const normalized = normalizeDivisionAreaGeometryRow({
      bbox: [0, 0, 1, 1],
      class: 'land',
      division_id: 'division-1',
      geometry: polygon,
      id: 'area-1',
      is_land: true,
      is_territorial: true,
      sources: [],
    })
    if (!normalized) throw new Error('Expected an Overture area row.')

    expect(normalized.canonical.type).toBe('mixed')
    expect(normalized.canonical.isLand).toBe(true)
    expect(normalized.canonical.isTerritorial).toBe(true)
    expect(
      (normalized.source.rawProperties as Record<string, unknown>).is_territorial,
    ).toBe(true)
  })

  test('uses mixed type and explicit flags for HAD district areas', () => {
    const normalized = normalizeDivisionAreaGeometryRow(
      {
        area_type: 'District',
        area_id: 'A',
        area_code: 'CW',
        csdi_admin_area_id: 42,
        division_id: 'division-1',
        geometry: polygon,
        id: 'HAD:A',
        object_id: 7,
      },
      'hkgov-had',
    )
    if (!normalized) throw new Error('Expected a HAD area row.')

    expect(normalized.canonical.type).toBe('mixed')
    expect(normalized.canonical.isLand).toBe(true)
    expect(normalized.canonical.isTerritorial).toBe(true)
    expect(normalized.canonical.sourceKeys).toEqual({
      hkgov: {
        objectId: 7,
        cdsiAdminAreaId: 42,
        areaType: 'District',
        areaId: 'A',
        areaCode: 'CW',
      },
    })
    expect((normalized.source.rawProperties as Record<string, unknown>).area_code).toBe(
      'CW',
    )
  })

  test('retains the complete Overture boundary source row in rawProperties', () => {
    const normalized = normalizeDivisionBoundaryGeometryRow({
      class: 'maritime',
      division_ids: ['division-1', 'division-2'],
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
      id: 'boundary-1',
      is_land: true,
      is_territorial: true,
      perspectives: null,
    })
    if (!normalized) throw new Error('Expected an Overture boundary row.')

    expect(normalized.canonical.type).toBe('mixed')
    expect(
      (normalized.source.rawProperties as Record<string, unknown>).is_territorial,
    ).toBe(true)
    expect(
      (normalized.source.rawProperties as Record<string, unknown>).division_ids,
    ).toEqual(['division-1', 'division-2'])
  })
})
