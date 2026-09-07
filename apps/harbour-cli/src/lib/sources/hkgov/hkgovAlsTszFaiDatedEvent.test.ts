import { test, expect } from 'bun:test'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-tsz-fai-dated-event.json'
import corrections from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-3d-corrections.json'
import { applyAls3dCorrections } from './hkgovAls3dCorrections'
import type { Als3dFeature } from './hkgovAls3d'
function feature(a: (typeof fixture.assertions)[number]): Als3dFeature {
  return {
    geometry: { type: 'Point', coordinates: [114, 22] },
    properties: {
      Address: {
        PremisesAddress: {
          BuildingCsuInformation: { CsuId: fixture.csu },
          EngPremisesAddress: {
            BuildingName: fixture.enBuildingName,
            EngEstate: { EstateName: fixture.estate },
            Eng3dAddress: structuredClone(a.en),
          },
          ChiPremisesAddress: {
            BuildingName: fixture.zhBuildingName,
            Chi3dAddress: structuredClone(a.zh),
          },
        },
      },
    },
  }
}
test('418 merger and new419 begin on13August2025 and never backfill earlier inventories', () => {
  expect(corrections.corrections.filter(c => c.csu === fixture.csu)).toHaveLength(0)
  for (const a of fixture.assertions) {
    const f = feature(a),
      after = applyAls3dCorrections(f, a.version).feature
    const units =
      after.properties.Address.PremisesAddress.EngPremisesAddress!.Eng3dAddress!.map(
        u => u.EngUnit!.UnitNo,
      )
    expect(units).toEqual(
      a.version < fixture.eventSourceVersion
        ? ['418A', '418B', '418C']
        : ['418', '419'],
    )
  }
  const before = fixture.assertions.find(a => a.version === '2025-06-20.0')!,
    after = fixture.assertions.find(a => a.version === fixture.eventSourceVersion)!
  const invalid = feature(before)
  invalid.properties.Address.PremisesAddress.EngPremisesAddress!.Eng3dAddress!.push(
    structuredClone(after.en[1]!),
  )
  expect(() => applyAls3dCorrections(invalid, before.version)).toThrow(
    'new-flat date changed',
  )
  expect(() => applyAls3dCorrections(feature(before), after.version)).toThrow(
    'new-flat date changed',
  )
})
