import { describe, expect, test } from 'bun:test'

import {
  collectHkgovAlsRomanNumeralBuildingNameFamilies,
  collectHkgovAlsRomanNumeralPremiseNumberFamilies,
  normalizeHkgovAlsBuildingNameRomanNumeral,
  normalizeHkgovAlsPremiseNumberRomanNumeral,
  normalizeHkgovAlsPremiseStructure,
  preferHkgovAlsEnglishCanonicalValue,
} from './hkgovAlsPremiseNormalization.ts'

describe('normalizeHkgovAlsPremiseStructure', () => {
  test('moves an estate-prefixed block from building name into structured fields', () => {
    expect(
      normalizeHkgovAlsPremiseStructure({
        blockDescriptor: null,
        blockNumber: null,
        buildingName: 'LUNG MUN OASIS BLOCK 10',
        estateName: 'LUNG MUN OASIS',
      }),
    ).toEqual({
      blockDescriptor: 'BLK',
      blockNumber: '10',
      buildingName: null,
      estateName: 'LUNG MUN OASIS',
      normalization: 'embedded-block',
    })
  })

  test('removes a repeated building and estate name', () => {
    expect(
      normalizeHkgovAlsPremiseStructure({
        blockDescriptor: null,
        blockNumber: null,
        buildingName: 'LOK YUEN HOUSE',
        estateName: 'LOK YUEN HOUSE',
      }),
    ).toMatchObject({ buildingName: null, normalization: 'redundant-building-name' })
  })

  test('does not invent a block for a free-form building name', () => {
    expect(
      normalizeHkgovAlsPremiseStructure({
        blockDescriptor: null,
        blockNumber: null,
        buildingName: 'WEST GATE TOWER',
        estateName: null,
      }),
    ).toMatchObject({
      blockDescriptor: null,
      blockNumber: null,
      buildingName: 'WEST GATE TOWER',
      normalization: 'none',
    })
  })

  test('does not replace a disagreeing structured block', () => {
    expect(
      normalizeHkgovAlsPremiseStructure({
        blockDescriptor: 'BLK',
        blockNumber: '9',
        buildingName: 'LUNG MUN OASIS BLOCK 10',
        estateName: 'LUNG MUN OASIS',
      }).normalization,
    ).toBe('none')
  })

  test('does not fall back to Chinese after removing a duplicate English name', () => {
    expect(
      preferHkgovAlsEnglishCanonicalValue({
        rawEnglish: 'THE SALVATION ARMY BRADBURY CAMP',
        canonicalEnglish: null,
        canonicalChinese: '救世軍白普理營一期營舍',
      }),
    ).toBeNull()
  })
})

describe('normalizeHkgovAlsBuildingNameRomanNumeral', () => {
  test('uses Roman numerals for every numeric member of a Roman-styled building family', () => {
    const romanNumeralFamilies = collectHkgovAlsRomanNumeralBuildingNameFamilies([
      'INTERNATIONAL ENTERPRISE CENTRE II',
      'INTERNATIONAL ENTERPRISE CENTRE IV',
      'UNRELATED BUILDING 1',
    ])

    expect(
      normalizeHkgovAlsBuildingNameRomanNumeral({
        buildingName: 'INTERNATIONAL ENTERPRISE CENTRE 1',
        romanNumeralFamilies,
      }),
    ).toEqual({
      from: 'INTERNATIONAL ENTERPRISE CENTRE 1',
      to: 'INTERNATIONAL ENTERPRISE CENTRE I',
    })
    expect(
      normalizeHkgovAlsBuildingNameRomanNumeral({
        buildingName: 'INTERNATIONAL ENTERPRISE CENTRE 3',
        romanNumeralFamilies,
      }),
    ).toEqual({
      from: 'INTERNATIONAL ENTERPRISE CENTRE 3',
      to: 'INTERNATIONAL ENTERPRISE CENTRE III',
    })
    expect(
      normalizeHkgovAlsBuildingNameRomanNumeral({
        buildingName: 'UNRELATED BUILDING 1',
        romanNumeralFamilies,
      }),
    ).toBeNull()
  })
})

describe('normalizeHkgovAlsPremiseNumberRomanNumeral', () => {
  test('uses Roman numerals for BLOCK, HOUSE and TOWER numbers within their family', () => {
    const romanNumeralFamilies = collectHkgovAlsRomanNumeralPremiseNumberFamilies([
      {
        blockDescriptor: 'BLOCK',
        blockNumber: 'IV',
        buildingName: null,
        estateName: 'EXAMPLE BLOCK ESTATE',
      },
      {
        blockDescriptor: 'HOUSE',
        blockNumber: 'II',
        buildingName: null,
        estateName: 'EXAMPLE HOUSE ESTATE',
      },
      {
        blockDescriptor: 'TOWER',
        blockNumber: 'III',
        buildingName: null,
        estateName: 'EXAMPLE TOWER ESTATE',
      },
    ])

    for (const premise of [
      { blockDescriptor: 'BLK', estateName: 'EXAMPLE BLOCK ESTATE' },
      { blockDescriptor: 'HOUSE', estateName: 'EXAMPLE HOUSE ESTATE' },
      { blockDescriptor: 'TOWER', estateName: 'EXAMPLE TOWER ESTATE' },
    ]) {
      expect(
        normalizeHkgovAlsPremiseNumberRomanNumeral({
          premise: {
            blockDescriptor: premise.blockDescriptor,
            blockNumber: '1',
            buildingName: null,
            estateName: premise.estateName,
          },
          romanNumeralFamilies,
        }),
      ).toEqual({ from: '1', to: 'I' })
    }

    expect(
      normalizeHkgovAlsPremiseNumberRomanNumeral({
        premise: {
          blockDescriptor: 'TOWER',
          blockNumber: '1',
          buildingName: null,
          estateName: 'UNRELATED ESTATE',
        },
        romanNumeralFamilies,
      }),
    ).toBeNull()
  })

  test('does not mistake single-letter block labels for Roman numeral evidence', () => {
    const romanNumeralFamilies = collectHkgovAlsRomanNumeralPremiseNumberFamilies([
      {
        blockDescriptor: 'BLK',
        blockNumber: 'C',
        buildingName: null,
        estateName: 'MING WAH DAI HA',
      },
      {
        blockDescriptor: 'BLK',
        blockNumber: 'D',
        buildingName: null,
        estateName: 'MING WAH DAI HA',
      },
    ])

    expect(
      normalizeHkgovAlsPremiseNumberRomanNumeral({
        premise: {
          blockDescriptor: 'BLK',
          blockNumber: '1',
          buildingName: null,
          estateName: 'MING WAH DAI HA',
        },
        romanNumeralFamilies,
      }),
    ).toBeNull()
  })
})
