import { describe, expect, test } from 'bun:test'
import { assertCompleteApiReleaseSetDocumentation } from './docsCoverage.ts'
import { readFixtureIfExists, readGuideFixtureIfExists } from './docsFixtures.ts'
import { renderMarkdownFixtureBody } from './docsRendering.ts'
import { runDocsPublishCommand } from './docs.ts'

const complete = '# EN\n\nEnglish\n\n# ZH-HANT\n\n繁體\n\n# ZH-HANS\n\n简体'
const row = {
  apiVersion: 'api-addresses-v0.1',
  code: 'data-hk-addresses-2026-09-22.0',
  notes: complete,
  guide: complete,
}

describe('API release-set documentation coverage', () => {
  test('accepts complete notes and guides, including stored docs without fixtures', () => {
    expect(() => assertCompleteApiReleaseSetDocumentation([row])).not.toThrow()
  })

  test('reports all missing documents across release sets', () => {
    expect(() =>
      assertCompleteApiReleaseSetDocumentation([
        { ...row, notes: null, guide: null },
        { ...row, code: 'another-release', guide: '' },
      ]),
    ).toThrow(
      /data-hk-addresses-2026-09-22\.0: notes \(EN\)[\s\S]*another-release: guide \(ZH-HANS\)/,
    )
  })

  test('rejects missing or empty locale sections even when English is present', () => {
    for (const guide of [
      '# EN\nEnglish',
      '# EN\nEnglish\n# ZH-HANT\n\n# ZH-HANS\n简体',
    ]) {
      expect(() =>
        assertCompleteApiReleaseSetDocumentation([{ ...row, guide }]),
      ).toThrow('guide (ZH-HANT)')
    }
    expect(() =>
      assertCompleteApiReleaseSetDocumentation([
        { ...row, guide: complete.replace('简体', '') },
      ]),
    ).toThrow('guide (ZH-HANS)')
  })

  test('publication fails before any writes when a release has no fixtures or stored docs', async () => {
    const originalFetch = globalThis.fetch
    const originalKey = process.env.HARBOUR_API_KEY
    const methods: string[] = []
    process.env.HARBOUR_API_KEY = 'test-docs-coverage'
    globalThis.fetch = (async (_input, init) => {
      methods.push(init?.method ?? 'GET')
      return Response.json({
        rows: [
          {
            ...row,
            code: 'data-hk-addresses-2099-01-01.0',
            apiFamily: 'addresses',
            domainCode: 'saanseoi',
            notes: null,
            guide: null,
          },
        ],
      })
    }) as typeof fetch
    try {
      await expect(
        runDocsPublishCommand(
          {
            command: 'docs:publish',
            positionals: [],
            options: { scope: 'apiReleaseSets' },
          },
          { remote: false, environment: 'dev' },
        ),
      ).rejects.toThrow('data-hk-addresses-2099-01-01.0: notes (EN)')
      expect(methods).toEqual(['GET'])
    } finally {
      globalThis.fetch = originalFetch
      if (originalKey === undefined) delete process.env.HARBOUR_API_KEY
      else process.env.HARBOUR_API_KEY = originalKey
    }
  })

  test('September 22 Addresses has renderable multilingual notes and a pinned guide', async () => {
    const notes = await readFixtureIfExists('addresses', row.code)
    const guide = await readGuideFixtureIfExists('addresses', row.code)
    expect(notes).not.toBeNull()
    expect(guide).not.toBeNull()
    const renderedNotes = await renderMarkdownFixtureBody(
      notes!,
      undefined,
      [
        {
          datasetCode: 'ds-hk-hkgov-dpo-address',
          datasetI18n: [{ locale: 'en', name: 'Address Lookup Service' }],
          publisherCode: 'hkgov-dpo',
          publisherI18n: [{ locale: 'en', name: 'Digital Policy Office' }],
          releaseCode: 'dr-hk-hkgov-dpo-address-2026-09-22.0',
          resourceType: 'address',
          role: 'primary',
          sourceVersion: '2026-09-22.0',
          variant: 'hkgov-dpo',
        },
      ],
      notes!.path,
    )
    const renderedGuide = await renderMarkdownFixtureBody(
      guide!,
      undefined,
      [],
      guide!.path,
    )
    assertCompleteApiReleaseSetDocumentation([
      { ...row, notes: renderedNotes, guide: renderedGuide },
    ])
    expect(renderedNotes).toContain('2026-09-22')
    expect(renderedGuide).toContain(`releaseSet=${row.code}`)
    expect(renderedGuide).toContain(
      'catalogRevision=catalog-hk-addresses-v0.1-2026-10-18.9',
    )
    expect(renderedNotes + renderedGuide).not.toContain('{{')
  })
})
