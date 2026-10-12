import { recordReviewedAlsCoalescences as applyDecemberInferredAlsHierarchySpecialised } from './hkgovAlsReviewHierarchy'
import { applyReviewedAlsParents } from './hkgovAlsReviewProgram'
import { validateReviewedAlsSources } from './hkgovAlsReviewProgram'
import october from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-october-deletion-retentions.json'

import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-december-deletion-retentions.json'
import november from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-november-deletion-retentions.json'

import { readAls3dFeatures } from './hkgovAls3d'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { consolidateEquivalentHkgovAlsPremises } from './hkgovAlsEvidence'
import {
  applyReviewedAlsPremiseRetentions,
  finishReviewedAlsPremiseRetentions,
  retainReviewedAlsPremises,
} from './hkgovAlsReviewedPremiseRetentions'

import type { HkgovAlsSourceFeature } from './hkgovAlsTypes'

const rules = [
  ...october.rules,
  ...november.rules,
  ...fixture.rules,
] as unknown as NonNullable<Parameters<typeof retainReviewedAlsPremises>[2]>
const maps = {
  areaByEn: new Map(),
  areaByZh: new Map(),
  ambiguousAreaEn: new Set<string>(),
  ambiguousAreaZh: new Set<string>(),
  countryId: null,
  districtByEn: new Map(),
  districtByZh: new Map(),
  ambiguousDistrictEn: new Set<string>(),
  ambiguousDistrictZh: new Set<string>(),
  snapshotId: 'test',
}
const guards = [
  ...october.sourceGuards,
  ...november.sourceGuards,
  ...fixture.sourceGuards,
]
async function inputs(dir: string) {
  const features: HkgovAlsSourceFeature[] = []
  for (const sourceFile of new Set(guards.map(g => g.sourceFile))) {
    const csus = new Set(
      guards.filter(g => g.sourceFile === sourceFile).map(g => g.csu),
    )
    for await (const f of readAls3dFeatures(
      `data/hkgov/dpo/ALS/${dir}/${sourceFile}`,
    )) {
      if (
        f.featureIndexOneBased === 1 ||
        csus.has(
          f.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation
            ?.CsuId ?? '',
        )
      )
        features.push({
          ...f,
          sourceFile,
          feature: {
            ...f.feature,
            geometry: {
              ...f.feature.geometry,
              coordinates: [
                f.feature.geometry.coordinates[0]!,
                f.feature.geometry.coordinates[1]!,
              ],
            },
          },
        })
    }
  }
  return features
}
function prepare(features: HkgovAlsSourceFeature[], version: string) {
  validateOctoberInferredAlsSources(features, version)
  validateNovemberInferredAlsSources(features, version)
  validateDecemberInferredAlsSources(features, version)
  const applications = retainReviewedAlsPremises(features, version, rules)
  const rows = features.map(f =>
    normaliseHkgovAlsFeature(
      f.feature,
      f.sourceFile,
      f.featureIndexOneBased,
      'test',
      version,
      maps,
      true,
      new Map(),
      new Map(),
      new Map(),
    ),
  )
  const raw = rows.map(r => [r.engPremisesAddressJson, r.chiPremisesAddressJson])
  applyReviewedAlsPremiseRetentions(rows, applications)
  expect(rows.map(r => [r.engPremisesAddressJson, r.chiPremisesAddressJson])).toEqual(
    raw,
  )
  applyOctoberInferredAlsHierarchy(rows, version)
  applyNovemberInferredAlsHierarchy(rows, version)
  applyDecemberInferredAlsHierarchy(rows, version)
  const distinct = consolidateEquivalentHkgovAlsPremises(rows).rows
  finishReviewedAlsPremiseRetentions(distinct)
  applyOctoberInferredAlsHierarchy(distinct, version)
  applyNovemberInferredAlsHierarchy(distinct, version)
  applyDecemberInferredAlsHierarchy(distinct, version)
  return distinct
}

