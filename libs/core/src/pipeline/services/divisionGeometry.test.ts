import { describe, expect, test } from 'bun:test'

import {
  normaliseDivisionAreaGeometryRow,
  normaliseDivisionBoundaryGeometryRow,
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

describe('division geometry normalisation', () => {
  test('excludes Guangdong rows from HK area and boundary extracts', () => {
    expect(
      normaliseDivisionAreaGeometryRow({
        division_id: 'guangdong',
        id: 'guangdong-area',
        region: 'CN-GD',
      }),
    ).toBeNull()
    expect(
      normaliseDivisionBoundaryGeometryRow({
        division_ids: ['guangdong-1', 'guangdong-2'],
        id: 'guangdong-boundary',
        region: 'CN-GD',
      }),
    ).toBeNull()
  })

  test('rejects PRC areas but retains boundaries that reference the PRC anchor', () => {
    const prcId = 'fb68fc73-3ac6-41c9-a692-22fcf20cb5be'
    expect(
      normaliseDivisionAreaGeometryRow({
        division_id: prcId,
        geometry: polygon,
        id: 'prc-area',
      }),
    ).toBeNull()
    const boundary = normaliseDivisionBoundaryGeometryRow({
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

    expect(normaliseDivisionAreaGeometryRow(row)).not.toBeNull()
    expect(() =>
      normaliseDivisionAreaGeometryRow(row, 'overture', {
        validateGeometry: true,
      }),
    ).toThrow('contains a self-intersecting ring')
  })

  test('derives mixed Overture type and bbox from geometry rather than input metadata', () => {
    const normalised = normaliseDivisionAreaGeometryRow({
      bbox: [99, 99, 100, 100],
      class: 'land',
      division_id: 'division-1',
      geometry: polygon,
      id: 'area-1',
      is_land: true,
      is_territorial: true,
      sources: [],
    })
    if (!normalised) throw new Error('Expected an Overture area row.')

    expect(normalised.canonical.type).toBe('mixed')
    expect(normalised.canonical.isLand).toBe(true)
    expect(normalised.canonical.isTerritorial).toBe(true)
    expect(normalised.canonical.bbox).toEqual([0, 0, 1, 1])
    expect(normalised.source.bbox).toEqual([0, 0, 1, 1])
    expect(
      (normalised.source.rawProperties as Record<string, unknown>).is_territorial,
    ).toBe(true)
  })

  test('uses mixed type and explicit flags for HAD district areas', () => {
    const normalised = normaliseDivisionAreaGeometryRow(
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
    if (!normalised) throw new Error('Expected a HAD area row.')

    expect(normalised.canonical.type).toBe('mixed')
    expect(normalised.canonical.isLand).toBe(true)
    expect(normalised.canonical.isTerritorial).toBe(true)
    expect(normalised.canonical.sourceKeys).toEqual({
      hkgov: {
        objectId: 7,
        cdsiAdminAreaId: 42,
        areaType: 'District',
        areaId: 'A',
        areaCode: 'CW',
      },
    })
    expect((normalised.source.rawProperties as Record<string, unknown>).area_code).toBe(
      'CW',
    )
  })

  test('keeps C&SD district metadata and the derived display provenance distinct', () => {
    const normalised = normaliseDivisionAreaGeometryRow(
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
        id: 'CENSTATD:A',
        sources: [{ dataset: 'hkgov-censtatd', districtClass: 'A' }],
      },
      'hkgov-censtatd',
      { variant: 'hkgov-censtatd:simplified' },
    )
    if (!normalised) throw new Error('Expected a C&SD display area row.')

    expect(normalised.canonical.variant).toBe('hkgov-censtatd:simplified')
    expect(normalised.canonical.sourceKeys).toEqual({
      hkgovCenstatd: {
        class: 'A',
        code: 11,
      },
    })
    expect(normalised.canonical.sources).toEqual({
      hkgovCenstatd: [{ dataset: 'hkgov-censtatd', districtClass: 'A' }],
    })
  })

  test('keeps a New Town area attached to its cohort-scoped planning division', () => {
    const normalised = normaliseDivisionAreaGeometryRow(
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
    if (!normalised) throw new Error('Expected a New Town area row.')

    expect(normalised.canonical.divisionId).toBe('b3a5b954-9d05-5aa5-bd74-ee2b0c2824e2')
    expect(normalised.canonical.variant).toBe('hkgov-pland-new-town')
    expect(normalised.canonical.sourceKeys).toEqual({
      hkgovPlandNewTown: { id: 'tseung-kwan-o', name: 'tseung-kwan-o' },
    })
  })

  test('retains the complete Overture boundary source row in rawProperties', () => {
    const normalised = normaliseDivisionBoundaryGeometryRow({
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
    if (!normalised) throw new Error('Expected an Overture boundary row.')

    expect(normalised.canonical.type).toBe('mixed')
    expect(
      (normalised.source.rawProperties as Record<string, unknown>).is_territorial,
    ).toBe(true)
    expect(
      (normalised.source.rawProperties as Record<string, unknown>).division_ids,
    ).toEqual(['division-1', 'division-2'])
  })
})
