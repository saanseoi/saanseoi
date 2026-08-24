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
    const apiReleaseSetCode = 'data-hk-divisions-2025-09-24.0-r1'
    const path = resolve(
      import.meta.dir,
      '../../../../../fixtures/meta/apiReleaseSets/divisions',
      'notes',
      `${apiReleaseSetCode}.md`,
    )
    const guidePath = resolve(
      import.meta.dir,
      '../../../../../fixtures/meta/apiReleaseSets/divisions',
      'guides',
      `${apiReleaseSetCode}.md`,
    )

    await rm(path, { force: true })
    await rm(guidePath, { force: true })
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
      expect(draft?.guidePath).toBe(guidePath)
      const fixture = await readFile(path, 'utf8')
      expect(fixture).toContain(`apiReleaseSet: "${apiReleaseSetCode}"`)
      expect(fixture).toContain('apiReleaseSetRevision: "1"')
      expect(fixture).toContain('## Revision log')
      expect(fixture).toContain(
        '- `r{{ apiReleaseSetRevision }}` Corrected the source metadata.',
      )
      expect(fixture.indexOf('`r{{ apiReleaseSetRevision }}` Corrected')).toBeLessThan(
        fixture.indexOf('`r0` consists of 7 composition members'),
      )
      expect(fixture.indexOf('## Revision log')).toBeLessThan(
        fixture.indexOf('# ZH-HANT'),
      )
    } finally {
      await rm(path, { force: true })
      await rm(guidePath, { force: true })
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

  test('renders the release-set domain supplied by the documentation row', async () => {
    expect(
      await renderMarkdownFixtureBody(
        {
          body: 'Publishes the {{ domainCode }} domain.\n',
          frontmatter: {},
        },
        { domainCode: 'official' },
      ),
    ).toBe('Publishes the official domain.\n')
  })

  test('renders primary-source template values from the release-set manifest', async () => {
    expect(
      await renderMarkdownFixtureBody(
        {
          body: '[{{ primarySourceRelease }}]({{ primarySourceReleaseUrl }})\n',
          frontmatter: {},
        },
        {
          primarySourceRelease: 'dr-hk-overture-division-2026-08-19.0',
          primarySourceReleaseUrl:
            '/sources/ds-hk-overture-division/dr-hk-overture-division-2026-08-19.0',
        },
      ),
    ).toBe(
      '[dr-hk-overture-division-2026-08-19.0](/sources/ds-hk-overture-division/dr-hk-overture-division-2026-08-19.0)\n',
    )
  })

  test('derives an API URL version and localised region name from frontmatter', async () => {
    const rendered = await renderMarkdownFixtureBody({
      body: '{{apiVersionPath}} {{regionName:en}} {{regionName:zh-Hant}}\n',
      frontmatter: { apiVersion: 'api-divisions-v0.1', regionCode: 'hk' },
    })

    expect(rendered).toBe('v0.1 Hong Kong 香港\n')
  })

  test('renders transcluded API-key notes in every supported locale', async () => {
    const rendered = await renderMarkdownFixtureBody({
      body: `{{apiKeyNote:en}}

{{apiKeyNote:zh-Hant}}

{{apiKeyNote:zh-Hans}}
`,
      frontmatter: {},
    })

    expect(rendered).toContain('action-label="Get API key"')
    expect(rendered).toContain('action-label="取得 API 金鑰"')
    expect(rendered).toContain('action-label="获取 API 密钥"')
    expect(rendered).toContain('<black>access_token=</black>')
    expect(rendered).not.toContain('{{apiKeyNote:')
  })

  test('renders experimental API warnings in every supported locale', async () => {
    const rendered = await renderMarkdownFixtureBody({
      body: `{{experimentalApiWarning:en}}

{{experimentalApiWarning:zh-Hant}}

{{experimentalApiWarning:zh-Hans}}
`,
      frontmatter: { apiVersion: 'api-divisions-v0.1' },
    })

    expect(rendered).toContain('<black>v0.1</black> contract is experimental')
    expect(rendered).toContain('<black>v0.1</black> 合約仍屬實驗性質')
    expect(rendered).toContain('<black>v0.1</black> 合约仍处于实验阶段')
    expect(rendered).not.toContain('{{experimentalApiWarning:')
  })

  test('renders API profile tables from the shared profile definitions', async () => {
    const rendered = await renderMarkdownFixtureBody({
      body: '{{apiProfileTable:en}}\n\n{{apiProfileTable:zh-Hant}}\n\n{{apiProfileTable:zh-Hans}}\n',
      frontmatter: { apiFamily: 'divisions' },
    })

    expect(rendered).toContain(
      '| Profile | Use it when you need | Adds to the response |',
    )
    expect(rendered).toContain('| 設定檔 | 適用情況 | 回應新增內容 |')
    expect(rendered).toContain('| 配置文件 | 适用情形 | 响应新增内容 |')
    expect(rendered).toContain('| <black>compact</black> |')
    expect(rendered).toContain('| <black>map</black> |')
    expect(rendered).not.toContain('{{apiProfileTable:')
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
      '| [Overture](/publishers/overture) | [Divisions](/sources/ds-hk-overture-division) | [2025-09-24.0](/sources/ds-hk-overture-division/dr-hk-overture-division-2025-09-24.0) |',
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

  test('identifies the fixture that failed release-set source validation', async () => {
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
        'fixtures/meta/apiReleaseSets/divisions/notes/example.md',
      ),
    ).rejects.toThrow(
      'API release-set notes must contain exactly one Traditional Chinese constituent-source directive: {{apiReleaseSetSources:zh-Hant}}\nFixture: fixtures/meta/apiReleaseSets/divisions/notes/example.md',
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
