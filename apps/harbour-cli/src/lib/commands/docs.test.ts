import { describe, expect, test } from 'bun:test'
import { readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  createApiReleaseSetRevisionDraft,
  parseMarkdownFixture,
  releaseVersionFromSourceVersion,
  renderMarkdownFixtureBody,
} from './docs.ts'

describe('docs markdown fixtures', () => {
  test('copies the prior API release fixture and adds an English revision log', async () => {
    const apiReleaseSetCode = 'data-hk-divisions-2025-09-24.0-r99'
    const path = resolve(
      import.meta.dir,
      '../../../../../fixtures/meta/apiReleaseSets/divisions',
      `${apiReleaseSetCode}.md`,
    )

    await rm(path, { force: true })
    try {
      const draft = await createApiReleaseSetRevisionDraft(
        {
          apiReleaseSetCode,
          datasetName: 'Divisions',
          message: 'Corrected the source metadata.',
          publisherCode: 'overture',
          sourceVersion: '2025-09-24.0',
        },
        { prompt: false },
      )

      expect(draft?.status).toBe('created')
      const fixture = await readFile(path, 'utf8')
      expect(fixture).toContain(`apiReleaseSet: "${apiReleaseSetCode}"`)
      expect(fixture).toContain('revision: "99"')
      expect(fixture).toContain('## Revision log')
      expect(fixture).toContain('- Corrected the source metadata.')
      expect(fixture.indexOf('## Revision log')).toBeLessThan(
        fixture.indexOf('# ZH-HANT'),
      )
    } finally {
      await rm(path, { force: true })
    }
  })

  test('normalises source versions for the release-version frontmatter', () => {
    expect(releaseVersionFromSourceVersion('2022')).toBe('2022.0')
    expect(releaseVersionFromSourceVersion('2025-09-24.0')).toBe('2025-09-24.0')
    expect(releaseVersionFromSourceVersion('2025-09-24.1')).toBe('2025-09-24.1')
  })

  test('renders lower-camel frontmatter tags in fixture bodies', async () => {
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

    expect(await renderMarkdownFixtureBody(fixture)).toBe(`Schema \`1.12.0\`
Source \`2025-09-24.0\`
Release \`2025-09-24.0\`
Locale \`{{LOCALE}}\`
`)
  })

  test('renders the API release-set revision from frontmatter', async () => {
    const fixture = parseMarkdownFixture(`---
revision: "0"
---
Publishes revision r{{ revision }}.
`)

    expect(await renderMarkdownFixtureBody(fixture)).toBe('Publishes revision r0.\n')
  })

  test('derives an API URL version and localised region name from frontmatter', async () => {
    const rendered = await renderMarkdownFixtureBody({
      body: '{{apiVersionPath}} {{regionName:en}} {{regionName:zh-Hant}}\n',
      frontmatter: { apiVersion: 'api-divisions-v0.1', regionCode: 'hk' },
    })

    expect(rendered).toBe('v0.1 Hong Kong 香港\n')
  })

  test('renders API release sources as role and resource-type tables', async () => {
    const rendered = await renderMarkdownFixtureBody(
      {
        body: `# EN

## Constituent source releases

{{apiReleaseSetSources:en}}

## Using the Divisions API

## 組成來源發布

{{apiReleaseSetSources:zh-Hant}}

## 使用 Divisions API

## 组成来源发布

{{apiReleaseSetSources:zh-Hans}}
`,
        frontmatter: {},
      },
      {},
      [
        {
          datasetCode: 'ds-hk-overture-division',
          datasetI18n: [{ locale: 'en', name: 'Divisions' }],
          publisherCode: 'overture',
          publisherI18n: [{ locale: 'en', name: 'Overture' }],
          releaseCode: 'dr-hk-overture-division-2025-09-24.0',
          resourceType: 'division',
          role: 'primary',
          sourceVersion: '2025-09-24.0',
          variant: 'default',
        },
        {
          datasetCode: 'ds-hk-had-division-area-district',
          datasetI18n: [{ locale: 'en', name: 'District Boundary' }],
          publisherCode: 'hkgov-had',
          publisherI18n: [{ locale: 'en', name: 'Home Affairs Department' }],
          releaseCode: 'dr-hk-had-division-area-district-2022',
          resourceType: 'divisionArea',
          role: 'supporting',
          sourceVersion: '2022',
          variant: 'default',
        },
      ],
    )

    expect(rendered).toContain('### Primary · Division')
    expect(rendered).toContain(
      '| [Overture](/publishers/overture) | [Divisions](/sources/ds-hk-overture-division/dr-hk-overture-division-2025-09-24.0) | [2025-09-24.0](/sources/ds-hk-overture-division/dr-hk-overture-division-2025-09-24.0) |',
    )
    expect(rendered).toContain('### Supporting · Division Area')
    expect(rendered).toContain('### 主要 · 區劃')
    expect(rendered).toContain('### 支持 · 区划面')
    expect(rendered).not.toContain('{{apiReleaseSetSources:')
  })

  test('requires one constituent-source directive for each supported locale', async () => {
    await expect(
      renderMarkdownFixtureBody(
        {
          body: '{{apiReleaseSetSources:en}}\n',
          frontmatter: {},
        },
        {},
        [
          {
            datasetCode: 'ds-hk-overture-division',
            datasetI18n: [],
            publisherCode: 'overture',
            publisherI18n: [],
            releaseCode: 'dr-hk-overture-division-2025-09-24.0',
            resourceType: 'division',
            role: 'primary',
            sourceVersion: '2025-09-24.0',
            variant: 'default',
          },
        ],
      ),
    ).rejects.toThrow(
      'API release-set notes must contain exactly one Traditional Chinese constituent-source directive: {{apiReleaseSetSources:zh-Hant}}',
    )
  })

  test('does not publish constituent-source directives without source rows', async () => {
    await expect(
      renderMarkdownFixtureBody({
        body: '{{apiReleaseSetSources:en}}\n',
        frontmatter: {},
      }),
    ).rejects.toThrow(
      'API release-set notes contain constituent-source directives but the release set has no sources.',
    )
  })

  test('rejects unknown frontmatter tags', async () => {
    await expect(
      renderMarkdownFixtureBody({
        body: 'Schema `{{schemaVerison}}`\n',
        frontmatter: { sourceSchemaVersion: '1.12.0' },
      }),
    ).rejects.toThrow('Unknown markdown fixture frontmatter tag: {{schemaVerison}}')
  })

  test('can render a carried-forward fixture with target row frontmatter', async () => {
    const fixture = parseMarkdownFixture(`---
release: "dr-hk-hkgov-dpo-address-2025-09-24.0"
sourceSchemaVersion: "1.12.0"
---
Release \`{{release}}\`
Schema \`{{sourceSchemaVersion}}\`
`)

    expect(
      await renderMarkdownFixtureBody(fixture, {
        release: 'dr-hk-hkgov-dpo-address-2026-01-01.0',
        sourceSchemaVersion: '1.15.0',
      }),
    ).toBe(`Release \`dr-hk-hkgov-dpo-address-2026-01-01.0\`
Schema \`1.15.0\`
`)
  })

  test('renders C&SD measure tables from the reviewed curation manifest', async () => {
    const rendered = await renderMarkdownFixtureBody({
      body: '{{hkgovCenstatdMeasureTable:en}}\n',
      frontmatter: {
        measureCuration:
          'fixtures/meta/curations/hkgov-censtatd-statistics-measures/land-area-population-density-district.json',
      },
    })

    expect(rendered).toContain(
      '| `landArea` | Land area | Land area of the District Council district, in square kilometres. |',
    )
    expect(rendered).toContain(
      '| `populationDensity` | Population density | Mid-year population density of the District Council district, in persons per square kilometre. |',
    )
  })

  test('rejects measure curations outside the curation fixture root', async () => {
    await expect(
      renderMarkdownFixtureBody({
        body: '{{hkgovCenstatdMeasureTable:en}}\n',
        frontmatter: { measureCuration: 'package.json' },
      }),
    ).rejects.toThrow('Invalid curation fixture path: package.json')
  })
})
