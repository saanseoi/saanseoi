import { describe, expect, test } from 'bun:test'

import {
  resolvePlandDivisionCode,
  splitPlandSqlText,
} from './processLocalHkgovPlandDivisionSqlUpload.ts'

describe('Planning Division code assignment', () => {
  test('attaches the curated code to a mapped New Town and leaves an unmapped Division blank', () => {
    const assignments = new Map([
      ['9e97c5d6-a99e-53ea-9e4f-61af2299ff50', 'tung-chung'],
    ])

    expect(
      resolvePlandDivisionCode(
        'newtown',
        '9e97c5d6-a99e-53ea-9e4f-61af2299ff50',
        assignments,
      ),
    ).toBe('tung-chung')
    expect(
      resolvePlandDivisionCode('newtown', 'unmapped-new-town', assignments),
    ).toBeNull()
    expect(
      resolvePlandDivisionCode(
        'subunit',
        '9e97c5d6-a99e-53ea-9e4f-61af2299ff50',
        assignments,
      ),
    ).toBeNull()
  })
})

describe('Planning SQL text serialisation', () => {
  test('splits large source geometry text linearly without breaking a surrogate pair', () => {
    const value = `${'a'.repeat(8191)}😀${'文'.repeat(8192)}`
    const chunks = splitPlandSqlText(value)

    expect(chunks.join('')).toBe(value)
    expect(chunks[0]).toBe('a'.repeat(8191))
    expect(chunks[1]?.startsWith('😀')).toBeTrue()
    expect(
      Math.max(...chunks.map(chunk => Buffer.byteLength(chunk))),
    ).toBeLessThanOrEqual(8 * 1024 * 3)
  })
})
