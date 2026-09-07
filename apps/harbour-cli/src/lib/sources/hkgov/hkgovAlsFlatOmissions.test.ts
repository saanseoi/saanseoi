import { expect, test } from 'bun:test'
import type { Als3dFeature } from './hkgovAls3d'
import { alsFlatOmissionAdditions } from './hkgovAlsFlatOmissions'

function feature(units: string[]): Als3dFeature {
  return {
    geometry: { type: 'Point', coordinates: [114, 22] },
    properties: {
      Address: {
        PremisesAddress: {
          BuildingCsuInformation: { CsuId: 'building-1' },
          EngPremisesAddress: {
            EngEstate: { EstateName: 'ESTATE' },
            BuildingName: 'HOUSE',
            Eng3dAddress: units.map(unit => ({
              EngUnit: { UnitDescriptor: 'FLAT', UnitNo: unit },
              EngFloor: { FloorNum: 1, FloorDescription: '1/F' },
            })),
          },
          ChiPremisesAddress: {
            BuildingName: '樓',
            Chi3dAddress: units.map(unit => ({
              ChiFloor: { FloorNum: 1, FloorDescription: '1樓' },
              ChiUnit: { UnitNo: unit, UnitDescriptor: '室' },
            })),
          },
        },
      },
    },
  }
}

test('recognises structured bilingual blocks without inventing names', () => {
  const before = feature(['101'])
  const after = feature(['101', '102'])
  for (const f of [before, after]) {
    const p = f.properties.Address.PremisesAddress
    delete p.EngPremisesAddress!.BuildingName
    delete p.ChiPremisesAddress!.BuildingName
    p.EngPremisesAddress!.EngBlock = { BlockNo: '6', BlockDescriptor: 'BLK' }
    p.ChiPremisesAddress!.ChiBlock = { BlockNo: '6', BlockDescriptor: '座' }
  }
  expect(alsFlatOmissionAdditions(before, after)).toEqual([{ floor: 1, unit: '102' }])
  after.properties.Address.PremisesAddress.ChiPremisesAddress!.ChiBlock!.BlockNo = '7'
  expect(alsFlatOmissionAdditions(before, after)).toBeNull()
})

test('recognises only exact bilingual additions without mutating evidence', () => {
  const before = feature(['101'])
  expect(alsFlatOmissionAdditions(before, feature(['101', '102', '103']))).toEqual([
    { floor: 1, unit: '102' },
    { floor: 1, unit: '103' },
  ])
  expect(before).toEqual(feature(['101']))
})

test('does not treat mergers, splits, replacements, duplicates or removals as omissions', () => {
  for (const [before, after] of [
    [['101A', '101B'], ['101']],
    [['101'], ['101A', '101B']],
    [['101F'], ['101', '102']],
    [['101'], ['101', '101']],
    [['101', '102'], ['101']],
  ])
    expect(alsFlatOmissionAdditions(feature(before!), feature(after!))).toBeNull()
})

test('requires stable bilingual building identity and matching bilingual added flats', () => {
  const before = feature(['101'])
  for (const mutate of [
    (p: Als3dFeature['properties']['Address']['PremisesAddress']) => {
      p.BuildingCsuInformation!.CsuId = 'other'
    },
    (p: Als3dFeature['properties']['Address']['PremisesAddress']) => {
      p.EngPremisesAddress!.BuildingName = 'OTHER'
    },
    (p: Als3dFeature['properties']['Address']['PremisesAddress']) => {
      p.ChiPremisesAddress!.BuildingName = '別樓'
    },
    (p: Als3dFeature['properties']['Address']['PremisesAddress']) => {
      p.ChiPremisesAddress!.Chi3dAddress!.pop()
    },
  ]) {
    const after = feature(['101', '102'])
    mutate(after.properties.Address.PremisesAddress)
    expect(alsFlatOmissionAdditions(before, after)).toBeNull()
  }
})
