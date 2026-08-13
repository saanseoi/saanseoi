import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'

import {
  asOptionalInteger,
  createGeometryChurnCounts,
  formatMissingDivisionReferenceRecords,
  geometryBuildUpsertSql,
  MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES,
  shouldCompressCanonicalGeometry,
} from './processLocalDivisionGeometrySqlUpload.ts'
import { normaliseDivisionAreaGeometryRow } from '@repo/core/pipeline/services/divisionGeometry'

describe('formatMissingDivisionReferenceRecords', () => {
  test('prints three complete source records and reports the remainder', () => {
    expect(
      formatMissingDivisionReferenceRecords([
        {
          missingIds: ['division-1'],
          record: { id: 'area-1', division_id: 'division-1' },
        },
        {
          missingIds: ['division-2'],
          record: { id: 'area-2', division_id: 'division-2' },
        },
        {
          missingIds: ['division-3'],
          record: { id: 'area-3', division_id: 'division-3' },
        },
        {
          missingIds: ['division-4'],
          record: { id: 'area-4', division_id: 'division-4' },
        },
      ]),
    ).toEqual([
      '',
      'Affected records:',
      'Record 1 (missing division IDs: division-1):\n{\n  "id": "area-1",\n  "division_id": "division-1"\n}',
      'Record 2 (missing division IDs: division-2):\n{\n  "id": "area-2",\n  "division_id": "division-2"\n}',
      'Record 3 (missing division IDs: division-3):\n{\n  "id": "area-3",\n  "division_id": "division-3"\n}',
      '... and 1 more affected record.',
    ])
  })

  test('limits every diagnostic array to three values', () => {
    expect(
      formatMissingDivisionReferenceRecords([
        {
          missingIds: ['division-1'],
          record: {
            coordinates: [
              [114.1, 22.1],
              [114.2, 22.2],
              [114.3, 22.3],
              [114.4, 22.4],
              [114.5, 22.5],
            ],
            tags: ['one', 'two', 'three', 'four'],
          },
        },
      ]),
    ).toEqual([
      '',
      'Affected record:',
      'Missing division IDs: division-1\n{\n  "coordinates": [\n    [\n      114.1,\n      22.1\n    ],\n    [\n      114.2,\n      22.2\n    ],\n    [\n      114.3,\n      22.3\n    ],\n    "... 2 more"\n  ],\n  "tags": [\n    "one",\n    "two",\n    "three",\n    "... 1 more"\n  ]\n}',
    ])
  })
})

describe('asOptionalInteger', () => {
  test('accepts C&SD integral decimal codes', () => {
    expect(asOptionalInteger('11.00000000')).toBe(11)
  })

  test('rejects non-integral decimal codes', () => {
    expect(asOptionalInteger('11.5')).toBeNull()
  })
})

describe('createGeometryChurnCounts', () => {
  test('treats an independent cohort with no parent snapshot as an all-new baseline', () => {
    const geometry = {
      coordinates: [
        [
          [114.1, 22.2],
          [114.2, 22.2],
          [114.2, 22.3],
          [114.1, 22.2],
        ],
      ],
      type: 'Polygon' as const,
    }
    const row = normaliseDivisionAreaGeometryRow(
      {
        class: 'land',
        division_id: 'district-2016-1',
        geometry,
        id: 'censtatd-2016-1',
        source_geometry: geometry,
        source_properties: {
          dc: '11.00000000',
          dc_chi: '中西區',
          dc_class: 'A',
          dc_eng: 'Central and Western',
        },
      },
      'hkgov-censtatd',
    )
    if (!row) throw new Error('Expected normalised geometry.')

    const churn = createGeometryChurnCounts(
      [row],
      new Map([[row.canonical.id, 'current-hash']]),
      new Map(),
    )

    expect(churn).toMatchObject({
      added: 1,
      changed: 0,
      count: 1,
      removed: 0,
      unchanged: 0,
    })
  })
})

