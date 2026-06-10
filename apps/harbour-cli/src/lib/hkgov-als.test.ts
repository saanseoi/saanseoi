import { describe, expect, test } from 'bun:test'

import { resolveDivisionLookupSource } from './hkgov-als.ts'

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
      databaseName: 'ss-db-preview',
      kind: 'wrangler',
      mode: 'remote',
      wranglerEnv: 'preview',
    })

    expect(resolveDivisionLookupSource({ environment: 'production' })).toEqual({
      databaseName: 'ss-db-prod',
      kind: 'wrangler',
      mode: 'remote',
      wranglerEnv: 'production',
    })
  })
})
