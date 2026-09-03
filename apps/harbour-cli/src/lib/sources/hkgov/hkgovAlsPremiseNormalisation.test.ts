import { describe, expect, test } from 'bun:test'

import {
  collectHkgovAlsRomanNumeralBuildingNameFamilies,
  collectHkgovAlsRomanNumeralPremiseNumberFamilies,
  normaliseHkgovAlsBuildingNameRomanNumeral,
  normaliseHkgovAlsPremiseNumberRomanNumeral,
  normaliseHkgovAlsPremiseStructure,
  preferHkgovAlsEnglishCanonicalValue,
} from './hkgovAlsPremiseNormalisation.ts'

describe('normaliseHkgovAlsPremiseStructure', () => {
  test('moves an estate-prefixed block from building name into structured fields', () => {
    expect(
      normaliseHkgovAlsPremiseStructure({
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
      normalisation: 'embedded-block',
    })
  })

  test('removes a repeated building and estate name', () => {
    expect(
      normaliseHkgovAlsPremiseStructure({
        blockDescriptor: null,
        blockNumber: null,
        buildingName: 'LOK YUEN HOUSE',
        estateName: 'LOK YUEN HOUSE',
      }),
    ).toMatchObject({ buildingName: null, normalisation: 'redundant-building-name' })
  })

  test('does not invent a block for a free-form building name', () => {
    expect(
      normaliseHkgovAlsPremiseStructure({
        blockDescriptor: null,
        blockNumber: null,
        buildingName: 'WEST GATE TOWER',
        estateName: null,
      }),
    ).toMatchObject({
      blockDescriptor: null,
      blockNumber: null,
      buildingName: 'WEST GATE TOWER',
      normalisation: 'none',
    })
  })

  test('does not replace a disagreeing structured block', () => {
    expect(
      normaliseHkgovAlsPremiseStructure({
        blockDescriptor: 'BLK',
        blockNumber: '9',
        buildingName: 'LUNG MUN OASIS BLOCK 10',
        estateName: 'LUNG MUN OASIS',
      }).normalisation,
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

describe('normaliseHkgovAlsBuildingNameRomanNumeral', () => {
  test('uses Roman numerals for every numeric member of a Roman-styled building family', () => {
    const romanNumeralFamilies = collectHkgovAlsRomanNumeralBuildingNameFamilies([
      'INTERNATIONAL ENTERPRISE CENTRE II',
      'INTERNATIONAL ENTERPRISE CENTRE IV',
      'UNRELATED BUILDING 1',
    ])

    expect(
      normaliseHkgovAlsBuildingNameRomanNumeral({
        buildingName: 'INTERNATIONAL ENTERPRISE CENTRE 1',
        romanNumeralFamilies,
      }),
    ).toEqual({
      from: 'INTERNATIONAL ENTERPRISE CENTRE 1',
      reference: 'INTERNATIONAL ENTERPRISE CENTRE IV',
      to: 'INTERNATIONAL ENTERPRISE CENTRE I',
    })
    expect(
      normaliseHkgovAlsBuildingNameRomanNumeral({
        buildingName: 'INTERNATIONAL ENTERPRISE CENTRE 3',
        romanNumeralFamilies,
      }),
    ).toEqual({
      from: 'INTERNATIONAL ENTERPRISE CENTRE 3',
      reference: 'INTERNATIONAL ENTERPRISE CENTRE IV',
      to: 'INTERNATIONAL ENTERPRISE CENTRE III',
    })
    expect(
      normaliseHkgovAlsBuildingNameRomanNumeral({
        buildingName: 'UNRELATED BUILDING 1',
        romanNumeralFamilies,
      }),
    ).toBeNull()
  })

  test('canonicalises written building numbers in a Roman-styled family', () => {
    const romanNumeralFamilies = collectHkgovAlsRomanNumeralBuildingNameFamilies([
      'EXAMPLE BUILDING II',
    ])

    expect(
      normaliseHkgovAlsBuildingNameRomanNumeral({
        buildingName: 'EXAMPLE BUILDING ONE',
        romanNumeralFamilies,
      }),
    ).toEqual({
      from: 'EXAMPLE BUILDING ONE',
      reference: 'EXAMPLE BUILDING II',
      to: 'EXAMPLE BUILDING I',
    })
  })
})

describe('normaliseHkgovAlsPremiseNumberRomanNumeral', () => {
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
      {
        blockDescriptor: 'BLK',
        estateName: 'EXAMPLE BLOCK ESTATE',
        reference: 'BLOCK IV',
      },
      {
        blockDescriptor: 'HOUSE',
        estateName: 'EXAMPLE HOUSE ESTATE',
        reference: 'HOUSE II',
      },
      {
        blockDescriptor: 'TOWER',
        estateName: 'EXAMPLE TOWER ESTATE',
        reference: 'TOWER III',
      },
    ]) {
      expect(
        normaliseHkgovAlsPremiseNumberRomanNumeral({
          premise: {
            blockDescriptor: premise.blockDescriptor,
            blockNumber: '1',
            buildingName: null,
            estateName: premise.estateName,
          },
          romanNumeralFamilies,
        }),
      ).toEqual({ from: '1', reference: premise.reference, to: 'I' })
    }

    expect(
      normaliseHkgovAlsPremiseNumberRomanNumeral({
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
      normaliseHkgovAlsPremiseNumberRomanNumeral({
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

  test('canonicalises written block numbers in a Roman-styled family', () => {
    const romanNumeralFamilies = collectHkgovAlsRomanNumeralPremiseNumberFamilies([
      {
        blockDescriptor: 'BLK',
        blockNumber: 'II',
        buildingName: null,
        estateName: 'EXAMPLE ESTATE',
      },
    ])

    expect(
      normaliseHkgovAlsPremiseNumberRomanNumeral({
        premise: {
          blockDescriptor: 'BLK',
          blockNumber: 'TWO',
          buildingName: null,
          estateName: 'EXAMPLE ESTATE',
        },
        romanNumeralFamilies,
      }),
    ).toEqual({ from: 'TWO', reference: 'BLK II', to: 'II' })
  })
})
