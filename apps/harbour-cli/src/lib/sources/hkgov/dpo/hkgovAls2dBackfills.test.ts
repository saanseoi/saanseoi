import { expect, test } from 'bun:test'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-2d-backfills.json'
import { buildAls2dBackfillFeatures } from './hkgovAls2dBackfills'
import type { HkgovAlsSourceFeature } from './hkgovAlsTypes'

const rule = fixture.backfills.find(
  b => b.id === 'tsui-lam-pik-lam-block-1-until-revoked',
)!
function source(): HkgovAlsSourceFeature {
  const feature = structuredClone(rule.feature)
  return {
    feature: {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: [
          feature.geometry.coordinates[0]!,
          feature.geometry.coordinates[1]!,
        ],
      },
    },
    sourceFile: rule.sourceFile,
    featureIndexOneBased: rule.featureIndexOneBased,
  }
}
function pikLam(features: HkgovAlsSourceFeature[], version = '2026-08-19.0') {
  return buildAls2dBackfillFeatures(features, version).filter(
    f =>
      f.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId ===
      rule.csu,
  )
}

test('forward-fills the numbered parent independently of its blockless CSU alias', () => {
  const blockless = source()
  const p = blockless.feature.properties!.Address!.PremisesAddress!
  delete p.EngPremisesAddress!.EngBlock
  delete p.ChiPremisesAddress!.ChiBlock
  const original = structuredClone(blockless)
  expect(pikLam([blockless])).toHaveLength(1)
  expect(pikLam([blockless])[0]!.feature).toEqual(source().feature)
  expect(blockless).toEqual(original)
  expect(pikLam([], '2026-07-22.0')).toHaveLength(0)
  expect(pikLam([], '2027-01-01.0')).toHaveLength(1)
})

test('an identical returning publisher parent prevents a duplicate backfill', () => {
  expect(pikLam([source()])).toHaveLength(0)
})

test('retains the approved parent from the exact renamed source without duplicating it', () => {
  const renamed = source()
  const p = renamed.feature.properties!.Address!.PremisesAddress!
  p.EngPremisesAddress!.BuildingName = 'PIK LAM HOUSE (BLK 1)'
  p.ChiPremisesAddress!.BuildingName = '碧林樓(1座)'
  const original = structuredClone(renamed)
  const features = [renamed]
  const provenance = new Map<string, HkgovAlsSourceFeature[]>()
  const result = buildAls2dBackfillFeatures(features, '2026-08-19.0', provenance)
  expect(features).toHaveLength(0)
  expect(
    result
      .filter(
        f =>
          f.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation
            ?.CsuId === rule.csu,
      )
      .map(f => f.feature),
  ).toEqual([source().feature])
  expect(provenance.get(rule.csu)).toEqual([original])
})

test('changed and duplicate numbered parents still require review', () => {
  const changed = source()
  changed.feature.geometry!.coordinates = [114.2485, 22.32152]
  expect(() => pikLam([changed])).toThrow('numbered source changed')
  expect(() => pikLam([source(), source()])).toThrow('numbered source changed')
  const changedCsu = source()
  changedCsu.feature.properties!.Address!.PremisesAddress!
    .BuildingCsuInformation!.CsuId = 'different'
  expect(() => pikLam([changedCsu])).toThrow('numbered source changed')
})

test('revocation stops future carry-forward while preserving the reviewed historical repair', () => {
  const application = rule.application!
  const state = application.state
  try {
    application.state = 'revoked'
    expect(pikLam([], '2027-01-01.0')).toHaveLength(0)
    expect(pikLam([])).toHaveLength(1)
  } finally {
    application.state = state
  }
})
