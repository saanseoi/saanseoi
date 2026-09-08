import { requireDefined } from '../../../core/src/requireDefined'
import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { loadMigrationSql } from '../../../core/src/testing/metaFixtures'

import {
  buildMetaRegistrySyncStatements,
  apiDomainCodeRenames,
  initialApiCompositions,
  initialApiCompositionMembers,
  initialApiEndpoints,
  initialApiVersions,
  initialDatasets,
  initialDatasetTransforms,
  initialDataShards,
  initialDivisionCodes,
  initialPublishers,
  resolveInitialDataShardsForEnvironment,
  validateDivisionCodeFixtures,
  resolveMergeRulesetDefinitions,
} from './meta'
import populationRule from '../../../../fixtures/meta/processing-rules/censtatd-population-thousands-to-persons.json'
import { ruleDeclarationFromFixture } from '@repo/core/provenance/ruleFixture'

test('referenced policy content determines resolved ruleset identity and descriptions', () => {
  const definition = ruleDeclarationFromFixture(structuredClone(populationRule))
  const definitions = new Map([['population', definition]])
  const fixture = {
    versionHash: 'source-file-hash',
    code: 'test',
    resourceType: 'divisionStatistic' as const,
    strategy: 'merge' as const,
    version: '1',
    mergeRules: [{ operationCode: 'scale', ruleFixture: 'population' }],
  }
  const first = resolveMergeRulesetDefinitions(fixture, definitions)
  expect(first.mergeRules[0]?.definition).toEqual(definition)
  expect(first.mergeRules[0]?.i18n[0]?.description).toBe(definition.summary)
  definition.parameters.factor = 100
  const changed = resolveMergeRulesetDefinitions(fixture, definitions)
  expect(changed.versionHash).not.toBe(first.versionHash)
  expect(first.mergeRules[0]?.definition?.parameters.factor).toBe(1000)
  expect(resolveMergeRulesetDefinitions(fixture, definitions)).toEqual(changed)
  expect(() => resolveMergeRulesetDefinitions(fixture, new Map())).toThrow(
    'Unknown processing rule',
  )
})

