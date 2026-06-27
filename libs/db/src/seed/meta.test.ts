import { describe, expect, test } from 'bun:test'

import { initialDataShards, resolveInitialDataShardsForEnvironment } from './meta'

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
