import { describe, expect, test } from 'vitest'

import type { SourcesPageSource } from '#lib/registry/meta.remote.js'

import { sourceFlowDomain, sourceFlowPriority } from './sourceFlowDomain'

const source = (overrides: Partial<SourcesPageSource>): SourcesPageSource =>
  ({
    code: 'ds-hk-hkgov-censtatd-density',
    datasetI18n: [],
    license: null,
    publisher: null,
    publisherCode: 'hkgov-censtatd',
    releaseFrequency: 'five-yearly',
    resourceTypes: ['divisionStatistic'],
    sourceVariant: 'default',
    sourceVersions: [],
    theme: 'stats',
    ...overrides,
  }) as SourcesPageSource

describe('sourceFlowDomain', () => {
  test.each([
    'ds-hk-protomaps-island',
    'ds-hk-saanseoi-division',
    'ds-hk-saanseoi-division-area',
  ])('groups %s in Geographic before publication', code => {
    expect(
      sourceFlowDomain(
        source({
          code,
          sourceVariant: code.includes('protomaps') ? 'protomaps' : 'saanseoi',
          theme: 'divisions',
        }),
        'divisions',
      ),
    ).toBe('geographic')
  })
  test('keeps census statistics in the Government Stats domain', () => {
    expect(sourceFlowDomain(source({}), 'stats')).toBe('government')
  })

  test('uses the SaanSeoi Addresses domain', () => {
    expect(sourceFlowDomain(source({}), 'addresses')).toBe('saanseoi')
  })

  test('uses the SaanSeoi Streets domain', () => {
    expect(sourceFlowDomain(source({}), 'streets')).toBe('saanseoi')
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
              status: 'current',
            },
          ],
          theme: 'divisions',
        }),
        'divisions',
      ),
    ).toBe('planning')
  })

  test('places planned C&SD companion geometry in Geographic', () => {
    expect(
      sourceFlowDomain(
        source({
          resourceTypes: ['divisionStatistic', 'division', 'divisionArea'],
          sourceVariant: 'hkgov-censtatd',
          theme: 'stats',
        }),
        'divisions',
      ),
    ).toBe('geographic')
  })

  test('keeps planned HMA geometry in its own division domain', () => {
    expect(
      sourceFlowDomain(
        source({
          resourceTypes: ['divisionStatistic', 'division', 'divisionArea'],
          sourceVariant: 'hkgov-censtatd-hma',
          theme: 'stats',
        }),
        'divisions',
      ),
    ).toBe('hkgov-censtatd-hma')
  })

  test('keeps LandsD settlement divisions in HKGOV', () => {
    expect(
      sourceFlowDomain(
        source({
          publisherCode: 'hkgov-landsd',
          resourceTypes: ['division'],
          sourceVariant: 'default',
          theme: 'divisions',
        }),
        'divisions',
      ),
    ).toBe('hkgov-landsd')
  })

  test('keeps LandsD settlement divisions in HKGOV when release metadata is stale', () => {
    expect(
      sourceFlowDomain(
        source({
          publisherCode: 'hkgov-landsd',
          resourceTypes: ['division'],
          sourceVersions: [
            {
              code: '2025-01',
              cohortKey: '2025',
              license: null,
              releaseAs: [{ apiFamily: 'divisions', domainCode: 'geographic' }],
              stats: [],
              status: 'current',
            },
          ],
          theme: 'divisions',
        }),
        'divisions',
      ),
    ).toBe('hkgov-landsd')
  })

  test('orders curated divisions and areas before Overture in Geographic', () => {
    const overture = source({
      code: 'ds-hk-overture-division',
      publisherCode: 'overture',
      resourceTypes: ['division'],
      sourceVariant: 'overture',
      theme: 'divisions',
    })
    const area = source({
      resourceTypes: ['divisionStatistic', 'division', 'divisionArea'],
      sourceVariant: 'hkgov-censtatd-area',
      theme: 'stats',
    })

    expect(
      sourceFlowPriority(
        source({ code: 'ds-hk-saanseoi-division' }),
        'divisions',
        'geographic',
        'division',
      ),
    ).toBe(0)
    expect(
      sourceFlowPriority(
        source({ code: 'ds-hk-saanseoi-division-area' }),
        'divisions',
        'geographic',
        'division',
      ),
    ).toBe(1)
    expect(sourceFlowPriority(overture, 'divisions', 'geographic', 'division')).toBe(2)
    expect(sourceFlowPriority(area, 'divisions', 'geographic', 'division')).toBe(3)
  })
})
