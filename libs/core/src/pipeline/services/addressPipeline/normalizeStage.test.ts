import { describe, expect, test } from 'bun:test'

import { collectOvertureHongKongAddressSourceAssumptionViolations } from './normalizeStage'

describe('collectOvertureHongKongAddressSourceAssumptionViolations', () => {
  test('accepts current dropped-field assumptions', () => {
    expect(
      collectOvertureHongKongAddressSourceAssumptionViolations([
        {
          id: 'address-1',
          theme: 'addresses',
          type: 'address',
          country: 'HK',
          postcode: null,
          postal_city: '',
          unit: undefined,
        },
        {
          id: 'address-2',
          theme: 'addresses',
          type: 'address',
          country: 'HK',
          postcode: ' ',
          postal_city: null,
          unit: null,
        },
      ]),
    ).toEqual([])
  })

  test('reports changed dropped fields', () => {
    expect(
      collectOvertureHongKongAddressSourceAssumptionViolations([
        {
          id: 'unexpected',
          theme: 'places',
          type: 'place',
          country: 'CN',
          postcode: '999077',
          postal_city: 'Hong Kong',
          unit: '1A',
        },
      ]),
    ).toEqual([
      'row 1 (unexpected): expected theme=addresses, got "places"',
      'row 1 (unexpected): expected type=address, got "place"',
      'row 1 (unexpected): expected country=HK, got "CN"',
      'row 1 (unexpected): expected empty postcode, got "999077"',
      'row 1 (unexpected): expected empty postal_city, got "Hong Kong"',
      'row 1 (unexpected): expected empty unit, got "1A"',
    ])
  })
})
