import { expect, test } from 'bun:test'
import { normaliseOverturePlace } from '@repo/core/pipeline/services/places/place'
import {
  addPlaceReleaseStats,
  buildPlaceReleaseStatsRows,
  buildPlaceReleaseStatsRowsFromAccumulator,
  createPlaceReleaseStatsAccumulator,
} from './processLocalPlaceSqlUploadStatistics'
import type { EnrichedPlace } from './processLocalPlaceSqlUploadTypes'

test('streamed and array Place ingestion retain category and resolved district coverage identically', () => {
  const place = normaliseOverturePlace(
    {
      id: 'place-a',
      geometry: { type: 'Point', coordinates: [114.1, 22.3] },
      basic_category: 'food_service',
      taxonomy: { primary: 'cafe' },
      websites: ['https://example.com'],
    },
    '2026-09-23.0',
  )!
  const rows: EnrichedPlace[] = [
    {
      place,
      address2dId: null,
      address3dId: null,
      divisionIds: ['district-a', 'district-a', 'area-a'],
      divisionReferences: { districtId: 'district-a', areaId: 'area-a' },
      versionHash: 'hash',
      sourcePayloadHash: 'source',
    },
    {
      place: { ...place, id: 'place-b', basicCategory: null, websites: [] },
      address2dId: null,
      address3dId: null,
      // Evidence without a resolved scalar cannot establish district membership.
      divisionIds: ['district-b'],
      divisionReferences: { districtId: null },
      versionHash: 'hash-b',
      sourcePayloadHash: 'source-b',
    },
  ]
  const accumulator = createPlaceReleaseStatsAccumulator()
  for (const row of rows) addPlaceReleaseStats(accumulator, row)
  const stats = buildPlaceReleaseStatsRowsFromAccumulator(accumulator)
  const withoutTimestamps = (values: typeof stats) =>
    values.map(({ createdAt: _created, updatedAt: _updated, ...row }) => row)
  expect(withoutTimestamps(stats)).toEqual(
    withoutTimestamps(buildPlaceReleaseStatsRows(rows)),
  )
  expect(
    stats
      .filter(row => row.dimension === 'district')
      .map(row => [row.dimensionValue, row.value]),
  ).toEqual([['district-a', 1]])
  expect(
    stats.find(
      row => row.dimension === 'basicCategory' && row.dimensionValue === 'unspecified',
    )?.value,
  ).toBe(1)
  expect(
    stats.find(
      row =>
        row.dimension === 'placeField' &&
        row.dimensionValue === 'district' &&
        row.measure === 'coverage',
    )?.value,
  ).toBe(50)
})
