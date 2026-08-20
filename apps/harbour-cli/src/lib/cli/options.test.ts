import { describe, expect, test } from 'bun:test'

import { resolvePipelineEnvironment } from './options.ts'

describe('resolvePipelineEnvironment', () => {
  test('keeps preview uploads on preview shard metadata', () => {
    expect(resolvePipelineEnvironment({ environment: 'preview', remote: true })).toBe(
      'preview',
    )
  })

  test('uses production shard metadata only for production', () => {
    expect(
      resolvePipelineEnvironment({ environment: 'production', remote: true }),
    ).toBe('production')
    expect(resolvePipelineEnvironment({ environment: 'dev', remote: false })).toBe(
      'preview',
    )
  })

  test('uses preview shard metadata for local production-shaped targets', () => {
    expect(
      resolvePipelineEnvironment({ environment: 'production', remote: false }),
    ).toBe('preview')
  })
})
