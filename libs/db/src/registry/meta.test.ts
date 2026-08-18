import { describe, expect, test } from 'bun:test'

import {
  buildMetaRegistrySyncStatements,
  initialApiCompositions,
  initialApiEndpoints,
  initialApiVersions,
  initialDatasets,
  initialDatasetResourceTypes,
  initialDataShards,
  resolveInitialDataShardsForEnvironment,
} from './meta'

describe('fixture version hashes', () => {
  test('derives deterministic content hashes for versioned fixture records', () => {
    expect(initialApiVersions.length).toBeGreaterThan(0)
    expect(initialApiEndpoints.length).toBeGreaterThan(0)
    expect(
      [...initialApiVersions, ...initialApiEndpoints].every(record =>
        record.versionHash.startsWith('sha256:'),
      ),
    ).toBe(true)
  })

  test('loads both v0 and v0.1 aliases for seeded endpoint families', () => {
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
      '/v0.1/addresses',
      '/v0.1/addresses/{id}',
      '/v0/addresses',
      '/v0/addresses/{id}',
    ])
    expect(divisionPaths).toEqual([
      '/v0.1/divisions',
      '/v0.1/divisions/{id}',
      '/v0/divisions',
      '/v0/divisions/{id}',
    ])
    expect(placePaths).toEqual(['/v0.1/places', '/v0/places'])
    expect(statsPaths).toEqual(['/v0.1/stats', '/v0/stats'])
  })

  test('provides localised explanatory text for every API family', () => {
    const describedFamilies = new Set(
      initialApiCompositions
        .filter(composition => composition.status === 'current')
        .filter(composition =>
          Object.values(composition.i18n).every(translations =>
            translations.every(translation => translation.description),
          ),
        )
        .map(composition => composition.apiVersion),
    )

    expect(
      initialApiVersions.every(apiVersion => describedFamilies.has(apiVersion.code)),
    ).toBe(true)
  })

  test('registers C&SD statistics under the default Stats domain', () => {
    const censtatdStats = initialDatasets.filter(
      dataset =>
        dataset.publisherCode === 'hkgov-censtatd' &&
        dataset.theme === 'stats' &&
        initialDatasetResourceTypes.some(
          resourceType =>
            resourceType.publisherCode === dataset.publisherCode &&
            resourceType.datasetCode === dataset.code &&
            resourceType.resourceType === 'divisionStatistic',
        ),
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
    ).toHaveLength(4)
    expect(
      censtatdStats
        .filter(dataset => dataset.sourceVariant === 'census')
        .every(dataset => dataset.releaseFrequency === 'five-yearly'),
    ).toBe(true)
    expect(
      censtatdStats
        .filter(dataset => dataset.sourceVariant === 'official-statistics')
        .map(dataset => dataset.releaseFrequency)
        .sort(),
    ).toEqual(['half-yearly', 'half-yearly', 'yearly', 'yearly'])
    expect(
      initialApiCompositions.find(
        composition => composition.apiVersion === 'api-stats-v0.1',
      ),
    ).toMatchObject({ defaultDomainCode: 'default' })
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
                sourceFieldPath: 'hierarchies',
                type: 'bulk',
              }),
              expect.objectContaining({
                operationCode: 'derive_division_type_from_overture_taxonomy',
                mappings: expect.arrayContaining([
                  expect.objectContaining({
                    from: 'subtype = dependency',
                    to: 'sar',
                  }),
                ]),
              }),
              expect.objectContaining({
                operationCode: 'overture_division_locale_inferred',
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
            rules: [
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
            ],
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
