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
  test('excludes Guangdong rows from HK area and boundary extracts', () => {
    expect(
      normalizeDivisionAreaGeometryRow({
        division_id: 'guangdong',
        id: 'guangdong-area',
        region: 'CN-GD',
      }),
    ).toBeNull()
    expect(
      normalizeDivisionBoundaryGeometryRow({
        division_ids: ['guangdong-1', 'guangdong-2'],
        id: 'guangdong-boundary',
        region: 'CN-GD',
      }),
    ).toBeNull()
  })

  test('rejects PRC areas but retains boundaries that reference the PRC anchor', () => {
    const prcId = 'fb68fc73-3ac6-41c9-a692-22fcf20cb5be'
    expect(
      normalizeDivisionAreaGeometryRow({
        division_id: prcId,
        geometry: polygon,
        id: 'prc-area',
      }),
    ).toBeNull()
    const boundary = normalizeDivisionBoundaryGeometryRow({
      class: 'land',
      division_ids: [prcId, 'hk'],
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
      id: 'prc-boundary',
      is_land: true,
    })
    expect(boundary?.canonical.leftDivisionId).toBe(prcId)
    expect(boundary?.canonical.rightDivisionId).toBe('hk')
  })

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

  test('keeps C&SD district metadata and the derived display provenance distinct', () => {
    const normalized = normalizeDivisionAreaGeometryRow(
      {
        census_year: '2021',
        derivation: {
          method: 'topology-preserving-simplification',
          toleranceMetres: 10,
        },
        district_class: 'A',
        district_code: 11,
        division_id: 'division-1',
        geometry: polygon,
        id: 'CENSTATD:simplified:2021:A',
        sources: [
          { dataset: 'hkgov-censtatd', transform: 'simplified', districtClass: 'A' },
        ],
      },
      'hkgov-censtatd',
      { variant: 'hkgov-censtatd:simplified' },
    )
    if (!normalized) throw new Error('Expected a C&SD display area row.')

    expect(normalized.canonical.variant).toBe('hkgov-censtatd:simplified')
    expect(normalized.canonical.sourceKeys).toEqual({
      hkgovCenstatd: {
        class: 'A',
        code: 11,
      },
    })
    expect(normalized.canonical.sources).toEqual({
      hkgovCenstatd: [
        { dataset: 'hkgov-censtatd', transform: 'simplified', districtClass: 'A' },
      ],
    })
  })

  test('keeps a New Town area attached to its cohort-scoped planning division', () => {
    const normalized = normalizeDivisionAreaGeometryRow(
      {
        division_id: 'b3a5b954-9d05-5aa5-bd74-ee2b0c2824e2',
        geometry: polygon,
        id: 'PLAND:NEWTOWN:b3a5b954-9d05-5aa5-bd74-ee2b0c2824e2',
        identifiers: { 'PLAND:NEWTOWN': 'tseung-kwan-o' },
        newtown_id: 'tseung-kwan-o',
        sources: [{ dataset: 'hkgov-pland-new-town' }],
      },
      'hkgov-pland-new-town',
    )
    if (!normalized) throw new Error('Expected a New Town area row.')

    expect(normalized.canonical.divisionId).toBe('b3a5b954-9d05-5aa5-bd74-ee2b0c2824e2')
    expect(normalized.canonical.variant).toBe('hkgov-pland-new-town')
    expect(normalized.canonical.sourceKeys).toEqual({
      hkgovPlandNewTown: { id: 'tseung-kwan-o', name: 'tseung-kwan-o' },
    })
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
