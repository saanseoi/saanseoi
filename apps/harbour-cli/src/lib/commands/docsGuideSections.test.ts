import { expect, test } from 'bun:test'
import { Glob } from 'bun'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseMarkdownFixture, renderMarkdownFixtureBody } from './docsRendering.ts'

test('shared guide bodies resolve variables and nested profile tables across guide locales', async () => {
  const root = resolve(import.meta.dir, '../../../../..')
  const counts = {
    paginationSection: 0,
    responseProfilesSection: 0,
    localeSelectionSection: 0,
  }
  for await (const path of new Glob('fixtures/meta/apiReleaseSets/*/guides/*.md').scan(
    root,
  )) {
    const fixture = parseMarkdownFixture(await readFile(resolve(root, path), 'utf8'))
    const directives =
      fixture.body.match(
        /\{\{(?:paginationSection|responseProfilesSection|localeSelectionSection):[^}]+\}\}/g,
      ) ?? []
    for (const directive of directives) {
      const kind = directive.slice(2, directive.indexOf(':')) as keyof typeof counts
      counts[kind]++
      const rendered = await renderMarkdownFixtureBody(
        { ...fixture, body: directive },
        { domainCode: fixture.frontmatter.domainCode ?? 'official' },
      )
      expect(rendered, path).not.toContain('{{')
      expect(rendered).not.toMatch(/^## /m)
      expect(rendered).toContain(`cohort=${fixture.frontmatter.cohortKey}`)
      if (kind === 'paginationSection') {
        expect(rendered).toContain('page[limit]=25&')
        expect(rendered).toContain('links.next')
        expect(rendered).toContain('meta.page.total')
        if (fixture.frontmatter.apiFamily === 'stats')
          expect(rendered).toContain('/stats/v0?')
      }
      if (kind === 'responseProfilesSection') expect(rendered).toContain('|')
      if (kind === 'localeSelectionSection') expect(rendered).toContain('locales=null')
    }
    if (fixture.frontmatter.apiFamily === 'stats') {
      expect(fixture.body).not.toContain('{{responseProfilesSection:')
      expect(fixture.body).not.toContain('{{localeSelectionSection:')
    }
    if (fixture.frontmatter.apiFamily === 'places') {
      expect(fixture.body.indexOf('attributes.geometry')).toBeGreaterThan(
        fixture.body.indexOf('{{responseProfilesSection:en}}'),
      )
      expect(fixture.body.indexOf('Names and brand names')).toBeGreaterThan(
        fixture.body.indexOf('{{localeSelectionSection:en}}'),
      )
    }
  }
  expect(counts.paginationSection).toBe(70)
  expect(counts.responseProfilesSection).toBe(50)
  expect(counts.localeSelectionSection).toBe(39)
})
