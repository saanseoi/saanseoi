import { applyReviewedAlsParents } from './hkgovAlsReviewProgram'
import { validateReviewedAlsSources } from './hkgovAlsReviewProgram'
import retirements from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-approved-retirements.json'
import { buildAlsDeletionReport } from './hkgovAlsDeletionPreflight'
import type { AlsMembership, AlsMembershipAddress } from './hkgovAlsMembership'
import { normaliseAddressRowForPipeline } from '@repo/core/pipeline/services/addresses/normalisation'
import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-october-deletion-retentions.json'
import { readAls3dFeatures } from './hkgovAls3d'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { consolidateEquivalentHkgovAlsPremises } from './hkgovAlsEvidence'
import {
  applyReviewedAlsPremiseRetentions,
  finishReviewedAlsPremiseRetentions,
  retainReviewedAlsPremises,
} from './hkgovAlsReviewedPremiseRetentions'

import type { HkgovAlsSourceFeature } from './hkgovAlsTypes'

const rules = fixture.rules as unknown as NonNullable<
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
async function inputs(dir: string) {
  const features: HkgovAlsSourceFeature[] = []
  for (const sourceFile of new Set(fixture.sourceGuards.map(g => g.sourceFile))) {
    const csus = new Set(
      fixture.sourceGuards.filter(g => g.sourceFile === sourceFile).map(g => g.csu),
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
  const distinct = consolidateEquivalentHkgovAlsPremises(rows).rows
  finishReviewedAlsPremiseRetentions(distinct)
  applyOctoberInferredAlsHierarchy(distinct, version)
  return distinct
}

test('October reviewed decisions preserve identity, frontage and parent specificity across inspected releases', async () => {
  for (const dir of (await readdir('data/hkgov/dpo/ALS'))
    .filter(d => d.endsWith('ALS-GeoJSON'))
    .sort()) {
    const version = `${dir.slice(0, 4)}-${dir.slice(4, 6)}-${dir.slice(6, 8)}.0`
    if (version < '2024-10-18.0') continue
    const rows = prepare(await inputs(dir), version)
    for (const rule of rules)
      expect(
        rows.filter(r => r.id === rule.canonicalId),
        `${version}: ${rule.id}`,
      ).toHaveLength(1)
    expect(new Set(rows.map(r => r.id)).size).toBe(rows.length)
    const row = (n: number) =>
      rows.find(
        r =>
          r.id ===
          rules.find(
            r => r.id === `october-2024-inference-${String(n).padStart(2, '0')}`,
          )!.canonicalId,
      )!
    for (const [child, parent] of [
      [4, 55],
      [10, 50],
      [43, 51],
      [30, 52],
    ]) {
      expect(row(child!).parentAddressId).toBe(row(parent!).id)
      expect(row(child!).curatedGranularity).toBe('building')
      expect(row(child!).id).not.toBe(row(parent!).id)
    }
    expect(rows.filter(r => r.parentAddressId === row(54).id)).toHaveLength(14)
    const wings = rows.filter(r => r.parentAddressId === row(52).id)
    expect(wings).toHaveLength(2)
    expect(new Set(wings.map(r => r.id)).size).toBe(2)
    expect(row(49).curatedGranularity).toBe('complex')
    expect(row(55).curatedGranularity).toBe('phase')
    expect(normaliseAddressRowForPipeline(row(55)).base.granularity).toBe('phase')
    expect(row(37).enBuildingName).toBe('CTF LIFE TOWER')
    expect(row(39).enBuildingName).toBe('UPPER LIVING')
    expect(row(29).enBlockDescriptor).toBe('HSE')
    expect(row(29).enBlockNumber).toBe('A')
    expect(row(27).enStreetNumberFrom).toBe('8')
    expect(row(42).enStreetNumberFrom).toBe('6')
    for (const group of fixture.groups) {
      for (const id of group.childIds) {
        const child = rows.find(r => r.id === id || r.identityAlias === id)
        if (!child) continue // Some publisher children disappear in later releases.
        expect(child.id).not.toBe(group.parentId)
        expect(child.parentAddressId).toBe(group.parentId)
      }
    }
  }
}, 240_000)

test('only entry 28 retires and evidence changes fail closed', async () => {
  expect(
    fixture.triage.filter(t => t.handling === 'approve-retirement').map(t => t.entry),
  ).toEqual([28])
  expect(fixture.triage.filter(t => t.handling === 'investigate')).toHaveLength(0)
  expect(rules).toHaveLength(54)
  const dir = (await readdir('data/hkgov/dpo/ALS')).find(
    d => d.startsWith('20241018-') && d.endsWith('ALS-GeoJSON'),
  )!
  const features = await inputs(dir)
  const before = structuredClone(features)
  expect(retainReviewedAlsPremises(features, '2024-09-03.0', rules).size).toBe(0)
  expect(features).toEqual(before)
  const guard = fixture.sourceGuards.find(
    g => g.assertions.find(a => a.version === '2024-10-18.0')!.hashes.length,
  )!
  const feature = features.find(
    f =>
      f.sourceFile === guard.sourceFile &&
      f.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId ===
        guard.csu,
  )!
  feature.feature.geometry!.coordinates![0]! += 0.01
  expect(() => validateOctoberInferredAlsSources(features, '2024-10-18.0')).toThrow(
    'source evidence changed',
  )
  expect(() => validateOctoberInferredAlsSources(before, '2026-09-01.0')).toThrow(
    'unreviewed source release',
  )
})

test('October retirement approval require the exact reviewed identities and evidence', () => {
  const decision = retirements.decisions.find(
    d => d.id === 'october-2024-reviewed-substation-retirement',
  )!
  const before: AlsMembership = {
    schemaVersion: 1,
    sourceVersion: '2024-09-03.0',
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
    sourceVersion: '2024-10-18.0',
    addresses: [],
    collections: [],
    sources: [],
    aliases: [],
  }
  const approved = buildAlsDeletionReport(before, after)
  expect(approved.requiresReview).toBe(false)
  expect(approved.reviewedRetirements.length).toBe(1)
  const changed = structuredClone(before)
  changed.addresses[0]!.coordinates![0] += 0.01
  expect(buildAlsDeletionReport(changed, after).requiresReview).toBe(true)
  expect(
    buildAlsDeletionReport(
      { ...before, sourceVersion: '2024-09-01.0' },
      { ...after, sourceVersion: '2024-09-03.0' },
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
