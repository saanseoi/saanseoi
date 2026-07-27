import { describe, expect, test } from 'bun:test'

import {
  asOptionalInteger,
  createGeometryChurnCounts,
  formatMissingDivisionReferenceRecords,
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
