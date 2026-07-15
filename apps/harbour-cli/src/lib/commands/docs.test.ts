import { describe, expect, test } from 'bun:test'

import { parseMarkdownFixture, renderMarkdownFixtureBody } from './docs.ts'

describe('docs markdown fixtures', () => {
  test('renders lower-camel frontmatter tags in fixture bodies', () => {
    const fixture = parseMarkdownFixture(`---
sourceSchemaVersion: "1.12.0"
sourceVersion: "2025-09-24.0"
---
Schema \`{{sourceSchemaVersion}}\`
Source \`{{ sourceVersion }}\`
Locale \`{{LOCALE}}\`
`)

    expect(renderMarkdownFixtureBody(fixture)).toBe(`Schema \`1.12.0\`
Source \`2025-09-24.0\`
Locale \`{{LOCALE}}\`
`)
  })

  test('rejects unknown frontmatter tags', () => {
    expect(() =>
      renderMarkdownFixtureBody({
        body: 'Schema `{{schemaVerison}}`\n',
        frontmatter: { sourceSchemaVersion: '1.12.0' },
      }),
    ).toThrow('Unknown markdown fixture frontmatter tag: {{schemaVerison}}')
  })

  test('can render a carried-forward fixture with target row frontmatter', () => {
    const fixture = parseMarkdownFixture(`---
release: "overture-hk-2025-09-24.0-address"
sourceSchemaVersion: "1.12.0"
---
Release \`{{release}}\`
Schema \`{{sourceSchemaVersion}}\`
`)

    expect(
      renderMarkdownFixtureBody(fixture, {
        release: 'overture-hk-2026-01-01.0-address',
        sourceSchemaVersion: '1.15.0',
      }),
    ).toBe(`Release \`overture-hk-2026-01-01.0-address\`
Schema \`1.15.0\`
`)
  })
})
