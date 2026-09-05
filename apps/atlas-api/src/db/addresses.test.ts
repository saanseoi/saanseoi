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
    ).toBe('streetName : (Kings AND Road AND OR)')
  })

  test('makes prefix matching explicit', () => {
    expect(buildAddressFtsQuery({ mode: 'full-text', query: 'Harbour View' })).toBe(
      'Harbour AND View',
    )
    expect(buildAddressFtsQuery({ mode: 'prefix', query: 'Harbour View' })).toBe(
      'Harbour* AND View*',
    )
  })
})
