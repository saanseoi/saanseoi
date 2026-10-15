import type { ApiFieldFixtureDocument } from './apiFieldFixtures'
import addressDocument from '../../../fixtures/meta/apiFields/api-addresses-v0.1@saanseoi-v1.json'
import divisionDocument from '../../../fixtures/meta/apiFields/api-divisions-v0.1@geographic-v2.json'
import { pinApiFieldRules } from './apiFieldInputs'
import { initialDatasets } from './registry/meta'
import { resolveSnapshotProcessingRules } from '../../core/src/provenance/processingPolicyCatalogue'
import { describe, expect, test } from 'bun:test'

import {
  comparePublisherSchemaVersions,
  expandApiFieldFixture,
  listApiFieldFixtures,
  resolveApiFieldFixture,
} from './apiFieldFixtures'
import { computeVersionHash } from './versioning'

const overtureSourceSchemas = {
  'ds-hk-overture-division': '1.17.0',
  'ds-hk-hkgov-had-division-area-district': '1.2',
  'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': '1.0',
  'ds-hk-hkgov-censtatd-division-statistic-population-households-district': '1.0',
}

describe('api field fixtures', () => {
  test('curated Address division provenance stays in the current generic relationship field', () => {
    const fixture = listApiFieldFixtures().find(
      value =>
        value.apiVersion === 'api-addresses-v0.1' &&
        value.domainCode === 'saanseoi' &&
        value.mappingVersion === 1 &&
        value.sourceCompositions.some(composition =>
          composition.datasetCodes.includes('ds-hk-overture-place'),
        ),
    )!
    expect(fixture).toMatchObject({ mappingVersion: 1, schemaVersion: 'sv-address-v1' })
    for (const sourceDatasetCode of [
      'ds-hk-hkgov-dpo-address',
      'ds-hk-overture-place',
    ]) {
      expect(
        fixture.fields
          .filter(
            field =>
              field.sourceDatasetCode === sourceDatasetCode &&
              field.apiField.startsWith('relationships'),
          )
          .map(field => field.apiField),
      ).toEqual(['relationships.divisions'])
    }
  })

  test('resolves Overture Place Addresses with the selected Geographic Division sources', () => {
    expect(
      resolveApiFieldFixture({
        apiVersion: 'api-addresses-v0.1',
        domainCode: 'saanseoi',
        lineageSnapshotVersions: ['ss-hk-address-hkgov-dpo-2026-07-22.0'],
        schemaVersion: 'sv-address-v1',
        rulesetVersion: 'rs-address-merge-v1',
        sourceSchemas: {
          'ds-hk-hkgov-dpo-address': '3.2',
          'ds-hk-overture-division': '1.18.0',
          'ds-hk-overture-place': '2.0.0',
          'ds-hk-saanseoi-division': '1.0',
        },
      }),
    ).not.toBeNull()
  })

  test('Address provenance selects supplementary fields only for exact source signatures', () => {
    const lookup = {
      apiVersion: 'api-addresses-v0.1',
      domainCode: 'saanseoi',
      lineageSnapshotVersions: ['ss-hk-address-hkgov-dpo-2026-07-22.0'],
      schemaVersion: 'sv-address-v1',
      rulesetVersion: 'rs-address-merge-v1',
      sourceSchemas: {
        'ds-hk-hkgov-dpo-address': '3.2',
        'ds-hk-overture-division': '1.18.0',
      },
    }
    const official = resolveApiFieldFixture(lookup)
    expect(official).not.toBeNull()
    expect(
      official!.fields.every(field =>
        Object.hasOwn(lookup.sourceSchemas, field.sourceDatasetCode),
      ),
    ).toBe(true)

    const sourceSchemas = { ...lookup.sourceSchemas, 'ds-hk-overture-place': '2.0.0' }
    const supplementary = resolveApiFieldFixture({ ...lookup, sourceSchemas })
    expect(supplementary).not.toBeNull()
    expect(
      supplementary!.fields
        .filter(field => field.sourceDatasetCode === 'ds-hk-overture-place')
        .map(field => field.apiField),
    ).toEqual([
      'id',
      'attributes.i18n',
      'attributes.sources',
      'relationships.divisions',
    ])
    expect(
      resolveApiFieldFixture({
        ...lookup,
        sourceSchemas: { ...sourceSchemas, 'ds-hk-overture-place': '2.1.0' },
      }),
    ).toBeNull()
    expect(
      resolveApiFieldFixture({
        ...lookup,
        sourceSchemas: { ...sourceSchemas, 'ds-hk-saanseoi-division': '1.0' },
      }),
    ).not.toBeNull()
  })

  test('statistics distinguish publisher periods, registry IDs and named measure outputs', () => {
    const fields = listApiFieldFixtures().find(
      f => f.apiVersion === 'api-stats-v0.1',
    )!.fields
    const population = fields.filter(f =>
      f.sourceDatasetCode.endsWith('population-households-district'),
    )
    expect(
      population.find(f => f.apiField === 'attributes.referencePeriod.code')?.inputs,
    ).toEqual([
      {
        origin: 'source',
        fieldPath: 'properties.year',
      },
    ])
    expect(population.find(f => f.apiField === 'attributes.datasetCode')).toMatchObject(
      {
        resolverCode: 'lookup_registry',
        inputs: [{ origin: 'registry', fieldPath: 'dataset.code' }],
      },
    )
    expect(
      population.find(f => f.apiField === 'attributes.values.domesticHouseholds')
        ?.inputs,
    ).toContainEqual({
      origin: 'source',
      fieldPath: 'properties.dh',
    })
    const quarter = fields.find(
      f =>
        f.sourceDatasetCode.endsWith('permanent-living-quarters-district') &&
        f.apiField === 'attributes.referencePeriod.code',
    )!
    expect(quarter.inputs).toEqual([
      {
        origin: 'source',
        fieldPath: 'properties.year',
      },
      {
        origin: 'source',
        fieldPath: 'properties.quarter',
      },
    ])
  })

  test('covers Places cohorts using the Division schema retained by their ALS snapshot', () => {
    // Places selects the latest ALS snapshot at or before its cohort and uses
    // that snapshot's Division reference, which can predate the Places schema.
    const cohorts = [
      ['2025-09-24.0', '1.12.0', '1.12.0'],
      ['2025-10-22.0', '1.13.0', '1.12.0'],
      ['2025-12-17.0', '1.15.0', '1.14.0'],
      ['2026-01-21.0', '1.15.0', '1.14.0'],
      ['2026-02-18.0', '1.16.0', '1.15.0'],
      ['2026-03-18.0', '1.16.0', '1.15.0'],
      ['2026-04-15.0', '1.16.0', '1.16.0'],
      ['2026-05-20.0', '1.17.0', '1.16.0'],
      ['2026-06-17.0', '1.17.0', '1.17.0'],
      ['2026-07-22.0', '1.18.0', '1.18.0'],
      ['2026-08-19.0', '1.18.0', '1.18.0'],
    ] as const
    for (const [cohort, placeSchema, divisionSchema] of cohorts) {
      expect(
        resolveApiFieldFixture({
          apiVersion: 'api-places-v0.1',
          domainCode: 'overture',
          lineageSnapshotVersions: [`ss-hk-place-${cohort}`],
          schemaVersion: 'sv-place-v1',
          rulesetVersion: 'rs-place-merge-v1',
          sourceSchemas: {
            'ds-hk-hkgov-dpo-address': '3.2',
            'ds-hk-overture-place': placeSchema,
            'ds-hk-overture-division': divisionSchema,
          },
        }),
      ).not.toBeNull()
    }
  })

  test('resolves December Places with the selected November Division schema', () => {
    const lookup = {
      apiVersion: 'api-places-v0.1',
      domainCode: 'overture',
      lineageSnapshotVersions: [
        'ss-hk-place-2025-09-24.0',
        'ss-hk-place-2025-10-22.0',
        'ss-hk-place-2025-12-17.0',
      ],
      schemaVersion: 'sv-place-v1',
      rulesetVersion: 'rs-place-merge-v1',
      sourceSchemas: {
        'ds-hk-hkgov-dpo-address': '3.2',
        'ds-hk-overture-division': '1.14.0',
        'ds-hk-overture-place': '1.15.0',
      },
    }
    expect(resolveApiFieldFixture(lookup)).not.toBeNull()
    expect(
      resolveApiFieldFixture({
        ...lookup,
        sourceSchemas: { ...lookup.sourceSchemas, 'ds-hk-overture-division': '1.11.0' },
      }),
    ).toBeNull()
  })

  test('covers Places spatial membership with curated Divisions and Overture areas', () => {
    const fixture = listApiFieldFixtures().find(
      fixture => fixture.apiVersion === 'api-places-v0.1',
    )!
    for (const anchor of fixture.lineageAnchors) {
      const lookup = {
        apiVersion: fixture.apiVersion,
        domainCode: fixture.domainCode,
        schemaVersion: fixture.schemaVersion,
        rulesetVersion: fixture.rulesetVersion,
        lineageSnapshotVersions: [anchor.snapshotVersion],
        sourceSchemas: {
          'ds-hk-hkgov-dpo-address': '3.2',
          'ds-hk-overture-place': '1.12.0',
          'ds-hk-overture-division': '1.18.0',
          'ds-hk-saanseoi-division': '1.0',
        },
      }
      expect(resolveApiFieldFixture(lookup)).not.toBeNull()
      expect(
        resolveApiFieldFixture({
          ...lookup,
          sourceSchemas: {
            ...lookup.sourceSchemas,
            'ds-hk-saanseoi-division': '2.0',
          },
        }),
      ).toBeNull()
    }
  })

  test('Address and Places fixtures cover retained curated Division ingredients', () => {
    for (const apiVersion of ['api-addresses-v0.1', 'api-places-v0.1']) {
      const fixture = listApiFieldFixtures().find(f => f.apiVersion === apiVersion)!
      for (const anchor of fixture.lineageAnchors) {
        const sourceSchemas = {
          'ds-hk-hkgov-dpo-address': '3.2',
          'ds-hk-overture-place': '1.12.0',
          'ds-hk-overture-division': '2.0.0',
          'ds-hk-saanseoi-division': '1.0',
          'ds-hk-hkgov-landsd-division': '1.0',
          'ds-hk-hkgov-rvd-division': '1.0',
          'ds-hk-protomaps-island': '1.0',
        }
        const lookup = {
          apiVersion,
          domainCode: fixture.domainCode,
          schemaVersion: fixture.schemaVersion,
          rulesetVersion: fixture.rulesetVersion,
          lineageSnapshotVersions: [anchor.snapshotVersion],
          sourceSchemas,
        }
        expect(resolveApiFieldFixture(lookup)).not.toBeNull()
        expect(
          resolveApiFieldFixture({
            ...lookup,
            sourceSchemas: { ...sourceSchemas, 'ds-hk-overture-place': '2.0.0' },
          }),
        ).not.toBeNull()
        for (const ingredient of [
          'ds-hk-hkgov-landsd-division',
          'ds-hk-hkgov-rvd-division',
          'ds-hk-protomaps-island',
        ]) {
          expect(
            resolveApiFieldFixture({
              ...lookup,
              sourceSchemas: { ...sourceSchemas, [ingredient]: '2.0' },
            }),
          ).toBeNull()
        }
      }
    }
  })

  test('bundled mappings have current hashes and registered resolvers', () => {
    for (const fixture of listApiFieldFixtures()) {
      expect(fixture.versionHash).toBe(computeVersionHash(fixture))
      for (const field of fixture.fields) {
        expect(() =>
          pinApiFieldRules(
            field,
            initialDatasets
              .filter(dataset => dataset.code === field.sourceDatasetCode)
              .flatMap(dataset => [
                {
                  resourceReleaseId: dataset.code,
                  processingRules: dataset.processingRules,
                },
                ...dataset.resourceTypes.map(resourceType => ({
                  snapshotRecipeId: `${dataset.code}:${resourceType}`,
                  processingRules: resolveSnapshotProcessingRules(
                    [dataset.code],
                    resourceType,
                  ),
                })),
              ]),
          ),
        ).not.toThrow()
      }
    }
  })

  test('every exact signature attributes fields only to selected sources', () => {
    for (const bundled of listApiFieldFixtures()) {
      for (const composition of bundled.sourceCompositions) {
        for (const snapshotVersion of composition.anchorSnapshotVersions) {
          const sourceSchemas = Object.fromEntries(
            composition.datasetCodes.map(code => [
              code,
              bundled.publisherSchemaRanges[code]!.min,
            ]),
          )
          const fixture = resolveApiFieldFixture({
            ...bundled,
            lineageSnapshotVersions: [snapshotVersion],
            sourceSchemas,
          })
          expect(fixture).not.toBeNull()
          if (!fixture) throw new Error('Missing fixture')
          expect(fixture.fields.length).toBeGreaterThan(0)
          expect(fixture.versionHash).toBe(computeVersionHash(fixture))
          const ids = fixture.fields.map(field =>
            JSON.stringify([
              field.resourceType,
              field.apiField,
              field.variant ?? null,
              field.sourceDatasetCode,
              field.inputs,
              field.contributionType,
              field.priority,
            ]),
          )
          expect(new Set(ids).size).toBe(ids.length)
          for (const field of fixture.fields) {
            expect(Object.hasOwn(sourceSchemas, field.sourceDatasetCode)).toBe(true)
          }
          if (fixture.apiVersion === 'api-stats-v0.1') {
            expect(
              [...new Set(fixture.fields.map(field => field.sourceDatasetCode))].sort(),
            ).toEqual(Object.keys(sourceSchemas).sort())
            expect(
              fixture.fields
                .filter(
                  field =>
                    field.resourceType === 'statistic' && field.apiField === 'id',
                )
                .every(field => field.resolverCode === 'derive_statistics_record_id'),
            ).toBe(true)
          }
        }
      }
    }
  })

  test('shared publisher mappings retain ALS alternatives and are defensively cloned', () => {
    const fixture = listApiFieldFixtures().find(
      f => f.apiVersion === 'api-addresses-v0.1',
    )!
    const fields = fixture.publisherFields['ds-hk-hkgov-dpo-address']!
    expect(fields['properties.phaseNameEn']).toEqual([
      'properties.Address.PremisesAddress.EngPremisesAddress.EngEstate.EngPhase.PhaseName',
      'properties.Address.PremisesAddress.EngPremisesAddress.EngPhase.PhaseName',
    ])
    fields['properties.geoAddress'] = 'changed'
    expect(
      listApiFieldFixtures().find(f => f.apiVersion === 'api-addresses-v0.1')!
        .publisherFields['ds-hk-hkgov-dpo-address']!['properties.geoAddress'],
    ).not.toBe('changed')
    expect(fixture.fields.every(f => !f.apiField.startsWith('address.'))).toBe(true)
  })

  test('maps current Division names and excludes internal source columns', () => {
    for (const fixture of listApiFieldFixtures().filter(
      f => f.apiVersion === 'api-divisions-v0.1',
    )) {
      const paths = fixture.fields.map(field => field.apiField)
      expect(paths).toContain('attributes.class')
      for (const path of paths) {
        expect(path).not.toMatch(
          /attributes\.(divisionType|subtype|divisionClass|wikidata|overture)(\.|$)/,
        )
      }
    }
  })

  test('covers materialised C&SD reference-period cohorts with exact signatures', () => {
    const population = 'population-households-district'
    const subdividedUnits = 'subdivided-units-district'
    const cohorts: Array<[string, string[], string[]?]> = [
      ...['2016', '2017', '2018', '2019', '2020', '2025'].map(
        year => [year, [population]] as [string, string[]],
      ),
      ['2016', [population, subdividedUnits]],
      [
        '2021',
        [
          'housing-market-areas-building-groups',
          'major-housing-estates',
          'new-towns',
          population,
        ],
      ],
      [
        '2021',
        [
          'housing-market-areas-building-groups',
          'major-housing-estates',
          'new-towns',
          population,
          subdividedUnits,
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
        expect(
          resolveApiFieldFixture({
            ...lookup,
            sourceSchemas: Object.fromEntries(
              Object.keys(sourceSchemas).map(code => [code, '2.0']),
            ),
          }),
        ).toBeNull()
        expect(
          resolveApiFieldFixture({
            ...lookup,
            lineageSnapshotVersions: ['unrelated-branch'],
          }),
        ).toBeNull()
      }
    }
  })

  test('loads only domain-scoped fixtures with explicit lineage anchors', () => {
    const fixtures = listApiFieldFixtures()

    expect(
      fixtures.filter(fixture => fixture.apiVersion !== 'api-divisions-v0.2'),
    ).toHaveLength(11)
    expect(
      fixtures.filter(fixture => fixture.apiVersion === 'api-divisions-v0.2'),
    ).toHaveLength(8)
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
          'ds-hk-hkgov-had-division-area-district': '1.2',
        },
      }),
    ).toBeNull()
  })

  test('selects native Overture mappings without the SaanSeoi regional companion', () => {
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
        'ds-hk-hkgov-had-division-area-district': '1.2',
        'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': '1.0',
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
        'ds-hk-hkgov-had-division-area-district': '1.2',
        'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': '1.0',
        'ds-hk-hkgov-censtatd-division-statistic-population-households-district': '1.0',
      },
    })

    expect(fixture?.fields).toContainEqual(
      expect.objectContaining({
        apiField: 'attributes.variant',
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
        'ds-hk-hkgov-had-division-area-district': '1.2',
        'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': '1.0',
        'ds-hk-hkgov-censtatd-division-statistic-population-households-district': '1.0',
      },
    })

    expect(fixture?.fields).toContainEqual(
      expect.objectContaining({
        sourceDatasetCode:
          'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district',
      }),
    )
  })

  test('rejects the SaanSeoi regional companion in an Overture composition', () => {
    const fixture = resolveApiFieldFixture({
      apiVersion: 'api-divisions-v0.1',
      domainCode: 'geographic',
      lineageSnapshotVersions: ['ss-hk-division-2025-09-24.0'],
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-division-merge-v1',
      sourceSchemas: {
        'ds-hk-overture-division': '1.12.0',
        'ds-hk-hkgov-had-division-area-district': '1.2',
        'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': '1.0',
        'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters': '1.0',
      },
    })

    expect(fixture).toBeNull()
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
        'ds-hk-hkgov-had-division-area-district': '1.2',
        'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': '1.0',
        'ds-hk-hkgov-censtatd-division-statistic-population-households-district': '1.0',
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
          'ds-hk-hkgov-had-division-area-district': '1.2',
          'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': '1.0',
          'ds-hk-hkgov-censtatd-division-statistic-population-households-district':
            '1.0',
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
          apiField: 'id',
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
        'ds-hk-hkgov-had-division-area-district': '1.2',
        'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': '1.0',
        'ds-hk-hkgov-censtatd-division-statistic-population-households-district': '1.0',
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
        lineageSnapshotVersions: ['ss-hk-address-hkgov-dpo-2025-08-20.0'],
        schemaVersion: 'sv-address-v1',
        rulesetVersion: 'rs-address-merge-v1',
        sourceSchemas: currentSourceSchemas,
      }),
    ).toBeNull()

    expect(
      resolveApiFieldFixture({
        apiVersion: 'api-addresses-v0.1',
        domainCode: 'saanseoi',
        lineageSnapshotVersions: ['ss-hk-address-hkgov-dpo-2025-09-24.0'],
        schemaVersion: 'sv-address-v1',
        rulesetVersion: 'rs-address-merge-v1',
        sourceSchemas: historicalSourceSchemas,
      })?.lineageAnchors,
    ).toContainEqual(
      expect.objectContaining({
        snapshotVersion: 'ss-hk-address-hkgov-dpo-2025-09-24.0',
      }),
    )
  })

  test('selects the explicitly anchored earliest address backfill', () => {
    expect(
      resolveApiFieldFixture({
        apiVersion: 'api-addresses-v0.1',
        domainCode: 'saanseoi',
        lineageSnapshotVersions: ['ss-hk-address-hkgov-dpo-2025-01-23.0'],
        schemaVersion: 'sv-address-v1',
        rulesetVersion: 'rs-address-merge-v1',
        sourceSchemas: {
          'ds-hk-hkgov-dpo-address': '3.2',
          'ds-hk-overture-division': '1.12.0',
        },
      })?.lineageAnchors,
    ).toContainEqual(
      expect.objectContaining({
        snapshotVersion: 'ss-hk-address-hkgov-dpo-2025-01-23.0',
      }),
    )
  })

  test('maps every supported ALS release to its selected Overture division schema', () => {
    const expectedDivisionSchemas = {
      'ss-hk-address-hkgov-dpo-2025-01-23.0': '1.12.0',
      'ss-hk-address-hkgov-dpo-2025-02-25.0': '1.12.0',
      'ss-hk-address-hkgov-dpo-2025-03-21.0': '1.12.0',
      'ss-hk-address-hkgov-dpo-2025-04-26.0': '1.12.0',
      'ss-hk-address-hkgov-dpo-2025-05-22.0': '1.12.0',
      'ss-hk-address-hkgov-dpo-2025-06-20.0': '1.12.0',
      'ss-hk-address-hkgov-dpo-2025-08-13.0': '1.12.0',
      'ss-hk-address-hkgov-dpo-2025-09-03.0': '1.12.0',
      'ss-hk-address-hkgov-dpo-2025-11-04.0': '1.13.0',
      'ss-hk-address-hkgov-dpo-2025-12-16.0': '1.14.0',
      'ss-hk-address-hkgov-dpo-2026-02-04.0': '1.15.0',
      'ss-hk-address-hkgov-dpo-2026-04-03.0': '1.16.0',
      'ss-hk-address-hkgov-dpo-2026-04-22.0': '1.16.0',
      'ss-hk-address-hkgov-dpo-2026-04-25.0': '1.16.0',
      'ss-hk-address-hkgov-dpo-2026-07-08.0': '1.17.0',
      'ss-hk-address-hkgov-dpo-2026-07-10.0': '1.17.0',
      'ss-hk-address-hkgov-dpo-2026-07-22.0': '1.18.0',
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

test('every listed fixture has selectable sources and bounded field datasets', () => {
  for (const fixture of listApiFieldFixtures()) {
    expect(fixture.sourceCompositions.length).toBeGreaterThan(0)
    expect(fixture.lineageAnchors.length).toBeGreaterThan(0)
    for (const field of fixture.fields) {
      expect(fixture.publisherSchemaRanges[field.sourceDatasetCode]).toBeDefined()
    }
  }
})

test('authored fixtures reject empty source compositions and unbounded field datasets', () => {
  const empty = {
    ...addressDocument,
    sourceCompositions: [],
    lineageAnchors: [],
  }
  expect(() =>
    expandApiFieldFixture({
      ...empty,
      versionHash: computeVersionHash(empty),
    } as unknown as ApiFieldFixtureDocument),
  ).toThrow('requires a source composition')

  const unbounded = structuredClone(addressDocument)
  unbounded.fields[0]!.sourceDatasetCode = 'undeclared-source'
  expect(() =>
    expandApiFieldFixture({
      ...unbounded,
      versionHash: computeVersionHash(unbounded),
    } as unknown as ApiFieldFixtureDocument),
  ).toThrow('Missing publisher schema range for undeclared-source')
})

test('authored resource scope expands without repeating it on fields', () => {
  expect(addressDocument.resourceType).toBe('address')
  expect(
    addressDocument.fields.every(field => !Object.hasOwn(field, 'resourceType')),
  ).toBe(true)
  expect(
    expandApiFieldFixture(
      addressDocument as unknown as ApiFieldFixtureDocument,
    ).fields.every(field => field.resourceType === 'address'),
  ).toBe(true)
  expect(
    divisionDocument.resources.every(group =>
      group.fields.every(field => !Object.hasOwn(field, 'resourceType')),
    ),
  ).toBe(true)
  const expanded = expandApiFieldFixture(
    divisionDocument as unknown as ApiFieldFixtureDocument,
  )
  expect(new Set(expanded.fields.map(field => field.resourceType))).toEqual(
    new Set(divisionDocument.resources.map(group => group.resourceType)),
  )
  expect(() =>
    expandApiFieldFixture({
      ...addressDocument,
      versionHash: 'invalid',
    } as unknown as ApiFieldFixtureDocument),
  ).toThrow('hash')
})

test('mapping compatibility uses bounded numeric publisher ranges independently of anchor observations', () => {
  expect(comparePublisherSchemaVersions('1.10', '1.9')).toBeGreaterThan(0)
  expect(comparePublisherSchemaVersions('1.12', '1.12.0')).toBe(0)
  const anchor = addressDocument.lineageAnchors[0]!
  const lookup = {
    apiVersion: addressDocument.apiVersion,
    domainCode: addressDocument.domainCode,
    schemaVersion: addressDocument.schemaVersion,
    rulesetVersion: addressDocument.rulesetVersion,
    lineageSnapshotVersions: [anchor.snapshotVersion],
    sourceSchemas: {
      'ds-hk-hkgov-dpo-address': '3.2',
      'ds-hk-overture-division': '1.13.0',
    },
  }
  expect(resolveApiFieldFixture(lookup)?.mappingVersion).toBe(1)
  expect(
    resolveApiFieldFixture({
      ...lookup,
      sourceSchemas: { ...lookup.sourceSchemas, 'ds-hk-overture-division': '2.0.0' },
    })?.mappingVersion,
  ).toBe(1)
  expect(
    resolveApiFieldFixture({
      ...lookup,
      sourceSchemas: { ...lookup.sourceSchemas, 'ds-hk-overture-division': '2.1.0' },
    }),
  ).toBeNull()
  expect(
    resolveApiFieldFixture({
      ...lookup,
      sourceSchemas: { ...lookup.sourceSchemas, 'ds-hk-overture-division': '1.11.0' },
    }),
  ).toBeNull()
  expect(
    resolveApiFieldFixture({
      ...lookup,
      lineageSnapshotVersions: ['unrelated-branch'],
    }),
  ).toBeNull()
})

test('mapping filenames identify API, registry domain and independent version', async () => {
  const directory = new URL('../../../fixtures/meta/apiFields/', import.meta.url)
    .pathname
  for (const file of new Bun.Glob('*.json').scanSync(directory)) {
    const document = await Bun.file(directory + file).json()
    expect(file).toBe(
      `${document.apiVersion}@${document.domainCode}-v${document.mappingVersion}.json`,
    )
    const apiVersion = await Bun.file(
      new URL(
        `../../../fixtures/meta/apiVersions/${document.apiVersion}.json`,
        import.meta.url,
      ),
    ).json()
    // Retained mappings can describe domains absent from the current composition.
    expect(apiVersion.code).toBe(document.apiVersion)
    expect(document.domainCode).toMatch(/^[a-z][a-z0-9-]*$/)
    expect(Object.keys(document)[0]).toBe('versionHash')
  }
})

test('anchors are unique and compositions cannot be borrowed from another branch', () => {
  for (const fixture of listApiFieldFixtures()) {
    const snapshots = fixture.lineageAnchors.map(anchor => anchor.snapshotVersion)
    expect(new Set(snapshots).size).toBe(snapshots.length)
    expect(
      fixture.lineageAnchors.every(anchor => Object.keys(anchor).length === 1),
    ).toBe(true)
  }
  const fixture = listApiFieldFixtures().find(f => f.apiVersion === 'api-stats-v0.1')!
  const composition = fixture.sourceCompositions[0]!
  const unrelated = fixture.lineageAnchors.find(
    anchor =>
      !fixture.sourceCompositions.some(
        c =>
          c.anchorSnapshotVersions.includes(anchor.snapshotVersion) &&
          JSON.stringify(c.datasetCodes) === JSON.stringify(composition.datasetCodes),
      ),
  )!
  expect(unrelated).toBeDefined()
  const sourceSchemas = Object.fromEntries(
    composition.datasetCodes.map(code => [
      code,
      fixture.publisherSchemaRanges[code]!.min,
    ]),
  )
  expect(
    resolveApiFieldFixture({
      ...fixture,
      sourceSchemas,
      lineageSnapshotVersions: [unrelated.snapshotVersion],
    }),
  ).toBeNull()
})

test('initial curated release resolves its retained ingredient composition for API 0.2', () => {
  const sourceSchemas: Record<string, string> = {
    ...overtureSourceSchemas,
    'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters': '1.0',
    'ds-hk-overture-division': '1.18.0',
    'ds-hk-hkgov-landsd-division': '1.0',
    'ds-hk-hkgov-rvd-division': '1.0',
    'ds-hk-protomaps-island': '1.0',
    'ds-hk-saanseoi-division': '1.0',
  }
  delete sourceSchemas[
    'ds-hk-hkgov-censtatd-division-statistic-population-households-district'
  ]
  const lookup = {
    apiVersion: 'api-divisions-v0.2',
    domainCode: 'geographic',
    schemaVersion: 'sv-division-v1',
    rulesetVersion: 'rs-division-merge-v2',
    lineageSnapshotVersions: ['ss-hk-division-saanseoi-2026-09-01.0'],
    sourceSchemas,
  }
  expect(resolveApiFieldFixture(lookup)?.mappingVersion).toBe(3)
  expect(
    resolveApiFieldFixture({
      ...lookup,
      lineageSnapshotVersions: ['ss-hk-division-saanseoi-2026-10-01.0'],
    })?.mappingVersion,
  ).toBe(3)
  expect(
    resolveApiFieldFixture({
      ...lookup,
      lineageSnapshotVersions: ['ss-hk-division-saanseoi-2026-09-01.9'],
    }),
  ).toBeNull()
  const { 'ds-hk-hkgov-rvd-division': rvd, ...withoutRvd } = sourceSchemas
  expect(rvd).toBe('1.0')
  expect(resolveApiFieldFixture({ ...lookup, sourceSchemas: withoutRvd })).toBeNull()
  expect(
    resolveApiFieldFixture({
      ...lookup,
      lineageSnapshotVersions: ['unrelated-branch'],
    }),
  ).toBeNull()
  expect(
    resolveApiFieldFixture({
      ...lookup,
      sourceSchemas: { ...sourceSchemas, 'ds-hk-saanseoi-division': '2.0' },
    }),
  ).toBeNull()
})
