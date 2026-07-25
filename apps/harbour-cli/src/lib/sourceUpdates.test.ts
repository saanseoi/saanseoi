import { describe, expect, test } from 'bun:test'

import {
  parseLandsdStreetNoticePage,
  parseLandsdStreetPdfText,
} from './landsdStreet.ts'

import {
  buildOverturistCommand,
  datasetName,
  isNewUpdate,
  isUpdateCheckDue,
  lookupDatasetUpdates,
  loadDatasetFixtures,
  recordUpdateState,
  readCsdiArchivedSources,
  resolveDatasetVersion,
  shouldCheckDataset,
  type DatasetUpdate,
  type DatasetFixture,
  type UpdateStateEntry,
} from './sourceUpdates.ts'

describe('dataset update registry', () => {
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
        versionPolicy: { scheme: 'upstream', correction: false },
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
        versionPolicy: { scheme: 'upstream', correction: true },
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
      versionPolicy: { scheme: 'upstream', correction: false },
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

  test('honours an explicit update freeze', () => {
    const dataset = {
      code: 'ds-example',
      publisherCode: 'example',
      regionCode: 'hk',
      theme: 'places',
      type: 'place',
      versionPolicy: { scheme: 'upstream', correction: false },
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
      versionPolicy: { scheme: 'upstream', correction: false },
      updatePolicy: { allowUpdates: true, checkFrequency: 'monthly' as const },
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
        versionPolicy: { scheme: 'upstream', correction: false },
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

  test('discovers native archives for every configured CSDI catalogue', async () => {
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
            correction: true,
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
          version: '2021-Q4',
        }),
        expect.objectContaining({
          sourceKey: 'archive:censtatd-2021:2025-Q1',
          status: 'new',
          version: '2025-Q1',
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
            'upstream',
            'reference-year',
          ].includes(fixture.versionPolicy.scheme) &&
          typeof fixture.versionPolicy.correction === 'boolean',
      ),
    ).toBe(true)
  })

  test('keeps the initial release date when a later delivery is a correction', () => {
    const dataset = {
      code: 'ds-example',
      publisherCode: 'example',
      regionCode: 'hk',
      theme: 'places',
      type: 'place',
      versionPolicy: { scheme: 'initial-release-date', correction: true },
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
      versionPolicy: { scheme: 'release-date', correction: true },
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
})

describe('LandsD street source', () => {
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