describe('fixture version hashes', () => {
  test.each(['tseung-kwan-o', 'tseung_kwan_o', 'TSEUNG-KWAN-O', '_HK', 'HK__AREA'])(
    'rejects Division code outside SCREAMING_SNAKE_CASE: %s',
    divisionCode => {
      expect(() =>
        validateDivisionCodeFixtures([
          {
            domainCode: 'geographic',
            assignments: [{ divisionCode, canonicalId: 'division-hk' }],
          },
        ]),
      ).toThrow('Invalid Division code')
    },
  )
  test('validates curated Division code fixtures directly', () => {
    const valid = {
      domainCode: 'geographic',
      assignments: [{ divisionCode: 'HK', canonicalId: 'division-hk' }],
    }
    expect(() =>
      validateDivisionCodeFixtures([valid], new Set(['division-hk'])),
    ).not.toThrow()
    expect(() =>
      validateDivisionCodeFixtures([
        {
          ...valid,
          assignments: [{ divisionCode: 'bad code', canonicalId: 'division-hk' }],
        },
      ]),
    ).toThrow('Invalid Division code')
    expect(() =>
      validateDivisionCodeFixtures([
        { ...valid, assignments: [...valid.assignments, ...valid.assignments] },
      ]),
    ).toThrow('Duplicate Division code')
    expect(() => validateDivisionCodeFixtures([valid], new Set())).toThrow(
      'unknown canonical Division',
    )
  })
  test('retains every reviewed 2021 HMA code as an unambiguous Division assignment', () => {
    const hmaAssignments = initialDivisionCodes.filter(
      assignment => assignment.domainCode === 'hkgov-censtatd-hma',
    )

    expect(hmaAssignments).toHaveLength(173)
    expect(
      new Set(hmaAssignments.map(assignment => assignment.divisionCode)).size,
    ).toBe(173)
    expect(hmaAssignments.every(assignment => !('level' in assignment))).toBe(true)
  })
  test('retains SCREAMING_SNAKE_CASE Planning Department New Town Division codes', () => {
    const newTownAssignments = initialDivisionCodes.filter(
      assignment => assignment.domainCode === 'hkgov-pland-new-town',
    )

    expect(newTownAssignments).toHaveLength(13)
    expect(
      newTownAssignments.map(assignment => assignment.divisionCode).sort(),
    ).toEqual([
      'FANLING_SHEUNG_SHUI_KWU_TUNG',
      'HUNG_SHUI_KIU_HA_TSUEN',
      'SHA_TIN_MA_ON_SHAN_AREA',
      'SHA_TIN_SHA_TIN_AREA',
      'TAI_PO',
      'TIN_SHUI_WAI',
      'TSEUNG_KWAN_O',
      'TSUEN_WAN_KWAI_CHUNG_AREA',
      'TSUEN_WAN_TSING_YI_AREA',
      'TSUEN_WAN_TSUEN_WAN_AREA',
      'TUEN_MUN',
      'TUNG_CHUNG',
      'YUEN_LONG',
    ])
    expect(
      newTownAssignments.find(
        assignment => assignment.divisionCode === 'TSUEN_WAN_TSING_YI_AREA',
      ),
    ).toMatchObject({ canonicalId: 'd0b06deb-4842-507b-8284-a3254615e5aa' })
  })
  test('derives deterministic content hashes for versioned fixture records', () => {
    expect(initialApiVersions.length).toBeGreaterThan(0)
    expect(initialApiEndpoints.length).toBeGreaterThan(0)
    expect(
      [...initialApiVersions, ...initialApiEndpoints].every(record =>
        record.versionHash.startsWith('sha256:'),
      ),
    ).toBe(true)
  })

  test('loads product-scoped endpoints for seeded API families', () => {
    const addressPaths = initialApiEndpoints
      .filter(endpoint => endpoint.apiVersion === 'api-addresses-v0.1')
      .map(endpoint => endpoint.path)
      .sort()
    const divisionPaths = initialApiEndpoints
      .filter(endpoint => endpoint.apiVersion === 'api-divisions-v0.1')
      .map(endpoint => endpoint.path)
      .sort()
    const placePaths = initialApiEndpoints
      .filter(endpoint => endpoint.apiVersion === 'api-places-v0.1')
      .map(endpoint => endpoint.path)
      .sort()
    const statsPaths = initialApiEndpoints
      .filter(endpoint => endpoint.apiVersion === 'api-stats-v0.1')
      .map(endpoint => endpoint.path)
      .sort()

    expect(addressPaths).toEqual([
      '/addresses/v0',
      '/addresses/v0.1',
      '/addresses/v0.1/search',
      '/addresses/v0.1/{id}',
      '/addresses/v0.1/{id}/units',
      '/addresses/v0/search',
      '/addresses/v0/{id}',
      '/addresses/v0/{id}/units',
    ])
    expect(divisionPaths).toEqual([
      '/divisions/v0',
      '/divisions/v0.1',
      '/divisions/v0.1/{id}',
      '/divisions/v0/{id}',
    ])
    expect(placePaths).toEqual([
      '/places/v0.1',
      '/places/v0.1/by-cell/{h3Level}/{h3Cell}',
      '/places/v0.1/search',
      '/places/v0.1/{id}',
    ])
    expect(statsPaths).toEqual([
      '/stats/v0',
      '/stats/v0.1',
      '/stats/v0.1/geographies',
      '/stats/v0.1/series',
      '/stats/v0.1/{id}',
      '/stats/v0/geographies',
      '/stats/v0/series',
      '/stats/v0/{id}',
    ])
  })

  test('provides localised long and short descriptions for every API family', () => {
    const describedFamilies = new Set(
      initialApiCompositions
        .filter(composition => composition.status === 'current')
        .filter(composition =>
          Object.values(composition.i18n).every(translations =>
            translations.every(
              translation => translation.description && translation.descriptionShort,
            ),
          ),
        )
        .map(composition => composition.apiVersion),
    )

    expect(
      initialApiVersions.every(apiVersion => describedFamilies.has(apiVersion.code)),
    ).toBe(true)
  })

  test('registers C&SD statistics under the Government Stats domain', () => {
    const censtatdStats = initialDatasets.filter(
      dataset =>
        dataset.publisherCode === 'hkgov-censtatd' &&
        dataset.theme === 'stats' &&
        dataset.resourceTypes.includes('divisionStatistic'),
    )

    expect(censtatdStats).toHaveLength(8)
    expect(
      censtatdStats.every(dataset => dataset.code.startsWith('ds-hk-hkgov-censtatd-')),
    ).toBe(true)
    expect(
      censtatdStats.every(
        dataset =>
          dataset.sourceCrs === 'EPSG:2326' && dataset.releaseType === 'static',
      ),
    ).toBe(true)
    expect(
      censtatdStats.filter(dataset => dataset.sourceVariant === 'census'),
    ).toHaveLength(2)
    expect(
      censtatdStats
        .filter(dataset => dataset.sourceVariant === 'census')
        .every(dataset => dataset.releaseFrequency === 'census'),
    ).toBe(true)
    expect(
      censtatdStats
        .filter(dataset => dataset.sourceVariant === 'official-statistics')
        .map(dataset => dataset.releaseFrequency)
        .sort(),
    ).toEqual(['half-yearly', 'yearly', 'yearly'])
    expect(
      initialApiCompositions.find(
        composition => composition.apiVersion === 'api-stats-v0.1',
      ),
    ).toMatchObject({ defaultDomainCode: 'government' })
    expect(
      initialApiCompositionMembers
        .filter(
          member =>
            member.apiCompositionCode === 'comp-stats-v1' &&
            member.resourceType === 'divisionStatistic',
        )
        .map(member => member.variant)
        .sort(),
    ).toEqual(censtatdStats.map(dataset => dataset.code).sort())
    expect(
      initialApiCompositionMembers
        .filter(member => member.apiCompositionCode === 'comp-stats-v1')
        .every(
          member => !member.isRequired && member.cohortMatchingMode === 'exact_ref',
        ),
    ).toBe(true)
    expect(
      censtatdStats.every(dataset =>
        dataset.processingRules?.rulesets.some(
          ruleset =>
            ruleset.rulesetVersion === 'rs-division-statistic-merge-v1' &&
            ruleset.rules.some(
              rule =>
                rule.operationCode === 'normalise_censtatd_statistic_source_assertion',
            ),
        ),
      ),
    ).toBe(true)
  })

  test('pairs C&SD HMA geometry with its canonical division and maps Permanent Living Quarters to Overture areas', () => {
    const divisionsComposition = initialApiCompositions.find(
      composition => composition.code === 'comp-divisions-v1',
    )
    expect(divisionsComposition).toBeDefined()

    const hmaMembers = initialApiCompositionMembers.filter(
      member =>
        member.apiCompositionCode === 'comp-divisions-v1' &&
        member.domainCode === 'hkgov-censtatd-hma',
    )
    expect(hmaMembers).toContainEqual(
      expect.objectContaining({
        resourceType: 'division',
        variant: 'hkgov-censtatd-hma',
        role: 'primary',
        isRequired: true,
      }),
    )
    expect(hmaMembers).toContainEqual(
      expect.objectContaining({
        resourceType: 'divisionArea',
        variant: 'hkgov-censtatd-hma',
        role: 'geometry',
        isRequired: true,
      }),
    )

    const areaTypeMembers = initialApiCompositionMembers.filter(
      member =>
        member.apiCompositionCode === 'comp-divisions-v1' &&
        member.domainCode === 'geographic' &&
        member.variant === 'hkgov-censtatd',
    )
    expect(areaTypeMembers).toEqual([
      expect.objectContaining({
        resourceType: 'divisionArea',
        isRequired: true,
        role: 'geometry',
        cohortMatchingMode: 'latest_at_or_before_cohort_per_dataset',
        configJson: expect.stringContaining('"variant":"overture"'),
      }),
    ])
  })

  test('renames legacy domain labels in published registry metadata', () => {
    const statements = buildMetaRegistrySyncStatements('preview').join('\n')
    expect(statements).toContain('DELETE FROM apiCompositionMembers')
    expect(apiDomainCodeRenames).toEqual([
      { apiVersion: 'api-addresses-v0.1', from: 'default', to: 'saanseoi' },
      { apiVersion: 'api-addresses-v0.1', from: 'official', to: 'saanseoi' },
      { apiVersion: 'api-stats-v0.1', from: 'official', to: 'government' },
      { apiVersion: 'api-streets-v0.1', from: 'official', to: 'saanseoi' },
    ])
    expect(statements).toContain(
      'UPDATE apiCatalogRevisionReleaseSets\nSET domainCode =',
    )
    expect(statements).toContain('UPDATE apiReleaseSets\nSET domainCode =')
  })

  test('stores deterministic bulk actions resolved from versioned merge rulesets', () => {
    const overtureDivisions = initialDatasets.find(
      dataset => dataset.code === 'ds-hk-overture-division',
    )
    const censtatdDensity = initialDatasets.find(
      dataset =>
        dataset.code ===
        'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
    )

    expect(overtureDivisions?.processingRules).toEqual(
      expect.objectContaining({
        rulesets: [
          expect.objectContaining({
            rulesetVersion: 'rs-division-merge-v1',
            rules: expect.arrayContaining([
              expect.objectContaining({
                operationCode: 'normalise_overture_division_hierarchy',
                definition: expect.objectContaining({ id: 'normalise-divisions' }),
                type: 'bulk',
              }),
              expect.objectContaining({
                operationCode: 'derive_division_type_from_overture_taxonomy',
                definition: expect.objectContaining({ id: 'normalise-divisions' }),
              }),
              expect.objectContaining({
                operationCode: 'overture_division_locale_inferred',
                type: 'bulk',
              }),
              expect.objectContaining({
                operationCode: 'overture_hong_kong_lok_ma_chau_loop_reclassified',
                definition: expect.objectContaining({
                  id: 'apply-division-classification-curation',
                }),
                type: 'record',
              }),
            ]),
          }),
        ],
      }),
    )
    expect(censtatdDensity?.processingRules).toEqual(
      expect.objectContaining({
        rulesets: [
          expect.objectContaining({
            rulesetVersion: 'rs-division-statistic-merge-v1',
            rules: expect.arrayContaining([
              expect.objectContaining({
                operationCode: 'normalise_censtatd_statistic_source_assertion',
                type: 'bulk',
              }),
              expect.objectContaining({
                operationCode: 'map_censtatd_district_code_to_canonical_division',
                type: 'bulk',
                mappings: expect.arrayContaining([
                  expect.objectContaining({
                    from: 'matching C&SD bridge canonicalId',
                    to: 'divisionId',
                  }),
                ]),
              }),
              expect.objectContaining({
                operationCode: 'normalise_censtatd_population_thousands_to_persons',
                sourceFieldPath: 'publisher-properties.MYPOPN_LAND',
                type: 'bulk',
              }),
            ]),
          }),
        ],
      }),
    )
  })
})

