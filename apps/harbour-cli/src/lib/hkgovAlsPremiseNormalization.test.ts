import { describe, expect, test } from 'bun:test'

import { normalizeHkgovAlsPremiseStructure } from './hkgovAlsPremiseNormalization.ts'

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
})
