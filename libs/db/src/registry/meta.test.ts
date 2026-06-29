import { describe, expect, test } from 'bun:test'

import {
  buildMetaRegistrySyncStatements,
  initialApiEndpoints,
  initialApiVersions,
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

    expect(addressPaths).toEqual([
      '/v0.1/addresses',
      '/v0.1/addresses/{id}',
      '/v0/addresses',
      '/v0/addresses/{id}',
    ])
    expect(divisionPaths).toEqual(['/v0.1/divisions', '/v0/divisions'])
    expect(placePaths).toEqual(['/v0.1/places', '/v0/places'])
  })
})

describe('resolveInitialDataShardsForEnvironment', () => {
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
})
