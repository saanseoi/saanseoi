import { describe, expect, test } from 'bun:test'

import {
  buildHkgovAlsProcessingActions,
  buildHkgovAlsDivisionQuality,
  consolidateEquivalentHkgovAlsPremises,
  dedupeHkgovAlsSourceFeatures,
  formatEnPremisesAddress,
  formatZhPremisesAddress,
  resolveDivisionLookupSource,
  resolveDivisionSnapshotSource,
} from './hkgovAls.ts'

describe('ALS premise address formatting', () => {
  test('retains village number, name, and location in both locales', () => {
    expect(
      formatEnPremisesAddress({
        EngDistrict: 'SHA TIN DISTRICT',
        EngVillage: {
          BuildingNoFrom: '9',
          LocationName: 'SHA TIN',
          VillageName: 'NORTH YEUK SIU LEK YUEN TSUEN',
        },
        Region: 'NT',
      }),
    ).toBe('9, NORTH YEUK SIU LEK YUEN TSUEN, SHA TIN, SHA TIN DISTRICT, NT')

    expect(
      formatZhPremisesAddress({
        ChiDistrict: '沙田區',
        ChiVillage: {
          BuildingNoFrom: '9',
          LocationName: '沙田',
          VillageName: '小瀝源村北約',
        },
        Region: '新界',
      }),
    ).toBe('9小瀝源村北約沙田沙田區新界')
  })

  test('continues to prefer a street over a village when both are supplied', () => {
    expect(
      formatEnPremisesAddress({
        EngStreet: { BuildingNoFrom: '1', StreetName: 'EXAMPLE STREET' },
        EngVillage: { BuildingNoFrom: '9', VillageName: 'EXAMPLE VILLAGE' },
      }),
    ).toBe('1 EXAMPLE STREET')
  })
})

describe('dedupeHkgovAlsSourceFeatures', () => {
  const feature = {
    geometry: { coordinates: [114.1, 22.3] as [number, number], type: 'Point' },
    properties: {
      Address: {
        PremisesAddress: {
          EngPremisesAddress: {
            BuildingName: 'EXAMPLE BUILDING',
            EngDistrict: 'EXAMPLE DISTRICT',
            EngStreet: { BuildingNoFrom: '1', StreetName: 'EXAMPLE STREET' },
            Region: 'HK',
          },
        },
      },
    },
  }

  test('removes only identical source features and records every occurrence', () => {
    const result = dedupeHkgovAlsSourceFeatures([
      {
        feature,
        featureIndexOneBased: 4,
        sourceFile: 'first.geojson',
      },
      {
        feature: structuredClone(feature),
        featureIndexOneBased: 9,
        sourceFile: 'second.geojson',
      },
      {
        feature: {
          ...feature,
          properties: {
            ...feature.properties,
            Address: {
              PremisesAddress: {
                EngPremisesAddress: {
                  ...feature.properties.Address.PremisesAddress.EngPremisesAddress,
                  BuildingName: 'DISTINCT BUILDING',
                },
              },
            },
          },
        },
        featureIndexOneBased: 12,
        sourceFile: 'second.geojson',
      },
    ])

    expect(result.features).toHaveLength(2)
    expect(result.duplicateGroups).toEqual([
      {
        address: 'EXAMPLE BUILDING, 1 EXAMPLE STREET, EXAMPLE DISTRICT, HK',
        occurrences: [
          { featureIndexOneBased: 4, sourceFile: 'first.geojson' },
          { featureIndexOneBased: 9, sourceFile: 'second.geojson' },
        ],
      },
    ])
  })
})

