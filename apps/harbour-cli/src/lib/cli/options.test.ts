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

import { parseArgs, resolveR2Target, resolveUploadTarget } from './options'

test('local D1 with production R2 preserves the database environment', () => {
  const target = resolveUploadTarget(
    parseArgs(['bun', 'cli', 'init', '--target', 'local', '--r2', 'production']),
  )
  expect(target).toEqual({ remote: false, environment: 'dev', r2: 'production' })
  expect(resolvePipelineEnvironment(target)).toBe('preview')
  expect(resolveR2Target(target)).toBe('production')
})

test('rejects missing and incompatible R2 targets', () => {
  for (const args of [
    ['--r2'],
    ['--r2', 'bogus'],
    ['--target', 'production', '--r2', 'local'],
  ])
    expect(() =>
      resolveUploadTarget(parseArgs(['bun', 'cli', 'init', ...args])),
    ).toThrow()
})
