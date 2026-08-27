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
      expect(fixture).toContain('revision: "1"')
      expect(fixture).not.toContain('apiReleaseSetRevision:')
      expect(fixture).not.toContain('primarySourceRelease:')
      expect(fixture).toContain('## Revision log')
      expect(fixture).toContain('- `r{{ revision }}` Corrected the source metadata.')
      expect(fixture.indexOf('`r{{ revision }}` Corrected')).toBeLessThan(
        fixture.indexOf('`r0` contains 7 source snapshots'),
      )
      expect(fixture).toContain(
        'Corrected the source metadata.\n- `r0` contains 7 source snapshots.',
      )
      expect(fixture).not.toContain(
        'Corrected the source metadata.\n\n- `r0` contains 7 source snapshots.',
      )
      expect(fixture.indexOf('## Revision log')).toBeLessThan(
        fixture.indexOf('# ZH-HANT'),
      )
    } finally {
      await rm(path, { force: true })
      await rm(guidePath, { force: true })
    }
  })

  test('makes a dataset addition explicit in the default revision note', async () => {
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
      await createApiReleaseSetRevisionDraft(
        {
          apiReleaseSetCode,
          datasetName: 'Divisions',
          publisherCode: 'overture',
          sourceVersion: '2025-09-24.0',
        },
        { prompt: false },
      )

      expect(await readFile(path, 'utf8')).toContain(
        '- `r{{ revision }}` Added **Divisions** from the `2025-09-24.0` source release published by _Overture Maps Foundation_.',
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

  test('derives the calendar year from the start of a cohort key', async () => {
    const rendered = await renderMarkdownFixtureBody({
      body: '{{cohortYear}} {{ cohortKey }}\n',
      frontmatter: { cohortKey: '2023-H2' },
    })

    expect(rendered).toBe('2023 2023-H2\n')
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
      frontmatter: {
        apiFamily: 'divisions',
        apiVersion: 'api-divisions-v0.1',
      },
    })

    expect(rendered).toContain('<black>v0.1</black> contract is experimental')
    expect(rendered).toContain('<black>v0.1</black> 合約仍屬實驗性質')
    expect(rendered).toContain('<black>v0.1</black> 合约仍处于实验阶段')
    expect(rendered).not.toContain('{{experimentalApiWarning:')
  })

  test('renders the Statistics experimental warning with its entry-point routes', async () => {
    const rendered = await renderMarkdownFixtureBody({
      body: `{{experimentalApiWarning:en}}

{{experimentalApiWarning:zh-Hant}}

{{experimentalApiWarning:zh-Hans}}
`,
      frontmatter: {
        apiFamily: 'stats',
        apiVersion: 'api-stats-v0.1',
      },
    })

    expect(rendered).toContain(
      'The <black>v0.1</black> API is experimental. Use <black>GET /stats/v0</black> to list',
    )
    expect(rendered).toContain('<black>GET /stats/v0/{id}</black>')
    expect(rendered).toContain('<black>v0.1</black> API 仍屬實驗性質')
    expect(rendered).toContain('<black>v0.1</black> API 仍处于实验阶段')
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
    expect(rendered).toContain('| `compact` |')
    expect(rendered).toContain('| `map` |')
    expect(rendered).not.toContain('{{apiProfileTable:')
  })

  test('renders domains from the current API composition', async () => {
    const rendered = await renderMarkdownFixtureBody({
      body: '{{domains:en}}\n\n{{domains:zh-Hant}}\n\n{{domains:zh-Hans}}\n',
      frontmatter: {
        apiVersion: 'api-divisions-v0.1',
        domainCode: 'geographic',
      },
    })

    expect(rendered).toContain(
      '`geographic` <blue>DEFAULT</blue> <blue>THIS RELEASE</blue> — Overture-led geographical and administrative divisions.',
    )
    expect(rendered).toContain('`hkgov-pland-pu` — 規劃署的規劃單元及小組。')
    expect(rendered).toContain('`hkgov-landsd` — 地政总署的聚落地名。')
    expect(rendered).not.toContain('{{domains:')
  })

  test('renders release-set companion resources as a provider-specific table', async () => {
    const rendered = await renderMarkdownFixtureBody(
      {
        body: `{{apiReleaseSetCompanions:en}}

{{apiReleaseSetSources:en}}

{{apiReleaseSetSources:zh-Hant}}

{{apiReleaseSetSources:zh-Hans}}
`,
        frontmatter: {},
      },
      {},
      [
        {
          datasetCode: 'ds-hk-hkgov-censtatd-division-area-2016',
          datasetI18n: [
            {
              description: 'Census district area geometry.',
              locale: 'en',
              name: 'Census district areas',
            },
          ],
          publisherCode: 'hkgov-censtatd',
          publisherI18n: [
            {
              locale: 'en',
              name: 'Census and Statistics Department',
              nameShort: 'C&SD',
            },
          ],
          releaseCode: 'dr-hk-hkgov-censtatd-division-area-2016',
          resourceType: 'divisionArea',
          role: 'supporting',
          sourceVersion: '2016',
          variant: 'hkgov-censtatd-landclipped',
        },
        {
          datasetCode: 'ds-hk-hkgov-had-division-area',
          datasetI18n: [
            {
              description: 'Official district-area geometry.',
              locale: 'en',
              name: 'District areas',
            },
          ],
          publisherCode: 'hkgov-had',
          publisherI18n: [
            {
              locale: 'en',
              name: 'Home Affairs Department',
              nameShort: 'HAD',
            },
          ],
          releaseCode: 'dr-hk-hkgov-had-division-area-2025',
          resourceType: 'divisionArea',
          role: 'supporting',
          sourceVersion: '2025',
          variant: 'hkgov-had',
        },
        {
          datasetCode: 'ds-hk-overture-division-area',
          datasetI18n: [
            {
              description: 'Overture area geometry for divisions.',
              locale: 'en',
              name: 'Division areas',
            },
          ],
          publisherCode: 'overture',
          publisherI18n: [
            {
              locale: 'en',
              name: 'Overture Maps Foundation',
              nameShort: 'Overture',
            },
          ],
          releaseCode: 'dr-hk-overture-division-area-2025-09-24.0',
          resourceType: 'divisionArea',
          role: 'supporting',
          sourceVersion: '2025-09-24.0',
          variant: 'overture',
        },
        {
          datasetCode: 'ds-hk-overture-division-boundary',
          datasetI18n: [
            {
              description: 'Overture boundary geometry for divisions.',
              locale: 'en',
              name: 'Division boundaries',
            },
          ],
          publisherCode: 'overture',
          publisherI18n: [
            {
              locale: 'en',
              name: 'Overture Maps Foundation',
              nameShort: 'Overture',
            },
          ],
          releaseCode: 'dr-hk-overture-division-boundary-2025-09-24.0',
          resourceType: 'divisionBoundary',
          role: 'supporting',
          sourceVersion: '2025-09-24.0',
          variant: 'overture',
        },
      ],
    )

    expect(rendered).toContain('| Code | Type | Publisher | Description |')
    expect(rendered).toContain(
      '| `areas:hkgov-censtatd-landclipped` | Area | [C&SD](/publishers/hkgov-censtatd "Census and Statistics Department") | C&SD census land-clipped district areas. |',
    )
    expect(rendered).toContain(
      '| `areas:hkgov-had` | Area | [HAD](/publishers/hkgov-had "Home Affairs Department") | Official district areas. |',
    )
    expect(rendered).toContain(
      '| `areas:overture` | Area | [Overture](/publishers/overture "Overture Maps Foundation") | Division area polygons. |',
    )
    expect(rendered).toContain(
      '| `boundaries:overture` | Boundary | [Overture](/publishers/overture "Overture Maps Foundation") | District boundaries. |',
    )
    expect(rendered).not.toContain('{{apiReleaseSetCompanions:')
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
