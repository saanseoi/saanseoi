import { describe, expect, test } from 'bun:test'

import { resolvePlandDivisionCode } from './processLocalHkgovPlandDivisionSqlUpload.ts'

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
