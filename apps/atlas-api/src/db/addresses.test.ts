import { describe, expect, test } from 'bun:test'

import { buildAddressFtsQuery, normaliseAddressSearchNumber } from './addresses'

describe('address search query preparation', () => {
  test('keeps a bare stem distinct from a suffixed building number', () => {
    expect(normaliseAddressSearchNumber('5')).toBe('5')
    expect(normaliseAddressSearchNumber('5a')).toBe('5A')
    expect(normaliseAddressSearchNumber('5A-5C')).toBeNull()
  })

  test('uses the requested component and never exposes FTS syntax from input', () => {
    expect(
      buildAddressFtsQuery({
        mode: 'component',
        component: 'street',
        query: "King's Road OR *",
      }),
    ).toBe('streetName : (kings AND road AND or)')
  })

  test('makes prefix matching explicit', () => {
    expect(buildAddressFtsQuery({ mode: 'full-text', query: 'Harbour View' })).toBe(
      'harbour AND view',
    )
    expect(buildAddressFtsQuery({ mode: 'prefix', query: 'Harbour View' })).toBe(
      'harbour* AND view*',
    )
  })

  test('expands canonical block abbreviations and their long forms symmetrically', () => {
    expect(buildAddressFtsQuery({ mode: 'full-text', query: 'Tower 1' })).toBe(
      '(twr OR tower OR towers) AND 1',
    )
    expect(buildAddressFtsQuery({ mode: 'prefix', query: 'apt' })).toBe(
      '(apt* OR apts* OR apartment* OR apartments*)',
    )
    expect(
      buildAddressFtsQuery({
        mode: 'component',
        component: 'block',
        query: 'Houses A',
      }),
    ).toBe('blockExpression : ((hse OR hses OR house OR houses) AND a)')
  })
})