describe('buildHkgovAlsProcessingActions', () => {
  test('records each Roman-numeral building-name normalisation', () => {
    const row = {
      canonicalId: 'ss-example',
      chiPremisesAddressJson: null,
      enBlockDescriptor: 'TOWER',
      enBlockNumberRomanNumeralNormalisation: { from: '1', reference: 'II', to: 'I' },
      enBuildingNameRomanNumeralNormalisation: {
        from: 'INTERNATIONAL ENTERPRISE CENTRE 1',
        reference: 'II',
        to: 'INTERNATIONAL ENTERPRISE CENTRE I',
      },
      enFormattedAddress: 'INTERNATIONAL ENTERPRISE CENTRE I, 11 EXAMPLE STREET',
      engPremisesAddressJson: null,
      identityKey: 'example-identity',
      identityMatchMethod: 'als-premise',
      identitySummary: {},
      sourceFeatureIndexOneBased: 1,
      sourceFile: 'example.geojson',
      zhHantFormattedAddress: null,
    } as unknown as Parameters<
      typeof buildHkgovAlsProcessingActions
    >[0]['resolvedRows'][number]

    expect(
      buildHkgovAlsProcessingActions({
        decisions: { authority: 'hkgov-dpo', decisions: [], version: 1 },
        identityEquivalentFeatureGroups: [],
        resolvedRows: [row],
        sourceDuplicateFeatureGroups: [],
      }),
    ).toContainEqual({
      action: 'als_building_name_roman_numeral_normalised',
      affectedRecordCount: 1,
      evidence: {
        buildingName: {
          from: 'INTERNATIONAL ENTERPRISE CENTRE 1',
          reference: 'II',
          to: 'INTERNATIONAL ENTERPRISE CENTRE I',
        },
        canonicalRecord: expect.any(Object),
      },
      mode: 'automatic',
      summary:
        'Styled an ALS building-name number as Roman numerals used by its building-name family.',
    })
    expect(
      buildHkgovAlsProcessingActions({
        decisions: { authority: 'hkgov-dpo', decisions: [], version: 1 },
        identityEquivalentFeatureGroups: [],
        resolvedRows: [row],
        sourceDuplicateFeatureGroups: [],
      }),
    ).toContainEqual({
      action: 'als_premise_number_roman_numeral_normalised',
      affectedRecordCount: 1,
      evidence: {
        canonicalRecord: expect.any(Object),
        premiseNumber: { descriptor: 'TOWER', from: '1', reference: 'II', to: 'I' },
      },
      mode: 'automatic',
      summary:
        'Styled an ALS BLOCK, HOUSE or TOWER number as Roman numerals used by its premise family.',
    })
  })

  test('records the field and prior value when an address component is dropped', () => {
    const row = {
      canonicalId: 'ss-example',
      chiPremisesAddressJson: null,
      enFormattedAddress: '17 EXAMPLE ROAD',
      engPremisesAddressJson: null,
      identityKey: 'example-identity',
      identityMatchMethod: 'als-address-component-withdrawal',
      identityPreviousSummary: { estateName: 'EXAMPLE ESTATE' },
      identitySummary: { estateName: null },
      sourceFeatureIndexOneBased: 1,
      sourceFile: 'example.geojson',
      zhHantFormattedAddress: null,
    } as unknown as Parameters<
      typeof buildHkgovAlsProcessingActions
    >[0]['resolvedRows'][number]

    expect(
      buildHkgovAlsProcessingActions({
        decisions: { authority: 'hkgov-dpo', decisions: [], version: 1 },
        identityEquivalentFeatureGroups: [],
        resolvedRows: [row],
        sourceDuplicateFeatureGroups: [],
      }),
    ).toContainEqual({
      action: 'als_address_component_withdrawal_matched',
      affectedRecordCount: 1,
      evidence: {
        canonicalRecord: expect.any(Object),
        droppedComponent: { field: 'estateName', value: 'EXAMPLE ESTATE' },
      },
      mode: 'automatic',
      summary: 'Retained an ALS ID after an address component was dropped.',
    })
  })

  test('records when identity history supplies an existing canonical ID', () => {
    const row = {
      canonicalId: 'ss-example',
      chiPremisesAddressJson: null,
      enFormattedAddress: '17 EXAMPLE ROAD',
      engPremisesAddressJson: null,
      identityKey: 'example-identity',
      identityMatchMethod: 'als-identity-history',
      identityPreviousSummary: { buildingName: 'EXAMPLE BUILDING' },
      identitySummary: { buildingName: 'EXAMPLE BUILDING' },
      sourceFeatureIndexOneBased: 1,
      sourceFile: 'example.geojson',
      zhHantFormattedAddress: null,
    } as unknown as Parameters<
      typeof buildHkgovAlsProcessingActions
    >[0]['resolvedRows'][number]

    expect(
      buildHkgovAlsProcessingActions({
        decisions: { authority: 'hkgov-dpo', decisions: [], version: 1 },
        identityEquivalentFeatureGroups: [],
        resolvedRows: [row],
        sourceDuplicateFeatureGroups: [],
      }),
    ).toContainEqual({
      action: 'als_identity_history_matched',
      affectedRecordCount: 1,
      evidence: {
        canonicalRecord: expect.any(Object),
        previousIdentity: { buildingName: 'EXAMPLE BUILDING' },
      },
      mode: 'automatic',
      summary: 'Reused the canonical ALS ID for a previously seen identity.',
    })
  })

  test('records source-representation differences for equivalent premises', () => {
    const actions = buildHkgovAlsProcessingActions({
      decisions: { authority: 'hkgov-dpo', decisions: [], version: 1 },
      identityEquivalentFeatureGroups: [
        {
          address: 'EXAMPLE BUILDING, 1 EXAMPLE ROAD',
          canonicalRecord: {
            sourceRepresentation: {
              premises: { en: { BuildingName: 'EXAMPLE BUILDING' } },
            },
          },
          ignoredRecords: [
            {
              sourceRepresentation: {
                premises: { en: { BuildingName: 'EXAMPLE BLDG' } },
              },
            },
          ],
          occurrences: [
            { featureIndexOneBased: 1, sourceFile: 'example.geojson' },
            { featureIndexOneBased: 2, sourceFile: 'example.geojson' },
          ],
        },
      ],
      resolvedRows: [],
      sourceDuplicateFeatureGroups: [],
    })

    expect(actions).toContainEqual({
      action: 'als_equivalent_premise_variant_consolidated',
      affectedRecordCount: 1,
      evidence: expect.objectContaining({
        differences: [
          {
            field: 'premises.en.BuildingName',
            oldValue: 'EXAMPLE BLDG',
            newValue: 'EXAMPLE BUILDING',
          },
        ],
      }),
      mode: 'automatic',
      summary: 'Consolidated ALS variants with the same complete premise identity.',
    })
  })
})

