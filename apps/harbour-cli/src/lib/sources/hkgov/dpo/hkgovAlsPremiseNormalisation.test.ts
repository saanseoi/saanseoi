import { describe, expect, test } from 'bun:test'

import {
  collectHkgovAlsRomanNumeralBuildingNameFamilies,
  collectHkgovAlsRomanNumeralPremiseNumberFamilies,
  hkgovAlsPhaseFamily,
  normaliseHkgovAlsBuildingNameRomanNumeral,
  normaliseHkgovAlsPhaseRomanNumeral,
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
        premisesName: 'LUNG MUN OASIS',
      }),
    ).toEqual({
      blockDescriptor: 'BLK',
      blockNumber: '10',
      buildingName: null,
      premisesName: 'LUNG MUN OASIS',
      normalisation: 'embedded-block',
    })
  })

  test('removes a repeated building and estate name', () => {
    expect(
      normaliseHkgovAlsPremiseStructure({
        blockDescriptor: null,
        blockNumber: null,
        buildingName: 'LOK YUEN HOUSE',
        premisesName: 'LOK YUEN HOUSE',
      }),
    ).toMatchObject({ buildingName: null, normalisation: 'redundant-building-name' })
  })

  test('removes an estate prefix from a house name without changing its block fields', () => {
    expect(
      normaliseHkgovAlsPremiseStructure({
        blockDescriptor: null,
        blockNumber: null,
        buildingName: 'FU TIP ESTATE BAN TIP HOUSE',
        premisesName: 'FU TIP ESTATE',
      }),
    ).toEqual({
      blockDescriptor: null,
      blockNumber: null,
      buildingName: 'BAN TIP HOUSE',
      premisesName: 'FU TIP ESTATE',
      normalisation: 'redundant-estate-prefix',
    })
  })

  test('does not invent a block for a free-form building name', () => {
    expect(
      normaliseHkgovAlsPremiseStructure({
        blockDescriptor: null,
        blockNumber: null,
        buildingName: 'WEST GATE TOWER',
        premisesName: null,
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
        premisesName: 'LUNG MUN OASIS',
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
        premisesName: 'EXAMPLE BLOCK ESTATE',
      },
      {
        blockDescriptor: 'HOUSE',
        blockNumber: 'II',
        buildingName: null,
        premisesName: 'EXAMPLE HOUSE ESTATE',
      },
      {
        blockDescriptor: 'TOWER',
        blockNumber: 'III',
        buildingName: null,
        premisesName: 'EXAMPLE TOWER ESTATE',
      },
    ])

    for (const premise of [
      {
        blockDescriptor: 'BLK',
        premisesName: 'EXAMPLE BLOCK ESTATE',
        reference: 'BLOCK IV',
      },
      {
        blockDescriptor: 'HOUSE',
        premisesName: 'EXAMPLE HOUSE ESTATE',
        reference: 'HOUSE II',
      },
      {
        blockDescriptor: 'TOWER',
        premisesName: 'EXAMPLE TOWER ESTATE',
        reference: 'TOWER III',
      },
    ]) {
      expect(
        normaliseHkgovAlsPremiseNumberRomanNumeral({
          premise: {
            blockDescriptor: premise.blockDescriptor,
            blockNumber: '1',
            buildingName: null,
            premisesName: premise.premisesName,
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
          premisesName: 'UNRELATED ESTATE',
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
        premisesName: 'MING WAH DAI HA',
      },
      {
        blockDescriptor: 'BLK',
        blockNumber: 'D',
        buildingName: null,
        premisesName: 'MING WAH DAI HA',
      },
    ])

    expect(
      normaliseHkgovAlsPremiseNumberRomanNumeral({
        premise: {
          blockDescriptor: 'BLK',
          blockNumber: '1',
          buildingName: null,
          premisesName: 'MING WAH DAI HA',
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
        premisesName: 'EXAMPLE ESTATE',
      },
    ])

    expect(
      normaliseHkgovAlsPremiseNumberRomanNumeral({
        premise: {
          blockDescriptor: 'BLK',
          blockNumber: 'TWO',
          buildingName: null,
          premisesName: 'EXAMPLE ESTATE',
        },
        romanNumeralFamilies,
      }),
    ).toEqual({ from: 'TWO', reference: 'BLK II', to: 'II' })
  })
})

describe('normaliseHkgovAlsPhaseRomanNumeral', () => {
  test('uses an estate phase series to render a Roman suffix as Arabic', () => {
    const family = hkgovAlsPhaseFamily('EXAMPLE ESTATE', 'PHASE 1', null)
    if (!family) throw new Error('Expected a phase family.')

    expect(
      normaliseHkgovAlsPhaseRomanNumeral({
        premisesName: 'EXAMPLE ESTATE',
        numericPhaseFamilies: new Map([[family, 'PHASE 1']]),
        phaseName: 'PHASE II',
        phaseRef: null,
      }),
    ).toEqual({ from: 'PHASE II', reference: 'PHASE 1', to: 'PHASE 2' })
  })

  test('does not change a Roman phase outside a numeric estate series', () => {
    expect(
      normaliseHkgovAlsPhaseRomanNumeral({
        premisesName: 'UNRELATED ESTATE',
        numericPhaseFamilies: new Map(),
        phaseName: 'PHASE II',
        phaseRef: null,
      }),
    ).toBeNull()
  })
})
