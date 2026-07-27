import { describe, expect, test } from 'bun:test'

import {
  parseMarkdownFixture,
  releaseVersionFromSourceVersion,
  renderMarkdownFixtureBody,
} from './docs.ts'

describe('docs markdown fixtures', () => {
  test('normalises source versions for the release-version frontmatter', () => {
    expect(releaseVersionFromSourceVersion('2022')).toBe('2022.0')
    expect(releaseVersionFromSourceVersion('2025-09-24.0')).toBe('2025-09-24.0')
    expect(releaseVersionFromSourceVersion('2025-09-24.1')).toBe('2025-09-24.1')
  })

  test('renders lower-camel frontmatter tags in fixture bodies', () => {
    const fixture = parseMarkdownFixture(`---
sourceSchemaVersion: "1.12.0"
sourceVersion: "2025-09-24.0"
releaseVersion: "2025-09-24.0"
---
Schema \`{{sourceSchemaVersion}}\`
Source \`{{ sourceVersion }}\`
Release \`{{ releaseVersion }}\`
Locale \`{{LOCALE}}\`
`)

    expect(renderMarkdownFixtureBody(fixture)).toBe(`Schema \`1.12.0\`
Source \`2025-09-24.0\`
Release \`2025-09-24.0\`
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
release: "dr-hk-hkgov-dpo-address-2025-09-24.0"
sourceSchemaVersion: "1.12.0"
---
Release \`{{release}}\`
Schema \`{{sourceSchemaVersion}}\`
`)

    expect(
      renderMarkdownFixtureBody(fixture, {
        release: 'dr-hk-hkgov-dpo-address-2026-01-01.0',
        sourceSchemaVersion: '1.15.0',
      }),
    ).toBe(`Release \`dr-hk-hkgov-dpo-address-2026-01-01.0\`
Schema \`1.15.0\`
`)
  })
})
