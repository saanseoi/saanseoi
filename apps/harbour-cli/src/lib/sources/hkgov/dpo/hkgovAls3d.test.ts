import { expect, test } from 'bun:test'
import {
  normaliseAls3dInventory,
  assertAddress3dRowBudget,
  type Als3dFeature,
} from './hkgovAls3d'
import {
  formatAddress3dPart,
  resolveAddress3dCoverage,
  validatePlaceAddress3dReference,
} from '@repo/db/address3d'

function feature(pairs: Array<[string, string]>): Als3dFeature {
  return {
    geometry: { type: 'Point', coordinates: [114, 22] },
    properties: {
      Address: {
        PremisesAddress: {
          EngPremisesAddress: {
            Eng3dAddress: pairs.map(([floor, unit]) => ({
              EngFloor: { FloorDescription: `${floor}/F` },
              EngUnit: { UnitDescriptor: 'FLAT', UnitNo: unit },
            })),
          },
          ChiPremisesAddress: {
            Chi3dAddress: [...pairs].reverse().map(([floor, unit]) => ({
              ChiFloor: { FloorDescription: `${floor}樓` },
              ChiUnit: { UnitDescriptor: '室', UnitNo: unit },
            })),
          },
        },
      },
    },
  }
}

test('pairs locales by floor/unit, preserves tokens and hashes independently of array order', () => {
  const input = [
    ['G', 'G01'],
    ['1', '01'],
    ['2', '01'],
    ['L1', 'A'],
  ] as Array<[string, string]>
  const left = normaliseAls3dInventory(feature(input), 'physical-building')
  const right = normaliseAls3dInventory(
    feature([...input].reverse()),
    'physical-building',
  )
  expect(left).toEqual(right)
  expect(left.unitCount).toBe(4)
  expect(new Set(left.units.map(unit => unit.id)).size).toBe(4)
  expect(left.units.find(unit => unit.floorRef === 'G')?.floorType).toBe('G')
  expect(left.units.find(unit => unit.floorRef === 'L1')?.floorRef).toBe('L1')
  expect(left.units.filter(unit => unit.unitRef === '01')).toHaveLength(2)
  expect(
    normaliseAls3dInventory(feature(input), 'another-building').units[0]?.id,
  ).not.toBe(left.units[0]?.id)
})

test('rejects duplicate units, mismatched locales and unknown descriptors', () => {
  expect(() =>
    normaliseAls3dInventory(
      feature([
        ['1', '01'],
        ['1', '01'],
      ]),
      'building',
    ),
  ).toThrow('Duplicate')
  const input = feature([['1', '01']])
  const zh = input.properties.Address.PremisesAddress.ChiPremisesAddress
  if (!zh) throw new Error('Missing fixture locale')
  zh.Chi3dAddress = []
  expect(() => normaliseAls3dInventory(input, 'building')).toThrow('Unpaired')
  const unknown = feature([['1', '01']])
  const unit =
    unknown.properties.Address.PremisesAddress.EngPremisesAddress?.Eng3dAddress?.[0]
      ?.EngUnit
  if (!unit) throw new Error('Missing fixture unit')
  unit.UnitDescriptor = 'UNREVIEWED'
  expect(() => normaliseAls3dInventory(unknown, 'building')).toThrow('unfamiliar')
  expect(normaliseAls3dInventory(feature([]), 'building').unitCount).toBe(0)
})

test('only explicitly listed children inherit unresolved coverage; a post office does not', () => {
  const inventory = normaliseAls3dInventory(feature([['1', '01']]), 'man-hong')
  const collection = {
    id: 'collection',
    address2dId: 'building',
    unresolvedSectionIds: ['762'],
    units: inventory.units,
  }
  expect(
    resolveAddress3dCoverage({ id: '762', parentAddressId: 'building' }, [collection]),
  ).toEqual({
    kind: 'ancestor',
    address3dId: 'collection',
    ownerAddress2dId: 'building',
    membership: 'unresolved',
  })
  expect(
    resolveAddress3dCoverage({ id: '772', parentAddressId: 'building' }, [collection]),
  ).toEqual({ kind: 'none' })
  const unit = inventory.units[0]
  if (!unit) throw new Error('Missing fixture unit')
  expect(() =>
    validatePlaceAddress3dReference({
      address: { id: '762', parentAddressId: 'building' },
      collection,
      unitId: unit.id,
      membership: 'established',
    }),
  ).toThrow('inconsistent')
  expect(() =>
    validatePlaceAddress3dReference({
      address: { id: '762', parentAddressId: 'building' },
      collection,
      unitId: unit.id,
      membership: 'unresolved',
    }),
  ).not.toThrow()
})

test('formats ordinary expressions, retains optional overrides and measures UTF-8 bytes', () => {
  expect(
    formatAddress3dPart({ unitExpression: 'FLAT 01', floorExpression: '1/F' }, 'en'),
  ).toBe('FLAT 01, 1/F')
  expect(
    formatAddress3dPart({ unitExpression: '01室', floorExpression: '1樓' }, 'zh-hant'),
  ).toBe('1樓01室')
  expect(
    formatAddress3dPart(
      {
        unitExpression: '01室',
        floorExpression: '1樓',
        formattedAddressPart: 'reviewed exception',
      },
      'zh-hant',
    ),
  ).toBe('reviewed exception')
  expect(() => assertAddress3dRowBudget({ text: '樓'.repeat(340_000) })).toThrow(
    'bytes',
  )
})
