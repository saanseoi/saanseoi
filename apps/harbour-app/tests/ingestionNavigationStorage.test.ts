import { afterEach, expect, it, vi } from 'vitest'
import {
  navigationStorageKey,
  readNavigation,
  readPreference,
  savePreference,
} from '../ingestion/src/navigationStorage'
afterEach(() => vi.unstubAllGlobals())
it('restores all dropdown values, including an explicitly empty subset', () => {
  const saved = {
    kind: 'SOURCE',
    group: 'dataset',
    table: 'records',
    subset: '',
    limit: 20,
  }
  expect(readNavigation(JSON.stringify(saved))).toEqual(saved)
  expect(
    readNavigation(JSON.stringify({ ...saved, subset: 'subset-id' }))?.subset,
  ).toBe('subset-id')
})
it('rejects malformed or unsupported saved settings', () => {
  for (const value of [
    null,
    '{',
    'null',
    '[]',
    JSON.stringify({ kind: 'META', group: 'a', table: 'b', subset: '', limit: 100 }),
  ])
    expect(readNavigation(value)).toBeNull()
})
it('saves preferences across reads and tolerates unavailable storage', () => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
  savePreference(navigationStorageKey, 'saved')
  expect(readPreference(navigationStorageKey)).toBe('saved')
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw Error('blocked')
    },
    setItem: () => {
      throw Error('full')
    },
  })
  expect(readPreference(navigationStorageKey)).toBeNull()
  expect(() => savePreference(navigationStorageKey, 'saved')).not.toThrow()
})
