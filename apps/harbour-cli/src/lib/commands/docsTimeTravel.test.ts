import { expect, test } from 'bun:test'
import { Glob } from 'bun'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseMarkdownFixture, renderMarkdownFixtureBody } from './docsRendering.ts'

test('renders shared time travel sections for Divisions and Places only', async () => {
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
    expect(directives, path).not.toBeNull()
    const rendered = await renderMarkdownFixtureBody({
      ...fixture,
      body: directives!.join('\n'),
    })
    expect(rendered).not.toContain('{{')
    expect(rendered).toContain(
      `catalogRevision=${fixture.frontmatter.timeTravelCatalogRevision}&`,
    )
    expect(rendered).toContain(`releaseSet=${fixture.frontmatter.apiReleaseSet}`)
    expect(rendered).toContain(`/${fixture.frontmatter.apiFamily}/v0.1?`)
    expect(rendered).toContain('links.permalink')
    guides++
  }
  expect(guides).toBe(24)
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
