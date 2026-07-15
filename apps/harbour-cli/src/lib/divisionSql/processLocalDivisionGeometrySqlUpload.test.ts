import { describe, expect, test } from 'bun:test'

import { formatMissingDivisionReferenceRecords } from './processLocalDivisionGeometrySqlUpload.ts'

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
})
