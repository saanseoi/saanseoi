import { describe, expect, test } from 'bun:test'

import {
  resolvePlandDivisionCode,
  splitPlandSqlText,
} from './processLocalHkgovPlandDivisionSqlUpload.ts'
import { isCompleteCompressedPlanningDivisionGeometry } from './processLocalHkgovPlandDivisionSqlUploadRows.ts'

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

describe('Planning geometry artefact cache', () => {
  const records = [{ base: { id: 'one' } }, { base: { id: 'two' } }] as never

  test('requires an entry for every prepared division', () => {
    expect(
      isCompleteCompressedPlanningDivisionGeometry(
        new Map([['one', new Uint8Array([1])]]),
        records,
      ),
    ).toBeFalse()
    expect(
      isCompleteCompressedPlanningDivisionGeometry(
        new Map([
          ['one', new Uint8Array([1])],
          ['two', new Uint8Array([2])],
        ]),
        records,
      ),
    ).toBeTrue()
  })
})
