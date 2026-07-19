import { describe, expect, test } from 'bun:test'

import {
  consolidateHkgovAlsSingletonNumberRangeVariants,
  consolidateEquivalentHkgovAlsPremises,
  dedupeHkgovAlsSourceFeatures,
  resolveDivisionLookupSource,
  resolveDivisionSnapshotSource,
} from './hkgovAls.ts'

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
    expect(result.duplicateGroups).toEqual([
      {
        address: 'BLOCK D, EXAMPLE BUILDING, 1 EXAMPLE STREET',
        occurrences: [
          { featureIndexOneBased: 4, sourceFile: 'eastern.geojson' },
          { featureIndexOneBased: 9, sourceFile: 'eastern.geojson' },
        ],
      },
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

describe('consolidateHkgovAlsSingletonNumberRangeVariants', () => {
  const range = {
    enFormattedAddress: 'TOI SHAN ASSOCIATION PRIMARY SCHOOL, 14-16 SHEK PAI TAU ROAD',
    geoAddress: '1521029168T20050430',
    geometry: '{"type":"Point","coordinates":[113.97237,22.40161]}',
    identityNumberFrom: '14',
    identityNumberTo: '16',
    numberlessIdentityKey: 'same-premise-without-number',
    sourceFeatureIndexOneBased: 2,
    sourceFile: 'tuen-mun.geojson',
    zhHantFormattedAddress: null,
  } as Parameters<typeof consolidateHkgovAlsSingletonNumberRangeVariants>[0][number]

  test('keeps a range and removes an identical-premise singleton at its endpoint', () => {
    const singleton = {
      ...range,
      enFormattedAddress: 'TOI SHAN ASSOCIATION PRIMARY SCHOOL, 16 SHEK PAI TAU ROAD',
      identityNumberFrom: '16',
      identityNumberTo: null,
      sourceFeatureIndexOneBased: 1,
    }

    const result = consolidateHkgovAlsSingletonNumberRangeVariants([singleton, range])

    expect(result.rows).toEqual([range])
    expect(result.duplicateGroups).toEqual([
      {
        address: 'TOI SHAN ASSOCIATION PRIMARY SCHOOL, 14-16 SHEK PAI TAU ROAD',
        occurrences: [
          { featureIndexOneBased: 2, sourceFile: 'tuen-mun.geojson' },
          { featureIndexOneBased: 1, sourceFile: 'tuen-mun.geojson' },
        ],
      },
    ])
  })

  test('does not infer that an intervening number belongs to a range', () => {
    const singleton = {
      ...range,
      identityNumberFrom: '15',
      identityNumberTo: null,
      sourceFeatureIndexOneBased: 3,
    }

    expect(
      consolidateHkgovAlsSingletonNumberRangeVariants([range, singleton]).rows,
    ).toEqual([range, singleton])
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