describe('resolveInitialDataShardsForEnvironment', () => {
  test('registers the Hong Kong BEFORE shards without a year scope', () => {
    for (const environment of ['preview', 'production'] as const) {
      expect(resolveInitialDataShardsForEnvironment(environment)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            bindingName: 'DB_HISTORY_HK_BEFORE',
            environment,
            regionCode: 'hk',
            shardType: 'history',
            year: undefined,
          }),
          expect.objectContaining({
            bindingName: 'DB_SOURCE_HK_BEFORE',
            environment,
            regionCode: 'hk',
            shardType: 'source',
            year: undefined,
          }),
        ]),
      )
    }
  })

  test('returns only preview shard rows for preview targets', () => {
    const previewShards = resolveInitialDataShardsForEnvironment('preview')

    expect(previewShards.length).toBeGreaterThan(0)
    expect(previewShards.every(shard => shard.environment === 'preview')).toBe(true)
    expect(previewShards).toHaveLength(initialDataShards.length / 2)
  })

  test('returns only production shard rows for production targets', () => {
    const productionShards = resolveInitialDataShardsForEnvironment('production')

    expect(productionShards.length).toBeGreaterThan(0)
    expect(productionShards.every(shard => shard.environment === 'production')).toBe(
      true,
    )
    expect(productionShards).toHaveLength(initialDataShards.length / 2)
  })
})

