import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import { parseHkgovAlsIdentityDecisions } from '../../../harbour-cli/src/lib/sources/hkgov/hkgovAlsDrift.ts'
import {
  formatAlsDivisionQualitySummary,
  formatSourceDuplicateSummary,
  HKGOV_ALS_IDENTITY_CURATION_PATH,
  inferAlsSourceVersionFromPath,
  resolveAlsReleaseVersions,
  selectAlsDivisionCohort,
  shouldIncludeSupersededAlsSourceVersions,
} from './hkgovAls.ts'

describe('formatAlsDivisionQualitySummary', () => {
  test('prints only unmatched or ambiguous divisions for each issue', () => {
    const summary = formatAlsDivisionQualitySummary('2026-07-26.0', {
      ambiguous_area_count: 0,
      ambiguous_district_count: 1,
      unmatched_area_count: 1,
      unmatched_district_count: 0,
      issues: [
        {
          address: '1 EXAMPLE STREET',
          areaName: 'NEW TERRITORIES',
          areaStatus: 'unmatched',
          districtName: 'NORTH DISTRICT',
          districtStatus: 'matched',
          sourceFeatureIndexOneBased: 16590,
          sourceFile: 'als_addresses_(north_district).geojson',
        },
        {
          address: '2 EXAMPLE STREET',
          areaName: 'KOWLOON',
          areaStatus: 'matched',
          districtName: 'NORTH DISTRICT / TAI PO',
          districtStatus: 'ambiguous',
          sourceFeatureIndexOneBased: 9,
          sourceFile: 'central_district.geojson',
        },
      ],
    })

    expect(summary).toContain('area unmatched: NEW TERRITORIES')
    expect(summary).toContain('district ambiguous: NORTH DISTRICT / TAI PO')
    expect(summary).not.toContain('district matched: NORTH DISTRICT')
    expect(summary).not.toContain('area matched: KOWLOON')
  })
})

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

describe('ALS target division cohort selection', () => {
  test('uses the target-published same-year cohort at or before the ALS release', () => {
    expect(
      selectAlsDivisionCohort('2026-07-26.0', [
        '2025-12-16.0',
        '2026-03-18.0',
        '2026-07-22.0',
      ]),
    ).toBe('2026-07-22.0')
  })

  test('uses the first target-published same-year cohort when none is earlier', () => {
    expect(selectAlsDivisionCohort('2026-01-02.0', ['2026-01-14.0'])).toBe(
      '2026-01-14.0',
    )
  })

  test('refuses a release with no eligible same-year division cohort', () => {
    expect(() => selectAlsDivisionCohort('2026-07-26.0', ['2025-12-16.0'])).toThrow(
      'No published Overture division snapshot is available for the 2026 ALS shard.',
    )
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

describe('ALS historical backfills', () => {
  test('skips every completed release after the requested historical gap', () => {
    expect(
      shouldIncludeSupersededAlsSourceVersions({
        allowHistoricalCohort: true,
      }),
    ).toBe(true)
  })

  test('keeps normal ingestion resume behaviour unchanged', () => {
    expect(shouldIncludeSupersededAlsSourceVersions({})).toBe(false)
    expect(shouldIncludeSupersededAlsSourceVersions({ continue: true })).toBe(true)
  })
})

describe('ALS curation fixture', () => {
  test('loads the checked-in DPO identity decisions by default', async () => {
    const decisions = parseHkgovAlsIdentityDecisions(
      JSON.parse(await readFile(HKGOV_ALS_IDENTITY_CURATION_PATH, 'utf8')),
    )

    expect(decisions.authority).toBe('hkgov-dpo')
    expect(decisions.decisions.length).toBeGreaterThan(0)
  })
})