describe('geometryBuildUpsertSql', () => {
  test('splits geometry upserts below D1’s SQL statement limit', () => {
    const sql = geometryBuildUpsertSql(
      'divisionAreas',
      Array.from({ length: 3 }, (_, index) => ({
        geometry: 'x'.repeat(40_000),
        id: `area-${index}`,
      })),
    )

    const statements = sql.split('\n')

    expect(statements).toHaveLength(2)
    for (const statement of statements) {
      expect(new TextEncoder().encode(statement).byteLength).toBeLessThanOrEqual(
        MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES,
      )
    }
  })

  test('replays an oversized geometry row through bounded statements', () => {
    const geometry = {
      coordinates: ['x'.repeat(MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES * 2)],
      type: 'Polygon',
    }
    const geometryText = JSON.stringify(geometry)
    const sql = geometryBuildUpsertSql('divisionAreas', [
      { geometry: 'small', id: 'area-1', snapshotId: 'snapshot-1' },
      { geometry, id: 'area-2', snapshotId: 'snapshot-1' },
      { geometry: 'small', id: 'area-3', snapshotId: 'snapshot-1' },
    ])
    const statements = sql.split('\n')

    for (const statement of statements) {
      expect(new TextEncoder().encode(statement).byteLength).toBeLessThanOrEqual(
        MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES,
      )
    }

    const database = new Database(':memory:')
    database.exec(
      'CREATE TABLE divisionAreas (snapshotId TEXT NOT NULL, id TEXT NOT NULL, geometry TEXT NOT NULL, PRIMARY KEY (snapshotId, id));',
    )
    database.exec(sql)

    expect(
      database
        .query('SELECT geometry FROM divisionAreas WHERE snapshotId = ? AND id = ?')
        .get('snapshot-1', 'area-2'),
    ).toEqual({ geometry: geometryText })
    database.close()
  })

  test('rejects an oversized geometry row without replay key columns', () => {
    expect(() =>
      geometryBuildUpsertSql('divisionAreas', [
        { geometry: 'x'.repeat(MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES * 2) },
      ]),
    ).toThrow('Cannot replay divisionAreas geometry row')
  })

  test('replays oversized Overture raw properties through bounded statements', () => {
    const rawProperties = {
      geometry: {
        coordinates: ['x'.repeat(MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES * 2)],
        type: 'Polygon',
      },
      id: 'area-1',
    }
    const rawPropertiesText = JSON.stringify(rawProperties)
    const sql = geometryBuildUpsertSql('overtureDivisionAreas', [
      {
        rawProperties,
        releaseId: 'release-1',
        sourceRecordId: 'area-1',
        versionHash: 'hash-1',
      },
    ])
    const statements = sql.split('\n')

    for (const statement of statements) {
      expect(new TextEncoder().encode(statement).byteLength).toBeLessThanOrEqual(
        MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES,
      )
    }

    const database = new Database(':memory:')
    database.exec(
      'CREATE TABLE overtureDivisionAreas (sourceRecordId TEXT NOT NULL, rawProperties TEXT NOT NULL, releaseId TEXT NOT NULL, versionHash TEXT NOT NULL, PRIMARY KEY (sourceRecordId, versionHash));',
    )
    database.exec(sql)

    expect(
      database
        .query(
          'SELECT rawProperties FROM overtureDivisionAreas WHERE sourceRecordId = ? AND versionHash = ?',
        )
        .get('area-1', 'hash-1'),
    ).toEqual({ rawProperties: rawPropertiesText })
    database.close()
  })

  test('replays an oversized Brotli geometry blob through bounded statements', () => {
    const sourceGeometry = Uint8Array.from(
      { length: MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES },
      (_, index) => index % 251,
    )
    const sql = geometryBuildUpsertSql('hkgovCenstatdDivisionAreas', [
      {
        sourceGeometry,
        sourceRecordId: 'CENSTATD:T',
        versionHash: 'hash-1',
      },
    ])
    const statements = sql.split('\n')

    for (const statement of statements) {
      expect(new TextEncoder().encode(statement).byteLength).toBeLessThanOrEqual(
        MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES,
      )
    }

    const database = new Database(':memory:')
    database.exec(
      'CREATE TABLE hkgovCenstatdDivisionAreas (sourceRecordId TEXT NOT NULL, sourceGeometry BLOB NOT NULL, versionHash TEXT NOT NULL, PRIMARY KEY (sourceRecordId, versionHash));',
    )
    database.exec(sql)

    expect(
      database
        .query(
          'SELECT sourceGeometry FROM hkgovCenstatdDivisionAreas WHERE sourceRecordId = ? AND versionHash = ?',
        )
        .get('CENSTATD:T', 'hash-1'),
    ).toEqual({ sourceGeometry: Buffer.from(sourceGeometry) })
    database.close()
  })
})

describe('shouldCompressCanonicalGeometry', () => {
  test('stores exact C&SD and Planning Unit canonical geometry as Brotli BLOBs', () => {
    expect(shouldCompressCanonicalGeometry('hkgov-censtatd', undefined)).toBeTrue()
    expect(shouldCompressCanonicalGeometry('hkgov-pland-pu', undefined)).toBeTrue()
  })

  test('keeps the C&SD simplified derivative and other geometry sources as JSON', () => {
    expect(shouldCompressCanonicalGeometry('hkgov-censtatd', 'simplified')).toBeFalse()
    expect(shouldCompressCanonicalGeometry('overture', undefined)).toBeFalse()
  })
})
