import { describe, expect, test } from 'bun:test'

import { resolveApiFamilyCacheProfile } from './apiFamilyLifecycle.ts'

describe('API-family lifecycle cache profiles', () => {
  test('selects the Places profile for remote reconciliation and cache rebuilds', () => {
    expect(resolveApiFamilyCacheProfile('places')).toBe('places')
  })

  test('leaves an unfiltered reconciliation unprofiled', () => {
    expect(resolveApiFamilyCacheProfile(undefined)).toBeUndefined()
  })
})
