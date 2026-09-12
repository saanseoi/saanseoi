import { expect, test } from 'bun:test'
import {
  assertCsdiArchiveDownload,
  assertCsdiArchiveUrl,
  findCsdiDatasetRelease,
  lookupDatasetUpdates,
  loadDatasetFixtures,
  normaliseDatasetVersion,
  readCsdiArchivedSources,
  resolveCsdiArchiveRedirect,
  type DatasetFixture,
} from './sourceUpdates.ts'

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

test('uses direct CSDI publisher-download URLs as release metadata for archive slots', async () => {
  const datasets = await loadDatasetFixtures()
  const expectedReleases = [
    ['ds-hk-hkgov-hyd-pedestrian-street', '2026-Q1'],
    ['ds-hk-hkgov-hyd-sensitive-street', '2025-Q1'],
    ['ds-hk-hkgov-hyd-strategic-street', '2025-Q1'],
    ['ds-hk-hkgov-hyd-street', '2026-Q2'],
    ['ds-hk-hkgov-landsd-road-centreline', '2026-Q2'],
  ] as const

  for (const [datasetCode, sourceVersion] of expectedReleases) {
    const dataset = datasets.find(candidate => candidate.code === datasetCode)
    if (!dataset?.sourceUrl) throw new Error(`Missing fixture for ${datasetCode}.`)

    const release = findCsdiDatasetRelease(
      dataset,
      dataset.sourceUrl,
      sourceVersion,
      'sha256:unrelated-archive-object',
    )
    expect(release).toMatchObject({
      sourceUrl: expect.stringMatching(
        /^https:\/\/static\.csdi\.gov\.hk\/csdi-webpage\/download\/common\//,
      ),
      sourceVersion,
    })
  }
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
            sourceUrl: 'https://portal.csdi.gov.hk/geoportal/?datasetId=censtatd-2016',
            sourceVersion: '2016',
          },
          {
            sourceUrl: 'https://portal.csdi.gov.hk/geoportal/?datasetId=censtatd-2021',
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

test('maps an unpinned current CSDI slot to its matching configured source version', async () => {
  const originalFetch = globalThis.fetch
  const sourceObjectHash = 'c'.repeat(64)
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
            quarter: 2,
            year: 2026,
          },
        ],
      }),
    { preconnect: originalFetch.preconnect },
  )

  try {
    const sourceUrl =
      'https://portal.csdi.gov.hk/geoportal/?datasetId=censtatd_rcd_1635934545173_69201'
    const [update] = await lookupDatasetUpdates(
      {
        code: 'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
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
          { sourceVersion: '2024', sourceUrl },
          { sourceVersion: '2026-Q2', sourceUrl },
        ],
      },
      undefined,
      undefined,
      true,
    )

    expect(update).toEqual(
      expect.objectContaining({
        sourceKey: 'archive:censtatd_rcd_1635934545173_69201:2026-Q2',
        status: 'new',
        targetSourceKey: '2026-Q2',
        version: '2026-Q2',
      }),
    )
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
