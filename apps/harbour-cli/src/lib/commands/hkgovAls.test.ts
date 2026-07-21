import { describe, expect, test } from 'bun:test'

import {
  formatSourceDuplicateSummary,
  inferAlsSourceVersionFromPath,
  resolveAlsReleaseVersions,
} from './hkgovAls.ts'

describe('formatSourceDuplicateSummary', () => {
  test('reports aggregate duplicate statistics without source-record JSON', () => {
    const summary = formatSourceDuplicateSummary([
      {
        address: '1 EXAMPLE STREET',
        canonicalRecord: { canonicalId: 'canonical-1' },
        ignoredRecords: [{ canonicalId: 'ignored-1' }],
        occurrences: [
          { featureIndexOneBased: 4, sourceFile: 'central.geojson' },
          { featureIndexOneBased: 9, sourceFile: 'central.geojson' },
        ],
      },
      {
        address: '2 EXAMPLE STREET',
        occurrences: [
          { featureIndexOneBased: 11, sourceFile: 'eastern.geojson' },
          { featureIndexOneBased: 21, sourceFile: 'kowloon.geojson' },
          { featureIndexOneBased: 37, sourceFile: 'kowloon.geojson' },
        ],
      },
    ])

    expect(summary).toContain('affectedPremises')
    expect(summary).toContain('2')
    expect(summary).toContain('sourceFeaturesInvolved')
    expect(summary).toContain('5')
    expect(summary).toContain('sourceFeaturesRemoved')
    expect(summary).toContain('3')
    expect(summary).toContain('sourceFilesInvolved')
    expect(summary).toContain('3')
    expect(summary).not.toContain('canonical-1')
    expect(summary).not.toContain('ignored-1')
  })
})

describe('ALS release versions', () => {
  test('uses a zero correction for the first release on a delivery date', () => {
    expect(inferAlsSourceVersionFromPath('/data/20250123-1031-ALS-GeoJSON')).toBe(
      '2025-01-23.0',
    )
  })

  test('increments the correction only when two releases share a date', () => {
    expect(
      resolveAlsReleaseVersions([
        '/data/20250123-1530-ALS-GeoJSON',
        '/data/20250123-1031-ALS-GeoJSON',
        '/data/20250225-1050-ALS-GeoJSON',
      ]),
    ).toEqual([
      {
        sourceDir: '/data/20250123-1031-ALS-GeoJSON',
        sourceVersion: '2025-01-23.0',
      },
      {
        sourceDir: '/data/20250123-1530-ALS-GeoJSON',
        sourceVersion: '2025-01-23.1',
      },
      {
        sourceDir: '/data/20250225-1050-ALS-GeoJSON',
        sourceVersion: '2025-02-25.0',
      },
    ])
  })
})
