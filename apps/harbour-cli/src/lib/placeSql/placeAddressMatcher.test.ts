import { describe, expect, test } from 'bun:test'

import {
  createPlaceAddressMatcher,
  matchPlaceAddressTexts,
  parsePlaceAddress,
  type PlaceAddressDefinition,
} from './placeAddressMatcher.ts'

function definition(
  addressId: string,
  overrides: Partial<PlaceAddressDefinition> = {},
): PlaceAddressDefinition {
  return {
    addressId,
    locale: 'en',
    formattedAddress: null,
    buildingName: null,
    buildingNumberExpression: '3',
    buildingNumberFrom: '3',
    buildingNumberTo: null,
    blockExpression: null,
    phaseExpression: null,
    estateName: null,
    streetName: 'ON KWAN STREET',
    ...overrides,
  }
}

describe('Overture Place address parsing', () => {
  test('parses an abbreviated English street address from the source data', () => {
    expect(parsePlaceAddress('19b Ap Lei Chau Praya Rd')).toMatchObject({
      address2dText: '19b Ap Lei Chau Praya Rd',
      address3dParts: [],
      buildingNumbers: ['19B'],
      normalisedAddress2dText: '19B AP LEI CHAU PRAYA ROAD',
    })
  })

  test('strips English address3d parts and matches the remaining ALS premise', () => {
    const matcher = createPlaceAddressMatcher([
      definition('kings-wing-plaza-1', {
        buildingName: 'KINGS WING PLAZA 1',
        formattedAddress: 'KINGS WING PLAZA 1, 3 ON KWAN STREET, SHA TIN DISTRICT, NT',
      }),
    ])
    const source = 'Shop 207, 2/F, Kings Wing Plaza 1, 3 On Kwan St'

    expect(parsePlaceAddress(source)).toMatchObject({
      address2dText: 'Kings Wing Plaza 1, 3 On Kwan St',
      address3dParts: ['Shop 207', '2/F'],
    })
    expect(matchPlaceAddressTexts([source], matcher)).toBe('kings-wing-plaza-1')
  })

  test('uses Traditional Chinese definitions and strips floor and room details', () => {
    const matcher = createPlaceAddressMatcher([
      definition('w-luxe', {
        locale: 'zh-hant',
        buildingName: 'W LUXE',
        buildingNumberExpression: '5',
        buildingNumberFrom: '5',
        formattedAddress: 'W LUXE5安耀街沙田區新界',
        streetName: '安耀街',
      }),
      definition('generic-on-yiu-5', {
        locale: 'zh-hant',
        buildingNumberExpression: '5',
        buildingNumberFrom: '5',
        formattedAddress: '5安耀街沙田區新界',
        streetName: '安耀街',
      }),
    ])
    const source = '石門安耀街5號W LUXE 16樓S10'

    expect(parsePlaceAddress(source)).toMatchObject({
      address2dText: '石門安耀街5號W LUXE',
      address3dParts: ['16樓S10'],
      buildingNumbers: ['5'],
    })
    expect(matchPlaceAddressTexts([source], matcher)).toBe('w-luxe')
  })

  test('normalises Chinese building and phase numbers from the source data', () => {
    const matcher = createPlaceAddressMatcher([
      definition('kings-wing-plaza-2', {
        locale: 'zh-hant',
        buildingName: '京瑞廣場2期',
        buildingNumberExpression: '1',
        buildingNumberFrom: '1',
        formattedAddress: '京瑞廣場2期1安群街沙田區新界',
        streetName: '安群街',
      }),
    ])

    expect(
      matchPlaceAddressTexts(['沙田石門安群街一號京瑞廣場二期一樓101A12鋪'], matcher),
    ).toBe('kings-wing-plaza-2')
  })

  test('matches a member of an ALS building-number range', () => {
    const matcher = createPlaceAddressMatcher([
      definition('odd-range', {
        buildingNumberExpression: null,
        buildingNumberFrom: '15',
        buildingNumberTo: '21',
        streetName: 'WONG CHUK YEUNG STREET',
      }),
    ])

    expect(matchPlaceAddressTexts(['17 Wong Chuk Yeung St'], matcher)).toBe('odd-range')
    expect(matchPlaceAddressTexts(['18 Wong Chuk Yeung St'], matcher)).toBeNull()
  })

  test('does not turn a locality, estate, or street-only label into a premise', () => {
    const matcher = createPlaceAddressMatcher([
      definition('street-address', {
        buildingNumberExpression: '9',
        buildingNumberFrom: '9',
        streetName: 'SHEK MUN KAP ROAD',
      }),
    ])

    for (const source of [
      'Shek Mun Kap Rd',
      'Cheung Chau',
      'Palm Beach',
      'Lantau',
      'Sun Hing Back St',
    ]) {
      expect(matchPlaceAddressTexts([source], matcher)).toBeNull()
    }
  })

  test('refuses equally strong canonical matches', () => {
    const matcher = createPlaceAddressMatcher([
      definition('first'),
      definition('second'),
    ])

    expect(matchPlaceAddressTexts(['3 On Kwan St'], matcher)).toBeNull()
  })
})
