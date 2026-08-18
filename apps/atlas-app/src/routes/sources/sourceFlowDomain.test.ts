import { describe, expect, test } from 'vitest'

import type { SourcesPageSource } from '#lib/registry/meta.remote.js'

import { sourceFlowDomain } from './sourceFlowDomain'

const source = (overrides: Partial<SourcesPageSource>): SourcesPageSource =>
  ({
    code: 'ds-hk-hkgov-censtatd-density',
    datasetI18n: [],
    license: null,
    publisher: null,
    publisherCode: 'hkgov-censtatd',
    releaseFrequency: 'five-yearly',
    resourceTypes: ['divisionStatistic'],
    sourceVariant: 'census',
    sourceVersions: [],
    theme: 'stats',
    ...overrides,
  }) as SourcesPageSource

describe('sourceFlowDomain', () => {
  test('keeps census statistics in the default Stats domain', () => {
    expect(sourceFlowDomain(source({}), 'stats')).toBe('default')
  })

  test('uses the published API domain for division sources', () => {
    expect(
      sourceFlowDomain(
        source({
          sourceVersions: [
            {
              code: '2025-01',
              cohortKey: '2025',
              license: null,
              releaseAs: [{ apiFamily: 'divisions', domainCode: 'planning' }],
              stats: [],
              status: 'published',
            },
          ],
          theme: 'divisions',
        }),
        'divisions',
      ),
    ).toBe('planning')
  })
})
