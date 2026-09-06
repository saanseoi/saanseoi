import { expect, test } from 'bun:test'
import {
  pairLandsdStreetNoticePages,
  parseLandsdStreetNoticePage,
  parseLandsdStreetPdfText,
  parseLandsdStreetSourcePage,
} from './landsd/street/landsdStreet.ts'
import {
  buildOverturistCommand,
  buildOverturistReleasesCommand,
  lookupDatasetUpdates,
} from './sourceUpdates.ts'

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
        version: '2026-07-26.0',
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
