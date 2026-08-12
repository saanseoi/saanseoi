import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  hkgroCandidateReasons,
  hkgroLocalPath,
  hkgroPdfUrl,
  parseHkgroToc,
  retrieveHkgroStreetNameArchive,
  runHkgroStreetNameRetrieveCommand,
} from './hkgroStreetNames.ts'

const TOC = `
  <table>
    <tr><td colspan=2>05-Jan-1901</td></tr>
    <tr><td>49</td><td><a href="view/g1901/460097.pdf">Change of name of Market Street</a></td></tr>
    <tr><td>50</td><td><a href="view/g1901/460100.pdf">Appointment of a Justice of the Peace</a></td></tr>
    <tr><td colspan=2>12-Jan-1901</td></tr>
    <tr><td>51</td><td><a href="view/g1901/460101.pdf">Naming of a lane &amp; a road</a><br><a href="view/g1901/460102.pdf">Naming of a lane (in Chinese)</a></td></tr>
  </table>
`

describe('HKGRO street-name retrieval', () => {
  test('retains every TOC record and marks broad candidates with reasons', () => {
    const records = parseHkgroToc(1901, TOC)
    expect(records).toHaveLength(4)
    expect(records[0]).toMatchObject({
      candidateReasons: ['street', 'names-of', 'change-of-names'],
      classification: 'unclassified',
      hkgroPdfId: '460097',
      notificationNumber: '49',
      publicationDate: '1901-01-05',
    })
    expect(records[1]).toMatchObject({
      candidateReasons: [],
      classification: 'not-candidate',
      hkgroPdfId: '460100',
    })
    expect(records[2]).toMatchObject({
      candidateReasons: ['road', 'lane', 'naming'],
      hkgroPdfId: '460101',
      publicationDate: '1901-01-12',
      subject: 'Naming of a lane & a road',
    })
    expect(records[3]).toMatchObject({ hkgroPdfId: '460102' })
  })

  test('uses fixed official and local paths', () => {
    expect(hkgroPdfUrl(1901, '461264')).toBe(
      'https://sunzi.lib.hku.hk/hkgro/view/g1901/461264.pdf',
    )
    expect(hkgroLocalPath(1901, '461264')).toBe(
      'data/hku/hkgro/street-name/1901/461264.pdf',
    )
    expect(hkgroCandidateReasons('Naming of a lane between houses')).toEqual([
      'lane',
      'naming',
    ])
  })

  test('downloads candidates, hashes them, and resumes from validated evidence', async () => {
    const archiveDir = await mkdtemp(join(tmpdir(), 'saanseoi-hkgro-test-'))
    let pdfRequests = 0
    const fetcher = async (url: string) => {
      if (url.includes('browseGa.jsp'))
        return new Response(
          `<div>Hong Kong Government Gazette 1901<br> Table of Contents</div>${TOC}`,
        )
      pdfRequests += 1
      return new Response('%PDF-1.7 test evidence')
    }
    expect(
      await retrieveHkgroStreetNameArchive({ archiveDir, fetcher, years: [1901] }),
    ).toMatchObject({ candidateCount: 3, downloadedCount: 3, recordCount: 4 })
    expect(
      await retrieveHkgroStreetNameArchive({ archiveDir, fetcher, years: [1901] }),
    ).toMatchObject({ downloadedCount: 0, reusedCount: 3 })
    expect(pdfRequests).toBe(3)
    const manifest = JSON.parse(
      await readFile(join(archiveDir, 'manifest.json'), 'utf8'),
    )
    expect(
      manifest.records.find(
        (record: { hkgroPdfId: string }) => record.hkgroPdfId === '460101',
      ),
    ).toMatchObject({ byteLength: 22, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
  })

  test('retains the HKGRO session cookie across its initial redirect', async () => {
    const archiveDir = await mkdtemp(join(tmpdir(), 'saanseoi-hkgro-test-'))
    const seenCookies: Array<string | null> = []
    let tocRequests = 0
    await retrieveHkgroStreetNameArchive({
      archiveDir,
      fetcher: async (url, init) => {
        if (url.includes('browseGa.jsp')) {
          tocRequests += 1
          seenCookies.push(new Headers(init?.headers).get('cookie'))
          if (tocRequests === 1) {
            return new Response('', {
              headers: {
                location: 'https://sunzi.lib.hku.hk/hkgro/index.jsp',
                'set-cookie': 'JSESSIONID=session-one; Path=/hkgro',
              },
              status: 302,
            })
          }
          return new Response(
            `<div>Hong Kong Government Gazette 1901<br> Table of Contents</div>${TOC}`,
          )
        }
        if (url.endsWith('index.jsp')) return new Response('<html>landing page</html>')
        return new Response('%PDF-1.7 test evidence')
      },
      years: [1901],
    })
    expect(seenCookies).toEqual([null, 'JSESSIONID=session-one'])
  })

  test('rejects remote targets before any HKGRO request', async () => {
    await expect(
      runHkgroStreetNameRetrieveCommand(
        { command: 'hkgov-hkgro-street-names:retrieve', options: {}, positionals: [] },
        { environment: 'preview', remote: true },
        () => undefined,
      ),
    ).rejects.toThrow('local-only')
  })

  test('fails rather than trusting a changed local candidate PDF', async () => {
    const archiveDir = await mkdtemp(join(tmpdir(), 'saanseoi-hkgro-test-'))
    const fetcher = async (url: string) =>
      url.includes('browseGa.jsp')
        ? new Response(
            `<div>Hong Kong Government Gazette 1901<br> Table of Contents</div>${TOC}`,
          )
        : new Response('%PDF-1.7 test evidence')
    await retrieveHkgroStreetNameArchive({ archiveDir, fetcher, years: [1901] })
    await writeFile(join(archiveDir, '1901', '460097.pdf'), '%PDF-1.7 altered')
    await expect(
      retrieveHkgroStreetNameArchive({ archiveDir, fetcher, years: [1901] }),
    ).rejects.toThrow('local byte-length mismatch')
  })

  test('records an empty upstream PDF as unavailable and continues', async () => {
    const archiveDir = await mkdtemp(join(tmpdir(), 'saanseoi-hkgro-test-'))
    const result = await retrieveHkgroStreetNameArchive({
      archiveDir,
      fetcher: async url =>
        url.includes('browseGa.jsp')
          ? new Response(
              `<div>Hong Kong Government Gazette 1901<br> Table of Contents</div>${TOC}`,
            )
          : url.endsWith('/460097.pdf')
            ? new Response('', { headers: { 'content-type': 'application/pdf' } })
            : new Response('%PDF-1.7 test evidence'),
      years: [1901],
    })
    expect(result).toMatchObject({ downloadedCount: 2, unavailableCount: 1 })
    const manifest = JSON.parse(
      await readFile(join(archiveDir, 'manifest.json'), 'utf8'),
    )
    expect(
      manifest.records.find(
        (record: { hkgroPdfId: string }) => record.hkgroPdfId === '460097',
      ),
    ).toMatchObject({
      assetStatus: 'unavailable',
      retrievalFailure: expect.stringContaining('empty application/pdf response'),
    })
  })

  test('fails explicitly when a candidate response is not a PDF', async () => {
    const archiveDir = await mkdtemp(join(tmpdir(), 'saanseoi-hkgro-test-'))
    await expect(
      retrieveHkgroStreetNameArchive({
        archiveDir,
        fetcher: async url =>
          url.includes('browseGa.jsp')
            ? new Response(
                `<div>Hong Kong Government Gazette 1901<br> Table of Contents</div>${TOC}`,
              )
            : new Response('<html>login required</html>'),
        years: [1901],
      }),
    ).rejects.toThrow('HKGRO PDF is not a valid PDF for 1901/460097')
  })
})
