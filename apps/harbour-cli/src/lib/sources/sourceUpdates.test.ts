import { describe, expect, test } from 'bun:test'

import {
  pairLandsdStreetNoticePages,
  parseLandsdStreetNoticePage,
  parseLandsdStreetPdfText,
  parseLandsdStreetSourcePage,
} from './landsd/street/landsdStreet.ts'

import {
  buildHkgovAlsIngestCommand,
  buildHkgovCenstatdDistrictArchiveIngestCommand,
  buildHkgovCenstatdDistrictStatisticArchiveIngestCommand,
  buildHkgovCenstatdStatisticsArchiveIngestCommand,
  buildHkgovHadDistrictArchiveIngestCommand,
  buildHkgovHydStreetArchiveIngestCommand,
  buildHkgovLandsdPlaceNameArchiveIngestCommand,
  buildHkgovLandsdRoadCentrelineArchiveIngestCommand,
  buildHkgovPlandArchiveIngestCommand,
  buildOverturistCommand,
  buildOverturistReleasesCommand,
  assertCsdiArchiveDownload,
  assertCsdiArchiveUrl,
  datasetCorrectionSuffixSources,
  datasetName,
  getDueUpdatePhases,
  isNewUpdate,
  isUpdateCheckDue,
  lookupDatasetUpdates,
  loadDatasetFixtures,
  normaliseDatasetVersion,
  recordUpdateState,
  recordUpdatePhaseCheck,
  recordUpdateArchiveMirror,
  recordUpdateDatabaseImport,
  readCsdiArchivedSources,
  resolveCsdiArchiveRedirect,
  resolveDatasetVersion,
  shouldCheckDataset,
  type DatasetUpdate,
  type DatasetFixture,
  type UpdateStateEntry,
} from './sourceUpdates.ts'

