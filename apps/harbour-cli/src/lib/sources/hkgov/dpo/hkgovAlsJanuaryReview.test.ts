import { recordReviewedAlsCoalescences as applyDecemberInferredAlsHierarchySpecialised } from './hkgovAlsReviewHierarchy'
import { applyReviewedAlsParents } from './hkgovAlsReviewProgram'
import { validateReviewedAlsSources } from './hkgovAlsReviewProgram'
import january from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-january-deletion-retentions.json'

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
  ...january.rules,
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
  ...january.sourceGuards,
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
              coordinates: f.feature.geometry.coordinates
                ? [
                    f.feature.geometry.coordinates[0]!,
                    f.feature.geometry.coordinates[1]!,
                  ]
                : undefined,
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
  validateJanuaryInferredAlsSources(features, version)
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
  applyJanuaryInferredAlsHierarchy(rows, version)
  const distinct = consolidateEquivalentHkgovAlsPremises(rows).rows
  finishReviewedAlsPremiseRetentions(distinct)
  applyOctoberInferredAlsHierarchy(distinct, version)
  applyNovemberInferredAlsHierarchy(distinct, version)
  applyDecemberInferredAlsHierarchy(distinct, version)
  applyJanuaryInferredAlsHierarchy(distinct, version)
  return distinct
}

test('January preserves names, separate frontages and building specificity across inspected deliveries', async () => {
  for (const dir of (await readdir('data/hkgov/dpo/ALS'))
    .filter(d => d.endsWith('ALS-GeoJSON'))
    .sort()) {
    const version = `${dir.slice(0, 4)}-${dir.slice(4, 6)}-${dir.slice(6, 8)}.0`
    if (version < '2025-01-23.0') continue
    const rows = prepare(await inputs(dir), version)
    expect(new Set(rows.map(r => r.id)).size).toBe(rows.length)
    for (const rule of january.rules)
      expect(
        rows.filter(r => r.id === rule.canonicalId),
        `${version}: ${rule.id}`,
      ).toHaveLength(1)
    const row = (n: number) =>
      rows.find(
        r =>
          r.id ===
          january.rules.find(
            r => 'entry' in r.externalEvidence && r.externalEvidence.entry === n,
          )!.canonicalId,
      )!
    expect(row(1).enBuildingName).toBe('THE GRID')
    expect(row(2).enBuildingName).toBe('GREENWOOD TOWER 3')
    expect(row(14).enBuildingName).toBe('PO LOK YUEN')
    expect(row(18).enBuildingName).toBe('BAL RESIDENCE')
    expect(row(26).enBuildingName).toBe('HONG KONG LI-NING BUILDING')
    expect(row(32).enBuildingName).toBe('EVEREST RESIDENCE')
    const siu = [5, 7, 17, 21, 25, 29, 31, 33].map(row)
    expect(new Set(siu.map(r => r.id)).size).toBe(8)
    for (const [entry, number] of [
      [6, 2],
      [13, 6],
      [41, 1],
      [42, 5],
    ]) {
      const building = row(entry!)
      expect(building.enBuildingName).toBe(`Silicon Hill Greenwood Tower ${number}`)
      expect(building.zhHantBuildingName).toBe('Silicon Hill 翠景閣第二座')
      const decision = january.rules.find(r => r.canonicalId === building.id)!
      expect(building.geometry).toBe(
        JSON.stringify({ type: 'Point', coordinates: decision.patch.coordinates }),
      )
    }
    expect(new Set([6, 13, 41, 42].map(n => row(n).id)).size).toBe(4)
    const daiFu = rows.find(r => r.id === 'ss-e8d4adaf-bde0-5240-90de-49eeb92c8d69')!
    expect(daiFu.enBuildingName).toBeNull()
    expect(daiFu.enStreetNumberFrom).toBe('7')
    expect(row(34).id).not.toBe(row(35).id)
    expect(row(44).enEstateName).toBe('BLACK POINT POWER STATION')
    expect(row(49).enEstateName).toBe('TAM GARDENS')
    expect(row(47).id).not.toBe(row(48).id)
    const tower = rows.find(
      r => r.enEstateName === 'YOHO WEST' && r.enBlockNumber === '2A',
    )!
    expect(tower).toBeTruthy()
    expect(tower.parentAddressId).toBe(row(48).id)
    expect(tower.id).not.toBe(row(47).id)
    expect(tower.id).not.toBe(row(48).id)
    for (const group of january.groups)
      for (const child of group.childIds) {
        const c = rows.find(r => r.id === child)!
        expect(c.id).not.toBe(group.parentId)
        expect(c.parentAddressId).toBe(group.parentId)
      }
  }
}, 240_000)

test('January human decisions resolve all losses and changed publisher evidence fails closed', async () => {
  expect(
    january.triage.filter(t => t.handling === 'investigate').map(t => t.entry),
  ).toEqual([])
  expect(
    january.triage.filter(t => t.handling === 'approve-retirement').map(t => t.entry),
  ).toEqual([3, 9, 15, 22, 23, 27, 36, 40, 45, 46])
  const dir = (await readdir('data/hkgov/dpo/ALS')).find(
    d => d.startsWith('20250123-') && d.endsWith('ALS-GeoJSON'),
  )!
  const features = await inputs(dir)
  const guard = january.sourceGuards.find(
    g => g.assertions.find(a => a.version === '2025-01-23.0')!.hashes.length,
  )!
  const changed = features.find(
    f =>
      f.sourceFile === guard.sourceFile &&
      f.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId ===
        guard.csu,
  )!
  changed.feature.geometry!.coordinates![0]! += 0.01
  expect(() => validateJanuaryInferredAlsSources(features, '2025-01-23.0')).toThrow(
    'source evidence changed',
  )
  expect(() => validateJanuaryInferredAlsSources(features, '2026-09-01.0')).toThrow(
    'unreviewed source release',
  )
})

const validateJanuaryInferredAlsSources = (
  rows: Parameters<typeof validateReviewedAlsSources>[0],
  version: string,
) =>
  validateReviewedAlsSources(
    rows,
    version,
    'hkgov-dpo-address-january-deletion-retentions',
  )
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

const applyJanuaryInferredAlsHierarchy = (
  rows: Parameters<typeof applyReviewedAlsParents>[0],
  version: string,
) =>
  applyReviewedAlsParents(
    rows,
    version,
    'hierarchy',
    'hkgov-dpo-address-january-deletion-retentions',
  )

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
