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

test('renamed, changed and duplicate returning parents bypass the fallback unchanged', () => {
  const renamed = source()
  const p = renamed.feature.properties!.Address!.PremisesAddress!
  p.EngPremisesAddress!.BuildingName = 'PIK LAM HOUSE (BLK 1)'
  p.ChiPremisesAddress!.BuildingName = '碧林樓(1座)'
  const changed = source()
  changed.feature.geometry!.coordinates = [114.2485, 22.32152]
  const changedCsu = source()
  changedCsu.feature.properties!.Address!.PremisesAddress!
    .BuildingCsuInformation!.CsuId = 'different'
  for (const features of [[renamed], [changed], [source(), source()], [changedCsu]]) {
    const original = structuredClone(features)
    expect(pikLam(features)).toHaveLength(0)
    expect(features).toEqual(original)
  }
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

test('Ho Sin Hang retention preserves a separate campus and skips a returning named building', () => {
  const retained = fixture.backfills.find(
    b => b.id === 'lingnan-ho-sin-hang-building-until-revoked',
  )!
  const feature = structuredClone(retained.feature)
  const named: HkgovAlsSourceFeature = {
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
    sourceFile: retained.sourceFile,
    featureIndexOneBased: retained.featureIndexOneBased,
  }
  const campus = structuredClone(named)
  const p = campus.feature.properties!.Address!.PremisesAddress!
  delete p.EngPremisesAddress!.BuildingName
  delete p.ChiPremisesAddress!.BuildingName
  p.EngPremisesAddress!.EngBlock = { BlockNo: 'CAMPUS' }
  campus.feature.geometry!.coordinates = [113.9829, 22.41083]
  const original = structuredClone(campus)
  const retainedFeatures = (features: HkgovAlsSourceFeature[], version: string) =>
    buildAls2dBackfillFeatures(features, version).filter(
      f =>
        f.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation
          ?.CsuId === retained.csu,
    )
  expect(retainedFeatures([campus], '2024-07-31.0')[0]!.feature).toEqual(named.feature)
  expect(campus).toEqual(original)
  expect(retainedFeatures([campus, named], '2024-08-21.0')).toHaveLength(0)
  expect(retainedFeatures([campus], '2027-01-01.0')).toHaveLength(1)
  expect(retainedFeatures([], '2024-07-24.0')).toHaveLength(0)
})
