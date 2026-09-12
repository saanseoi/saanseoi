import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp, rm, readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import { parseHkgovAlsIdentityDecisions } from '../../../harbour-cli/src/lib/sources/hkgov/dpo/hkgovAlsDrift.ts'
import {
  formatCompletedAlsRelease,
  formatAlsDivisionQualitySummary,
  filterDivisionI18nToKnownDivisions,
  formatSourceDuplicateSummary,
  HKGOV_ALS_IDENTITY_CURATION_PATH,
  inferAlsSourceVersionFromPath,
  resolveAlsReleaseVersions,
  selectAlsDivisionCohort,
  selectPendingAlsSourceReleases,
  shouldIncludeSupersededAlsSourceVersions,
  recordAlsIngestionReview,
  promptForDriftDecisions,
} from './hkgovAls.ts'

describe('skip curation checks', () => {
  test('persists unreviewed per-release evidence without changing curation verification', async () => {
    const root = await mkdtemp(join(tmpdir(), 'als-deferred-review-'))
    const result = {
      driftCandidates: [],
      curationApplications: [
        { fixture: 'example.json', id: 'pending', verification: 'unverified' },
        { fixture: 'example.json', id: 'approved', verification: 'verified' },
      ],
      divisionQuality: { issues: [] },
    } as unknown as Parameters<typeof recordAlsIngestionReview>[1]
    try {
      await recordAlsIngestionReview('2026-08-01.0', result, root)
      const report = JSON.parse(
        await readFile(join(root, 'review-backlog/2026-08-01.0.json'), 'utf8'),
      )
      expect(report).toMatchObject({
        reviewStatus: 'unreviewed',
        ingestionDisposition: 'continue',
        curationApplications: [{ id: 'pending', verification: 'unverified' }],
      })
      expect(report.curationApplications).toHaveLength(1)
      expect(
        JSON.parse(await readFile(report.identityDriftReport, 'utf8')),
      ).toMatchObject({ reviewStatus: 'unreviewed', candidates: [] })
      expect(result.curationApplications[0]?.verification).toBe('unverified')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('accepts drift with new IDs without persisting reviewed decisions', async () => {
    const candidates = [
      { current: { identityKey: 'current' }, previous: { identityKey: 'previous' } },
    ] as Parameters<typeof promptForDriftDecisions>[1]
    let persisted = false
    const result = await promptForDriftDecisions(
      { authority: 'hkgov-dpo', decisions: [], version: 1 },
      candidates,
      async () => {
        persisted = true
      },
      true,
    )
    expect(result.decisions).toEqual([])
    expect(persisted).toBe(false)
  })
})

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

describe('completed ALS release feedback', () => {
  test('uses the standard source-grid skipped renderer', async () => {
    expect(
      await formatCompletedAlsRelease({ environment: 'dev', remote: false }),
    ).toEqual([expect.stringContaining('SKIPPED: no updates')])
  })
})

describe('replayed division translations', () => {
  test('does not copy translations whose division was deleted from the snapshot', () => {
    const rows = filterDivisionI18nToKnownDivisions(
      [
        { divisionId: 'retained', locale: 'en' },
        { divisionId: 'deleted', locale: 'en' },
      ],
      new Set(['retained']),
    )

    expect(rows).toEqual([{ divisionId: 'retained', locale: 'en' }])
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
  test('uses the exact target-published cohort', () => {
    expect(
      selectAlsDivisionCohort('2026-07-22.0', [
        '2026-03-18.0',
        '2026-07-22.0',
        '2026-08-19.0',
      ]),
    ).toBe('2026-07-22.0')
  })

  test('uses the most recent target-published cohort at or before the ALS release', () => {
    expect(
      selectAlsDivisionCohort('2026-07-26.0', [
        '2025-12-16.0',
        '2026-03-18.0',
        '2026-07-22.0',
      ]),
    ).toBe('2026-07-22.0')
  })

  test('uses the soonest target-published cohort when none is earlier', () => {
    expect(
      selectAlsDivisionCohort('2024-07-25.0', ['2025-09-24.0', '2025-12-17.0']),
    ).toBe('2025-09-24.0')
  })

  test('refuses a release with no published division cohort', () => {
    expect(() => selectAlsDivisionCohort('2026-07-26.0', [])).toThrow(
      'No published Overture division snapshot is available to match ALS release 2026-07-26.0.',
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

describe('ALS preflight resume', () => {
  test('reviews only releases that still need ingestion unless forced', () => {
    const releases = [
      { sourceVersion: '2024-07-25.0' },
      { sourceVersion: '2024-10-23.0' },
      { sourceVersion: '2025-01-23.0' },
    ]
    const completed = new Set(['2024-07-25.0', '2024-10-23.0'])

    expect(selectPendingAlsSourceReleases(releases, completed)).toEqual([
      { sourceVersion: '2025-01-23.0' },
    ])
    expect(selectPendingAlsSourceReleases(releases, completed, true)).toEqual(releases)
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