describe('buildMetaRegistrySyncStatements', () => {
  test('replaces superseded Division codes and remains idempotent', () => {
    const db = new Database(':memory:')
    try {
      db.exec(`CREATE TABLE divisionCodes (
        domainCode TEXT, divisionCode TEXT, canonicalId TEXT,
        versionHash TEXT, createdAt INTEGER, updatedAt INTEGER,
        PRIMARY KEY (domainCode, divisionCode)
      )`)
      db.exec(`INSERT INTO divisionCodes VALUES (
        'hkgov-pland-new-town', 'tseung-kwan-o',
        '9598a407-bc95-5bce-84e1-d284b6322315', 'old', 0, 0
      )`)
      const statements = buildMetaRegistrySyncStatements('preview').filter(statement =>
        /^(INSERT INTO|DELETE FROM) divisionCodes\b/.test(statement.trim()),
      )
      for (let attempt = 0; attempt < 2; attempt++) {
        for (const statement of statements) db.exec(statement)
        expect(
          db
            .query(`SELECT divisionCode FROM divisionCodes
          WHERE canonicalId = '9598a407-bc95-5bce-84e1-d284b6322315'`)
            .all(),
        ).toEqual([{ divisionCode: 'TSEUNG_KWAN_O' }])
        expect(db.query('SELECT * FROM divisionCodes').all()).toHaveLength(
          initialDivisionCodes.length,
        )
      }
    } finally {
      db.close()
    }
  })
  test('seeds resource arrays directly on datasets and preserves them on repeated sync', () => {
    const db = new Database(':memory:')
    try {
      db.exec(loadMigrationSql(resolve(import.meta.dir, '../../migrations'), ['meta']))
      const statements = buildMetaRegistrySyncStatements('preview')
      for (let attempt = 0; attempt < 2; attempt++) {
        for (const statement of statements) db.exec(statement)
        const rows = db
          .query(`
          SELECT d.code, p.code AS publisherCode, d.resourceTypes
          FROM datasets d JOIN publishers p ON p.id = d.publisherId
        `)
          .all() as { code: string; publisherCode: string; resourceTypes: string }[]
        expect(rows).toHaveLength(initialDatasets.length)
        for (const dataset of initialDatasets) {
          const row = rows.find(
            row =>
              row.code === dataset.code && row.publisherCode === dataset.publisherCode,
          )
          expect(JSON.parse(requireDefined(row).resourceTypes)).toEqual(
            dataset.resourceTypes,
          )
        }
      }
    } finally {
      db.close()
    }
  })

  test('allows source-versioned transforms to share a public output variant', () => {
    const sharedVariantTransforms = initialDatasetTransforms.filter(
      transform => transform.outputVariant === 'hkgov-censtatd:simplified',
    )
    const statements = buildMetaRegistrySyncStatements('preview')

    expect(sharedVariantTransforms.length).toBeGreaterThan(1)
    expect(
      new Set(
        sharedVariantTransforms.map(transform =>
          [transform.datasetCode, transform.code, transform.sourceVersion].join(':'),
        ),
      ).size,
    ).toBe(sharedVariantTransforms.length)
    expect(statements).toContainEqual(
      expect.stringContaining('ON CONFLICT(datasetId, code, sourceVersion) DO UPDATE'),
    )
  })

  test('orders parent publishers before their children', () => {
    const parentIndex = initialPublishers.findIndex(
      publisher => publisher.code === 'hkgov',
    )
    const childIndex = initialPublishers.findIndex(
      publisher => publisher.code === 'hkgov-censtatd',
    )

    expect(parentIndex).toBeGreaterThanOrEqual(0)
    expect(childIndex).toBeGreaterThan(parentIndex)
  })

  test('builds update-capable upserts for registry-backed tables', () => {
    const statements = buildMetaRegistrySyncStatements('preview')

    expect(statements.length).toBeGreaterThan(0)
    expect(
      statements.some(statement => statement.includes('ON CONFLICT(code) DO UPDATE')),
    ).toBe(true)
    expect(
      statements.some(statement =>
        statement.includes('ON CONFLICT(operationId) DO UPDATE'),
      ),
    ).toBe(true)
    expect(statements.some(statement => statement.includes("'preview'"))).toBe(true)
    expect(statements.every(statement => !statement.includes("'production'"))).toBe(
      true,
    )
    expect(
      statements.some(statement =>
        statement.includes('publishers.parentPublisherId IS NULL'),
      ),
    ).toBe(true)
  })

  test('uses deterministic ids for seeded registry rows', () => {
    const statements = buildMetaRegistrySyncStatements('preview')
    const datasetStatement = statements.find(statement =>
      statement.startsWith('INSERT INTO datasets'),
    )
    const apiVersionStatement = statements.find(statement =>
      statement.startsWith('INSERT INTO apiVersions'),
    )

    expect(datasetStatement).toBeDefined()
    expect(apiVersionStatement).toBeDefined()
    expect(statements.every(statement => !statement.includes('randomblob'))).toBe(true)
    expect(datasetStatement).not.toContain('randomblob')
    expect(datasetStatement).toMatch(
      /VALUES \(\n {2}'[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'/,
    )
    expect(apiVersionStatement).toMatch(
      /VALUES \(\n {2}'[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'/,
    )
  })
})