describe('buildHkgovAlsDivisionQuality', () => {
  test('counts and retains detailed unmatched and ambiguous rows', () => {
    const result = buildHkgovAlsDivisionQuality([
      {
        areaMatchStatus: 'unmatched',
        areaNameEn: 'UNKNOWN AREA',
        areaNameZhHant: null,
        districtMatchStatus: 'matched',
        districtNameEn: 'CENTRAL AND WESTERN',
        districtNameZhHant: null,
        enFormattedAddress: '1 EXAMPLE STREET',
        sourceFeatureIndexOneBased: 4,
        sourceFile: 'central_district.geojson',
        zhHantFormattedAddress: null,
      },
      {
        areaMatchStatus: 'matched',
        areaNameEn: 'HONG KONG ISLAND',
        areaNameZhHant: null,
        districtMatchStatus: 'ambiguous',
        districtNameEn: 'DUPLICATE DISTRICT',
        districtNameZhHant: null,
        enFormattedAddress: '2 EXAMPLE STREET',
        sourceFeatureIndexOneBased: 9,
        sourceFile: 'central_district.geojson',
        zhHantFormattedAddress: null,
      },
    ])

    expect(result).toMatchObject({
      ambiguous_area_count: 0,
      ambiguous_district_count: 1,
      unmatched_area_count: 1,
      unmatched_district_count: 0,
    })
    expect(result.issues).toHaveLength(2)
    expect(result.issues[0]).toMatchObject({
      address: '1 EXAMPLE STREET',
      areaStatus: 'unmatched',
    })
  })
})