describe('dataset update registry', () => {
  test('accepts only the official CSDI HTTPS archive origin', () => {
    expect(() =>
      assertCsdiArchiveUrl('https://static.csdi.gov.hk/download/source.zip'),
    ).not.toThrow()
    expect(() =>
      assertCsdiArchiveUrl('http://static.csdi.gov.hk/download/source.zip'),
    ).toThrow('Refusing CSDI archive download outside the official origin')
    expect(() =>
      assertCsdiArchiveUrl('https://static.csdi.gov.hk.example/download/source.zip'),
    ).toThrow('Refusing CSDI archive download outside the official origin')
    expect(() =>
      assertCsdiArchiveUrl(
        'https://operator:secret@static.csdi.gov.hk/download/source.zip',
      ),
    ).toThrow('Refusing CSDI archive download outside the official origin')
    expect(() =>
      resolveCsdiArchiveRedirect(
        'https://static.csdi.gov.hk/download/source.zip',
        'http://127.0.0.1/internal',
      ),
    ).toThrow('Refusing CSDI archive download outside the official origin')
    expect(
      resolveCsdiArchiveRedirect(
        'https://static.csdi.gov.hk/download/source.zip',
        '../revised/source.zip',
      ),
    ).toBe('https://static.csdi.gov.hk/revised/source.zip')
  })

  test('rejects CSDI HTML error pages before caching them as source archives', () => {
    const url = 'https://static.csdi.gov.hk/csdi-webpage/download/common/missing?a=1'

    expect(() =>
      assertCsdiArchiveDownload(
        new TextEncoder().encode('<!DOCTYPE html><html><title>Download Failed</title>'),
        'text/html; charset=UTF-8',
        url,
      ),
    ).toThrow(
      `CSDI archive download returned an HTML failure page instead of the source file: ${url}`,
    )

    expect(() =>
      assertCsdiArchiveDownload(
        new TextEncoder().encode('<gml:FeatureCollection />'),
        'application/gml+xml',
        url,
      ),
    ).not.toThrow()
  })

  test('hands the exact mirrored LandsD archives to their native importers', () => {
    const common = {
      inputFile: '/tmp/landsd-source.zip',
      releaseNotesUrl: 'https://publisher.example/landsd',
      sourceArchiveKey: 'by-source/hk/landsd/source.zip',
      sourceArchiveSha256: 'f'.repeat(64),
      sourceVersion: '2026-Q2',
      target: { environment: 'preview' as const, remote: true },
    }

    for (const command of [
      buildHkgovLandsdPlaceNameArchiveIngestCommand(common),
      buildHkgovLandsdRoadCentrelineArchiveIngestCommand(common),
    ]) {
      expect(command).toEqual(
        expect.arrayContaining([
          '/tmp/landsd-source.zip',
          '--target',
          'preview',
          '--source-archive-key',
          'by-source/hk/landsd/source.zip',
          '--source-archive-sha256',
          'f'.repeat(64),
        ]),
      )
    }
  })

  test('hands the mirrored HyD archive and caller target to native street intake', () => {
    const command = buildHkgovHydStreetArchiveIngestCommand({
      datasetCode: 'ds-hk-hkgov-hyd-pedestrian-street',
      inputFile: '/tmp/td-source.zip',
      releaseNotesUrl: 'https://publisher.example/release',
      sourceArchiveKey: 'by-source/hk/hyd/source.zip',
      sourceArchiveSha256: 'a'.repeat(64),
      sourceVersion: '2025-Q1',
      target: { environment: 'production', remote: true },
    })

    expect(command).toEqual(
      expect.arrayContaining([
        'hkgov-hyd:street',
        '/tmp/td-source.zip',
        '--target',
        'production',
        '--dataset-code',
        'ds-hk-hkgov-hyd-pedestrian-street',
        '--source-archive-key',
        'by-source/hk/hyd/source.zip',
        '--source-archive-sha256',
        'a'.repeat(64),
      ]),
    )
  })

  test('passes --yes to DPO ingestion only when the parent update is non-interactive', () => {
    const common = {
      sourceRoot: '/tmp/als',
      version: '2026-07-26.0',
    }

    expect(
      buildHkgovAlsIngestCommand({
        ...common,
        target: { environment: 'preview', remote: true },
      }),
    ).toContain('preview')
    expect(
      buildHkgovAlsIngestCommand({
        ...common,
        target: { environment: 'production', remote: true },
      }),
    ).toContain('production')
    const local = buildHkgovAlsIngestCommand({
      ...common,
      target: { environment: 'dev', remote: false },
    })
    expect(local).toContain('local')
    expect(local).not.toContain('--yes')
    expect(
      buildHkgovAlsIngestCommand({
        ...common,
        skipPrompts: true,
        target: { environment: 'dev', remote: false },
      }),
    ).toContain('--yes')
  })

  test('starts PlanD native archive intake with the mirrored source package', () => {
    expect(
      buildHkgovPlandArchiveIngestCommand({
        inputFile: '/tmp/mirrored-source.zip',
        kind: 'pu',
        releaseNotesUrl: 'https://portal.csdi.gov.hk/example',
        sourceArchiveKey: 'by-source/hk/hkgov-csdi/pland/source.zip',
        sourceArchiveSha256: 'a'.repeat(64),
        sourceVersion: '2021',
        target: { environment: 'production', remote: true },
      }),
    ).toEqual(
      expect.arrayContaining([
        'hkgov-pland:ingest',
        '--kind',
        'pu',
        '/tmp/mirrored-source.zip',
        '--target',
        'production',
        '--source-version',
        '2021',
        '--source-archive-key',
        'by-source/hk/hkgov-csdi/pland/source.zip',
        '--source-archive-sha256',
        'a'.repeat(64),
      ]),
    )
  })

  test('starts C&SD density intake from the prepared archive and retains its identity', () => {
    const command = buildHkgovCenstatdDistrictStatisticArchiveIngestCommand({
      deferStatsReleaseSet: true,
      inputFile: '/tmp/prepared-density.zip',
      releaseNotesUrl: 'https://portal.csdi.gov.hk/density',
      sourceArchiveKey: 'by-source/hk/hkgov-csdi/density/archive-source.zip',
      sourceArchiveSha256: 'b'.repeat(64),
      sourceVersion: '2024',
      target: { environment: 'preview', remote: true },
      yes: true,
    })

    expect(command).toEqual(
      expect.arrayContaining([
        'hkgov-censtatd:district-land-area-population-density',
        '/tmp/prepared-density.zip',
        '--target',
        'preview',
        '--source-archive-key',
        'by-source/hk/hkgov-csdi/density/archive-source.zip',
        '--source-archive-sha256',
        'b'.repeat(64),
        '--defer-stats-release-set',
        '--yes',
      ]),
    )
  })

  test('starts C&SD district-area intake from the prepared native archive', () => {
    expect(
      buildHkgovCenstatdDistrictArchiveIngestCommand({
        datasetCode:
          'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district',
        deferApiReleaseSet: true,
        inputFile: '/tmp/prepared-districts.zip',
        releaseNotesUrl: 'https://portal.csdi.gov.hk/districts',
        sourceArchiveKey: 'by-source/hk/hkgov-csdi/districts/source.zip',
        sourceArchiveSha256: 'd'.repeat(64),
        sourceVersion: '2021',
        target: { environment: 'production', remote: true },
      }),
    ).toEqual(
      expect.arrayContaining([
        'hkgov-censtatd:district-area',
        '/tmp/prepared-districts.zip',
        '--target',
        'production',
        '--source-archive-key',
        'by-source/hk/hkgov-csdi/districts/source.zip',
        '--defer-api-release-set',
      ]),
    )
  })

  test('starts each remaining C&SD statistic from the prepared archive', () => {
    expect(
      buildHkgovCenstatdStatisticsArchiveIngestCommand({
        datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-new-towns',
        deferStatsReleaseSet: true,
        inputFile: '/tmp/new-towns.zip',
        releaseNotesUrl: 'https://portal.csdi.gov.hk/new-towns',
        sourceArchiveKey: 'by-source/hk/hkgov-csdi/new-towns/source.zip',
        sourceArchiveSha256: 'e'.repeat(64),
        sourceVersion: '2021',
        target: { environment: 'preview', remote: true },
        yes: true,
      }),
    ).toEqual(
      expect.arrayContaining([
        'hkgov-censtatd:statistics',
        '/tmp/new-towns.zip',
        '--target',
        'preview',
        '--dataset-code',
        'ds-hk-hkgov-censtatd-division-statistic-new-towns',
        '--defer-stats-release-set',
        '--yes',
      ]),
    )
  })

  test('starts HAD district intake from the mirrored native FGDB archive', () => {
    expect(
      buildHkgovHadDistrictArchiveIngestCommand({
        inputFile: '/tmp/had-districts.zip',
        releaseNotesUrl: 'https://portal.csdi.gov.hk/had-districts',
        sourceArchiveKey: 'by-source/hk/hkgov-csdi/had/source.zip',
        sourceArchiveSha256: 'f'.repeat(64),
        sourceVersion: '2022',
        target: { environment: 'production', remote: true },
      }),
    ).toEqual(
      expect.arrayContaining([
        'hkgov-had:district-area',
        '/tmp/had-districts.zip',
        '--target',
        'production',
        '--source-archive-key',
        'by-source/hk/hkgov-csdi/had/source.zip',
      ]),
    )
  })

  test('preserves a production caller target for C&SD density publication', () => {
    expect(
      buildHkgovCenstatdDistrictStatisticArchiveIngestCommand({
        inputFile: '/tmp/prepared-density.zip',
        releaseNotesUrl: 'https://portal.csdi.gov.hk/density',
        sourceArchiveKey: 'by-source/hk/hkgov-csdi/density/archive-source.zip',
        sourceArchiveSha256: 'c'.repeat(64),
        sourceVersion: '2022',
        target: { environment: 'production', remote: true },
        yes: false,
      }),
    ).toContain('production')
  })

  test('loads every dataset fixture', async () => {
    const fixtures = await loadDatasetFixtures()

    expect(fixtures.length).toBeGreaterThan(0)
    expect(new Set(fixtures.map(fixture => fixture.code)).size).toBe(fixtures.length)
    expect(fixtures.map(fixture => fixture.code)).toEqual(
      [...fixtures.map(fixture => fixture.code)].sort(),
    )
  })

  test('assigns every Planning Department cohort its own CSDI catalogue URL', async () => {
    const fixtures = await loadDatasetFixtures()
    const plandFixtures = fixtures.filter(
      fixture => fixture.publisherCode === 'hkgov-pland',
    )

    expect(plandFixtures).not.toHaveLength(0)
    for (const fixture of plandFixtures) {
      const sourceUrls = fixture.releases?.map(release => release.sourceUrl) ?? []
      expect(sourceUrls).not.toContain(undefined)
      expect(new Set(sourceUrls).size).toBe(sourceUrls.length)
    }
  })

  test('selects the English dataset name', () => {
    expect(
      datasetName({
        code: 'ds-example',
        publisherCode: 'example',
        regionCode: 'hk',
        theme: 'places',
        type: 'place',
        versionPolicy: { scheme: 'upstream', correctionSuffixSource: 'none' },
        i18n: [
          { locale: 'zh-hant', name: '例子' },
          { locale: 'en', name: 'Example' },
        ],
      }),
    ).toBe('Example')
  })

  test('detects an upstream version not present in local state', () => {
    const update = {
      dataset: {
        code: 'ds-example',
        publisherCode: 'example',
        regionCode: 'hk',
        theme: 'places',
        type: 'place',
        versionPolicy: { scheme: 'upstream', correctionSuffixSource: 'upstream' },
      },
      status: 'new',
      version: '2026-07-23.0',
      versionKey: '2026-07-23.0',
    } satisfies DatasetUpdate

    expect(isNewUpdate(update)).toBe(true)
    expect(isNewUpdate(update, { versionKey: '2026-07-23.0' })).toBe(false)
  })

  test('throttles update checks according to the fixture policy', () => {
    const dataset = {
      code: 'ds-example',
      publisherCode: 'example',
      regionCode: 'hk',
      theme: 'places',
      type: 'place',
      versionPolicy: { scheme: 'upstream', correctionSuffixSource: 'none' },
      updatePolicy: { allowUpdates: true, checkFrequency: 'monthly' as const },
    } satisfies DatasetFixture
    const lastChecked = '2026-07-01T00:00:00.000Z'

    expect(
      isUpdateCheckDue(dataset, { lastChecked }, false, Date.parse('2026-07-15')),
    ).toBe(false)
    expect(
      isUpdateCheckDue(dataset, { lastChecked }, false, Date.parse('2026-08-01')),
    ).toBe(true)
    expect(
      isUpdateCheckDue(dataset, { lastChecked }, true, Date.parse('2026-07-02')),
    ).toBe(true)
  })

  test('schedules each update phase from its own policy state', () => {
    const dataset = {
      code: 'ds-example',
      publisherCode: 'example',
      regionCode: 'hk',
      theme: 'places',
      type: 'place',
      versionPolicy: { scheme: 'upstream', correctionSuffixSource: 'none' },
      releasePolicy: {
        series: 'rolling',
        schedule: 'regular',
        revisionScope: 'latest',
        checks: {
          newReleases: {
            trigger: 'after-latest-release-age',
            ageDays: 25,
            frequency: 'daily',
          },
          revisions: { trigger: 'periodic', frequency: 'weekly' },
          archives: { trigger: 'on-discovery', discoveries: ['new-release'] },
        },
        archives: { availability: 'limited' },
      },
    } satisfies DatasetFixture
    const state: UpdateStateEntry = {
      phaseChecks: {
        'new-releases': {
          lastChecked: '2026-07-20T00:00:00.000Z',
          releaseLastRevisedAt: '2026-07-01.0',
        },
        revisions: { lastChecked: '2026-07-20T00:00:00.000Z' },
      },
    }

    expect(
      getDueUpdatePhases(dataset, state, {
        now: Date.parse('2026-07-26T00:00:00.000Z'),
      }),
    ).toEqual(['new-releases'])

    expect(
      getDueUpdatePhases(dataset, state, {
        force: true,
        now: Date.parse('2026-07-26T00:00:00.000Z'),
      }),
    ).toEqual(['new-releases', 'revisions', 'archives'])

    const mutableState: Record<string, UpdateStateEntry> = {}
    recordUpdatePhaseCheck(mutableState, dataset.code, 'archives', {
      checkedAt: '2026-07-26T00:00:00.000Z',
      sourceCursor: ['2026-07-26.0'],
    })
    expect(mutableState[dataset.code]?.phaseChecks?.archives).toEqual({
      lastChecked: '2026-07-26T00:00:00.000Z',
      releaseLastRevisedAt: undefined,
      sourceCursor: ['2026-07-26.0'],
    })
  })

  test('runs initial-only phases only before the target has a release', () => {
    const dataset = {
      code: 'ds-example',
      publisherCode: 'example',
      regionCode: 'hk',
      theme: 'places',
      type: 'place',
      versionPolicy: { scheme: 'upstream', correctionSuffixSource: 'none' },
      releasePolicy: {
        series: 'cohort',
        schedule: 'regular',
        revisionScope: 'all',
        checks: {
          newReleases: { trigger: 'initial-only' },
          revisions: { trigger: 'never' },
          archives: { trigger: 'never' },
        },
        archives: { availability: 'full' },
      },
    } satisfies DatasetFixture

    expect(getDueUpdatePhases(dataset, undefined, { hasTargetRelease: false })).toEqual(
      ['new-releases'],
    )
    expect(getDueUpdatePhases(dataset, undefined, { hasTargetRelease: true })).toEqual(
      [],
    )
  })

  test('honours an explicit update freeze', () => {
    const dataset = {
      code: 'ds-example',
      publisherCode: 'example',
      regionCode: 'hk',
      theme: 'places',
      type: 'place',
      versionPolicy: { scheme: 'upstream', correctionSuffixSource: 'none' },
      updatePolicy: { allowUpdates: false },
    } as const

    expect(shouldCheckDataset(dataset)).toBe(false)
  })

  test('checks a newly configured release even when another source was checked', () => {
    const dataset = {
      code: 'ds-example',
      publisherCode: 'example',
      regionCode: 'hk',
      theme: 'places',
      type: 'place',
      versionPolicy: { scheme: 'upstream', correctionSuffixSource: 'none' },
      updatePolicy: { allowUpdates: true, checkFrequency: 'monthly' as const },
      releasePolicy: {
        series: 'cohort',
        schedule: 'regular',
        revisionScope: 'all',
        checks: {
          newReleases: { trigger: 'periodic', frequency: 'monthly' },
          revisions: { trigger: 'never' },
          archives: { trigger: 'never' },
        },
        archives: { availability: 'none' },
      },
      releases: [
        { sourceVersion: '2021', sourceUrl: 'https://example.test/2021' },
        { sourceVersion: '2026', sourceUrl: 'https://example.test/2026' },
      ],
    } satisfies DatasetFixture
    const state: UpdateStateEntry = {
      sourceChecks: {
        '2021': { lastChecked: '2026-07-20T00:00:00.000Z' },
      },
    }

    expect(shouldCheckDataset(dataset, state)).toBe(true)
  })

  test('records check state independently for each source release', () => {
    const state: Record<string, UpdateStateEntry> = {}
    recordUpdateState(state, 'ds-example', {
      dataset: {
        code: 'ds-example',
        publisherCode: 'example',
        regionCode: 'hk',
        theme: 'places',
        type: 'place',
        versionPolicy: { scheme: 'upstream', correctionSuffixSource: 'none' },
      } satisfies DatasetFixture,
      status: 'current',
      sourceKey: '2021',
      version: '2021.0',
      versionKey: '2021.0',
      checkedAt: '2026-07-23T00:00:00.000Z',
    })

    expect(state['ds-example']?.sourceChecks?.['2021']).toEqual({
      version: '2021.0',
      versionKey: '2021.0',
      lastChecked: '2026-07-23T00:00:00.000Z',
      releaseLastRevisedAt: undefined,
      metadataLastRevisedAt: undefined,
      sourceCursor: undefined,
    })
  })

  test('keeps archive custody separate from a completed database import', () => {
    const state: Record<string, UpdateStateEntry> = {}
    const update = {
      checkedAt: '2026-07-28T00:00:00.000Z',
      dataset: {
        code: 'ds-example',
        publisherCode: 'example',
        regionCode: 'hk',
        theme: 'streets',
        type: 'street',
        versionPolicy: { scheme: 'quarterly', correctionSuffixSource: 'generated' },
      } satisfies DatasetFixture,
      mirroredArchive: {
        contentHash: 'a'.repeat(64),
        mirroredAt: '2026-07-28T00:01:00.000Z',
        objectKey: 'by-source/hk/example/source.zip',
      },
      sourceKey: '2026-Q2',
      status: 'new' as const,
      version: '2026-Q2.0',
      versionKey: 'sha256:abc',
    }

    recordUpdateState(state, 'ds-example', update)
    recordUpdateArchiveMirror(state, 'ds-example', update)

    expect(state['ds-example']?.archiveMirrors?.['2026-Q2']).toEqual({
      contentHash: 'a'.repeat(64),
      mirroredAt: '2026-07-28T00:01:00.000Z',
      objectKey: 'by-source/hk/example/source.zip',
      version: '2026-Q2.0',
      versionKey: 'sha256:abc',
    })
    expect(state['ds-example']?.databaseImports).toBeUndefined()

    recordUpdateDatabaseImport(state, 'ds-example', update)
    expect(state['ds-example']?.databaseImports?.['2026-Q2']).toMatchObject({
      version: '2026-Q2.0',
      versionKey: 'sha256:abc',
    })
  })

  test('rebuilds only missing CSDI cohorts from a partial target report', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async (input: Parameters<typeof fetch>[0]) => {
        const url = String(input)
        if (url.includes('/archivedDatasetFileList/censtatd-2016')) {
          return new Response(
            JSON.stringify({
              archivedDatasetFileFormatListVO: {
                sourceFormat: [{ fileType: 'FGDB', pos: 1 }],
              },
              archivedDatasetVersionList: [
                {
                  fileList: [
                    {
                      pos: 1,
                      sourceFormat: true,
                      url: `https://static.csdi.gov.hk/download/${'a'.repeat(64)}`,
                    },
                  ],
                  quarter: 4,
                  year: 2021,
                },
              ],
            }),
          )
        }
        if (url.includes('/archivedDatasetFileList/censtatd-2021')) {
          return new Response(
            JSON.stringify({
              archivedDatasetVersionList: [
                {
                  fileList: [
                    {
                      sourceFormat: true,
                      url: `https://static.csdi.gov.hk/download/${'b'.repeat(64)}`,
                    },
                  ],
                  quarter: 1,
                  year: 2025,
                },
              ],
            }),
          )
        }
        throw new Error(`Unexpected request: ${url}`)
      },
      { preconnect: originalFetch.preconnect },
    )

    try {
      const updates = await lookupDatasetUpdates(
        {
          code: 'ds-hk-hkgov-censtatd-division-area-district',
          publisherCode: 'hkgov-censtatd',
          regionCode: 'hk',
          releases: [
            {
              sourceUrl:
                'https://portal.csdi.gov.hk/geoportal/?datasetId=censtatd-2016',
              sourceVersion: '2016',
            },
            {
              sourceUrl:
                'https://portal.csdi.gov.hk/geoportal/?datasetId=censtatd-2021',
              sourceVersion: '2021',
            },
          ],
          theme: 'divisions',
          resourceTypes: ['divisionArea'],
          versionPolicy: {
            scheme: 'reference-year',
            releaseField: 'sourceVersion',
            correctionSuffixSource: 'generated',
          },
        },
        undefined,
        new Map([
          ['2016', null],
          ['2021', '2021.0'],
        ]),
        true,
      )

      expect(updates).toEqual([
        expect.objectContaining({
          archive: expect.objectContaining({ sourceFormat: 'FGDB' }),
          sourceKey: 'archive:censtatd-2016:2021-Q4',
          status: 'new',
          targetSourceKey: '2016',
          version: '2016.0',
        }),
        expect.objectContaining({
          sourceKey: 'archive:censtatd-2021:2025-Q1',
          status: 'new',
          targetSourceKey: '2021',
          version: '2021.0',
        }),
      ])
      expect(updates[1]?.message).not.toContain('Rebuilding the reset target')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('rebuilds a missing static CSDI cohort from its latest archive slot', async () => {
    const originalFetch = globalThis.fetch
    const olderObjectHash = 'a'.repeat(64)
    const newerObjectHash = 'b'.repeat(64)
    globalThis.fetch = Object.assign(
      async () =>
        Response.json({
          archivedDatasetVersionList: [
            {
              fileList: [
                {
                  sourceFormat: true,
                  url: `https://static.csdi.gov.hk/download/${olderObjectHash}`,
                },
              ],
              quarter: 4,
              year: 2023,
            },
            {
              fileList: [
                {
                  sourceFormat: true,
                  url: `https://static.csdi.gov.hk/download/${newerObjectHash}`,
                },
              ],
              quarter: 2,
              year: 2026,
            },
          ],
        }),
      { preconnect: originalFetch.preconnect },
    )

    try {
      const sourceUrl =
        'https://portal.csdi.gov.hk/geoportal/?datasetId=censtatd-static-series'
      const updates = await lookupDatasetUpdates(
        {
          code: 'ds-hk-hkgov-censtatd-division-statistic-example',
          publisherCode: 'hkgov-censtatd',
          regionCode: 'hk',
          releases: [{ sourceUrl, sourceVersion: '2021' }],
          theme: 'stats',
          resourceTypes: ['divisionStatistic'],
          versionPolicy: {
            scheme: 'reference-year',
            releaseField: 'sourceVersion',
            correctionSuffixSource: 'generated',
          },
        },
        undefined,
        new Map([['2021', null]]),
        true,
      )

      expect(updates).toEqual([
        expect.objectContaining({
          sourceKey: 'archive:censtatd-static-series:2026-Q2',
          status: 'new',
          targetSourceKey: '2021',
          version: '2021.0',
        }),
      ])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('selects CSDI source-format downloads from the archive catalogue', () => {
    expect(
      readCsdiArchivedSources({
        archivedDatasetFileFormatListVO: {
          sourceFormat: [
            { fileType: 'GeoJSON', pos: 0 },
            { fileType: 'FGDB', pos: 1 },
          ],
        },
        archivedDatasetVersionList: [
          {
            fileList: [
              { pos: 0, sourceFormat: false, url: 'https://example.test/converted' },
              { pos: 1, sourceFormat: true, url: 'https://example.test/native' },
            ],
            quarter: 3,
            year: 2023,
          },
        ],
      }),
    ).toEqual([
      {
        releaseSlot: '2023-Q3',
        sourceFormat: 'FGDB',
        sourceUrl: 'https://example.test/native',
      },
    ])
  })

  test('collapses fixture-recorded identical CSDI archive slots by source version', async () => {
    const originalFetch = globalThis.fetch
    const sourceObjectHash = 'a'.repeat(64)
    globalThis.fetch = Object.assign(
      async () =>
        Response.json({
          archivedDatasetVersionList: [
            {
              fileList: [
                {
                  sourceFormat: true,
                  url: `https://static.csdi.gov.hk/download/${sourceObjectHash}`,
                },
              ],
              quarter: 4,
              year: 2025,
            },
          ],
        }),
      { preconnect: originalFetch.preconnect },
    )

    try {
      const updates = await lookupDatasetUpdates(
        {
          code: 'ds-hk-hkgov-censtatd-division-area-district',
          publisherCode: 'hkgov-censtatd',
          regionCode: 'hk',
          sourceUrl:
            'https://portal.csdi.gov.hk/geoportal/?datasetId=censtatd_rcd_1635933617052_68946',
          theme: 'divisions',
          resourceTypes: ['divisionArea'],
          versionPolicy: {
            scheme: 'reference-year',
            releaseField: 'sourceVersion',
            correctionSuffixSource: 'generated',
          },
          releases: [
            {
              sourceVersion: '2021',
              sourceUrl:
                'https://portal.csdi.gov.hk/geoportal/?datasetId=censtatd_rcd_1635933617052_68946',
              verifiedIdenticalArchiveSlots: [
                {
                  contentHash: 'b'.repeat(64),
                  releaseSlot: '2025-Q4',
                  sourceObjectHash,
                },
              ],
            },
            {
              sourceVersion: '2016',
              sourceUrl:
                'https://portal.csdi.gov.hk/geoportal/?datasetId=censtatd_rcd_1635932488538_10765',
              verifiedIdenticalArchiveSlots: [
                {
                  contentHash: 'c'.repeat(64),
                  releaseSlot: '2025-Q4',
                  sourceObjectHash,
                },
              ],
            },
          ],
        },
        undefined,
        undefined,
        true,
      )

      expect(updates).toEqual([
        expect.objectContaining({
          sourceKey: 'archive-summary:2021',
          status: 'current',
          targetSourceKey: '2021',
          version: '2021.0',
        }),
        expect.objectContaining({
          sourceKey: 'archive-summary:2016',
          status: 'current',
          targetSourceKey: '2016',
          version: '2016.0',
        }),
      ])
      expect(updates[0]?.archive).toBeUndefined()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('maps distinct CSDI archive slots to their configured source releases', async () => {
    const originalFetch = globalThis.fetch
    const sourceObjectHash2022 = 'a'.repeat(64)
    const sourceObjectHash2024 = 'b'.repeat(64)
    globalThis.fetch = Object.assign(
      async () =>
        Response.json({
          archivedDatasetVersionList: [
            {
              fileList: [
                {
                  sourceFormat: true,
                  url: `https://static.csdi.gov.hk/download/${sourceObjectHash2022}`,
                },
              ],
              quarter: 4,
              year: 2023,
            },
            {
              fileList: [
                {
                  sourceFormat: true,
                  url: `https://static.csdi.gov.hk/download/${sourceObjectHash2024}`,
                },
              ],
              quarter: 3,
              year: 2025,
            },
          ],
        }),
      { preconnect: originalFetch.preconnect },
    )

    try {
      const sourceUrl =
        'https://portal.csdi.gov.hk/geoportal/?datasetId=censtatd_rcd_1635934215448_25451'
      const updates = await lookupDatasetUpdates(
        {
          code: 'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
          publisherCode: 'hkgov-censtatd',
          regionCode: 'hk',
          sourceUrl,
          theme: 'stats',
          resourceTypes: ['divisionStatistic'],
          versionPolicy: {
            scheme: 'reference-year',
            releaseField: 'sourceVersion',
            correctionSuffixSource: 'generated',
          },
          releases: [
            {
              sourceVersion: '2022',
              sourceUrl,
              archiveSlots: [
                {
                  contentHash: 'c'.repeat(64),
                  releaseSlot: '2023-Q4',
                  sourceObjectHash: sourceObjectHash2022,
                },
              ],
            },
            {
              sourceVersion: '2024',
              sourceUrl,
              archiveSlots: [
                {
                  contentHash: 'd'.repeat(64),
                  releaseSlot: '2025-Q3',
                  sourceObjectHash: sourceObjectHash2024,
                },
              ],
            },
          ],
        },
        undefined,
        undefined,
        true,
      )

      expect(updates.map(update => update.version)).toEqual(['2022.0', '2024.0'])
      expect(updates[0]?.downloadPath).toContain(sourceObjectHash2022)
      expect(updates[1]?.downloadPath).toContain(sourceObjectHash2024)
      expect(updates[0]?.downloadPath).not.toBe(updates[1]?.downloadPath)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('does not treat a CSDI archive slot as an unversioned dataset release', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async () =>
        Response.json({
          archivedDatasetVersionList: [
            {
              fileList: [
                {
                  sourceFormat: true,
                  url: `https://static.csdi.gov.hk/download/${'c'.repeat(64)}`,
                },
              ],
              quarter: 2,
              year: 2026,
            },
          ],
        }),
      { preconnect: originalFetch.preconnect },
    )

    try {
      const [update] = await lookupDatasetUpdates(
        {
          code: 'ds-hk-hkgov-hyd-street',
          publisherCode: 'hkgov-hyd',
          regionCode: 'hk',
          sourceUrl:
            'https://portal.csdi.gov.hk/geoportal/?datasetId=hyd_rcd_1632211119955_31211',
          theme: 'streets',
          resourceTypes: ['street'],
          versionPolicy: {
            scheme: 'release-date',
            correctionSuffixSource: 'generated',
          },
        },
        undefined,
        undefined,
        true,
      )

      expect(update).toEqual(
        expect.objectContaining({
          sourceKey: 'archive:hyd_rcd_1632211119955_31211:2026-Q2',
          status: 'new',
          targetSourceKey: 'ds-hk-hkgov-hyd-street',
        }),
      )
      expect(update).not.toHaveProperty('version')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('versions quarterly CSDI releases and corrections from their archive slot', async () => {
    const originalFetch = globalThis.fetch
    const previousSourceObjectHash = 'a'.repeat(64)
    const sourceObjectHash = 'b'.repeat(64)
    globalThis.fetch = Object.assign(
      async () =>
        Response.json({
          archivedDatasetVersionList: [
            {
              fileList: [
                {
                  sourceFormat: true,
                  url: `https://static.csdi.gov.hk/download/${sourceObjectHash}`,
                },
              ],
              quarter: 4,
              year: 2025,
            },
          ],
        }),
      { preconnect: originalFetch.preconnect },
    )

    try {
      const dataset = {
        code: 'ds-hk-hkgov-hyd-street',
        publisherCode: 'hkgov-hyd',
        regionCode: 'hk',
        sourceUrl:
          'https://portal.csdi.gov.hk/geoportal/?datasetId=hyd_rcd_1632211119955_31211',
        theme: 'streets',
        resourceTypes: ['street'],
        versionPolicy: { scheme: 'quarterly', correctionSuffixSource: 'generated' },
      } satisfies DatasetFixture
      const sourceKey = 'archive:hyd_rcd_1632211119955_31211:2025-Q4'
      const previous = {
        sourceChecks: {
          [sourceKey]: {
            version: '2025-Q4.0',
            versionKey: `sha256:${previousSourceObjectHash}`,
          },
        },
      }

      const [update] = await lookupDatasetUpdates(
        dataset,
        previous,
        new Map([[dataset.code, '2025-Q4.0']]),
        true,
      )
      expect(update).toEqual(
        expect.objectContaining({ status: 'new', version: '2025-Q4.1' }),
      )

      const [current] = await lookupDatasetUpdates(
        dataset,
        {
          sourceChecks: {
            [sourceKey]: {
              version: '2025-Q4.1',
              versionKey: `sha256:${sourceObjectHash}`,
            },
          },
        },
        new Map([[dataset.code, '2025-Q4.1']]),
        true,
      )
      expect(current).toEqual(
        expect.objectContaining({ status: 'current', version: '2025-Q4.1' }),
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('normalises quarterly target dates to their calendar-quarter release', () => {
    const dataset = {
      code: 'ds-hk-hkgov-hyd-street',
      publisherCode: 'hkgov-hyd',
      regionCode: 'hk',
      theme: 'streets',
      resourceTypes: ['street'],
      versionPolicy: { scheme: 'quarterly', correctionSuffixSource: 'generated' },
    } satisfies DatasetFixture

    expect(normaliseDatasetVersion(dataset, '2026-06-16')).toBe('2026-Q2.0')
    expect(normaliseDatasetVersion(dataset, '2026-Q3')).toBe('2026-Q3.0')
  })

  test('collapses current CSDI archive slots for the same source release', async () => {
    const originalFetch = globalThis.fetch
    const firstSourceObjectHash = 'a'.repeat(64)
    const secondSourceObjectHash = 'b'.repeat(64)
    globalThis.fetch = Object.assign(
      async () =>
        Response.json({
          archivedDatasetVersionList: [
            {
              fileList: [
                {
                  sourceFormat: true,
                  url: `https://static.csdi.gov.hk/download/${firstSourceObjectHash}`,
                },
              ],
              quarter: 4,
              year: 2025,
            },
            {
              fileList: [
                {
                  sourceFormat: true,
                  url: `https://static.csdi.gov.hk/download/${secondSourceObjectHash}`,
                },
              ],
              quarter: 2,
              year: 2026,
            },
          ],
        }),
      { preconnect: originalFetch.preconnect },
    )

    try {
      const dataset = {
        code: 'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
        publisherCode: 'hkgov-censtatd',
        regionCode: 'hk',
        sourceUrl:
          'https://portal.csdi.gov.hk/geoportal/?datasetId=censtatd_rcd_1635934545173_69201',
        theme: 'stats',
        resourceTypes: ['divisionStatistic'],
        versionPolicy: {
          scheme: 'reference-year',
          releaseField: 'sourceVersion',
          correctionSuffixSource: 'generated',
        },
        releases: [{ sourceVersion: '2021' }],
      } satisfies DatasetFixture
      const sourceKey = 'archive:censtatd_rcd_1635934545173_69201'
      const updates = await lookupDatasetUpdates(
        dataset,
        {
          sourceChecks: {
            [`${sourceKey}:2025-Q4`]: {
              versionKey: `sha256:${firstSourceObjectHash}`,
            },
            [`${sourceKey}:2026-Q2`]: {
              versionKey: `sha256:${secondSourceObjectHash}`,
            },
          },
        },
        new Map([['2021', '2021.0']]),
        true,
      )

      expect(updates).toEqual([
        expect.objectContaining({
          sourceKey: 'archive-summary:2021',
          status: 'current',
          targetSourceKey: '2021',
          version: '2021.0',
        }),
      ])
      expect(updates[0]?.archive).toBeUndefined()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('retries a truncated DPO archive response and excludes today from its query', async () => {
    const originalFetch = globalThis.fetch
    const calls: string[] = []
    globalThis.fetch = Object.assign(
      async (input: Parameters<typeof fetch>[0]) => {
        calls.push(String(input))
        if (calls.length === 1) {
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.error(new Error('JSON Parse error: Unexpected EOF'))
              },
            }),
          )
        }
        if (calls.length === 2) return new Response('{"timestamps":')
        return Response.json({
          timestamps: ['20260726-0930'],
        })
      },
      { preconnect: originalFetch.preconnect },
    )

    try {
      const [update] = await lookupDatasetUpdates(
        {
          code: 'ds-hk-hkgov-dpo-address',
          publisherCode: 'hkgov-dpo',
          regionCode: 'hk',
          sourceUrl:
            'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=dpo_rcd_1629267205232_33603',
          theme: 'addresses',
          resourceTypes: ['address'],
          versionPolicy: {
            scheme: 'release-date',
            correctionSuffixSource: 'generated',
          },
        },
        undefined,
        undefined,
        true,
      )

      expect(calls).toHaveLength(3)
      const archiveUrl = new URL(calls[0] as string)
      const yesterday = new Date(Date.now() - 86_400_000)
        .toISOString()
        .slice(0, 10)
        .replaceAll('-', '')
      expect(archiveUrl.searchParams.get('end')).toBe(yesterday)
      expect(archiveUrl.pathname).toBe('/v1/historical-archive/list-file-versions')
      expect(archiveUrl.searchParams.get('url')).toBe(
        'https://www.als.gov.hk/data/ALS-GeoJSON.zip',
      )
      expect(update).toEqual(
        expect.objectContaining({
          downloadUrl:
            'https://api.data.gov.hk/v1/historical-archive/get-file?time=20260726-0930&url=https%3A%2F%2Fwww.als.gov.hk%2Fdata%2FALS-GeoJSON.zip',
          releaseLastRevisedAt: '20260726-0930',
          status: 'new',
          version: '2026-07-26.0',
        }),
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('separates an older DPO delivery as a download-only archive', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async () =>
        Response.json({
          timestamps: ['20260722-0930', '20260723-1015'],
        }),
      { preconnect: originalFetch.preconnect },
    )

    try {
      const updates = await lookupDatasetUpdates(
        {
          code: 'ds-hk-hkgov-dpo-address',
          publisherCode: 'hkgov-dpo',
          regionCode: 'hk',
          sourceUrl:
            'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=dpo_rcd_1629267205232_33603',
          theme: 'addresses',
          resourceTypes: ['address'],
          versionPolicy: {
            scheme: 'release-date',
            correctionSuffixSource: 'generated',
          },
        },
        {
          sourceChecks: {
            '2026-07-22.0': {
              version: '2026-07-22.0',
              versionKey: '2026-07-22.0',
            },
          },
        },
        undefined,
        true,
      )

      expect(updates).toHaveLength(2)
      expect(updates[0]?.version).toBe('2026-07-23.0')
      expect(updates[0]?.sourceKey).toBe('2026-07-23.0')
      expect(updates[0]?.targetSourceKey).toBe('2026-07-23.0')
      expect(updates[0]?.phase).toBeUndefined()
      expect(updates[1]?.version).toBe('2026-07-22.0')
      expect(updates[1]?.phase).toBe('archives')
      expect(updates[1]?.status).toBe('current')
      expect(updates[0]?.ingest).toBeInstanceOf(Function)
      expect(updates[1]?.download).toBeInstanceOf(Function)
      expect(updates[1]?.ingest).toBeUndefined()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('does not re-ingest an unchanged DPO release when its delivery timestamp changes', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async () => Response.json({ timestamps: ['20260722-0930'] }),
      { preconnect: originalFetch.preconnect },
    )

    try {
      const [update] = await lookupDatasetUpdates(
        {
          code: 'ds-hk-hkgov-dpo-address',
          publisherCode: 'hkgov-dpo',
          regionCode: 'hk',
          sourceUrl:
            'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=dpo_rcd_1629267205232_33603',
          theme: 'addresses',
          resourceTypes: ['address'],
          versionPolicy: {
            scheme: 'release-date',
            correctionSuffixSource: 'generated',
          },
          releasePolicy: {
            archives: { availability: 'limited' },
            checks: {
              archives: { trigger: 'never' },
              newReleases: { trigger: 'periodic', frequency: 'daily' },
              revisions: { trigger: 'never' },
            },
            revisionScope: 'none',
            schedule: 'irregular',
            series: 'rolling',
          },
        },
        {
          releaseLastRevisedAt: '20260722-1931',
          version: '2026-07-22.0',
          versionKey: '2026-07-22.0',
        },
        new Map([['ds-hk-hkgov-dpo-address', '2026-07-22.0']]),
        true,
      )

      expect(update).toEqual(
        expect.objectContaining({
          releaseLastRevisedAt: '20260722-0930',
          status: 'current',
          version: '2026-07-22.0',
        }),
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('builds the Hong Kong Overturist download command', () => {
    expect(buildOverturistCommand('2026-07-23.0', 'divisions')).toEqual([
      process.execPath,
      expect.stringContaining('/overturist/overturist.ts'),
      'get',
      '--division',
      'b4f09a9f-4cba-4a7c-bf58-2e63bc2e913d',
      '--release',
      '2026-07-23.0',
      '--theme',
      'divisions',
      '--replace',
    ])
  })

  test('requests JSON from the Overturist release catalogue', () => {
    expect(buildOverturistReleasesCommand()).toEqual([
      process.execPath,
      expect.stringContaining('/overturist/overturist.ts'),
      'releases',
      '--format',
      'json',
    ])
  })

  test('registers the requested CSDI datasets with their API families', async () => {
    const fixtures = await loadDatasetFixtures(
      new Set([
        'ds-hk-hkgov-hyd-street',
        'ds-hk-hkgov-hyd-sensitive-street',
        'ds-hk-hkgov-hyd-strategic-street',
        'ds-hk-hkgov-hyd-pedestrian-street',
        'ds-hk-hkgov-landsd-division',
      ]),
    )

    expect(fixtures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ds-hk-hkgov-hyd-street',
          sourceLayer: 'SNP',
          theme: 'streets',
          resourceTypes: ['street'],
        }),
        expect.objectContaining({
          code: 'ds-hk-hkgov-landsd-division',
          sourceLayer: 'GEO_PLACE_NAME',
          theme: 'divisions',
          resourceTypes: ['division'],
        }),
        expect.objectContaining({
          code: 'ds-hk-hkgov-hyd-sensitive-street',
          sourceLayer: 'sensitive',
          theme: 'streets',
          resourceTypes: ['street'],
        }),
        expect.objectContaining({
          code: 'ds-hk-hkgov-hyd-strategic-street',
          sourceLayer: 'STRATEGIC',
          theme: 'streets',
          resourceTypes: ['street'],
        }),
        expect.objectContaining({
          code: 'ds-hk-hkgov-hyd-pedestrian-street',
          sourceLayers: [
            'Full_Time_Pedestrian_Street',
            'Hawker_Street',
            'Market_Street',
            'Part_time_Pedestrian_Street',
            'Traffic_Calming_Street',
          ],
          theme: 'streets',
          resourceTypes: ['street'],
        }),
      ]),
    )
  })

  test('registers a version policy for every dataset fixture', async () => {
    const fixtures = await loadDatasetFixtures()

    expect(
      fixtures.every(
        fixture =>
          fixture.versionPolicy &&
          [
            'initial-release-date',
            'reference-date',
            'release-date',
            'quarterly',
            'upstream',
            'reference-year',
          ].includes(fixture.versionPolicy.scheme) &&
          datasetCorrectionSuffixSources.includes(
            fixture.versionPolicy.correctionSuffixSource,
          ),
      ),
    ).toBe(true)
  })

  test('registers a three-phase release policy for every dataset fixture', async () => {
    const fixtures = await loadDatasetFixtures()

    expect(
      fixtures.every(
        fixture =>
          fixture.releasePolicy?.checks.newReleases &&
          fixture.releasePolicy.checks.revisions &&
          fixture.releasePolicy.checks.archives,
      ),
    ).toBe(true)
  })

  test('records DPO as an irregular rolling series with daily archive checks', async () => {
    const [dataset] = await loadDatasetFixtures(new Set(['ds-hk-hkgov-dpo-address']))

    expect(dataset?.releasePolicy).toEqual({
      archives: {
        availability: 'limited',
        entryUrl: 'https://api.data.gov.hk/v1/historical-archive/list-file-versions',
        operation: 'data-gov-historical-file-versions',
      },
      checks: {
        archives: { trigger: 'periodic', frequency: 'daily' },
        newReleases: { trigger: 'periodic', frequency: 'daily' },
        revisions: { trigger: 'never' },
      },
      revisionScope: 'none',
      schedule: 'irregular',
      series: 'rolling',
    })
  })

  test('records Overture as a regular rolling series with conditional checks', async () => {
    const datasets = await loadDatasetFixtures(
      new Set([
        'ds-hk-overture-division',
        'ds-hk-overture-division-area',
        'ds-hk-overture-division-boundary',
        'ds-hk-overture-place',
      ]),
    )

    expect(datasets).toHaveLength(4)
    expect(
      datasets.every(
        dataset =>
          dataset.releasePolicy?.series === 'rolling' &&
          dataset.releasePolicy.schedule === 'regular' &&
          dataset.releasePolicy.revisionScope === 'latest' &&
          dataset.releasePolicy.checks.newReleases.trigger ===
            'after-latest-release-age' &&
          dataset.releasePolicy.checks.newReleases.ageDays === 25 &&
          dataset.releasePolicy.checks.newReleases.frequency === 'daily' &&
          dataset.releasePolicy.checks.revisions.trigger === 'periodic' &&
          dataset.releasePolicy.checks.revisions.frequency === 'daily' &&
          dataset.releasePolicy.checks.archives.trigger === 'on-discovery' &&
          dataset.releasePolicy.checks.archives.discoveries.includes('new-release') &&
          dataset.releasePolicy.archives.availability === 'limited' &&
          dataset.releasePolicy.archives.operation === 'overture-release-catalog',
      ),
    ).toBe(true)
  })

  test('records DPang as a manually maintained rolling series', async () => {
    const [dataset] = await loadDatasetFixtures(new Set(['ds-hk-dpang-street']))

    expect(dataset?.releasePolicy).toEqual({
      archives: { availability: 'full' },
      checks: {
        archives: { trigger: 'never' },
        newReleases: { trigger: 'never' },
        revisions: { trigger: 'never' },
      },
      revisionScope: 'latest',
      schedule: 'irregular',
      series: 'rolling',
    })
  })

  test('records Planning Department divisions as revisable regular cohorts', async () => {
    const datasets = await loadDatasetFixtures(
      new Set(['ds-hk-hkgov-pland-division-new-town', 'ds-hk-hkgov-pland-division-pu']),
    )

    expect(datasets).toHaveLength(2)
    expect(
      datasets.every(
        dataset =>
          dataset.releasePolicy?.series === 'cohort' &&
          dataset.releasePolicy.schedule === 'regular' &&
          dataset.releasePolicy.revisionScope === 'all' &&
          dataset.releasePolicy.checks.newReleases.trigger === 'periodic' &&
          dataset.releasePolicy.checks.newReleases.frequency === 'monthly' &&
          dataset.releasePolicy.checks.revisions.trigger === 'periodic' &&
          dataset.releasePolicy.checks.revisions.frequency === 'weekly' &&
          dataset.releasePolicy.checks.archives.trigger === 'periodic' &&
          dataset.releasePolicy.checks.archives.frequency === 'quarterly' &&
          dataset.releasePolicy.archives.availability === 'full' &&
          dataset.releasePolicy.archives.operation === 'csdi-archived-dataset',
      ),
    ).toBe(true)
  })

  test('records C&SD districts as initial-only cohorts with revision archive scans', async () => {
    const [dataset] = await loadDatasetFixtures(
      new Set(['ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district']),
    )

    expect(dataset?.releasePolicy).toEqual({
      archives: {
        availability: 'full',
        entryUrl:
          'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=censtatd_rcd_1635933617052_68946',
        operation: 'csdi-archived-dataset',
      },
      checks: {
        archives: {
          discoveries: ['revision'],
          includeInitialDownload: true,
          trigger: 'on-discovery',
        },
        newReleases: { trigger: 'initial-only' },
        revisions: { frequency: 'weekly', trigger: 'periodic' },
      },
      revisionScope: 'all',
      schedule: 'regular',
      series: 'cohort',
    })
  })

  test('records C&SD statistics as initial-only cohorts with revision archive scans', async () => {
    const datasets = await loadDatasetFixtures()
    const statistics = datasets.filter(
      dataset =>
        dataset.publisherCode === 'hkgov-censtatd' && dataset.theme === 'stats',
    )

    expect(statistics).toHaveLength(8)
    expect(
      statistics.every(
        dataset =>
          dataset.releasePolicy?.series === 'cohort' &&
          dataset.releasePolicy.schedule === 'regular' &&
          dataset.releasePolicy.revisionScope === 'all' &&
          dataset.releasePolicy.checks.newReleases.trigger === 'initial-only' &&
          dataset.releasePolicy.checks.revisions.trigger === 'periodic' &&
          dataset.releasePolicy.checks.revisions.frequency === 'weekly' &&
          dataset.releasePolicy.checks.archives.trigger === 'on-discovery' &&
          dataset.releasePolicy.checks.archives.includeInitialDownload === true &&
          dataset.releasePolicy.archives.availability === 'full' &&
          dataset.releasePolicy.archives.operation === 'csdi-archived-dataset',
      ),
    ).toBe(true)
  })

  test('records HAD districts as a revisable irregular rolling series', async () => {
    const [dataset] = await loadDatasetFixtures(
      new Set(['ds-hk-hkgov-had-division-area-district']),
    )

    expect(dataset?.releasePolicy).toEqual({
      archives: {
        availability: 'full',
        entryUrl:
          'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=had_rcd_1634523272907_75218',
        operation: 'csdi-archived-dataset',
      },
      checks: {
        archives: { discoveries: ['new-release'], trigger: 'on-discovery' },
        newReleases: { frequency: 'monthly', trigger: 'periodic' },
        revisions: { frequency: 'weekly', trigger: 'periodic' },
      },
      revisionScope: 'latest',
      schedule: 'irregular',
      series: 'rolling',
    })
  })

  test('records HyD and TD streets as quarterly rolling series', async () => {
    const datasets = await loadDatasetFixtures()
    const streets = datasets.filter(
      dataset =>
        dataset.theme === 'streets' &&
        [
          'ds-hk-hkgov-hyd-street',
          'ds-hk-hkgov-hyd-strategic-street',
          'ds-hk-hkgov-hyd-sensitive-street',
          'ds-hk-hkgov-hyd-pedestrian-street',
        ].includes(dataset.code),
    )

    expect(streets).toHaveLength(4)
    expect(
      streets.every(
        dataset =>
          dataset.releasePolicy?.series === 'rolling' &&
          dataset.releasePolicy.schedule === 'regular' &&
          dataset.releasePolicy.revisionScope === 'latest' &&
          dataset.releasePolicy.checks.newReleases.trigger ===
            'after-latest-release-age' &&
          dataset.releasePolicy.checks.newReleases.ageDays === 90 &&
          dataset.releasePolicy.checks.newReleases.frequency === 'daily' &&
          dataset.releasePolicy.checks.revisions.trigger === 'periodic' &&
          dataset.releasePolicy.checks.revisions.frequency === 'weekly' &&
          dataset.releasePolicy.checks.archives.trigger === 'on-discovery' &&
          dataset.releasePolicy.checks.archives.discoveries.includes('new-release') &&
          dataset.releasePolicy.checks.archives.includeInitialDownload === true &&
          dataset.releasePolicy.archives.availability === 'full' &&
          dataset.releasePolicy.archives.operation === 'csdi-archived-dataset',
      ),
    ).toBe(true)
  })

  test('records LandsD divisions as initial-only cohorts with revision archive scans', async () => {
    const [dataset] = await loadDatasetFixtures(
      new Set(['ds-hk-hkgov-landsd-division']),
    )

    expect(dataset?.releasePolicy).toEqual({
      archives: {
        availability: 'full',
        entryUrl:
          'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=landsd_rcd_1648571595120_89752',
        operation: 'csdi-archived-dataset',
      },
      checks: {
        archives: {
          discoveries: ['revision'],
          includeInitialDownload: true,
          trigger: 'on-discovery',
        },
        newReleases: { trigger: 'initial-only' },
        revisions: { frequency: 'weekly', trigger: 'periodic' },
      },
      revisionScope: 'all',
      schedule: 'regular',
      series: 'cohort',
    })
  })

  test('records the two LandsD street series separately', async () => {
    const datasets = await loadDatasetFixtures(
      new Set(['ds-hk-hkgov-landsd-road-centreline', 'ds-hk-hkgov-landsd-street']),
    )
    const centreline = datasets.find(
      dataset => dataset.code === 'ds-hk-hkgov-landsd-road-centreline',
    )
    const notices = datasets.find(
      dataset => dataset.code === 'ds-hk-hkgov-landsd-street',
    )

    expect(centreline?.releasePolicy).toMatchObject({
      archives: { availability: 'full', operation: 'csdi-archived-dataset' },
      checks: {
        archives: {
          discoveries: ['new-release'],
          includeInitialDownload: true,
          trigger: 'on-discovery',
        },
        newReleases: {
          ageDays: 28,
          frequency: 'daily',
          trigger: 'after-latest-release-age',
        },
        revisions: { frequency: 'weekly', trigger: 'periodic' },
      },
      revisionScope: 'latest',
      schedule: 'regular',
      series: 'rolling',
    })
    expect(notices?.releasePolicy).toEqual({
      archives: { availability: 'none' },
      checks: {
        archives: { trigger: 'never' },
        newReleases: { frequency: 'weekly', trigger: 'periodic' },
        revisions: { trigger: 'never' },
      },
      revisionScope: 'none',
      schedule: 'irregular',
      series: 'rolling',
    })
  })

  test('keeps the initial release date when a later delivery is a correction', () => {
    const dataset = {
      code: 'ds-example',
      publisherCode: 'example',
      regionCode: 'hk',
      theme: 'places',
      type: 'place',
      versionPolicy: {
        scheme: 'initial-release-date',
        correctionSuffixSource: 'generated',
      },
    } as const

    expect(
      resolveDatasetVersion(
        dataset,
        '2026-07-23',
        {
          versionKey: '2026-07-22.0',
          releaseLastRevisedAt: '2026-07-22',
        },
        '2026-07-23',
      ),
    ).toBe('2026-07-22.1')
  })

  test('uses a new release date as the base for release-date policies', () => {
    const dataset = {
      code: 'ds-example',
      publisherCode: 'example',
      regionCode: 'hk',
      theme: 'places',
      type: 'place',
      versionPolicy: { scheme: 'release-date', correctionSuffixSource: 'generated' },
    } as const

    expect(
      resolveDatasetVersion(
        dataset,
        '2026-07-23',
        {
          versionKey: '2026-07-22.0',
          releaseLastRevisedAt: '2026-07-22',
        },
        '2026-07-23',
      ),
    ).toBe('2026-07-23.0')
  })

  test('preserves an upstream correction suffix instead of generating one', () => {
    const dataset = {
      code: 'ds-example',
      publisherCode: 'example',
      regionCode: 'hk',
      theme: 'places',
      type: 'place',
      versionPolicy: {
        scheme: 'upstream',
        correctionSuffixSource: 'upstream',
      },
    } as const

    expect(
      resolveDatasetVersion(
        dataset,
        '2026-07-23.2',
        {
          versionKey: '2026-07-23.0',
          releaseLastRevisedAt: '2026-07-23.0',
        },
        '2026-07-23.2',
      ),
    ).toBe('2026-07-23.2')
  })
})

describe('LandsD street source', () => {
  test('does not replay notices before the target release when the local cursor is partial', async () => {
    const englishPage = `
      <li>Year 2026 (Last modified: 3.7.2026)</li>
      <table>
        <tr data-year="2016"><td>22 January 2016</td><td>First Street</td><td>Central</td><td>Declaration of street name</td><td><a href="/doc/en/2016-01.pdf">G.N.1001</a></td><td>-</td></tr>
        <tr data-year="2026"><td>17 June 2026</td><td>Current Street</td><td>Central</td><td>Declaration of street name</td><td><a href="/doc/en/2026-06.pdf">G.N.2001</a></td><td>-</td></tr>
        <tr data-year="2026"><td>3 July 2026</td><td>Next Street</td><td>Central</td><td>Declaration of street name</td><td><a href="/doc/en/2026-07.pdf">G.N.2002</a></td><td>-</td></tr>
      </table>
    `
    const traditionalChinesePage = `
      <li>2026 年（最後修訂日期: 3.7.2026）<div class="hidden_revision_date">3.7.2026</div></li>
      <table>
        <tr data-year="2016"><td>2016年1月22日</td><td>第一街</td><td>中西區</td><td>宣布街道名稱</td><td><a href="/doc/tc/2016-01.pdf">第1001號</a></td><td>-</td></tr>
        <tr data-year="2026"><td>2026年6月17日</td><td>現有街</td><td>中西區</td><td>宣布街道名稱</td><td><a href="/doc/tc/2026-06.pdf">第2001號</a></td><td>-</td></tr>
        <tr data-year="2026"><td>2026年7月3日</td><td>下一街</td><td>中西區</td><td>宣布街道名稱</td><td><a href="/doc/tc/2026-07.pdf">第2002號</a></td><td>-</td></tr>
      </table>
    `
    const originalFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async (input: Parameters<typeof fetch>[0]) =>
        new Response(
          String(input).includes('/tc/') ? traditionalChinesePage : englishPage,
        ),
      { preconnect: originalFetch.preconnect },
    )

    try {
      const julyNotice = pairLandsdStreetNoticePages({
        en: parseLandsdStreetSourcePage(englishPage, 'en'),
        zhHant: parseLandsdStreetSourcePage(traditionalChinesePage, 'zh-Hant'),
      }).find(notice => notice.publicationDate === '2026-07-03')
      if (!julyNotice) throw new Error('Expected the July LandsD notice.')

      const updates = await lookupDatasetUpdates(
        {
          code: 'ds-hk-hkgov-landsd-street',
          publisherCode: 'hkgov-landsd',
          regionCode: 'hk',
          sourceUrl:
            'https://www.landsd.gov.hk/en/survey-mapping/mapping/street-geographical-place-naming/street-naming.html',
          theme: 'streets',
          resourceTypes: ['street'],
          versionPolicy: {
            scheme: 'release-date',
            correctionSuffixSource: 'generated',
          },
        },
        { sourceCursor: [julyNotice.id] },
        new Map([['ds-hk-hkgov-landsd-street', '2026-06-17.0']]),
        true,
      )

      expect(updates).toEqual([
        expect.objectContaining({
          status: 'new',
          version: '2026-07-03.0',
        }),
      ])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('parses the notice table and resolves relative source links', () => {
    const page = parseLandsdStreetNoticePage(`
      <li>Year 2026 (Last modified: 3.7.2026)</li>
      <table><tr data-year="2026">
        <td>3 July 2026</td><td>Central Wan Chai Bypass</td>
        <td>Central &amp; Western - Wan Chai</td><td>Declaration of street name</td>
        <td><a href="/notice.pdf">G.N.4034</a></td>
        <td><a href="/plan.pdf">HKRM52</a></td>
      </tr></table>
    `)

    expect(page.lastModified).toBe('2026-07-03')
    expect(page.notices).toEqual([
      expect.objectContaining({
        date: '2026-07-03',
        district: 'Central & Western - Wan Chai',
        noticeLink: {
          label: 'G.N.4034',
          url: 'https://www.landsd.gov.hk/notice.pdf',
        },
        nameEn: 'Central Wan Chai Bypass',
        planLinks: [
          {
            label: 'HKRM52',
            url: 'https://www.landsd.gov.hk/plan.pdf',
          },
        ],
      }),
    ])
  })

  test('parses fixed-width PDF rows and normalises PDF hyphens', () => {
    const rows = parseLandsdStreetPdfText(`
English Name                         Chinese Name   District Code
ABERDEEN RESERVOIR ROAD              香港仔水塘道         WC‐C&W‐S
                            Page 1                            Dec 2025
District Code Reference Table
`)

    expect(rows).toEqual([
      {
        englishName: 'ABERDEEN RESERVOIR ROAD',
        chineseName: '香港仔水塘道',
        districtCode: 'WC-C&W-S',
      },
    ])
  })
})
