import { describe, expect, test } from 'bun:test'
import { requireDefined } from './requireDefined'

describe('requireDefined', () => {
  test('preserves defined values, including falsy values', () => {
    for (const value of [0, false, '', Number.NaN, { id: 'record' }]) {
      expect(requireDefined(value)).toBe(value)
    }
  })

  test('rejects missing values', () => {
    for (const value of [null, undefined]) {
      expect(() => requireDefined(value)).toThrow('Expected a defined value.')
    }
  })
})
