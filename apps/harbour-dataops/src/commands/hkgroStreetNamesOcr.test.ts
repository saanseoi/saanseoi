import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { retrieveHkgroStreetNameArchive } from './hkgroStreetNames.ts'
import { discoverHkgroStreetNames } from './hkgroStreetNamesDiscover.ts'
import { hkgroOcrOutputPath, ocrHkgroStreetNameArchive } from './hkgroStreetNamesOcr.ts'

const TOC = `
  <table>
    <tr><td colspan=2>05-Jan-1901</td></tr>
    <tr><td>49</td><td><a href="view/g1901/460097.pdf">Change of name of Market Street</a></td></tr>
  </table>
`

const ocrResult = {
  extraction: {
    engine: 'PaddleOCR' as const,
    engineVersion: '2.9.1',
    language: 'en' as const,
    method: 'ocr' as const,
    model: 'en',
    renderDpi: 300 as const,
  },
  pages: [
    {
      pageNumber: 1,
      rawPaddleOcrNdjson:
        '{"type":"metadata","engine":"PaddleOCR","engineVersion":"2.9.1","model":"en"}\n{"type":"word","left":1,"top":2,"text":"Market Street","confidence":0.99}\n',
      words: [{ confidence: 0.99, left: 1, text: 'Market Street', top: 2 }],
    },
  ],
  text: 'Market Street',
}

describe('HKGRO street-name OCR', () => {
  test('stores raw OCR output with explicit provenance and resumes only validated results', async () => {
    const archiveDir = await mkdtemp(join(tmpdir(), 'saanseoi-hkgro-ocr-test-'))
    await retrieveHkgroStreetNameArchive({
      archiveDir,
      fetcher: async url =>
        url.includes('browseGa.jsp')
          ? new Response(
              `<div>Hong Kong Government Gazette 1901<br> Table of Contents</div>${TOC}`,
            )
          : new Response('%PDF-1.7 test evidence'),
      years: [1901],
    })
    let runs = 0
    const runner = async () => {
      runs += 1
      return ocrResult
    }
    await expect(
      ocrHkgroStreetNameArchive({ archiveDir, runner, years: [1901] }),
    ).resolves.toMatchObject({ completeCount: 1, reusedCount: 0, sourceCount: 1 })
    await expect(
      ocrHkgroStreetNameArchive({ archiveDir, runner, years: [1901] }),
    ).resolves.toMatchObject({ completeCount: 0, reusedCount: 1, sourceCount: 1 })
    expect(runs).toBe(1)
    const result = JSON.parse(
      await readFile(join(archiveDir, 'ocr', '1901', '460097.ocr.json'), 'utf8'),
    )
    expect(result).toMatchObject({
      extraction: { language: 'en', method: 'ocr', renderDpi: 300 },
      pages: [
        {
          rawPaddleOcrNdjson: expect.stringContaining('"type":"word"'),
          words: [{ confidence: 0.99, text: 'Market Street' }],
        },
      ],
      source: { hkgroPdfId: '460097', year: 1901 },
    })
    expect(hkgroOcrOutputPath(1901, '460097')).toBe(
      'data/hku/hkgro/street-name/ocr/1901/460097.ocr.json',
    )
  })

  test('records an unparseable OCR attempt with details, then fails immediately', async () => {
    const archiveDir = await mkdtemp(join(tmpdir(), 'saanseoi-hkgro-ocr-test-'))
    await retrieveHkgroStreetNameArchive({
      archiveDir,
      fetcher: async url =>
        url.includes('browseGa.jsp')
          ? new Response(
              `<div>Hong Kong Government Gazette 1901<br> Table of Contents</div>${TOC}`,
            )
          : new Response('%PDF-1.7 test evidence'),
      years: [1901],
    })
    await expect(
      ocrHkgroStreetNameArchive({
        archiveDir,
        runner: async () => {
          throw new Error('model weights unavailable')
        },
        years: [1901],
      }),
    ).rejects.toThrow('model weights unavailable')
    const manifest = JSON.parse(
      await readFile(join(archiveDir, 'ocr-manifest.json'), 'utf8'),
    )
    expect(manifest.records).toEqual([
      expect.objectContaining({
        failure: expect.stringContaining('model weights unavailable'),
        status: 'unparseable',
      }),
    ])
  })

  test('keeps the default discovery review beside a custom archive', async () => {
    const archiveDir = await mkdtemp(join(tmpdir(), 'saanseoi-hkgro-ocr-test-'))
    await retrieveHkgroStreetNameArchive({
      archiveDir,
      fetcher: async url =>
        url.includes('browseGa.jsp')
          ? new Response(
              `<div>Hong Kong Government Gazette 1901<br> Table of Contents</div>${TOC}`,
            )
          : new Response('%PDF-1.7 test evidence'),
      years: [1901],
    })
    await ocrHkgroStreetNameArchive({
      archiveDir,
      runner: async () => ocrResult,
      years: [1901],
    })

    await expect(discoverHkgroStreetNames({ archiveDir })).resolves.toMatchObject({
      reviewPath: join(archiveDir, 'discovery', 'review.json'),
    })
  })

  test('rejects non-integer API year filters', async () => {
    await expect(
      ocrHkgroStreetNameArchive({ archiveDir: '/tmp', years: [1901.5] }),
    ).rejects.toThrow('HKGRO OCR years must be whole years between 1842 and 1941.')
  })
})
