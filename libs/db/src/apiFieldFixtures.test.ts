import { describe, expect, test } from 'bun:test'

import { listApiFieldFixtures, resolveApiFieldFixture } from './apiFieldFixtures'
import { resolverCodes } from './constants/schema'
import { computeVersionHash } from './versioning'

const overtureSourceSchemas = {
  'ds-hk-overture-division': '1.17.0',
  'ds-hk-overture-division-area': '1.17.0',
  'ds-hk-overture-division-boundary': '1.17.0',
  'ds-hk-hkgov-had-division-area-district': '1.2',
  'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': '1.0',
  'ds-hk-hkgov-censtatd-division-statistic-population-households-district': '1.0',
  'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters': '1.0',
}

describe('api field fixtures', () => {
  test('bundled mappings have current hashes and registered resolvers', () => {
    for (const fixture of listApiFieldFixtures()) {
      expect(fixture.versionHash).toBe(computeVersionHash(fixture))
      for (const field of fixture.fields) {
        expect(resolverCodes).toContain(field.resolverCode)
      }
    }
  })

  test('every exact signature attributes fields only to selected sources', () => {
    for (const bundled of listApiFieldFixtures()) {
      for (const anchor of bundled.lineageAnchors) {
        const fixture = resolveApiFieldFixture({
          ...bundled,
          lineageSnapshotVersions: [anchor.snapshotVersion],
          sourceSchemas: anchor.sourceSchemas,
        })
        expect(fixture).not.toBeNull()
        if (!fixture) throw new Error('Missing fixture')
        expect(fixture.fields.length).toBeGreaterThan(0)
        expect(fixture.versionHash).toBe(computeVersionHash(fixture))
        const ids = fixture.fields.map(field =>
          JSON.stringify([
            field.apiField,
            field.variant ?? null,
            field.sourceDatasetCode,
            field.sourceFieldPath,
            field.contributionType,
            field.priority,
          ]),
        )
        expect(new Set(ids).size).toBe(ids.length)
        for (const field of fixture.fields) {
          expect(Object.hasOwn(anchor.sourceSchemas, field.sourceDatasetCode)).toBe(
            true,
          )
        }
        if (fixture.apiVersion === 'api-stats-v0.1') {
          expect(
            [...new Set(fixture.fields.map(field => field.sourceDatasetCode))].sort(),
          ).toEqual(Object.keys(anchor.sourceSchemas).sort())
          expect(
            fixture.fields
              .filter(field => field.apiField === 'statistic.id')
              .every(field => field.resolverCode === 'derive_statistics_record_id'),
          ).toBe(true)
        }
      }
    }
  })

  test('maps current Division names and excludes internal source columns', () => {
    for (const fixture of listApiFieldFixtures().filter(
      f => f.apiVersion === 'api-divisions-v0.1',
    )) {
      const paths = fixture.fields.map(field => field.apiField)
      expect(paths).toContain('division.attributes.type')
      for (const path of paths) {
        expect(path).not.toMatch(
          /attributes\.(divisionType|subtype|divisionClass|wikidata|overture)(\.|$)/,
        )
      }
    }
  })

  test('covers materialised C&SD reference-period cohorts with exact signatures', () => {
    const population = 'population-households-district'
    const cohorts: Array<[string, string[], string[]?]> = [
      ...['2016', '2017', '2018', '2019', '2020', '2025'].map(
        year => [year, [population]] as [string, string[]],
      ),
      [
        '2021',
        [
          'housing-market-areas-building-groups',
          'major-housing-estates',
          'new-towns',
          population,
        ],
      ],
      ['2022', [population], ['land-area-population-density-district', population]],
      ['2023', ['permanent-living-quarters', population]],
      ['2023-q3', ['permanent-living-quarters-district']],
      ['2024', [population], ['land-area-population-density-district', population]],
    ]
    for (const [period, sources, anchors = sources] of cohorts) {
      const sourceSchemas = Object.fromEntries(
        sources.map(source => [
          `ds-hk-hkgov-censtatd-division-statistic-${source}`,
          '1.0',
        ]),
      )
      for (const anchor of anchors) {
        const lookup = {
          apiVersion: 'api-stats-v0.1',
          domainCode: 'government',
          schemaVersion: 'sv-statistics-v1',
          rulesetVersion: 'rs-division-statistic-merge-v1',
          lineageSnapshotVersions: [
            `ss-hk-division-statistic-ds-hk-hkgov-censtatd-division-statistic-${anchor}-${period}`,
          ],
          sourceSchemas,
        }
        expect(resolveApiFieldFixture(lookup)).not.toBeNull()
        expect(
          resolveApiFieldFixture({
            ...lookup,
            sourceSchemas: { ...sourceSchemas, 'unreviewed-source': '1.0' },
          }),
        ).toBeNull()
      }
    }
  })

  test('loads only domain-scoped fixtures with explicit lineage anchors', () => {
    const fixtures = listApiFieldFixtures()

    expect(fixtures).toHaveLength(13)
    for (const fixture of fixtures) {
      expect(fixture.domainCode).not.toBe('')
      expect(fixture.lineageAnchors.length).toBeGreaterThan(0)
    }
  })

  test('requires an exact source-schema signature', () => {
    expect(
      resolveApiFieldFixture({
        apiVersion: 'api-divisions-v0.1',
        domainCode: 'geographic',
        lineageSnapshotVersions: ['ss-hk-division-2025-09-24.0'],
        schemaVersion: 'sv-division-v1',
        rulesetVersion: 'rs-division-merge-v1',
        sourceSchemas: {
          'ds-hk-overture-division': '1.12.0',
          'ds-hk-overture-division-area': '1.12.0',
          'ds-hk-overture-division-boundary': '1.11.0',
          'ds-hk-hkgov-had-division-area-district': '1.2',
        },
      }),
    ).toBeNull()
  })

  test('selects the density mapping for its distinct C&SD release signature', () => {
    const cohorts = [
      { snapshotVersion: 'ss-hk-division-2025-09-24.0', version: '1.12.0' },
      { snapshotVersion: 'ss-hk-division-2025-10-22.0', version: '1.13.0' },
      { snapshotVersion: 'ss-hk-division-2025-11-19.0', version: '1.14.0' },
      { snapshotVersion: 'ss-hk-division-2025-12-17.0', version: '1.15.0' },
      { snapshotVersion: 'ss-hk-division-2026-01-21.0', version: '1.15.0' },
      { snapshotVersion: 'ss-hk-division-2026-02-18.0', version: '1.16.0' },
      { snapshotVersion: 'ss-hk-division-2026-03-18.0', version: '1.16.0' },
      { snapshotVersion: 'ss-hk-division-2026-04-15.0', version: '1.16.0' },
      { snapshotVersion: 'ss-hk-division-2026-05-20.0', version: '1.17.0' },
      { snapshotVersion: 'ss-hk-division-2026-06-17.0', version: '1.17.0' },
      { snapshotVersion: 'ss-hk-division-2026-06-24.0', version: '1.17.0' },
      { snapshotVersion: 'ss-hk-division-2026-07-22.0', version: '1.18.0' },
      { snapshotVersion: 'ss-hk-division-2026-08-19.0', version: '1.18.0' },
    ]

    for (const cohort of cohorts) {
      const sourceSchemas = {
        'ds-hk-overture-division': cohort.version,
        'ds-hk-overture-division-area': cohort.version,
        'ds-hk-overture-division-boundary': cohort.version,
        'ds-hk-hkgov-had-division-area-district': '1.2',
        'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': '1.0',
        'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district':
          '1.0',
      }
      const fixture = resolveApiFieldFixture({
        apiVersion: 'api-divisions-v0.1',
        domainCode: 'geographic',
        lineageSnapshotVersions: [cohort.snapshotVersion],
        schemaVersion: 'sv-division-v1',
        rulesetVersion: 'rs-division-merge-v1',
        sourceSchemas,
      })

      expect(fixture?.lineageAnchors).toContainEqual(
        expect.objectContaining({
          snapshotVersion: cohort.snapshotVersion,
          sourceSchemas,
        }),
      )
    }
  })

  test('selects the Population and Household mapping without Permanent Living Quarters', () => {
    const fixture = resolveApiFieldFixture({
      apiVersion: 'api-divisions-v0.1',
      domainCode: 'geographic',
      lineageSnapshotVersions: ['ss-hk-division-2025-09-24.0'],
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-division-merge-v1',
      sourceSchemas: {
        'ds-hk-overture-division': '1.12.0',
        'ds-hk-overture-division-area': '1.12.0',
        'ds-hk-overture-division-boundary': '1.12.0',
        'ds-hk-hkgov-had-division-area-district': '1.2',
        'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': '1.0',
        'ds-hk-hkgov-censtatd-division-statistic-population-households-district': '1.0',
      },
    })

    expect(fixture?.fields).toContainEqual(
      expect.objectContaining({
        apiField: 'divisionArea.attributes.variant',
        sourceDatasetCode:
          'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
        variant: 'hkgov-censtatd',
      }),
    )
  })

  test('selects the mapping for a complete required release set', () => {
    const fixture = resolveApiFieldFixture({
      apiVersion: 'api-divisions-v0.1',
      domainCode: 'geographic',
      lineageSnapshotVersions: [
        'ss-hk-division-2025-09-24.0',
        'ss-hk-division-2025-10-22.0',
      ],
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-division-merge-v1',
      sourceSchemas: {
        'ds-hk-overture-division': '1.13.0',
        'ds-hk-overture-division-area': '1.13.0',
        'ds-hk-overture-division-boundary': '1.13.0',
        'ds-hk-hkgov-had-division-area-district': '1.2',
        'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': '1.0',
        'ds-hk-hkgov-censtatd-division-statistic-population-households-district': '1.0',
        'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters': '1.0',
      },
    })

    expect(fixture?.fields).toContainEqual(
      expect.objectContaining({
        sourceDatasetCode:
          'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district',
      }),
    )
  })

  test('selects the PLQ mapping before annual C&SD district geometry is available', () => {
    const fixture = resolveApiFieldFixture({
      apiVersion: 'api-divisions-v0.1',
      domainCode: 'geographic',
      lineageSnapshotVersions: ['ss-hk-division-2025-09-24.0'],
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-division-merge-v1',
      sourceSchemas: {
        'ds-hk-overture-division': '1.12.0',
        'ds-hk-overture-division-area': '1.12.0',
        'ds-hk-overture-division-boundary': '1.12.0',
        'ds-hk-hkgov-had-division-area-district': '1.2',
        'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': '1.0',
        'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters': '1.0',
      },
    })

    expect(fixture?.fields).toContainEqual(
      expect.objectContaining({
        apiField: 'divisionArea.attributes.variant',
        sourceDatasetCode:
          'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters',
        variant: 'hkgov-censtatd',
      }),
    )
  })

  test('keeps the Overture 1.15 mapping across the 2025 to 2026 boundary', () => {
    const fixture = resolveApiFieldFixture({
      apiVersion: 'api-divisions-v0.1',
      domainCode: 'geographic',
      lineageSnapshotVersions: ['ss-hk-division-2026-01-21.0'],
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-division-merge-v1',
      sourceSchemas: {
        'ds-hk-overture-division': '1.15.0',
        'ds-hk-overture-division-area': '1.15.0',
        'ds-hk-overture-division-boundary': '1.15.0',
        'ds-hk-hkgov-had-division-area-district': '1.2',
        'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': '1.0',
        'ds-hk-hkgov-censtatd-division-statistic-population-households-district': '1.0',
        'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters': '1.0',
      },
    })

    expect(fixture?.lineageAnchors).toContainEqual(
      expect.objectContaining({
        snapshotVersion: 'ss-hk-division-2026-01-21.0',
      }),
    )
  })

  test('keeps Overture mappings across every monthly 2026 release cohort', () => {
    const cohorts = [
      { snapshotVersion: 'ss-hk-division-2026-03-18.0', version: '1.16.0' },
      { snapshotVersion: 'ss-hk-division-2026-04-15.0', version: '1.16.0' },
      { snapshotVersion: 'ss-hk-division-2026-06-17.0', version: '1.17.0' },
    ]

    for (const cohort of cohorts) {
      const fixture = resolveApiFieldFixture({
        apiVersion: 'api-divisions-v0.1',
        domainCode: 'geographic',
        lineageSnapshotVersions: [cohort.snapshotVersion],
        schemaVersion: 'sv-division-v1',
        rulesetVersion: 'rs-division-merge-v1',
        sourceSchemas: {
          'ds-hk-overture-division': cohort.version,
          'ds-hk-overture-division-area': cohort.version,
          'ds-hk-overture-division-boundary': cohort.version,
          'ds-hk-hkgov-had-division-area-district': '1.2',
          'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': '1.0',
          'ds-hk-hkgov-censtatd-division-statistic-population-households-district':
            '1.0',
          'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters': '1.0',
        },
      })

      expect(fixture?.lineageAnchors).toContainEqual(
        expect.objectContaining({ snapshotVersion: cohort.snapshotVersion }),
      )
    }
  })

  test('resolves Planning Department mappings with their shared division datasets', () => {
    const fixtures = [
      {
        domainCode: 'hkgov-pland-pu',
        snapshotVersion: 'ss-hk-division-hkgov-pland-pu-2001',
        sourceDatasetCode: 'ds-hk-hkgov-pland-division-pu',
        sourceSchemaVersion: '1.0',
      },
      {
        domainCode: 'hkgov-pland-pu',
        snapshotVersion: 'ss-hk-division-hkgov-pland-pu-2021',
        sourceDatasetCode: 'ds-hk-hkgov-pland-division-pu',
        sourceSchemaVersion: '2.0',
      },
      {
        domainCode: 'hkgov-pland-new-town',
        snapshotVersion: 'ss-hk-division-hkgov-pland-new-town-2006',
        sourceDatasetCode: 'ds-hk-hkgov-pland-division-new-town',
        sourceSchemaVersion: '1.0',
      },
      {
        domainCode: 'hkgov-pland-new-town',
        snapshotVersion: 'ss-hk-division-hkgov-pland-new-town-2011',
        sourceDatasetCode: 'ds-hk-hkgov-pland-division-new-town',
        sourceSchemaVersion: '1.0',
      },
      {
        domainCode: 'hkgov-pland-new-town',
        snapshotVersion: 'ss-hk-division-hkgov-pland-new-town-2016',
        sourceDatasetCode: 'ds-hk-hkgov-pland-division-new-town',
        sourceSchemaVersion: '1.0',
      },
      {
        domainCode: 'hkgov-pland-new-town',
        snapshotVersion: 'ss-hk-division-hkgov-pland-new-town-2021',
        sourceDatasetCode: 'ds-hk-hkgov-pland-division-new-town',
        sourceSchemaVersion: '1.0',
      },
    ]

    for (const fixture of fixtures) {
      const resolved = resolveApiFieldFixture({
        apiVersion: 'api-divisions-v0.1',
        domainCode: fixture.domainCode,
        lineageSnapshotVersions: [fixture.snapshotVersion],
        schemaVersion: 'sv-division-v1',
        rulesetVersion: `rs-division-${fixture.domainCode}-merge-v1`,
        sourceSchemas: {
          [fixture.sourceDatasetCode]: fixture.sourceSchemaVersion,
        },
      })

      expect(resolved).not.toBeNull()
      expect(resolved?.fields).toContainEqual(
        expect.objectContaining({
          apiField: 'divisionArea.id',
          sourceDatasetCode: fixture.sourceDatasetCode,
        }),
      )
    }
  })

  test('selects the closest matching ancestor, not the highest snapshot code', () => {
    const fixture = resolveApiFieldFixture({
      apiVersion: 'api-divisions-v0.1',
      domainCode: 'geographic',
      lineageSnapshotVersions: [
        'ss-hk-division-2025-09-24.0',
        'ss-hk-division-2025-10-22.0',
        'ss-hk-division-2025-11-19.0',
        'ss-hk-division-2025-12-17.0',
        'ss-hk-division-2026-02-18.0',
        'ss-hk-division-2026-05-20.0',
        'ss-hk-division-2026-06-17.0',
      ],
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-division-merge-v1',
      sourceSchemas: overtureSourceSchemas,
    })

    expect(fixture?.lineageAnchors).toContainEqual(
      expect.objectContaining({
        snapshotVersion: 'ss-hk-division-2026-05-20.0',
      }),
    )
  })

  test('resolves the current Overture 1.18 release anchor', () => {
    const fixture = resolveApiFieldFixture({
      apiVersion: 'api-divisions-v0.1',
      domainCode: 'geographic',
      lineageSnapshotVersions: [
        'ss-hk-division-2025-09-24.0',
        'ss-hk-division-2025-10-22.0',
        'ss-hk-division-2025-11-19.0',
        'ss-hk-division-2025-12-17.0',
        'ss-hk-division-2026-01-21.0',
        'ss-hk-division-2026-02-18.0',
        'ss-hk-division-2026-03-18.0',
        'ss-hk-division-2026-04-15.0',
        'ss-hk-division-2026-05-20.0',
        'ss-hk-division-2026-06-17.0',
        'ss-hk-division-2026-07-22.0',
        'ss-hk-division-2026-08-19.0',
      ],
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-division-merge-v1',
      sourceSchemas: {
        'ds-hk-overture-division': '1.18.0',
        'ds-hk-overture-division-area': '1.18.0',
        'ds-hk-overture-division-boundary': '1.18.0',
        'ds-hk-hkgov-had-division-area-district': '1.2',
        'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': '1.0',
        'ds-hk-hkgov-censtatd-division-statistic-population-households-district': '1.0',
        'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters': '1.0',
      },
    })

    expect(fixture?.lineageAnchors).toContainEqual(
      expect.objectContaining({
        snapshotVersion: 'ss-hk-division-2026-08-19.0',
      }),
    )
  })

  test('does not infer a newer branch mapping for an unanchored backfill', () => {
    const currentSourceSchemas = {
      'ds-hk-hkgov-dpo-address': '3.2',
      'ds-hk-overture-division': '1.17.0',
    }
    const historicalSourceSchemas = {
      'ds-hk-hkgov-dpo-address': '3.2',
      'ds-hk-overture-division': '1.12.0',
    }

    expect(
      resolveApiFieldFixture({
        apiVersion: 'api-addresses-v0.1',
        domainCode: 'saanseoi',
        lineageSnapshotVersions: ['ss-hk-address-2025-08-20.0'],
        schemaVersion: 'sv-address-v1',
        rulesetVersion: 'rs-address-merge-v1',
        sourceSchemas: currentSourceSchemas,
      }),
    ).toBeNull()

    expect(
      resolveApiFieldFixture({
        apiVersion: 'api-addresses-v0.1',
        domainCode: 'saanseoi',
        lineageSnapshotVersions: ['ss-hk-address-2025-09-24.0'],
        schemaVersion: 'sv-address-v1',
        rulesetVersion: 'rs-address-merge-v1',
        sourceSchemas: historicalSourceSchemas,
      })?.lineageAnchors,
    ).toContainEqual(
      expect.objectContaining({
        snapshotVersion: 'ss-hk-address-2025-09-24.0',
        sourceSchemas: {
          'ds-hk-hkgov-dpo-address': '3.2',
          'ds-hk-overture-division': '1.12.0',
        },
      }),
    )
  })

  test('selects the explicitly anchored earliest address backfill', () => {
    expect(
      resolveApiFieldFixture({
        apiVersion: 'api-addresses-v0.1',
        domainCode: 'saanseoi',
        lineageSnapshotVersions: ['ss-hk-address-2025-01-23.0'],
        schemaVersion: 'sv-address-v1',
        rulesetVersion: 'rs-address-merge-v1',
        sourceSchemas: {
          'ds-hk-hkgov-dpo-address': '3.2',
          'ds-hk-overture-division': '1.12.0',
        },
      })?.lineageAnchors,
    ).toContainEqual(
      expect.objectContaining({
        snapshotVersion: 'ss-hk-address-2025-01-23.0',
      }),
    )
  })

  test('maps every supported ALS release to its selected Overture division schema', () => {
    const expectedDivisionSchemas = {
      'ss-hk-address-2025-01-23.0': '1.12.0',
      'ss-hk-address-2025-02-25.0': '1.12.0',
      'ss-hk-address-2025-03-21.0': '1.12.0',
      'ss-hk-address-2025-04-26.0': '1.12.0',
      'ss-hk-address-2025-05-22.0': '1.12.0',
      'ss-hk-address-2025-06-20.0': '1.12.0',
      'ss-hk-address-2025-08-13.0': '1.12.0',
      'ss-hk-address-2025-09-03.0': '1.12.0',
      'ss-hk-address-2025-11-04.0': '1.13.0',
      'ss-hk-address-2025-12-16.0': '1.14.0',
      'ss-hk-address-2026-02-04.0': '1.15.0',
      'ss-hk-address-2026-04-03.0': '1.16.0',
      'ss-hk-address-2026-04-22.0': '1.16.0',
      'ss-hk-address-2026-04-25.0': '1.16.0',
      'ss-hk-address-2026-07-08.0': '1.17.0',
      'ss-hk-address-2026-07-10.0': '1.17.0',
      'ss-hk-address-2026-07-22.0': '1.18.0',
    }

    for (const [snapshotVersion, divisionSchemaVersion] of Object.entries(
      expectedDivisionSchemas,
    )) {
      expect(
        resolveApiFieldFixture({
          apiVersion: 'api-addresses-v0.1',
          domainCode: 'saanseoi',
          lineageSnapshotVersions: [snapshotVersion],
          schemaVersion: 'sv-address-v1',
          rulesetVersion: 'rs-address-merge-v1',
          sourceSchemas: {
            'ds-hk-hkgov-dpo-address': '3.2',
            'ds-hk-overture-division': divisionSchemaVersion,
          },
        })?.lineageAnchors,
      ).toContainEqual(
        expect.objectContaining({
          snapshotVersion,
          sourceSchemas: {
            'ds-hk-hkgov-dpo-address': '3.2',
            'ds-hk-overture-division': divisionSchemaVersion,
          },
        }),
      )
    }
  })

  test('returns defensive copies from the fixture registry', () => {
    const fixtures = listApiFieldFixtures()
    const fixture = resolveApiFieldFixture({
      apiVersion: 'api-divisions-v0.1',
      domainCode: 'geographic',
      lineageSnapshotVersions: [
        'ss-hk-division-2026-05-20.0',
        'ss-hk-division-2026-06-17.0',
      ],
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-division-merge-v1',
      sourceSchemas: overtureSourceSchemas,
    })
    const listedFixture = fixtures.at(0)
    if (!listedFixture || !fixture) throw new Error('Expected matching fixture')
    const listedField = listedFixture.fields.at(0)
    const resolvedField = fixture.fields.at(0)
    const listedAnchor = listedFixture.lineageAnchors.at(0)
    const resolvedAnchor = fixture.lineageAnchors.at(0)
    if (!listedField || !resolvedField || !listedAnchor || !resolvedAnchor) {
      throw new Error('Expected fixture fields and anchors')
    }

    listedFixture.apiVersion = 'mutated'
    listedAnchor.snapshotVersion = 'mutated'
    listedField.apiField = 'mutated'
    fixture.apiVersion = 'mutated'
    resolvedAnchor.snapshotVersion = 'mutated'
    resolvedField.apiField = 'mutated'

    expect(listApiFieldFixtures()[0]?.apiVersion).toBe('api-divisions-v0.1')
    expect(listApiFieldFixtures()[0]?.lineageAnchors[0]?.snapshotVersion).toBe(
      'ss-hk-division-2025-09-24.0',
    )
    expect(listApiFieldFixtures()[0]?.fields[0]?.apiField).not.toBe('mutated')
  })
})