describe('consolidateEquivalentHkgovAlsPremises', () => {
  test('only consolidates rows with the same complete premise identity', () => {
    const first = {
      enFormattedAddress: 'BLOCK D, EXAMPLE BUILDING, 1 EXAMPLE STREET',
      identityKey: 'same-complete-premise',
      sourceFeatureIndexOneBased: 4,
      sourceFile: 'eastern.geojson',
      zhHantFormattedAddress: null,
    } as Parameters<typeof consolidateEquivalentHkgovAlsPremises>[0][number]
    const equivalent = {
      ...first,
      sourceFeatureIndexOneBased: 9,
    }
    const distinct = {
      ...first,
      identityKey: 'different-block',
      sourceFeatureIndexOneBased: 12,
    }

    const result = consolidateEquivalentHkgovAlsPremises([first, equivalent, distinct])

    expect(result.rows).toEqual([first, distinct])
    expect(result.duplicateGroups).toHaveLength(1)
    expect(result.duplicateGroups[0]?.occurrences).toEqual([
      { featureIndexOneBased: 4, sourceFile: 'eastern.geojson' },
      { featureIndexOneBased: 9, sourceFile: 'eastern.geojson' },
    ])
  })

  test('prefers a present precedence indicator over an absent one', () => {
    const missingIndicator = {
      blockDescriptorPrecedenceIndicator: null,
      enFormattedAddress: 'EXAMPLE BUILDING, 1 EXAMPLE STREET',
      identityKey: 'same-complete-premise',
      sourceFeatureIndexOneBased: 4,
      sourceFile: 'eastern.geojson',
      zhHantFormattedAddress: null,
    } as Parameters<typeof consolidateEquivalentHkgovAlsPremises>[0][number]
    const presentIndicator = {
      ...missingIndicator,
      blockDescriptorPrecedenceIndicator: 'Y',
      sourceFeatureIndexOneBased: 9,
    }

    const result = consolidateEquivalentHkgovAlsPremises([
      missingIndicator,
      presentIndicator,
    ])
    expect(result.rows).toEqual([presentIndicator])
  })

  test('prefers the affirmative precedence indicator when variants disagree', () => {
    const no = {
      blockDescriptorPrecedenceIndicator: 'N',
      enFormattedAddress: 'EXAMPLE BUILDING, 1 EXAMPLE STREET',
      identityKey: 'same-complete-premise',
      sourceFeatureIndexOneBased: 4,
      sourceFile: 'eastern.geojson',
      zhHantFormattedAddress: null,
    } as Parameters<typeof consolidateEquivalentHkgovAlsPremises>[0][number]
    const yes = {
      ...no,
      blockDescriptorPrecedenceIndicator: 'Y',
      sourceFeatureIndexOneBased: 9,
    }

    expect(consolidateEquivalentHkgovAlsPremises([no, yes]).rows).toEqual([yes])
  })
})

describe('resolveDivisionLookupSource', () => {
  test('uses the shared local D1 sqlite path for dev by default', () => {
    const source = resolveDivisionLookupSource(
      { environment: 'dev' },
      () => '/tmp/.local/d1/dev/mock.sqlite',
    )

    expect(source.kind).toBe('sqlite')

    if (source.kind !== 'sqlite') {
      throw new Error('Expected sqlite division lookup source.')
    }

    expect(source.dbPath).toBe('/tmp/.local/d1/dev/mock.sqlite')
  })

  test('keeps explicit local sqlite paths authoritative', () => {
    const source = resolveDivisionLookupSource(
      {
        dbPath: './tmp/custom.sqlite',
        environment: 'dev',
      },
      explicitPath => explicitPath ?? '/tmp/fallback.sqlite',
    )

    expect(source).toEqual({
      dbPath: './tmp/custom.sqlite',
      kind: 'sqlite',
    })
  })

  test('uses remote Wrangler D1 for preview and production', () => {
    expect(resolveDivisionLookupSource({ environment: 'preview' })).toEqual({
      databaseName: 'ss-current-db-preview',
      kind: 'wrangler',
      mode: 'remote',
      wranglerEnv: 'preview',
    })

    expect(resolveDivisionLookupSource({ environment: 'production' })).toEqual({
      databaseName: 'ss-current-db-prod',
      kind: 'wrangler',
      mode: 'remote',
      wranglerEnv: 'production',
    })
  })
})

describe('resolveDivisionSnapshotSource', () => {
  test('uses the local meta sqlite path for dev by default', () => {
    const source = resolveDivisionSnapshotSource(
      { environment: 'dev' },
      () => '/tmp/.local/d1/dev/metadata.sqlite',
    )

    expect(source).toEqual({
      dbPath: '/tmp/.local/d1/dev/metadata.sqlite',
      kind: 'sqlite',
    })
  })

  test('maps explicit local sqlite paths to the colocated meta database', () => {
    const source = resolveDivisionSnapshotSource(
      {
        dbPath: '/tmp/.local/d1/dev/current.sqlite',
        environment: 'dev',
      },
      () => '/tmp/.local/d1/dev/metadata.sqlite',
    )

    expect(source).toEqual({
      dbPath: '/tmp/.local/d1/dev/metadata.sqlite',
      kind: 'sqlite',
    })
  })
})
