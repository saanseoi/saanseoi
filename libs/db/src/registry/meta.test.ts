import { datasetVariantForSource } from '../../../core/src/codes'
import { geographicDivisionClassification } from '../divisionTaxonomy'
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
  initialUnits,
  resolveInitialDataShardsForEnvironment,
  validateDivisionCodeFixtures,
  resolveMergeRulesetDefinitions,
} from './meta'
import populationRule from '../../../../fixtures/meta/processing-rules/assembly/censtatd-population-thousands-to-persons.json'
import saanseoiComposition from '../../../../fixtures/meta/apiCompositions/api-divisions-comp-v2.json'
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
  expect(first.mergeRules[0]?.i18n.en?.description).toBe(definition.summary)
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
      assignments: [
        {
          divisionCode: 'HK',
          divisionClass: 'area',
          divisionCategory: 'administrative',
          canonicalId: 'division-hk',
        },
      ],
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
    ).toMatchObject({ canonicalId: 'ss-d0b06deb-4842-507b-8284-a3254615e5aa' })
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

  test('seeds API lifecycle transitions as append-only journal events', () => {
    const deprecatedVersion = initialApiVersions.find(
      apiVersion => apiVersion.code === 'api-divisions-v0.1',
    )
    const statements = buildMetaRegistrySyncStatements('preview')
    const lifecycleStatements = statements.filter(statement =>
      statement.startsWith('INSERT INTO apiLifecycleJournal'),
    )
    const apiVersionStatement = statements.find(statement =>
      statement.startsWith('INSERT INTO apiVersions'),
    )

    expect(deprecatedVersion?.lifecycleEvents).toEqual([
      {
        statusFrom: 'draft',
        statusTo: 'current',
        occurredAt: '2026-06-01T00:00:00.000Z',
      },
      {
        statusFrom: 'current',
        statusTo: 'deprecated',
        occurredAt: '2026-09-01T00:00:00.000Z',
        reason:
          'Overture inventories remain publishable; use v0.2 for curated SaanSeoi editions.',
      },
    ])
    expect(lifecycleStatements.length).toBeGreaterThanOrEqual(7)
    expect(
      lifecycleStatements.every(statement => statement.includes('DO NOTHING')),
    ).toBe(true)
    expect(apiVersionStatement).not.toContain('publishedAt')
    expect(apiVersionStatement).not.toContain('archivedAt')
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
      '/divisions/v0.1/search',
      '/divisions/v0.1/{id}',
      '/divisions/v0/search',
      '/divisions/v0/{id}',
    ])
    expect(placePaths).toEqual([
      '/places/v0',
      '/places/v0.1',
      '/places/v0.1/by-cell/{h3Level}/{h3Cell}',
      '/places/v0.1/search',
      '/places/v0.1/{id}',
      '/places/v0/by-cell/{h3Level}/{h3Cell}',
      '/places/v0/search',
      '/places/v0/{id}',
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
          initialApiCompositionMembers
            .filter(member => member.apiCompositionCode === composition.code)
            .every(member =>
              Object.values(member.i18n).every(
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
    expect(censtatdStats.map(dataset => dataset.sourceVariant).sort()).toEqual([
      'default',
      'default',
      'default',
      'default',
      'default',
      'default',
      'hkgov-censtatd-hma',
      'hkgov-censtatd-landclipped',
    ])
    expect(
      censtatdStats
        .filter(dataset => dataset.releaseFrequency === 'census')
        .map(dataset => dataset.code)
        .sort(),
    ).toEqual([
      'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups',
      'ds-hk-hkgov-censtatd-division-statistic-major-housing-estates',
      'ds-hk-hkgov-censtatd-division-statistic-new-towns',
      'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district',
    ])
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
    ).toEqual(
      censtatdStats
        .map(dataset =>
          datasetVariantForSource('divisionStatistic', undefined, {
            datasetCode: dataset.code,
          }),
        )
        .sort(),
    )
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
            ruleset.rulesetVersion === 'rs-source-ingestion-v1' &&
            ruleset.rules.some(
              rule =>
                rule.operationCode ===
                  `ingest-${dataset.code.replace(/^ds-hk-/, '')}` &&
                rule.definition?.id ===
                  (dataset.code.endsWith('-land-area-population-density-district')
                    ? 'normalise_censtatd_statistic_source_assertion'
                    : 'retain-censtatd-source'),
            ),
        ),
      ),
    ).toBe(true)
  })

  test('pairs C&SD HMA geometry with its canonical division and maps Permanent Living Quarters to SaanSeoi areas', () => {
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
    expect(areaTypeMembers).toEqual([])
    const saanseoiAreaTypeMembers = initialApiCompositionMembers.filter(
      member =>
        member.apiCompositionCode === 'comp-divisions-v2' &&
        member.domainCode === 'geographic' &&
        member.variant === 'hkgov-censtatd',
    )
    expect(saanseoiAreaTypeMembers).toEqual([
      expect.objectContaining({
        resourceType: 'divisionArea',
        isRequired: true,
        role: 'geometry',
        cohortMatchingMode: 'latest_at_or_before_cohort_per_dataset',
      }),
    ])
    expect(
      saanseoiComposition.domains
        .find(domain => domain.code === 'geographic')
        ?.members.find(member => member.variant === 'hkgov-censtatd')
        ?.ingestDependencies,
    ).toEqual([{ resourceType: 'division', variant: 'saanseoi' }])
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
    expect(statements).toContain('FROM apiVersionReleaseSets\n    WHERE apiVersionId =')
    expect(statements).toContain('AND apiVersionReleaseSetId IN (')
  })

  test('datasets select ingestion rules while snapshot policies own canonical normalisation', () => {
    const overture = initialDatasets.find(
      dataset => dataset.code === 'ds-hk-overture-division',
    )!.processingRules!
    expect(overture.stage).toBe('ingestion')
    expect(overture.rulesets[0]!.rules.map(rule => rule.definition?.id)).toEqual([
      'retain-overture-source',
    ])
    const density = initialDatasets.find(
      dataset =>
        dataset.code ===
        'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
    )!.processingRules!
    expect(density.stage).toBe('ingestion')
    expect(density.rulesets[0]!.rules.map(rule => rule.definition?.id)).toEqual([
      'normalise_censtatd_statistic_source_assertion',
    ])
  })

  test('registers the curated Protomaps island geometry source separately from Overture', () => {
    expect(initialDatasets).toContainEqual(
      expect.objectContaining({
        code: 'ds-hk-protomaps-island',
        publisherCode: 'protomaps',
        theme: 'divisions',
        kind: 'island',
        sourceVariant: 'protomaps',
        releaseType: 'snapshot',
        releaseFrequency: 'monthly',
        resourceTypes: ['divisionArea'],
        processingRules: expect.objectContaining({
          stage: 'ingestion',
          rulesets: [
            expect.objectContaining({
              rulesetVersion: 'rs-source-ingestion-v1',
              rules: expect.arrayContaining([
                expect.objectContaining({
                  operationCode: 'extract-protomaps-source',
                  kind: 'bulk',
                }),
                expect.objectContaining({
                  operationCode: 'ingest-protomaps-island',
                  kind: 'bulk',
                }),
              ]),
            }),
          ],
        }),
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
        domainCode TEXT, divisionClass TEXT, divisionCode TEXT, canonicalId TEXT,
        versionHash TEXT, createdAt INTEGER, updatedAt INTEGER,
        PRIMARY KEY (domainCode, divisionClass, divisionCode)
      )`)
      db.exec(`INSERT INTO divisionCodes VALUES (
        'hkgov-pland-new-town', '', 'tseung-kwan-o',
        'ss-9598a407-bc95-5bce-84e1-d284b6322315', 'old', 0, 0
      )`)
      const statements = buildMetaRegistrySyncStatements('preview').filter(statement =>
        /^(INSERT INTO|DELETE FROM) divisionCodes\b/.test(statement.trim()),
      )
      for (let attempt = 0; attempt < 2; attempt++) {
        for (const statement of statements) db.exec(statement)
        expect(
          db
            .query(`SELECT divisionCode FROM divisionCodes
          WHERE canonicalId = 'ss-9598a407-bc95-5bce-84e1-d284b6322315'`)
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
  test('stores locale values on owners and composition members after migration and repeated sync', () => {
    const db = new Database(':memory:')
    try {
      db.exec(loadMigrationSql(resolve(import.meta.dir, '../../migrations'), ['meta']))
      const statements = buildMetaRegistrySyncStatements('preview')
      for (let attempt = 0; attempt < 2; attempt++) {
        for (const statement of statements) db.exec(statement)
        for (const [table, seeds] of [
          ['publishers', initialPublishers],
          ['datasets', initialDatasets],
          ['units', initialUnits],
        ] as const) {
          const rows = db.query(`SELECT code, i18n FROM ${table}`).all() as Array<{
            code: string
            i18n: string
          }>
          expect(rows).toHaveLength(seeds.length)
          for (const seed of seeds) {
            expect(
              JSON.parse(requireDefined(rows.find(row => row.code === seed.code)).i18n),
            ).toEqual(seed.i18n)
          }
          // Matching fixture hashes must not prevent restoration of locale values.
          if (attempt === 0) db.exec(`UPDATE ${table} SET i18n = '{}'`)
        }
        const members = db
          .query(`
          SELECT c.code, m.domainCode, m.resourceType, m.variant, m.i18n
          FROM apiCompositionMembers m JOIN apiComposition c ON c.id = m.apiCompositionId
        `)
          .all() as Array<{
          code: string
          domainCode: string
          resourceType: string
          variant: string
          i18n: string
        }>
        expect(members).toHaveLength(initialApiCompositionMembers.length)
        for (const seed of initialApiCompositionMembers) {
          const row = requireDefined(
            members.find(
              row =>
                row.code === seed.apiCompositionCode &&
                row.domainCode === seed.domainCode &&
                row.resourceType === seed.resourceType &&
                row.variant === seed.variant,
            ),
          )
          expect(JSON.parse(row.i18n)).toEqual(seed.i18n)
          expect(Array.isArray(JSON.parse(row.i18n))).toBe(false)
          expect(Object.keys(JSON.parse(row.i18n)).sort()).toEqual([
            'en',
            'zh-hans',
            'zh-hant',
          ])
        }
      }
      expect(
        db
          .query(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('publisherI18n', 'datasetI18n', 'unitsI18n')",
          )
          .all(),
      ).toEqual([])
      expect(
        db
          .query(
            "SELECT name FROM pragma_table_info('apiComposition') WHERE name = 'i18n'",
          )
          .all(),
      ).toEqual([])
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

test('official source datasets retain executable processing definitions and confirmed CRS', () => {
  for (const code of [
    'ds-hk-hkgov-dpo-address',
    'ds-hk-hkgov-had-division-area-district',
    'ds-hk-hkgov-landsd-division',
    'ds-hk-hkgov-pland-division-new-town',
    'ds-hk-hkgov-pland-division-pu',
  ]) {
    const dataset = initialDatasets.find(dataset => dataset.code === code)
    if (!dataset) throw new Error(`Missing dataset fixture: ${code}`)
    expect(dataset.sourceCrs).toMatch(/^EPSG:/)
    const processingRules = dataset.processingRules
    if (!processingRules) throw new Error(`Missing processing rules: ${code}`)
    const rules = processingRules.rulesets.flatMap(ruleset => ruleset.rules)
    expect(rules.length).toBeGreaterThan(0)
    expect(rules.every(rule => rule.definition?.implementation)).toBe(true)
  }
  expect(
    initialDatasets.find(dataset => dataset.code === 'ds-hk-hkgov-pland-division-pu')
      ?.kind,
  ).toBe('pu')
})

test('Division codes are unique within category and may repeat between categories', () => {
  const fixture = {
    domainCode: 'geographic',
    assignments: [
      {
        divisionCode: 'CW',
        divisionClass: 'district',
        divisionCategory: 'administrative',
        canonicalId: 'central-western',
      },
      {
        divisionCode: 'CW',
        divisionClass: 'macrohood',
        divisionCategory: 'hood',
        canonicalId: 'chai-wan',
      },
    ],
  }
  expect(() => validateDivisionCodeFixtures([fixture])).not.toThrow()
  expect(() =>
    validateDivisionCodeFixtures([
      {
        ...fixture,
        assignments: [
          ...fixture.assignments,
          {
            divisionCode: 'CW',
            divisionClass: 'macrohood',
            divisionCategory: 'hood',
            canonicalId: 'another',
          },
        ],
      },
    ]),
  ).toThrow('Duplicate Division code')
})

test.each([
  ['area', 'district'],
  ['city', 'town'],
  ['village', 'hamlet'],
  ['rural_area', 'village'],
  ['macrohood', 'microhood'],
  ['minor_island', 'island_group'],
])('rejects geographic code reuse between %s and %s', (left, right) => {
  expect(() =>
    validateDivisionCodeFixtures([
      {
        domainCode: 'geographic',
        assignments: [
          {
            divisionCode: 'TEST',
            divisionClass: left,
            divisionCategory: geographicDivisionClassification(left)!.category,
            canonicalId: 'a',
          },
          {
            divisionCode: 'TEST',
            divisionClass: right,
            divisionCategory: geographicDivisionClassification(right)!.category,
            canonicalId: 'b',
          },
        ],
      },
    ]),
  ).toThrow('Duplicate Division code')
})

test('geographic code assignments declare their actual category', () => {
  const assignment = {
    divisionCode: 'TEST',
    divisionClass: 'microhood',
    canonicalId: 'test',
  }
  expect(() =>
    validateDivisionCodeFixtures([
      { domainCode: 'geographic', assignments: [assignment] },
    ]),
  ).toThrow('category mismatch')
  expect(() =>
    validateDivisionCodeFixtures([
      {
        domainCode: 'geographic',
        assignments: [{ ...assignment, divisionCategory: 'locality' }],
      },
    ]),
  ).toThrow('category mismatch')
})

test('Address and Places composition members retain explicit collection variants and distinct roles after registry sync', () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../migrations'), ['meta']),
    )
    for (let pass = 0; pass < 2; pass += 1) {
      for (const statement of buildMetaRegistrySyncStatements('local'))
        sqlite.exec(statement)
      const members = sqlite
        .query(`SELECT c.code AS composition, m.domainCode AS domain,
        m.resourceType AS resource, m.variant, m.role
        FROM apiCompositionMembers m JOIN apiComposition c ON c.id = m.apiCompositionId
        WHERE c.code IN ('comp-addresses-v1', 'comp-places-v1')
        ORDER BY c.code, m.priority`)
        .all()
      expect(members).toEqual([
        {
          composition: 'comp-addresses-v1',
          domain: 'saanseoi',
          resource: 'address',
          variant: 'hkgov-dpo',
          role: 'primary',
        },
        {
          composition: 'comp-addresses-v1',
          domain: 'saanseoi',
          resource: 'address',
          variant: 'overture-places',
          role: 'supplementary',
        },
        {
          composition: 'comp-addresses-v1',
          domain: 'saanseoi',
          resource: 'division',
          variant: 'overture',
          role: 'lookup',
        },
        {
          composition: 'comp-places-v1',
          domain: 'overture',
          resource: 'place',
          variant: 'overture',
          role: 'primary',
        },
        {
          composition: 'comp-places-v1',
          domain: 'overture',
          resource: 'address',
          variant: 'hkgov-dpo',
          role: 'lookup',
        },
        {
          composition: 'comp-places-v1',
          domain: 'overture',
          resource: 'address',
          variant: 'overture-places',
          role: 'lookup',
        },
        {
          composition: 'comp-places-v1',
          domain: 'overture',
          resource: 'division',
          variant: 'overture',
          role: 'lookup',
        },
      ])
    }
  } finally {
    sqlite.close()
  }
})

test('migrated registry sync stores compositions without notes or schema or ruleset pins', () => {
  const db = new Database(':memory:')
  try {
    db.exec(loadMigrationSql(resolve(import.meta.dir, '../../migrations'), ['meta']))
    const statements = buildMetaRegistrySyncStatements('local')
    for (let pass = 0; pass < 2; pass++)
      for (const statement of statements) db.exec(statement)
    const columns = db
      .query<{ name: string }, []>('PRAGMA table_info(apiComposition)')
      .all()
      .map(row => row.name)
    expect(columns).not.toContain('notes')
    expect(columns).not.toContain('rulesetVersions')
    expect(columns).not.toContain('schemaVersion')
    expect(
      initialApiCompositions.every(row => !Object.hasOwn(row, 'rulesetVersions')),
    ).toBe(true)
    expect(db.query('SELECT count(*) AS count FROM apiComposition').get()).toEqual({
      count: initialApiCompositions.length,
    })
  } finally {
    db.close()
  }
})

test('resource releases omit notes while source releases retain published documentation', () => {
  const db = new Database(':memory:')
  try {
    db.exec(loadMigrationSql(resolve(import.meta.dir, '../../migrations'), ['meta']))
    const columns = (table: string) =>
      db
        .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
        .all()
        .map(row => row.name)
    expect(columns('resourceReleases')).not.toContain('notes')
    expect(columns('sourceReleases')).toContain('notes')
    db.exec(`
      PRAGMA foreign_keys = ON;
      INSERT INTO publishers (id, code, versionHash) VALUES ('notes-publisher', 'notes-publisher', 'hash');
      INSERT INTO datasets (id, publisherId, code, regionCode, releaseType, releaseFrequency, theme, resourceTypes, versionHash)
      VALUES ('notes-dataset', 'notes-publisher', 'notes-dataset', 'hk', 'static', 'monthly', 'divisions', '["division"]', 'hash');
      INSERT INTO sourceReleases (id, datasetId, code, sourceVersion, status, notes)
      VALUES ('notes-source', 'notes-dataset', 'notes-source', '2026-10', 'staged', 'Published source documentation');
      INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status) VALUES ('notes-source', 'notes-dataset', 'source-' || 'notes-resource', '2026-10', 'staged');
UPDATE sourceReleases SET datasetId = 'notes-dataset', sourceVersion = '2026-10' WHERE id = 'notes-source';
INSERT INTO resourceReleases (id, sourceReleaseId, code, resourceType, status) VALUES ('notes-resource', 'notes-source', 'notes-resource', 'division', 'staged');
    `)
    expect(
      db
        .query(
          `SELECT s.notes FROM resourceReleases r JOIN sourceReleases s ON s.id = r.sourceReleaseId WHERE r.id = 'notes-resource'`,
        )
        .get(),
    ).toEqual({ notes: 'Published source documentation' })
    expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    db.close()
  }
})
