import florists from '../../../../scripts/geocoding/fixtures/florists-2026-10-18.json'
import { expect, test } from 'bun:test'
import { parseAddress, numberStems } from './addressParsing'
import { scoreAddress } from './addressGeocoding'
import type { AddressRecord } from '../db/addresses'

const record = (number: string, street: string, building = '') =>
  ({
    i18n: {
      en: {
        meta: null,
        formattedAddress: `${building}, ${number} ${street}`,
        buildingNumberFrom: number,
        streetName: street,
        buildingName: building,
      },
    },
  }) as Pick<AddressRecord, 'i18n'>

test.each([
  [
    "Room 1104, 11/F, 70 Queen's Road Central, Central, Hong Kong Island, Hong Kong",
    'queens road central',
    [70, 70],
  ],
  [
    '2F, Hollywood House, 29 Hollywood Rd, Central, Hong Kong',
    'hollywood road',
    [29, 29],
  ],
  ['139A Sai Yee Street', 'sai yee street', [139, 139]],
  ['164 Prince Edward Rd W', 'prince edward road west', [164, 164]],
  ['32–36 Hau Tei Square', 'hau tei square', [32, 36]],
  ['Hong Kong, Mong Kok, Sai Yee St, 139A地下', 'sai yee street', [139, 139]],
  ['皇后大道中70號', '皇后大道中', [70, 70]],
])('parse %s', (input, street, numbers) => {
  expect(parseAddress(input as string)).toMatchObject({ street, numbers })
})

test('street numbers use numeric boundaries and ignore unsupported suffixes', () => {
  expect(
    scoreAddress(record('370', "Queen's Road Central"), '70 Queen’s Road Central'),
  ).toBe(0)
  expect(
    scoreAddress(record('70', "Queen's Road Central"), '70 Queen’s Road Central'),
  ).toBeGreaterThan(0)
  expect(scoreAddress(record('229', 'Hollywood Road'), '29 Hollywood Road')).toBe(0)
  expect(
    scoreAddress(
      record('164A', 'Prince Edward Road West'),
      '164 Prince Edward Road West',
    ),
  ).toBeGreaterThan(0)
})

test('ranges and locality qualifiers retain weaker candidates', () => {
  expect(
    scoreAddress(
      record('34', 'Hau Tei Square', 'Fu Wah House'),
      '32-36 Hau Tei Square',
    ),
  ).toBeGreaterThan(0)
  expect(
    scoreAddress(record('63', 'Yuen Long On Ning Road'), '63 On Ning Road'),
  ).toBeGreaterThan(0)
  expect(
    scoreAddress(
      record('1', 'Castle Peak Road - Castle Peak Bay'),
      '1 Castle Peak Road Castle Peak Bay',
    ),
  ).toBeGreaterThan(0)
  expect(numberStems(parseAddress('1-999999 Queen Street'))).toEqual([])
})

test('building qualifiers improve rank without inventing a building for bare streets', () => {
  const one = record('1', 'Harbour View Street', 'One International Finance Centre')
  const another = record('1', 'Harbour View Street', 'Another Facility')
  expect(scoreAddress(one, '1 Harbour View Street')).toBe(
    scoreAddress(another, '1 Harbour View Street'),
  )
  expect(scoreAddress(one, 'One IFC, 1 Harbour View Street')).toBeGreaterThan(
    scoreAddress(another, 'One IFC, 1 Harbour View Street'),
  )
  expect(
    scoreAddress(
      record('200', "Queen's Road East", 'Lee Tung Avenue'),
      "Lee Tung Avenue, 200 Queen's Rd E",
    ),
  ).toBeGreaterThan(
    scoreAddress(
      record('200', "Queen's Road East", 'Other'),
      "Lee Tung Avenue, 200 Queen's Rd E",
    ),
  )
})

test('Chinese locality prefix is weaker than an exact street match', () => {
  expect(
    scoreAddress(
      record('3', '安群街', '京瑞廣場一期'),
      'Hong Kong, New Territories, Sha Tin, 石門安群街3號京瑞廣場一期2樓219號',
    ),
  ).toBeGreaterThan(0)
})
test('an estate name alone cannot satisfy a requested market', () => {
  const estate = {
    i18n: {
      en: {
        meta: null,
        formattedAddress: 'TAI WAI, 12H FOURTH STREET',
        premisesName: 'TAI WAI',
      },
    },
  } as Pick<AddressRecord, 'i18n'>
  expect(scoreAddress(estate, 'Tai Wai Market')).toBe(0)
})

test('Chinese phase numerals qualify the matching building', () => {
  const input = '石門安群街3號京瑞廣場一期2樓219號'
  expect(scoreAddress(record('3', '安群街', '京瑞廣場1期'), input)).toBeGreaterThan(
    scoreAddress(record('3', '安群街', '京瑞廣場2期'), input),
  )
  expect(scoreAddress(record('35', 'Hau Tei Square'), '32-36 Hau Tei Square')).toBe(0)
})

test('explicit endpoint pairs do not become continuous historical ranges', () => {
  const pair = record('32', 'Hau Tei Square')
  pair.i18n.en!.buildingNumberTo = '36'
  pair.i18n.en!.buildingNumberConnector = '&'
  expect(scoreAddress(pair, '34 Hau Tei Square')).toBe(0)
  pair.i18n.en!.buildingNumberConnector = '-'
  expect(scoreAddress(pair, '34 Hau Tei Square')).toBeGreaterThan(0)
})

test.each(florists.places.filter(place => /^\d/.test(place.addressCore)))(
  'fixed sample preserves the street number through full listing parsing: $id',
  place => {
    const expected = place.addressCore.match(/^(\d+)[A-Z]?(?:-(\d+))?/)!
    const numbers: [number, number] = [
      Number(expected[1]),
      Number(expected[2] ?? expected[1]),
    ]
    expect(parseAddress(place.addressCore).numbers).toEqual(numbers)
    expect(parseAddress(place.googleAddress).numbers).toEqual(numbers)
  },
)
