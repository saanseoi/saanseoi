import { describe, expect, test } from 'bun:test'

import {
  hashDivisionGeometryRow,
  hashDivisionGeometrySourceRow,
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
  test('source fingerprints retain envelope metadata and the established serialised field key', async () => {
    const source = {
      properties: { name: ' Original ' },
      sourceGeometry: null,
      sourceRecordId: 'record',
      sourceLocator: null,
      derivation: null,
    }
    const hash = await hashDivisionGeometrySourceRow(source)
    expect(hash).toBe(
      '88bb9a74535773540154b76fa4c1b18b00970d478ce7c39ec37dc69aa07c7506',
    )
    expect(
      await hashDivisionGeometrySourceRow({ ...source, sourceRecordId: 'other' }),
    ).not.toBe(hash)
    expect(
      await hashDivisionGeometrySourceRow({
        ...source,
        properties: { name: 'Changed upstream' },
      }),
    ).not.toBe(hash)
  })

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

  test('validates a detailed non-intersecting ring', () => {
    const segments = 2048
    const ring = Array.from({ length: segments }, (_, index) => {
      const angle = (index / segments) * Math.PI * 2
      return [Math.cos(angle), Math.sin(angle)]
    })
    ring.push(ring[0] as [number, number])

    expect(() =>
      normaliseDivisionAreaGeometryRow(
        {
          class: 'land',
          division_id: 'division-1',
          geometry: { coordinates: [ring], type: 'Polygon' },
          id: 'detailed-area',
          is_land: true,
          is_territorial: false,
        },
        'overture',
        { validateGeometry: true },
      ),
    ).not.toThrow()
  })

  test('accepts a valid ring with a consecutive duplicate position', () => {
    expect(() =>
      normaliseDivisionAreaGeometryRow(
        {
          class: 'land',
          division_id: 'division-1',
          geometry: {
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0],
              ],
            ],
            type: 'Polygon',
          },
          id: 'duplicate-position-area',
          is_land: true,
          is_territorial: false,
        },
        'overture',
        { validateGeometry: true },
      ),
    ).not.toThrow()
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

    expect(normalised.source.sourceRecordId).toBe('area-1')
    expect(normalised.canonical.id).toBe('area-1')
    expect(normalised.canonical.type).toBe('mixed')
    expect(normalised.canonical.isLand).toBe(true)
    expect(normalised.canonical.isTerritorial).toBe(true)
    expect(normalised.canonical.bbox).toEqual([0, 0, 1, 1])
    expect(normalised.canonical.geometry).toEqual(polygon)
    expect(normalised.source).not.toHaveProperty('bbox')
    expect(normalised.source).not.toHaveProperty('geometry')
    for (const field of ['isLand', 'isTerritorial', 'subtype', 'class']) {
      expect(normalised.source).not.toHaveProperty(field)
    }
    expect<unknown>(normalised.source.sourceGeometry).toEqual(polygon)
    expect(normalised.source.properties).not.toHaveProperty('geometry')
    expect(normalised.source.properties).toHaveProperty('sources', [])
    expect(normalised.source.properties).not.toHaveProperty('id')
    expect(normalised.source.properties).toMatchObject({
      bbox: [99, 99, 100, 100],
      class: 'land',
    })
    expect(
      (normalised.source.properties as Record<string, unknown>).isTerritorial,
    ).toBe(true)
  })

  test.each(['Polygon', 'MultiPolygon'] as const)(
    'omits embedded bbox from canonical %s without changing source evidence or shape hashes',
    async type => {
      const shape = {
        type,
        coordinates: type === 'Polygon' ? polygon.coordinates : [polygon.coordinates],
      }
      const inputGeometry = Object.freeze({ ...shape, bbox: [0.1, 0.1, 0.9, 0.9] })
      const row = {
        class: 'land',
        division_id: 'division-1',
        geometry: inputGeometry,
        id: 'area-1',
      }
      const normalised = normaliseDivisionAreaGeometryRow(row)
      const withoutBbox = normaliseDivisionAreaGeometryRow({ ...row, geometry: shape })
      if (!normalised || !withoutBbox) throw new Error('Expected area rows.')

      expect(normalised.canonical.geometry).toEqual(shape)
      expect(normalised.canonical.bbox).toEqual([0, 0, 1, 1])
      expect(normalised.source.sourceGeometry).toEqual(inputGeometry)
      expect(inputGeometry.bbox).toEqual([0.1, 0.1, 0.9, 0.9])
      expect(await hashDivisionGeometryRow(normalised.canonical)).toBe(
        await hashDivisionGeometryRow(withoutBbox.canonical),
      )
      expect(await hashDivisionGeometrySourceRow(normalised.source)).not.toBe(
        await hashDivisionGeometrySourceRow(withoutBbox.source),
      )
    },
  )

  test.each(['LineString', 'MultiLineString'] as const)(
    'omits embedded bbox from canonical %s while retaining the source geometry',
    type => {
      const line = [
        [0, 0],
        [1, 1],
      ]
      const shape = { type, coordinates: type === 'LineString' ? line : [line] }
      const inputGeometry = Object.freeze({ ...shape, bbox: [0.1, 0.1, 0.9, 0.9] })
      const normalised = normaliseDivisionBoundaryGeometryRow({
        class: 'land',
        division_ids: ['left', 'right'],
        geometry: inputGeometry,
        id: 'boundary-1',
      })
      if (!normalised) throw new Error('Expected a boundary row.')

      expect(normalised.canonical.geometry).toEqual(shape)
      expect(normalised.canonical.bbox).toEqual([0, 0, 1, 1])
      expect(normalised.source.sourceGeometry).toEqual(inputGeometry)
      expect(inputGeometry.bbox).toEqual([0.1, 0.1, 0.9, 0.9])
    },
  )

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
        source_geometry: polygon,
        source_properties: {
          AREA_CODE: 'CW',
          AREA_ID: 'A',
          AREA_TYPE: 'District',
          CSDI_ADMIN_AREA_ID: 42,
          OBJECTID: 7,
        },
      },
      'hkgov-had',
    )
    if (!normalised) throw new Error('Expected a HAD area row.')

    expect(normalised.source.sourceRecordId).toBe('7')
    expect(normalised.canonical.id).toBe('HAD:A')
    expect(normalised.canonical.type).toBe('mixed')
    expect(normalised.canonical.isLand).toBe(true)
    expect(normalised.canonical.isTerritorial).toBe(true)
    expect(normalised.canonical.identifiers).toEqual({
      hkgov: {
        objectId: 7,
        cdsiAdminAreaId: 42,
        areaId: 'A',
        areaCode: 'CW',
      },
    })
    expect((normalised.source.properties as Record<string, unknown>).areaCode).toBe(
      'CW',
    )
    expect(normalised.source.properties).not.toHaveProperty('theme')
    expect(normalised.source.properties).not.toHaveProperty('source_feature')
    expect(normalised.source.sourceLocator).toBeNull()
    expect(normalised.source.sourceGeometry).toMatchObject(polygon)
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
        source_geometry: polygon,
        source_properties: {
          dc: 11,
          dc_chi: '中西區',
          dc_class: 'A',
          dc_eng: 'Central and Western',
        },
        sources: [{ dataset: 'hkgov-censtatd', districtClass: 'A' }],
      },
      'hkgov-censtatd',
      { variant: 'hkgov-censtatd:simplified' },
    )
    if (!normalised) throw new Error('Expected a C&SD display area row.')

    expect(normalised.canonical.variant).toBe('hkgov-censtatd:simplified')
    expect(normalised.canonical.identifiers).toEqual({
      hkgovCenstatd: {
        class: 'A',
        code: 11,
      },
    })
    expect(normalised.canonical.sources).toEqual({
      hkgovCenstatd: [{ dataset: 'hkgov-censtatd', districtClass: 'A' }],
    })
    expect(normalised.source.properties).toEqual({
      dc: 11,
      dcZhHant: '中西區',
      dcClass: 'A',
      dcEn: 'Central and Western',
    })
    expect(normalised.source.derivation).toEqual({
      method: 'topology-preserving-simplification',
      toleranceMetres: 10,
    })
  })

  test('keeps a New Town area attached to its cohort-scoped planning division', () => {
    const inputGeometry = Object.freeze({ ...polygon, bbox: [0.1, 0.1, 0.9, 0.9] })
    const normalised = normaliseDivisionAreaGeometryRow(
      {
        division_id: 'b3a5b954-9d05-5aa5-bd74-ee2b0c2824e2',
        geometry: inputGeometry,
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
    expect(normalised.canonical.identifiers).toEqual({
      hkgovPlandNewTown: { id: 'tseung-kwan-o' },
    })
    expect(normalised.canonical.geometry).toEqual(polygon)
    expect(normalised.canonical.bbox).toEqual([0, 0, 1, 1])
    expect(normalised.source.properties).toHaveProperty('geometry', inputGeometry)
    expect(inputGeometry.bbox).toEqual([0.1, 0.1, 0.9, 0.9])
  })

  test('retains the complete Overture boundary source row in properties', () => {
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
      (normalised.source.properties as Record<string, unknown>).isTerritorial,
    ).toBe(true)
    expect(
      (normalised.source.properties as Record<string, unknown>).divisionIds,
    ).toEqual(['division-1', 'division-2'])
  })
})

test('Overture boundaries retain native WKB separately from canonical line coordinates', () => {
  const bytes = Buffer.alloc(41)
  bytes.writeUInt8(1, 0)
  bytes.writeUInt32LE(2, 1)
  bytes.writeUInt32LE(2, 5)
  bytes.writeDoubleLE(114, 9)
  bytes.writeDoubleLE(22, 17)
  bytes.writeDoubleLE(115, 25)
  bytes.writeDoubleLE(23, 33)
  const result = normaliseDivisionBoundaryGeometryRow({
    id: 'native-boundary',
    division_ids: ['a', 'b'],
    class: 'land',
    is_land: true,
    geometry: bytes,
  })
  expect(result?.source.sourceGeometry).toEqual({
    encoding: 'wkb-base64',
    data: bytes.toString('base64'),
  })
  expect(result?.canonical.geometry).toEqual({
    type: 'LineString',
    coordinates: [
      [114, 22],
      [115, 23],
    ],
  })
})
