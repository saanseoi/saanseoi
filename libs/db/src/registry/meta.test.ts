import { describe, expect, test } from 'bun:test'

import {
  buildMetaRegistrySyncStatements,
  apiDomainCodeRenames,
  initialApiCompositions,
  initialApiCompositionMembers,
  initialApiEndpoints,
  initialApiVersions,
  initialDatasets,
  initialDatasetResourceTypes,
  initialDatasetTransforms,
  initialDataShards,
  initialDivisionCodes,
  initialIdentifierBridges,
  initialPublishers,
  resolveInitialDataShardsForEnvironment,
  validateDivisionCodeFixtures,
} from './meta'

describe('fixture version hashes', () => {
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
  test('retains URL-safe Planning Department New Town Division codes', () => {
    const newTownAssignments = initialDivisionCodes.filter(
      assignment => assignment.domainCode === 'hkgov-pland-new-town',
    )

    expect(newTownAssignments).toHaveLength(13)
    expect(
      newTownAssignments.map(assignment => assignment.divisionCode).sort(),
    ).toEqual([
      'fanling-sheung-shui-kwu-tung',
      'hung-shui-kiu-ha-tsuen',
      'sha-tin-ma-on-shan-area',
      'sha-tin-sha-tin-area',
      'tai-po',
      'tin-shui-wai',
      'tseung-kwan-o',
      'tsuen-wan-kwai-chung-area',
      'tsuen-wan-tsing-yi-area',
      'tsuen-wan-tsuen-wan-area',
      'tuen-mun',
      'tung-chung',
      'yuen-long',
    ])
    expect(
      newTownAssignments.find(
        assignment => assignment.divisionCode === 'tsuen-wan-tsing-yi-area',
      ),
    ).toMatchObject({ canonicalId: 'd0b06deb-4842-507b-8284-a3254615e5aa' })
  })
  test('retains the reviewed 2021 C&SD-to-Planning New Town bridge', () => {
    const newTownMappings = initialIdentifierBridges.filter(
      bridge =>
        bridge.authority === 'hkgov-censtatd' &&
        bridge.cohortKey === '2021' &&
        bridge.domain === 'new-town' &&
        bridge.resourceType === 'division',
    )

    expect(newTownMappings).toHaveLength(13)
    expect(newTownMappings.map(mapping => mapping.externalId).sort()).toEqual([
      '11',
      '13',
      '15',
      '17',
      '18',
      '20',
      '22',
      '24',
      '25',
      '27',
      '28',
      '30',
      '32',
    ])
    expect(newTownMappings.every(mapping => mapping.canonicalId)).toBe(true)
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
      '/addresses/v0.1/{id}',
      '/addresses/v0/{id}',
    ])
    expect(divisionPaths).toEqual([
      '/divisions/v0',
      '/divisions/v0.1',
      '/divisions/v0.1/{id}',
      '/divisions/v0/{id}',
    ])
    expect(placePaths).toEqual(['/places/v0.1/{region}/{id}'])
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

  test('registers C&SD statistics under the official Stats domain', () => {
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
    ).toHaveLength(2)
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
    ).toEqual(['half-yearly', 'yearly', 'yearly'])
    expect(
      initialApiCompositions.find(
        composition => composition.apiVersion === 'api-stats-v0.1',
      ),
    ).toMatchObject({ defaultDomainCode: 'official' })
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

  test('renames legacy official domain labels in published registry metadata', () => {
    const statements = buildMetaRegistrySyncStatements('preview').join('\n')
    expect(statements).toContain('DELETE FROM apiCompositionMembers')
    expect(apiDomainCodeRenames).toEqual([
      { apiVersion: 'api-addresses-v0.1', from: 'default', to: 'official' },
      { apiVersion: 'api-stats-v0.1', from: 'default', to: 'official' },
      { apiVersion: 'api-streets-v0.1', from: 'hkgov-landsd', to: 'official' },
    ])
    expect(statements).toContain(
      'UPDATE apiCatalogRevisionReleaseSets\nSET domainCode =',
    )
    expect(statements).toContain('UPDATE apiReleaseSets\nSET domainCode =')
  })

  test('keeps complete reviewed C&SD district bridges for both statistic cohorts', () => {
    const bridgesFor = (cohortKey: string) =>
      initialIdentifierBridges.filter(
        bridge =>
          bridge.authority === 'hkgov-censtatd' &&
          bridge.cohortKey === cohortKey &&
          bridge.domain === 'administrative' &&
          bridge.resourceType === 'division',
      )

    const bridges2016 = bridgesFor('2016')
    const bridges2021 = bridgesFor('2021')

    expect(bridges2016).toHaveLength(18)
    expect(bridges2021).toHaveLength(18)
    expect(new Set(bridges2016.map(bridge => bridge.externalCode)).size).toBe(18)
    expect(new Set(bridges2021.map(bridge => bridge.externalCode)).size).toBe(18)
    expect(new Set(bridges2016.map(bridge => bridge.canonicalId))).toEqual(
      new Set(bridges2021.map(bridge => bridge.canonicalId)),
    )
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
              expect.objectContaining({
                operationCode: 'overture_hong_kong_lok_ma_chau_loop_reclassified',
                sourceFieldPath: 'id, subtype, class, admin_level',
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
                sourceFieldPath: 'raw_properties.MYPOPN_LAND',
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
