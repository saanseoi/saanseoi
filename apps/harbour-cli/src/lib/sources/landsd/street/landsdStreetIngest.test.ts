import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ingestLandsdStreetSource } from './landsdStreetIngest.ts'

const englishPage = `
  <li>Year 2026 (Last modified: 3.7.2026)</li>
  <table><tr data-year="2026">
    <td>3 July 2026</td><td>Central Wan Chai Bypass</td>
    <td>Central &amp; Western - Wan Chai - Eastern</td><td>Declaration of street name</td>
    <td><a href="/doc/en/street-name/egazette/2026/egn202630274034.pdf">G.N.4034</a></td>
    <td><a href="/doc/en/street-name/gnplan/2026/HKRM52.pdf">HKRM52</a></td>
  </tr></table>
`

const traditionalChinesePage = `
  <li>2026 年（最後修訂日期: 3.7.2026）<div class="hidden_revision_date">3.7.2026</div></li>
  <table><tr data-year="2026">
    <td>2026年7月3日</td><td>中環灣仔繞道</td>
    <td>中西區-灣仔-東區</td><td>宣布街道名稱</td>
    <td><a href="/doc/tc/street-name/egazette/2026/cgn202630274034.pdf">第4034號</a></td>
    <td><a href="/doc/en/street-name/gnplan/2026/HKRM52.pdf">HKRM52</a></td>
  </tr></table>
`

const validPdfBytes = createMinimalPdf()

