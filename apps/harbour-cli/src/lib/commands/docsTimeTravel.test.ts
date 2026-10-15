import { requireDefined } from '@repo/core/requireDefined'
import { expect, test } from 'bun:test'
import { Glob } from 'bun'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseMarkdownFixture, renderMarkdownFixtureBody } from './docsRendering.ts'

test('renders shared time travel sections for versioned API guides', async () => {
  const root = resolve(import.meta.dir, '../../../../..')
  let guides = 0
  for await (const path of new Glob('fixtures/meta/apiReleaseSets/*/guides/*.md').scan(
    root,
  )) {
    const fixture = parseMarkdownFixture(await readFile(resolve(root, path), 'utf8'))
    const directives = fixture.body.match(/\{\{timeTravelSection:[^}]+\}\}/g)
    if (!fixture.body.trim()) continue
    if (fixture.frontmatter.apiFamily === 'stats') {
      expect(directives, path).toBeNull()
      expect(fixture.frontmatter.timeTravelCatalogRevision).toBeUndefined()
      continue
    }
    expect(directives ? [...directives].sort() : undefined, path).toEqual(
      ['en', 'zh-Hant', 'zh-Hans']
        .map(locale => `{{timeTravelSection:${locale}}}`)
        .sort(),
    )
    const exampleKeys = [
      'timeTravelEffectiveAt',
      'timeTravelKnownAt',
      'timeTravelCatalogRevision',
    ]
    const hasCheckpointExample = exampleKeys.some(key => fixture.frontmatter[key])
    if (hasCheckpointExample) {
      for (const key of exampleKeys)
        expect(fixture.frontmatter[key], `${path}: ${key}`).toBeTruthy()
    }
    const versionPath = fixture.frontmatter.apiVersion?.match(/-(v\d+(?:\.\d+)*)$/)?.[1]
    expect(versionPath, path).toBeTruthy()
    const rendered = await renderMarkdownFixtureBody({
      ...fixture,
      body: requireDefined(directives).join('\n'),
    })
    expect(rendered).not.toContain('{{')
    if (hasCheckpointExample) {
      expect(rendered).toContain(
        `catalogRevision=${fixture.frontmatter.timeTravelCatalogRevision}&`,
      )
      expect(rendered).toContain(`releaseSet=${fixture.frontmatter.apiReleaseSet}`)
      expect(rendered).toContain(`/${fixture.frontmatter.apiFamily}/${versionPath}?`)
    } else {
      expect(rendered).toContain('<black>catalogRevision</black>')
      expect(rendered).toContain('<black>releaseSet</black>')
      expect(rendered).not.toContain('```url')
    }
    expect(rendered).toContain('links.permalink')
    guides++
  }
  expect(guides).toBeGreaterThan(0)
})

test('guides without checkpoint examples explain replay in every locale', async () => {
  for (const locale of ['en', 'zh-Hant', 'zh-Hans']) {
    const rendered = await renderMarkdownFixtureBody({
      body: `{{timeTravelSection:${locale}}}`,
      frontmatter: {},
    })
    for (const selector of ['effectiveAt', 'knownAt', 'catalogRevision', 'releaseSet'])
      expect(rendered).toContain(`<black>${selector}</black>`)
    expect(rendered).toContain('links.permalink')
    expect(rendered).not.toContain('{{')
    expect(rendered).not.toContain('```url')
  }
})

test('frontmatter overrides supply checkpoint examples and missing values fail clearly', async () => {
  const fixture = {
    body: '{{timeTravelSection:en}}',
    frontmatter: {
      apiFamily: 'addresses',
      apiVersion: 'api-addresses-v0.1',
      apiReleaseSet: 'example',
      timeTravelEffectiveAt: '2025-01-01T00:00:00.000Z',
      timeTravelKnownAt: '2026-01-01T00:00:00.000Z',
    },
  }
  await expect(renderMarkdownFixtureBody(fixture)).rejects.toThrow(
    'timeTravelCatalogRevision',
  )
  const rendered = await renderMarkdownFixtureBody(fixture, {
    timeTravelCatalogRevision: 'checkpoint',
    domainCode: 'official',
  })
  expect(rendered).toContain('catalogRevision=checkpoint&')
  expect(rendered).toContain('domain=official&')
})
