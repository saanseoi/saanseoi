import { describe, expect, test } from 'bun:test'

import {
  createPlaceAddressMatcher,
  matchPlaceAddressTexts,
  parsePlaceAddress,
  type ParsedAddress3dPart,
  type PlaceAddressDefinition,
  type PlaceStreetDefinition,
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

function unit(
  sourceText: string,
  unitRef: string,
  unitType: Extract<ParsedAddress3dPart, { kind: 'unit' }>['unitType'],
): ParsedAddress3dPart {
  return {
    kind: 'unit',
    sourceText,
    unitExpression: sourceText,
    unitRef,
    unitType,
  }
}

function floor(
  sourceText: string,
  floorRef: string | null,
  floorType: Extract<ParsedAddress3dPart, { kind: 'floor' }>['floorType'] = 'floor',
): ParsedAddress3dPart {
  return {
    floorExpression: sourceText,
    floorRef,
    floorType,
    kind: 'floor',
    sourceText,
  }
}

const landsdStreetNames = [
  ['en', 'AP LEI CHAU PRAYA ROAD'],
  ['en', 'CHEUNG CHAU BEACH ROAD'],
  ['en', 'CHEUNG CHAU PEAK ROAD'],
  ['en', "KING'S ROAD"],
  ['en', 'NING FOO STREET'],
  ['en', 'ON KWAN STREET'],
  ['en', 'ON LAI STREET'],
  ['en', 'SHEK MUN KAP ROAD'],
  ['en', 'CHEUNG YEE STREET'],
  ['en', 'WING HONG STREET'],
  ['en', 'YAT TUNG STREET'],
  ['en', 'TAT TUNG ROAD'],
  ['en', 'SMITHFIELD'],
  ['en', 'TUNG CHUNG WATERFRONT ROAD'],
  ['en', 'CHUNG YAT STREET'],
  ['en', 'PRAYA STREET'],
  ['en', 'PO NGONG DRIVE'],
  ['en', 'SCHOOL ROAD'],
  ['en', 'WONG CHUK YEUNG STREET'],
  ['zh-hant', '安耀街'],
  ['zh-hant', '安群街'],
  ['zh-hant', '安麗街'],
  ['zh-hant', '安心街'],
  ['zh-hant', '翔天路'],
  ['zh-hant', '順東路'],
  ['zh-hant', '東涌道'],
  ['zh-hant', '黃竹洋街'],
] as const

const landsdStreets: PlaceStreetDefinition[] = landsdStreetNames.map(
  ([locale, name], index) => ({
    locale,
    name,
    streetId: `landsd-street-${index + 1}`,
  }),
)

const sourceMatcher = createPlaceAddressMatcher([], landsdStreets)

type ParseCase = {
  address2dText: string
  address3dParts?: ParsedAddress3dPart[]
  buildingNumberExpression: string | null
  buildingNumbers: string[]
  definitions?: PlaceAddressDefinition[]
  disposition: 'premise-candidate' | 'street-only' | 'unrecognised'
  matchedAddressId?: string | null
  name: string
  recognised2dComponents?: Array<{
    kind: 'buildingName' | 'estateName' | 'blockExpression' | 'phaseExpression'
    name: string
    normalisedName: string
  }>
  source: string
  streetName: string | null
  unclassified2dText: string | null
}

const sourceParseCases: ParseCase[] = [
  {
    name: 'stall-only shopping centre address has no 2D premise',
    source:
      'Stall No. 89 & 91, G/F., Yat Tung Market, Yat Tung Estate, Tung Chung , Hong Kong',
    address2dText: 'Yat Tung Market, Yat Tung Estate, Tung Chung , Hong Kong',
    address3dParts: [
      unit('Stall No. 89 & 91', '89 & 91', 'stall'),
      floor('G/F.', 'G', 'ground_floor'),
    ],
    buildingNumberExpression: null,
    buildingNumbers: [],
    disposition: 'unrecognised',
    streetName: null,
    unclassified2dText: 'YAT TUNG MARKET YAT TUNG ESTATE TUNG CHUNG HONG KONG',
  },
  {
    name: 'building name without a street remains unmatched when ambiguous',
    source: '46 Ming Fai Building',
    address2dText: '46 Ming Fai Building',
    buildingNumberExpression: null,
    buildingNumbers: [],
    disposition: 'unrecognised',
    streetName: null,
    unclassified2dText: '46 MING FAI BUILDING',
  },
  {
    name: 'short street abbreviation absent from canonical Streets',
    source: '8 Kin Sang Ln',
    address2dText: '8 Kin Sang Ln',
    buildingNumberExpression: null,
    buildingNumbers: [],
    disposition: 'unrecognised',
    streetName: null,
    unclassified2dText: '8 KIN SANG LANE',
  },
  {
    name: 'English suffix abbreviation and alphanumeric premise number',
    source: '19b Ap Lei Chau Praya Rd',
    address2dText: '19b Ap Lei Chau Praya Rd',
    buildingNumberExpression: '19B',
    buildingNumbers: ['19B'],
    disposition: 'premise-candidate',
    streetName: 'AP LEI CHAU PRAYA ROAD',
    unclassified2dText: null,
  },
  {
    name: 'floor-only detail is not mistaken for a premise number',
    source: "2/f King's Rd",
    address2dText: "King's Rd",
    address3dParts: [floor('2/f', '2')],
    buildingNumberExpression: null,
    buildingNumbers: [],
    disposition: 'street-only',
    streetName: "KING'S ROAD",
    unclassified2dText: null,
  },
  {
    name: 'shop and floor before a named building and street premise',
    source: 'Shop 207, 2/F, Kings Wing Plaza 1, 3 On Kwan St',
    address2dText: 'Kings Wing Plaza 1, 3 On Kwan St',
    address3dParts: [unit('Shop 207', '207', 'shop'), floor('2/F', '2')],
    buildingNumberExpression: '3',
    buildingNumbers: ['3'],
    disposition: 'premise-candidate',
    streetName: 'ON KWAN STREET',
    unclassified2dText: 'KINGS WING PLAZA 1',
  },
  {
    name: 'unit and floor before the long-form street suffix',
    source: 'Unit H, 10/f Kings Wing Plaza 1, 3 On Kwan Street',
    address2dText: 'Kings Wing Plaza 1, 3 On Kwan Street',
    address3dParts: [unit('Unit H', 'H', 'unit'), floor('10/f', '10')],
    buildingNumberExpression: '3',
    buildingNumbers: ['3'],
    disposition: 'premise-candidate',
    streetName: 'ON KWAN STREET',
    unclassified2dText: 'KINGS WING PLAZA 1',
  },
  {
    name: 'room number plus a venue description and street without a number',
    source: 'Room 1107, Technology Park, On Lai St',
    address2dText: 'Technology Park, On Lai St',
    address3dParts: [unit('Room 1107', '1107', 'room')],
    buildingNumberExpression: null,
    buildingNumbers: [],
    disposition: 'street-only',
    streetName: 'ON LAI STREET',
    unclassified2dText: 'TECHNOLOGY PARK',
  },
  {
    name: 'several flat identifiers are extracted as one unit series',
    source: 'Flat A,M,N, 16/F, Kings Wing Plaza 1',
    address2dText: 'Kings Wing Plaza 1',
    address3dParts: [unit('Flat A,M,N', 'A,M,N', 'flat'), floor('16/F', '16')],
    buildingNumberExpression: null,
    buildingNumbers: [],
    disposition: 'unrecognised',
    streetName: null,
    unclassified2dText: 'KINGS WING PLAZA 1',
  },
  {
    name: 'shop range plus building and numbered street',
    source: 'Shop G40-42, Kings Wing Plaza 1, 3 On Kwan St',
    address2dText: 'Kings Wing Plaza 1, 3 On Kwan St',
    address3dParts: [unit('Shop G40-42', 'G40-42', 'shop')],
    buildingNumberExpression: '3',
    buildingNumbers: ['3'],
    disposition: 'premise-candidate',
    streetName: 'ON KWAN STREET',
    unclassified2dText: 'KINGS WING PLAZA 1',
  },
  {
    name: 'unit and floor plus locality after the numbered street',
    source: 'Unit 02, 3/F., Technology Park, 18 On Lai Street, Shek Mun',
    address2dText: 'Technology Park, 18 On Lai Street, Shek Mun',
    address3dParts: [unit('Unit 02', '02', 'unit'), floor('3/F.', '3')],
    buildingNumberExpression: '18',
    buildingNumbers: ['18'],
    disposition: 'premise-candidate',
    streetName: 'ON LAI STREET',
    unclassified2dText: 'TECHNOLOGY PARK SHEK MUN',
  },
  {
    name: 'Traditional Chinese floor and unlabelled unit suffix',
    source: '石門安耀街5號W LUXE 16樓S10',
    address2dText: '石門安耀街5號W LUXE',
    address3dParts: [floor('16樓', '16'), unit('S10', 'S10', 'other')],
    buildingNumberExpression: '5',
    buildingNumbers: ['5'],
    disposition: 'premise-candidate',
    streetName: '安耀街',
    unclassified2dText: '石門 W LUXE',
  },
  {
    name: 'Traditional Chinese floor and room suffix',
    source: '石門安耀街5號W Luxe 22樓S17室',
    address2dText: '石門安耀街5號W Luxe',
    address3dParts: [floor('22樓', '22'), unit('S17室', 'S17', 'room')],
    buildingNumberExpression: '5',
    buildingNumbers: ['5'],
    disposition: 'premise-candidate',
    streetName: '安耀街',
    unclassified2dText: '石門 W LUXE',
  },
  {
    name: 'Traditional Chinese definitions provide canonical building evidence',
    source: '石門安耀街5號W LUXE 16樓S10',
    address2dText: '石門安耀街5號W LUXE',
    address3dParts: [floor('16樓', '16'), unit('S10', 'S10', 'other')],
    buildingNumberExpression: '5',
    buildingNumbers: ['5'],
    definitions: [
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
    ],
    disposition: 'premise-candidate',
    matchedAddressId: 'w-luxe',
    recognised2dComponents: [
      {
        kind: 'buildingName',
        name: 'W LUXE',
        normalisedName: 'W LUXE',
      },
    ],
    streetName: '安耀街',
    unclassified2dText: '石門',
  },
  {
    name: 'Chinese numerals for street, phase, floor and shop',
    source: '沙田石門安群街一號京瑞廣場二期一樓101A12鋪',
    address2dText: '沙田石門安群街1號京瑞廣場2期',
    address3dParts: [floor('1樓', '1'), unit('101A12鋪', '101A12', 'shop')],
    buildingNumberExpression: '1',
    buildingNumbers: ['1'],
    disposition: 'premise-candidate',
    streetName: '安群街',
    unclassified2dText: '沙田石門 京瑞廣場2期',
  },
  {
    name: 'Chinese building name and multiple shop observations',
    source: '沙田安群街3號京瑞廣場1期地下G26號鋪及1樓123號鋪',
    address2dText: '沙田安群街3號京瑞廣場1期 及',
    address3dParts: [
      floor('地下', null, 'ground_floor'),
      unit('G26號鋪', 'G26', 'shop'),
      floor('1樓', '1'),
      unit('123號鋪', '123', 'shop'),
    ],
    buildingNumberExpression: '3',
    buildingNumbers: ['3'],
    disposition: 'premise-candidate',
    streetName: '安群街',
    unclassified2dText: '沙田 京瑞廣場1期 及',
  },
  {
    name: 'Chinese room range after a floor',
    source: '石門安麗街18號達利廣場10樓07-08室',
    address2dText: '石門安麗街18號達利廣場',
    address3dParts: [floor('10樓', '10'), unit('07-08室', '07-08', 'room')],
    buildingNumberExpression: '18',
    buildingNumbers: ['18'],
    disposition: 'premise-candidate',
    streetName: '安麗街',
    unclassified2dText: '石門 達利廣場',
  },
  {
    name: 'Chinese multi-room range and building description',
    source: '小瀝源安心街19號匯貿中心 10樓1010-1012室',
    address2dText: '小瀝源安心街19號匯貿中心',
    address3dParts: [floor('10樓', '10'), unit('1010-1012室', '1010-1012', 'room')],
    buildingNumberExpression: '19',
    buildingNumbers: ['19'],
    disposition: 'premise-candidate',
    streetName: '安心街',
    unclassified2dText: '小瀝源 匯貿中心',
  },
  {
    name: 'Chinese street number range before a Chinese street',
    source: 'Fu Cheung Centre, 8-12 黃竹洋街',
    address2dText: 'Fu Cheung Centre, 8-12 黃竹洋街',
    buildingNumberExpression: '8-12',
    buildingNumbers: ['8', '10', '12'],
    disposition: 'premise-candidate',
    streetName: '黃竹洋街',
    unclassified2dText: 'FU CHEUNG CENTRE',
  },
  {
    name: 'romanised Chinese street does not impersonate its official bilingual name',
    source: "Hang Wai Industrial (Int'l) Co. Ltd. S, 15-21 Huang Zhu YangJie",
    address2dText: "Hang Wai Industrial (Int'l) Co. Ltd. S, 15-21 Huang Zhu YangJie",
    buildingNumberExpression: null,
    buildingNumbers: [],
    disposition: 'unrecognised',
    streetName: null,
    unclassified2dText: 'HANG WAI INDUSTRIAL INTL CO LTD S 15 21 HUANG ZHU YANGJIE',
  },
  {
    name: 'alphanumeric number against a canonical apostrophe street',
    source: "125a King's Rd",
    address2dText: "125a King's Rd",
    buildingNumberExpression: '125A',
    buildingNumbers: ['125A'],
    disposition: 'premise-candidate',
    streetName: "KING'S ROAD",
    unclassified2dText: null,
  },
  {
    name: 'plain number against the same canonical apostrophe street',
    source: "225 King's Rd",
    address2dText: "225 King's Rd",
    buildingNumberExpression: '225',
    buildingNumbers: ['225'],
    disposition: 'premise-candidate',
    streetName: "KING'S ROAD",
    unclassified2dText: null,
  },
  {
    name: 'numbered street without a venue or building description',
    source: '3 On Kwan St',
    address2dText: '3 On Kwan St',
    buildingNumberExpression: '3',
    buildingNumbers: ['3'],
    disposition: 'premise-candidate',
    streetName: 'ON KWAN STREET',
    unclassified2dText: null,
  },
  {
    name: 'Chinese number marker before an English street',
    source: '14號 School Rd',
    address2dText: '14號 School Rd',
    buildingNumberExpression: '14',
    buildingNumbers: ['14'],
    disposition: 'premise-candidate',
    streetName: 'SCHOOL ROAD',
    unclassified2dText: null,
  },
  {
    name: 'canonical street without a premise number',
    source: 'Shek Mun Kap Rd',
    address2dText: 'Shek Mun Kap Rd',
    buildingNumberExpression: null,
    buildingNumbers: [],
    disposition: 'street-only',
    streetName: 'SHEK MUN KAP ROAD',
    unclassified2dText: null,
  },
  {
    name: 'locality without a street',
    source: 'Cheung Chau',
    address2dText: 'Cheung Chau',
    buildingNumberExpression: null,
    buildingNumbers: [],
    disposition: 'unrecognised',
    streetName: null,
    unclassified2dText: 'CHEUNG CHAU',
  },
  {
    name: 'estate or beach name without a street',
    source: 'Palm Beach',
    address2dText: 'Palm Beach',
    buildingNumberExpression: null,
    buildingNumbers: [],
    disposition: 'unrecognised',
    streetName: null,
    unclassified2dText: 'PALM BEACH',
  },
  {
    name: 'island locality without a street',
    source: 'Lantau',
    address2dText: 'Lantau',
    buildingNumberExpression: null,
    buildingNumbers: [],
    disposition: 'unrecognised',
    streetName: null,
    unclassified2dText: 'LANTAU',
  },
  {
    name: 'source street absent from the LandsD baseline',
    source: 'Sun Hing Back St',
    address2dText: 'Sun Hing Back St',
    buildingNumberExpression: null,
    buildingNumbers: [],
    disposition: 'unrecognised',
    streetName: null,
    unclassified2dText: 'SUN HING BACK STREET',
  },
  {
    name: 'two floor expressions before a numbered street',
    source: 'G/F & 1/F, 36 Praya St',
    address2dText: '36 Praya St',
    address3dParts: [floor('G/F', 'G', 'ground_floor'), floor('1/F', '1')],
    buildingNumberExpression: '36',
    buildingNumbers: ['36'],
    disposition: 'premise-candidate',
    streetName: 'PRAYA STREET',
    unclassified2dText: null,
  },
  {
    name: 'flat and punctuated floor with trailing source comma',
    source: 'Flat A, 9/F., Cheung Lung Industrial Bldg, 10 Cheung Yee Street, ',
    address2dText: 'Cheung Lung Industrial Bldg, 10 Cheung Yee Street',
    address3dParts: [unit('Flat A', 'A', 'flat'), floor('9/F.', '9')],
    buildingNumberExpression: '10',
    buildingNumbers: ['10'],
    disposition: 'premise-candidate',
    streetName: 'CHEUNG YEE STREET',
    unclassified2dText: 'CHEUNG LUNG INDUSTRIAL BLDG',
  },
  {
    name: 'room and floor before venue and street',
    source: 'Room 1201, 12/F, Kimberland Centre, 55 Wing Hong Street',
    address2dText: 'Kimberland Centre, 55 Wing Hong Street',
    address3dParts: [unit('Room 1201', '1201', 'room'), floor('12/F', '12')],
    buildingNumberExpression: '55',
    buildingNumbers: ['55'],
    disposition: 'premise-candidate',
    streetName: 'WING HONG STREET',
    unclassified2dText: 'KIMBERLAND CENTRE',
  },
  {
    name: 'operational airport description has a unit and level but no street',
    source:
      'Unit 5T028 Level 5 Arrivals Hall Passenger Terminal 1 Hk International Airport',
    address2dText: 'Arrivals Hall Passenger Terminal 1 Hk International Airport',
    address3dParts: [unit('Unit 5T028', '5T028', 'unit'), floor('Level 5', '5')],
    buildingNumberExpression: null,
    buildingNumbers: [],
    disposition: 'unrecognised',
    streetName: null,
    unclassified2dText: 'ARRIVALS HALL PASSENGER TERMINAL 1 HK INTERNATIONAL AIRPORT',
  },
  {
    name: 'venue description and ordinal floor before numbered street',
    source:
      'YMCA of Hong Kong Christian College (YHKCC) Main Hall on 2nd floor  2 Chung Yat Street',
    address2dText:
      'YMCA of Hong Kong Christian College (YHKCC) Main Hall on 2 Chung Yat Street',
    address3dParts: [floor('2nd floor', '2')],
    buildingNumberExpression: '2',
    buildingNumbers: ['2'],
    disposition: 'premise-candidate',
    streetName: 'CHUNG YAT STREET',
    unclassified2dText: 'YMCA OF HONG KONG CHRISTIAN COLLEGE YHKCC MAIN HALL',
  },
  {
    name: 'shop, ground floor, shopping centre and estate before numbered street',
    source: 'Shop 8, G/F, Yat Tung Shopping Centre, Yat Tung Estate, 8 Yat Tung St',
    address2dText: 'Yat Tung Shopping Centre, Yat Tung Estate, 8 Yat Tung St',
    address3dParts: [unit('Shop 8', '8', 'shop'), floor('G/F', 'G', 'ground_floor')],
    buildingNumberExpression: '8',
    buildingNumbers: ['8'],
    disposition: 'premise-candidate',
    streetName: 'YAT TUNG STREET',
    unclassified2dText: 'YAT TUNG SHOPPING CENTRE YAT TUNG ESTATE',
  },
  {
    name: 'venue-only shop address is not promoted to a 2D premise',
    source: 'Shop 107, Citygate Outlets',
    address2dText: 'Citygate Outlets',
    address3dParts: [unit('Shop 107', '107', 'shop')],
    buildingNumberExpression: null,
    buildingNumbers: [],
    disposition: 'unrecognised',
    streetName: null,
    unclassified2dText: 'CITYGATE OUTLETS',
  },
  {
    name: 'unit, floor, venue and numbered abbreviated road',
    source: 'Unit 327, 3/F, Citygate Outlets, 20 Tat Tung Rd',
    address2dText: 'Citygate Outlets, 20 Tat Tung Rd',
    address3dParts: [unit('Unit 327', '327', 'unit'), floor('3/F', '3')],
    buildingNumberExpression: '20',
    buildingNumbers: ['20'],
    disposition: 'premise-candidate',
    streetName: 'TAT TUNG ROAD',
    unclassified2dText: 'CITYGATE OUTLETS',
  },
  {
    name: 'street plus venue plus remote number remains street-only',
    source: 'Tat Tung Road Citygate Outlets Shop G18 地下 20',
    address2dText: 'Tat Tung Road Citygate Outlets 20',
    address3dParts: [
      unit('Shop G18', 'G18', 'shop'),
      floor('地下', null, 'ground_floor'),
    ],
    buildingNumberExpression: null,
    buildingNumbers: [],
    disposition: 'street-only',
    streetName: 'TAT TUNG ROAD',
    unclassified2dText: 'CITYGATE OUTLETS 20',
  },
  {
    name: 'official street name with no suffix',
    source: 'Shop 18, G/F, Smithfield Court, 43 Smithfield',
    address2dText: 'Smithfield Court, 43 Smithfield',
    address3dParts: [unit('Shop 18', '18', 'shop'), floor('G/F', 'G', 'ground_floor')],
    buildingNumberExpression: '43',
    buildingNumbers: ['43'],
    disposition: 'premise-candidate',
    streetName: 'SMITHFIELD',
    unclassified2dText: 'SMITHFIELD COURT',
  },
  {
    name: 'wing and block venue description before a numbered long road',
    source: 'Left Wing, G/F & 1/F, Block A, 15 Tung Chung Waterfront Road',
    address2dText: 'Left Wing, Block A, 15 Tung Chung Waterfront Road',
    address3dParts: [floor('G/F', 'G', 'ground_floor'), floor('1/F', '1')],
    buildingNumberExpression: '15',
    buildingNumbers: ['15'],
    disposition: 'premise-candidate',
    streetName: 'TUNG CHUNG WATERFRONT ROAD',
    unclassified2dText: 'LEFT WING BLOCK A',
  },
]

describe('Overture Place address parsing', () => {
  for (const sourceCase of sourceParseCases) {
    test(sourceCase.name, () => {
      const matcher = sourceCase.definitions
        ? createPlaceAddressMatcher(sourceCase.definitions, landsdStreets)
        : sourceMatcher
      const parsed = parsePlaceAddress(sourceCase.source, matcher)
      expect(parsed).toEqual({
        address2dText: sourceCase.address2dText,
        address3dParts: sourceCase.address3dParts ?? [],
        buildingNumberExpression: sourceCase.buildingNumberExpression,
        buildingNumbers: sourceCase.buildingNumbers,
        disposition: sourceCase.disposition,
        normalisedAddress2dText: normalised(sourceCase.address2dText),
        recognised2dComponents: sourceCase.recognised2dComponents ?? [],
        street:
          sourceCase.streetName === null
            ? null
            : expect.objectContaining({ name: sourceCase.streetName }),
        unclassified2dText: sourceCase.unclassified2dText,
      })
      if (sourceCase.matchedAddressId !== undefined) {
        expect(matchPlaceAddressTexts([sourceCase.source], matcher)).toBe(
          sourceCase.matchedAddressId,
        )
      }
    })
  }

  test('normalises source suffix abbreviations to the full LandsD matching form', () => {
    expect(parsePlaceAddress('19b Ap Lei Chau Praya Rd', sourceMatcher)).toMatchObject({
      normalisedAddress2dText: '19B AP LEI CHAU PRAYA ROAD',
      street: {
        locale: 'en',
        name: 'AP LEI CHAU PRAYA ROAD',
        normalisedName: 'AP LEI CHAU PRAYA ROAD',
        streetIds: ['landsd-street-1'],
      },
    })
  })

  test('does not interpret a directional street word as a block expression', () => {
    const matcher = createPlaceAddressMatcher([
      {
        addressId: 'airport-address',
        locale: 'en',
        formattedAddress: '80 South Perimeter Road, Hong Kong International Airport',
        buildingName: null,
        buildingNumberExpression: '80',
        buildingNumberFrom: '80',
        buildingNumberTo: null,
        blockExpression: 'SOUTH',
        phaseExpression: null,
        estateName: 'HONG KONG INTERNATIONAL AIRPORT',
        streetName: 'SOUTH PERIMETER ROAD',
      },
    ])

    expect(
      parsePlaceAddress(
        '80 South Perimeter Road, Hong Kong International Airport',
        matcher,
      ),
    ).toMatchObject({
      buildingNumberExpression: '80',
      recognised2dComponents: [
        {
          kind: 'estateName',
          name: 'HONG KONG INTERNATIONAL AIRPORT',
        },
      ],
      street: expect.objectContaining({ name: 'SOUTH PERIMETER ROAD' }),
      unclassified2dText: null,
    })
  })

  test('absorbs No. into the adjacent street number', () => {
    const matcher = createPlaceAddressMatcher([
      {
        addressId: 'china-fen-hin',
        locale: 'en',
        formattedAddress: 'China Fen Hin Building, 5 Cheung Yue Street',
        buildingName: 'China Fen Hin Building',
        buildingNumberExpression: '5',
        buildingNumberFrom: '5',
        buildingNumberTo: null,
        blockExpression: null,
        phaseExpression: null,
        estateName: null,
        streetName: 'Cheung Yue Street',
      },
    ])

    expect(
      parsePlaceAddress('China Fen Hin Building No. 5 Cheung Yue Street', matcher),
    ).toMatchObject({
      buildingNumberExpression: '5',
      buildingNumbers: ['5'],
      unclassified2dText: null,
    })
  })
})

describe('Overture Place first-cohort uncovered address shapes', () => {
  const cases = [
    {
      name: 'venue with romanised street variant absent from the baseline',
      source: 'Tung Chung Health Centre, 6 Fu DongJie',
      disposition: 'unrecognised',
      street: null,
      parts: [],
    },
    {
      name: 'locality and beach road without a building number',
      source: 'Cheung Chau Tung Wan, Cheung Chau Beach Road, Cheung Chau, Hong Kong',
      disposition: 'street-only',
      street: 'CHEUNG CHAU BEACH ROAD',
      parts: [],
    },
    {
      name: 'estate and peak road without a building number',
      source: 'Bellevue Garden, Cheung Chau Peak Rd',
      disposition: 'street-only',
      street: 'CHEUNG CHAU PEAK ROAD',
      parts: [],
    },
    {
      name: 'floor-only street observation',
      source: '1/f Ning Foo St',
      disposition: 'street-only',
      street: 'NING FOO STREET',
      parts: ['1/f'],
    },
    {
      name: 'shop and floor with venue but no street',
      source: 'Shop\u200b 110C, 1/F, Fu Tung Plaza',
      disposition: 'unrecognised',
      street: null,
      parts: ['1/F'],
    },
    {
      name: 'airport hall and terminal instruction',
      source: '7/F, Departures East Hall, Terminal 1, Hong Kong International Airport',
      disposition: 'unrecognised',
      street: null,
      parts: ['7/F'],
    },
    {
      name: 'trail section is a non-premise location',
      source: 'Lantau Trail Sec. 11',
      disposition: 'unrecognised',
      street: null,
      parts: [],
    },
    {
      name: 'kiosk and transit station description',
      source: 'Kiosk TUC05, MTR Tung Chung Station, Tung Chung, Lantau Island',
      disposition: 'unrecognised',
      street: null,
      parts: ['Kiosk TUC05'],
    },
    {
      name: 'mixed-script station shop has no known street',
      source: '港鐵22號HK 新界 大嶼山站TUC號舖',
      disposition: 'unrecognised',
      street: null,
      parts: [],
    },
    {
      name: 'Chinese village premise without a canonical street',
      source: '下嶺皮村10號',
      disposition: 'unrecognised',
      street: null,
      parts: [],
    },
    {
      name: 'Chinese market shop without a canonical street',
      source: '昂坪市集14號鋪',
      disposition: 'unrecognised',
      street: null,
      parts: ['14號鋪'],
    },
    {
      name: 'Chinese locality suffix after a street',
      source: 'Cheung Chau Beach Rd, 北路',
      disposition: 'street-only',
      street: 'CHEUNG CHAU BEACH ROAD',
      parts: [],
    },
    {
      name: 'street-side shop range without a canonical premise number',
      source: 'Po Ngong Dr, 大嶼山昂坪市集9B號舖',
      disposition: 'street-only',
      street: 'PO NGONG DRIVE',
      parts: ['9B號舖'],
    },
    {
      name: 'romanised Chinese street concatenated with a number',
      source: 'Xiang TianLu1號',
      disposition: 'unrecognised',
      street: null,
      parts: [],
    },
    {
      name: 'Chinese street with shop range but no building number',
      source: 'Shop 6E112 & 6E115 - 6, 翔天路',
      disposition: 'street-only',
      street: '翔天路',
      parts: ['Shop 6E112 & 6E115 - 6'],
    },
    {
      name: 'unit and floor with no 2D address',
      source: '1樓b11號舖',
      disposition: 'unrecognised',
      street: null,
      parts: ['1樓', 'b11號舖'],
    },
    {
      name: 'Chinese street locality without a building number',
      source: '東涌順東路',
      disposition: 'street-only',
      street: '順東路',
      parts: [],
    },
    {
      name: 'publisher ranking instruction is not an address',
      source: '全部遊覽線路中排第4名',
      disposition: 'unrecognised',
      street: null,
      parts: [],
    },
    {
      name: 'number-only source value',
      source: '128號',
      disposition: 'unrecognised',
      street: null,
      parts: [],
    },
    {
      name: 'number range and ground floor without a street',
      source: '94-95號地下茘枝園',
      disposition: 'unrecognised',
      street: null,
      parts: ['地下'],
    },
    {
      name: 'Chinese village descriptor after a known road',
      source: '東涌道下嶺皮二十一座',
      disposition: 'street-only',
      street: '東涌道',
      parts: [],
    },
    {
      name: 'shopping centre shop without a canonical street',
      source: '東涌逸東商場221號商舖',
      disposition: 'unrecognised',
      street: null,
      parts: [],
    },
  ] as const

  for (const sourceCase of cases) {
    test(sourceCase.name, () => {
      const parsed = parsePlaceAddress(sourceCase.source, sourceMatcher)
      expect(parsed.disposition).toBe(sourceCase.disposition)
      expect(parsed.street?.name ?? null).toBe(sourceCase.street)
      expect(parsed.address3dParts.map(part => part.sourceText)).toEqual([
        ...sourceCase.parts,
      ])
    })
  }
})

describe('Overture Place address matching', () => {
  test('recognises ALS building and estate names as canonical 2D evidence', () => {
    const matcher = createPlaceAddressMatcher([
      definition('smithfield-court', {
        buildingNumberExpression: '43',
        buildingNumberFrom: '43',
        estateName: 'SMITHFIELD COURT',
        streetName: 'SMITHFIELD',
      }),
      definition('technology-park', {
        buildingName: 'TECHNOLOGY PARK',
        buildingNumberExpression: '18',
        buildingNumberFrom: '18',
        streetName: 'ON LAI STREET',
      }),
      definition('yat-tung-shopping-centre', {
        buildingName: 'YAT TUNG SHOPPING CENTRE',
        buildingNumberExpression: '8',
        buildingNumberFrom: '8',
        estateName: 'YAT TUNG ESTATE',
        streetName: 'YAT TUNG STREET',
      }),
    ])

    expect(
      parsePlaceAddress('Shop 18, G/F, Smithfield Court, 43 Smithfield', matcher),
    ).toMatchObject({
      recognised2dComponents: [
        {
          kind: 'estateName',
          name: 'SMITHFIELD COURT',
        },
      ],
      unclassified2dText: null,
    })
    expect(
      parsePlaceAddress('Room 1107, Technology Park, On Lai St', matcher),
    ).toMatchObject({
      recognised2dComponents: [
        {
          kind: 'buildingName',
          name: 'TECHNOLOGY PARK',
        },
      ],
      unclassified2dText: null,
    })
    expect(
      parsePlaceAddress(
        'Shop 8, G/F, Yat Tung Shopping Centre, Yat Tung Estate, 8 Yat Tung St',
        matcher,
      ),
    ).toMatchObject({
      recognised2dComponents: [
        { kind: 'buildingName', name: 'YAT TUNG SHOPPING CENTRE' },
        { kind: 'estateName', name: 'YAT TUNG ESTATE' },
      ],
      unclassified2dText: null,
    })
    expect(
      matchPlaceAddressTexts(
        ['Shop 8, G/F, Yat Tung Shopping Centre, Yat Tung Estate, 8 Yat Tung St'],
        matcher,
      ),
    ).toBe('yat-tung-shopping-centre')
  })

  test('matches a unique ALS premise after stripping its typed 3D parts', () => {
    const matcher = createPlaceAddressMatcher([
      definition('kings-wing-plaza-1', {
        buildingName: 'KINGS WING PLAZA 1',
        formattedAddress: 'KINGS WING PLAZA 1, 3 ON KWAN STREET, SHA TIN DISTRICT, NT',
      }),
    ])

    expect(
      matchPlaceAddressTexts(
        ['Shop 207, 2/F, Kings Wing Plaza 1, 3 On Kwan St'],
        matcher,
      ),
    ).toBe('kings-wing-plaza-1')
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

  test('matches only valid members of an ALS building-number range', () => {
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

  test('does not turn a locality, estate, venue, or street-only label into a premise', () => {
    const matcher = createPlaceAddressMatcher(
      [
        definition('street-address', {
          buildingNumberExpression: '9',
          buildingNumberFrom: '9',
          streetName: 'SHEK MUN KAP ROAD',
        }),
      ],
      landsdStreets,
    )

    for (const source of [
      'Shek Mun Kap Rd',
      'Cheung Chau',
      'Palm Beach',
      'Lantau',
      'Sun Hing Back St',
      'Shop 107, Citygate Outlets',
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

  test('does not accept 19B as an ALS range member of 19-21', () => {
    const matcher = createPlaceAddressMatcher([
      definition('ap-lei-chau-range', {
        buildingNumberExpression: '19-21',
        buildingNumberFrom: '19',
        buildingNumberTo: '21',
        streetName: 'AP LEI CHAU PRAYA ROAD',
      }),
    ])

    expect(matchPlaceAddressTexts(['19B Ap Lei Chau Praya Rd'], matcher)).toBeNull()
  })
})

function normalised(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleUpperCase('en')
    .replaceAll(/[’']/g, '')
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .map(
      token =>
        ({ LN: 'LANE', RD: 'ROAD', ST: 'STREET' })[token as 'LN' | 'RD' | 'ST'] ??
        token,
    )
    .join(' ')
}