test('stages paired notice releases with managed evidence URLs and an operator report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'saanseoi-landsd-ingest-'))
  let assetNumber = 0
  let rejectPdfDownloads = false
  const progress: string[] = []
  const sourceFetch = Object.assign(
    async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url.endsWith('.pdf')) {
        if (rejectPdfDownloads)
          throw new Error('The second run should reuse the persisted PDF artefact.')
        return new Response(validPdfBytes, {
          headers: { 'content-type': 'application/pdf' },
        })
      }
      if (url.includes('/tc/')) {
        return new Response(
          traditionalChinesePage.replace('宣布街道名稱', '擬更改街道名稱公告'),
        )
      }
      if (url.endsWith('street-naming.html')) {
        return new Response(
          englishPage.replace(
            'Declaration of street name',
            'Notice of intention to change street name',
          ),
        )
      }
      throw new Error(`Unexpected source URL ${url}`)
    },
    { preconnect: fetch.preconnect },
  )

  try {
    const result = await ingestLandsdStreetSource({
      includeBaseline: false,
      outputDir: root,
      target: { environment: 'preview', remote: true },
      writeFixtures: false,
      fetch: sourceFetch,
      onProgress: event => progress.push(event.message),
      publishAsset: async () => {
        assetNumber += 1
        return {
          source: {
            assetId: `asset-${assetNumber}`,
            url: `https://preview.api.saanseoi.hk/v0/assets/asset-${assetNumber}`,
          },
          manifest: {
            assetId: `manifest-${assetNumber}`,
            url: `https://preview.api.saanseoi.hk/v0/assets/manifest-${assetNumber}`,
          },
        }
      },
    })

    expect(result.releases).toHaveLength(1)
    expect(result.releases[0]).toMatchObject({
      fixturePath: null,
      sourceVersion: '2026-07-03.0',
    })
    const i18n = result.releases[0]?.records[0]?.i18n
    expect(i18n).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Central Wan Chai Bypass' }),
        expect.objectContaining({ locale: 'zh-Hant', name: '中環灣仔繞道' }),
      ]),
    )
    expect(result.releases[0]?.records[0]?.evidenceAssets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'G.N.4034',
          originalUrl:
            'https://www.landsd.gov.hk/doc/en/street-name/egazette/2026/egn202630274034.pdf',
          role: 'governmentNotice',
        }),
        expect.objectContaining({
          label: 'HKRM52',
          originalUrl:
            'https://www.landsd.gov.hk/doc/en/street-name/gnplan/2026/HKRM52.pdf',
          role: 'gazettePlan',
        }),
      ]),
    )
    expect(
      Object.keys(i18n?.find(record => record.locale === 'en') ?? {}).sort(),
    ).toEqual(['description', 'locale', 'name'])
    expect(
      result.releases[0]?.records[0]?.evidenceAssets.every(
        link => !link.assetUrl.includes(link.objectKey),
      ),
    ).toBe(true)
    expect(JSON.parse(await readFile(result.reportPath, 'utf8'))).toMatchObject({
      assetFailures: [],
      pairedNoticeCount: 1,
      sourcePageRows: { en: 1, zhHant: 1 },
    })
    expect(progress).toEqual(
      expect.arrayContaining([
        'Refreshing English and Traditional Chinese source-page indexes to discover notices; cached PDFs will not be downloaded again',
        'Parsed 1 English and 1 Traditional Chinese source-page row(s); pairing bilingual notices',
        expect.stringContaining('Downloading source PDF 1/4'),
        'Extracting text from Government Notice PDFs (0/1)',
        expect.stringContaining('Rendering Gazette Plan previews (1/1)'),
        'Writing release payload and operator report',
      ]),
    )
    rejectPdfDownloads = true
    const resumedProgress: string[] = []
    await expect(
      ingestLandsdStreetSource({
        includeBaseline: false,
        outputDir: root,
        target: { environment: 'preview', remote: true },
        writeFixtures: false,
        fetch: sourceFetch,
        onProgress: event => resumedProgress.push(event.message),
        publishAsset: async () => {
          assetNumber += 1
          return {
            source: {
              assetId: `asset-${assetNumber}`,
              url: `https://preview.api.saanseoi.hk/v0/assets/asset-${assetNumber}`,
            },
            manifest: {
              assetId: `manifest-${assetNumber}`,
              url: `https://preview.api.saanseoi.hk/v0/assets/manifest-${assetNumber}`,
            },
          }
        },
      }),
    ).resolves.toMatchObject({ releases: expect.any(Array) })
    expect(resumedProgress).toEqual(
      expect.arrayContaining([
        'Found 3 cached source PDF artefact(s) in this stage directory; matching PDFs will be reused by role, URL and locale',
        expect.stringContaining('reusing 3 cached LandsD PDF(s), downloading 0'),
        expect.stringContaining('Reusing cached source PDF 1/4'),
        expect.stringContaining('Reusing cached Gazette Plan previews (1/1)'),
      ]),
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function createMinimalPdf() {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 4 0 R >>\nendobj\n',
    '4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const object of objects) {
    offsets.push(pdf.length)
    pdf += object
  }
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets
    .slice(1)
    .map(offset => `${offset.toString().padStart(10, '0')} 00000 n \n`)
    .join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

test('writes a blocking operator report when bilingual notice pairing fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'saanseoi-landsd-pairing-failure-'))
  const sourceFetch = Object.assign(
    async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url.includes('/tc/'))
        return new Response(
          traditionalChinesePage.replace('2026年7月3日', '2026年7月4日'),
        )
      if (url.endsWith('street-naming.html')) return new Response(englishPage)
      throw new Error(`Unexpected source URL ${url}`)
    },
    { preconnect: fetch.preconnect },
  )

  try {
    await expect(
      ingestLandsdStreetSource({
        includeBaseline: false,
        outputDir: root,
        target: { environment: 'preview', remote: true },
        fetch: sourceFetch,
        publishAsset: async () => ({
          source: {
            assetId: '11111111-1111-4111-8111-111111111111',
            url: 'https://preview.api.saanseoi.hk/v0/assets/11111111-1111-4111-8111-111111111111',
          },
          manifest: {
            assetId: '22222222-2222-4222-8222-222222222222',
            url: 'https://preview.api.saanseoi.hk/v0/assets/22222222-2222-4222-8222-222222222222',
          },
        }),
      }),
    ).rejects.toThrow('LandsD bilingual pairing failed')

    expect(
      JSON.parse(await readFile(join(root, 'operator-report.json'), 'utf8')),
    ).toMatchObject({
      assetFailures: [],
      pairedNoticeCount: 0,
      pairingFailures: [expect.stringContaining('LandsD bilingual pairing failed')],
      sourcePageRows: { en: 1, zhHant: 1 },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
