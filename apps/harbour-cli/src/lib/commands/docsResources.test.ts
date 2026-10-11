import { expect, test } from 'bun:test'
import {
  renderApiReleaseSetCompanionResources,
  renderApiReleaseSetSourcesTables,
} from './docsResources'
import type { ApiReleaseSetSourceDocsRow } from './docsTypes'

test('curated ingredients remain source evidence without becoming geometry providers', () => {
  const source = (publisher: string, variant: string): ApiReleaseSetSourceDocsRow => ({
    publisherCode: publisher,
    publisherI18n: [{ locale: 'en', name: publisher }],
    datasetCode: `ds-hk-${publisher}-division`,
    datasetI18n: [
      { locale: 'en', name: publisher, description: 'Ingredient evidence' },
    ],
    releaseCode: `dr-hk-${publisher}-division-2026-10-01.0`,
    resourceType: 'divisionArea',
    role: 'supporting',
    sourceVersion: '2026-10-01.0',
    variant,
  })
  const sources = [
    source('saanseoi', 'saanseoi'),
    source('overture', 'saanseoi'),
    source('hkgov-landsd', 'saanseoi'),
    source('protomaps', 'saanseoi'),
    source('overture', 'overture'),
    source('hkgov-had', 'hkgov-had'),
  ]
  for (const locale of ['en', 'zh-Hant', 'zh-Hans']) {
    const table = renderApiReleaseSetCompanionResources(
      `{{apiReleaseSetCompanions:${locale}}}`,
      sources,
    )
    expect(table.match(/`areas:saanseoi`/g)).toHaveLength(1)
    expect(table).toContain('/publishers/saanseoi')
    expect(table).toContain('`areas:overture`')
    expect(table).toContain('`areas:hkgov-had`')
    expect(table).not.toContain('/publishers/hkgov-landsd')
    expect(table).not.toContain('/publishers/protomaps')
    expect(table).not.toContain('Ingredient evidence')
  }
  const scope = renderApiReleaseSetSourcesTables(
    '{{apiReleaseSetSources:en}}\n{{apiReleaseSetSources:zh-Hant}}\n{{apiReleaseSetSources:zh-Hans}}',
    sources,
    true,
  )
  expect(scope).toContain('/publishers/hkgov-landsd')
  expect(scope).toContain('/publishers/protomaps')
})

test('source tables deduplicate lineage paths within each role and resource section', () => {
  const source: ApiReleaseSetSourceDocsRow = {
    publisherCode: 'overture',
    publisherI18n: [{ locale: 'en', name: 'Overture' }],
    datasetCode: 'ds-hk-overture-division',
    datasetI18n: [{ locale: 'en', name: 'Divisions' }],
    releaseCode: 'dr-hk-overture-division-2026-08-19.0',
    resourceType: 'division',
    role: 'supporting',
    sourceVersion: '2026-08-19.0',
    variant: 'overture',
  }
  const sources = [
    source,
    { ...source, variant: 'saanseoi' },
    { ...source, resourceType: 'divisionArea' },
    { ...source, resourceType: 'divisionArea', variant: 'saanseoi' },
    { ...source, role: 'primary' as const },
    {
      ...source,
      releaseCode: 'dr-hk-overture-division-2026-09-23.0',
      sourceVersion: '2026-09-23.0',
    },
  ]
  const rendered = renderApiReleaseSetSourcesTables(
    '# EN\n{{apiReleaseSetSources:en}}\n# ZH-HANT\n{{apiReleaseSetSources:zh-Hant}}\n# ZH-HANS\n{{apiReleaseSetSources:zh-Hans}}',
    sources,
    true,
  )
  for (const section of rendered.split(/^# /m).slice(1)) {
    // Three distinct role/resource sections retain the August release; the
    // September release remains a separate row within Supporting Division.
    expect(section.match(/\| \[2026-08-19\.0\]/g)).toHaveLength(3)
    expect(section.match(/\| \[2026-09-23\.0\]/g)).toHaveLength(1)
    for (const table of section.split(/^### /m).slice(1)) {
      const rows = table.split('\n').filter(line => line.startsWith('| ['))
      expect(new Set(rows).size).toBe(rows.length)
    }
  }
  expect(sources).toHaveLength(6)
})