test('December reconciliations preserve fronts, named buildings and university parentage across inspected deliveries', async () => {
  for (const dir of (await readdir('data/hkgov/dpo/ALS'))
    .filter(d => d.endsWith('ALS-GeoJSON'))
    .sort()) {
    const version = `${dir.slice(0, 4)}-${dir.slice(4, 6)}-${dir.slice(6, 8)}.0`
    if (version < '2024-12-12.0') continue
    const rows = prepare(await inputs(dir), version)
    expect(new Set(rows.map(r => r.id)).size).toBe(rows.length)
    for (const rule of fixture.rules)
      expect(
        rows.filter(r => r.id === rule.canonicalId),
        `${version}: ${rule.id}`,
      ).toHaveLength(1)
    const row = (n: number) =>
      rows.find(
        r =>
          r.id ===
          fixture.rules.find(
            r => 'entry' in r.externalEvidence && r.externalEvidence.entry === n,
          )!.canonicalId,
      )!
    expect(row(1).id).not.toBe(row(5).id)
    expect(row(1).enStreetNumberFrom).toBe('250')
    expect(row(1).enStreetNumberTo).toBe('254')
    expect(row(5).enStreetNumberFrom).toBe('252')
    expect(row(2).enStreetNumberFrom).toBe('3')
    expect(row(6).enStreetNumberFrom).toBe('11')
    expect(row(2).id).not.toBe(row(6).id)
    expect(row(9).enBuildingName).toBe('LINDA VISTA')
    expect(row(10).enBuildingName).toBe('LOK YUEN HOUSE')
    expect(row(10).enEstateName).toBeNull()
    for (const n of [11, 13]) {
      expect(row(n).enEstateName).toBe('SEASONS MONARCH')
      expect(row(n).enBlockNumber).toBe(n === 11 ? '71' : '72')
      expect(row(n).enStreetName).toBe('KAM TIN ROAD')
      expect(row(n).enStreetNumberFrom).toBe('183')
      expect(row(n).enVillageName).toBeNull()
    }
    expect(row(14).enBuildingName).toBe('FU TUNG MARKET')
    if (version === '2024-12-12.0')
      expect(row(16).enBuildingName).toContain('HOTEL EASE ACCESS')
    else expect(row(16).enBuildingName).toBeTruthy()
    expect(row(17).enEstateName).toBe('KAI FAT HOUSE')
    expect(row(3).parentAddressId).toBe(row(20).id)
    expect(row(20).id).not.toBe(row(21).id)
    const decision = fixture.coalescences[0]!
    const owner = rows.find(r => r.id === decision.canonicalId)!
    expect(owner.enBuildingName).toBe('HIN TIP HOUSE')
    expect(
      JSON.parse(owner.sources).hkgovAlsReviewedIdentityCoalescence.aliasIds,
    ).toEqual(decision.aliasIds)
    expect(rows.some(r => decision.aliasIds.includes(r.id))).toBe(false)
  }
}, 240_000)

test('December human decisions are explicit; changed evidence fails closed', async () => {
  expect(
    fixture.triage.filter(t => t.handling === 'investigate').map(t => t.entry),
  ).toEqual([])
  expect(
    fixture.triage.filter(t => t.handling === 'approve-retirement').map(t => t.entry),
  ).toEqual([12, 19])
  expect(
    fixture.rules.find(
      r => r.canonicalId === 'ss-4430944c-3403-5390-83ee-4c678cf19de3',
    )!.authority,
  ).toContain('User decision')
  const dir = (await readdir('data/hkgov/dpo/ALS')).find(
    d => d.startsWith('20241212-') && d.endsWith('ALS-GeoJSON'),
  )!
  const features = await inputs(dir)
  const guard = fixture.sourceGuards.find(
    g => g.assertions.find(a => a.version === '2024-12-12.0')!.hashes.length,
  )!
  const changed = features.find(
    f =>
      f.sourceFile === guard.sourceFile &&
      f.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId ===
        guard.csu,
  )!
  changed.feature.geometry!.coordinates![0]! += 0.01
  expect(() => validateDecemberInferredAlsSources(features, '2024-12-12.0')).toThrow(
    'source evidence changed',
  )
  expect(() => validateDecemberInferredAlsSources(features, '2026-09-01.0')).toThrow(
    'unreviewed source release',
  )
})

const validateOctoberInferredAlsSources = (
  rows: Parameters<typeof validateReviewedAlsSources>[0],
  version: string,
) =>
  validateReviewedAlsSources(
    rows,
    version,
    'hkgov-dpo-address-october-deletion-retentions',
  )
const validateNovemberInferredAlsSources = (
  rows: Parameters<typeof validateReviewedAlsSources>[0],
  version: string,
) =>
  validateReviewedAlsSources(
    rows,
    version,
    'hkgov-dpo-address-november-deletion-retentions',
  )
const validateDecemberInferredAlsSources = (
  rows: Parameters<typeof validateReviewedAlsSources>[0],
  version: string,
) =>
  validateReviewedAlsSources(
    rows,
    version,
    'hkgov-dpo-address-december-deletion-retentions',
  )

const applyDecemberInferredAlsHierarchy = (
  rows: Parameters<typeof applyReviewedAlsParents>[0],
  version: string,
) => {
  applyDecemberInferredAlsHierarchySpecialised(rows, version)
  applyReviewedAlsParents(
    rows,
    version,
    'hierarchy',
    'hkgov-dpo-address-december-deletion-retentions',
  )
}

const applyOctoberInferredAlsHierarchy = (
  rows: Parameters<typeof applyReviewedAlsParents>[0],
  version: string,
) =>
  applyReviewedAlsParents(
    rows,
    version,
    'hierarchy',
    'hkgov-dpo-address-october-deletion-retentions',
  )

const applyNovemberInferredAlsHierarchy = (
  rows: Parameters<typeof applyReviewedAlsParents>[0],
  version: string,
) =>
  applyReviewedAlsParents(
    rows,
    version,
    'hierarchy',
    'hkgov-dpo-address-november-deletion-retentions',
  )
