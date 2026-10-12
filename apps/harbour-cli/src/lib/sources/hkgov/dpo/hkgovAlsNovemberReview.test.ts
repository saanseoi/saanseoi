import { applyReviewedAlsParents } from './hkgovAlsReviewProgram'
import { validateReviewedAlsSources } from './hkgovAlsReviewProgram'
import retirements from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-approved-retirements.json'
import { buildAlsDeletionReport } from './hkgovAlsDeletionPreflight'
import type { AlsMembership, AlsMembershipAddress } from './hkgovAlsMembership'
import october from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-october-deletion-retentions.json'

import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-november-deletion-retentions.json'
import { readAls3dFeatures } from './hkgovAls3d'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { consolidateEquivalentHkgovAlsPremises } from './hkgovAlsEvidence'
import {
  applyReviewedAlsPremiseRetentions,
  finishReviewedAlsPremiseRetentions,
  retainReviewedAlsPremises,
} from './hkgovAlsReviewedPremiseRetentions'

import type { HkgovAlsSourceFeature } from './hkgovAlsTypes'

const rules = [...october.rules, ...fixture.rules] as unknown as NonNullable<
  Parameters<typeof retainReviewedAlsPremises>[2]
>
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
const guards = [...october.sourceGuards, ...fixture.sourceGuards]
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
  const distinct = consolidateEquivalentHkgovAlsPremises(rows).rows
  finishReviewedAlsPremiseRetentions(distinct)
  applyOctoberInferredAlsHierarchy(distinct, version)
  applyNovemberInferredAlsHierarchy(distinct, version)
  return distinct
}

test('November reviewed decisions retain 59 identities and preserve fronts, houses and parentage across inspected deliveries', async () => {
  for (const dir of (await readdir('data/hkgov/dpo/ALS'))
    .filter(d => d.endsWith('ALS-GeoJSON'))
    .sort()) {
    const version = `${dir.slice(0, 4)}-${dir.slice(4, 6)}-${dir.slice(6, 8)}.0`
    if (version < '2024-11-13.0') continue
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
    expect(row(3).enBuildingName).toBe('METRO SOUTH TOWER 1')
    expect(row(21).enBuildingName).toBe('METRO SOUTH TOWER 2')
    expect(row(2).enStreetName ?? row(2).enVillageName).toBe('CHOI TIP STREET')
    for (const n of [19, 20, 28, 31, 36, 47, 55]) {
      expect(row(n).enEstateName).toBe('PALM SPRINGS')
      expect(row(n).enBlockDescriptor).toBe('HSE')
      expect(row(n).enBlockNumber).toBeTruthy()
      expect(row(n).enVillageNumberFrom).toBeNull()
    }
    const parent = rows.find(
      r =>
        r.id ===
        october.rules.find(r => r.id === 'october-2024-inference-50')!.canonicalId,
    )!
    expect(row(22).parentAddressId).toBe(parent.id)
    expect(row(22).curatedGranularity).toBe('building')
    expect(rows.filter(r => r.id === parent.id)).toHaveLength(1)
    expect(row(1).enStreetNumberFrom).toBe('12')
    expect(row(9).enStreetNumberFrom).toBe('12')
    expect(row(1).enStreetName).not.toBe(row(9).enStreetName)
    expect(row(1).id).not.toBe(row(9).id)
    expect(row(16).enStreetNumberFrom).toBe('430')
    expect(row(56).parentAddressId).toBe(fixture.groups[0]!.parentId)
    expect(row(56).id).not.toBe(fixture.groups[0]!.parentId)
    expect(row(39).enBuildingName).toBeTruthy()
    for (const n of [7, 15, 53, 60]) expect(row(n).id).toBeTruthy()
    expect(row(15).enBlockNumber).toBe('K2')
    expect(row(53).enBlockNumber).toBe('B')
  }
}, 240_000)

test('only three demolished November premises retire and raw drift fails closed', async () => {
  expect(
    fixture.triage.filter(t => t.handling === 'approve-retirement').map(t => t.entry),
  ).toEqual([24, 38, 41])
  const dir = (await readdir('data/hkgov/dpo/ALS')).find(
    d => d.startsWith('20241113-') && d.endsWith('ALS-GeoJSON'),
  )!
  const features = await inputs(dir)
  const guard = fixture.sourceGuards.find(
    g => g.assertions.find(a => a.version === '2024-11-13.0')!.hashes.length,
  )!
  const changed = features.find(
    f =>
      f.sourceFile === guard.sourceFile &&
      f.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId ===
        guard.csu,
  )!
  changed.feature.geometry!.coordinates![0]! += 0.01
  expect(() => validateNovemberInferredAlsSources(features, '2024-11-13.0')).toThrow(
    'source evidence changed',
  )
  expect(() => validateNovemberInferredAlsSources(features, '2026-09-01.0')).toThrow(
    'unreviewed source release',
  )
})

test('November retirement approval requires the exact demolished identities and evidence', () => {
  const decision = retirements.decisions.find(
    d => d.id === 'november-2024-reviewed-demolished-premises',
  )!
  const before: AlsMembership = {
    schemaVersion: 1,
    sourceVersion: '2024-10-18.0',
    addresses: structuredClone(decision.previousAddresses).map(
      (a): AlsMembershipAddress => ({
        ...a,
        coordinates: [a.coordinates[0]!, a.coordinates[1]!],
      }),
    ),
    collections: [],
    aliases: [],
    sources: decision.previousAddresses.flatMap(a =>
      a.sourceIds.map(id => ({ id, kind: '2d' as const, canonicalIds: [a.id] })),
    ),
  }
  const after: AlsMembership = {
    schemaVersion: 1,
    sourceVersion: '2024-11-13.0',
    addresses: [],
    collections: [],
    sources: [],
    aliases: [],
  }
  const approved = buildAlsDeletionReport(before, after)
  expect(approved.requiresReview).toBe(false)
  expect(approved.reviewedRetirements).toHaveLength(3)
  for (const address of before.addresses) {
    const changed = structuredClone(before)
    changed.addresses.find(a => a.id === address.id)!.coordinates![0] += 0.01
    expect(buildAlsDeletionReport(changed, after).requiresReview).toBe(true)
  }
  expect(
    buildAlsDeletionReport(
      { ...before, sourceVersion: '2024-09-03.0' },
      { ...after, sourceVersion: '2024-10-18.0' },
    ).requiresReview,
  ).toBe(true)
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
