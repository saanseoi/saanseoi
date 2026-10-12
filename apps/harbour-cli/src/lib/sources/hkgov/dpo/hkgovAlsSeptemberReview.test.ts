import { applyReviewedAlsDerivedHierarchy as applySeptemberReviewedAlsHierarchy } from './hkgovAlsReviewHierarchy'
import { validateReviewedAlsSources } from './hkgovAlsReviewProgram'
import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-september-deletion-retentions.json'
import retirements from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-approved-retirements.json'
import { readAls3dFeatures } from './hkgovAls3d'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { consolidateEquivalentHkgovAlsPremises } from './hkgovAlsEvidence'
import {
  applyReviewedAlsPremiseRetentions,
  finishReviewedAlsPremiseRetentions,
  retainReviewedAlsPremises,
} from './hkgovAlsReviewedPremiseRetentions'

import type { HkgovAlsSourceFeature } from './hkgovAlsTypes'
import { buildAlsDeletionReport } from './hkgovAlsDeletionPreflight'
import type { AlsMembership, AlsMembershipAddress } from './hkgovAlsMembership'

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
  validateSeptemberReviewedAlsSources(features, version)
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
  applySeptemberReviewedAlsHierarchy(rows, version)
  const distinct = consolidateEquivalentHkgovAlsPremises(rows).rows
  finishReviewedAlsPremiseRetentions(distinct)
  applySeptemberReviewedAlsHierarchy(distinct, version)
  return distinct
}

test('review preserves the 43 reconciled identities and independent premises across all remaining deliveries', async () => {
  for (const dir of (await readdir('data/hkgov/dpo/ALS'))
    .filter(d => d.endsWith('ALS-GeoJSON'))
    .sort()) {
    const version = `${dir.slice(0, 4)}-${dir.slice(4, 6)}-${dir.slice(6, 8)}.0`
    if (version < '2024-09-03.0') continue
    const originals = await inputs(dir)
    const before = JSON.stringify(originals)
    const rows = prepare(structuredClone(originals), version)
    expect(JSON.stringify(originals)).toBe(before)
    for (const rule of rules.filter(r => r.retain))
      expect(
        rows.filter(r => r.id === rule.canonicalId).length,
        `${version}: ${rule.id}`,
      ).toBe(1)
    expect(new Set(rows.map(r => r.id)).size).toBe(rows.length)
    const byRule = (id: string) =>
      rows.find(r => JSON.parse(r.sources).hkgovAlsReviewedPremiseRetention?.id === id)!
    expect(byRule('september-2024-review-03').enBuildingName).toBe('GET NICE CENTRE')
    expect(
      rows.some(
        r =>
          r.hkgovCsuId === '3695618842P20050615' &&
          r.enStreetNumberFrom === '272' &&
          r.enBuildingName === 'CHINACHEM HUNG HOM CENTRE',
      ),
    ).toBe(false)
    const station = byRule('september-2024-fire-station-complex')
    expect(station.curatedGranularity).toBe('complex')
    expect(byRule('september-2024-review-30').parentAddressId).toBe(station.id)
    const wong = byRule('september-2024-review-31')
    expect([wong.enStreetNumberFrom, wong.enStreetNumberTo]).toEqual(['84', '90'])
    for (const group of fixture.groups) {
      const parent = rows.find(r => r.id === group.parentId)!
      expect(parent).toBeDefined()
      const children = rows.filter(r => r.parentAddressId === parent.id)
      expect(children.length).toBeGreaterThan(0)
      expect(children.every(r => r.curatedGranularity === group.childGranularity)).toBe(
        true,
      )
    }
  }
}, 240_000)

test('review is bounded, changed publisher evidence fails closed, and only the two approved records retire', async () => {
  const dir = (await readdir('data/hkgov/dpo/ALS')).find(
    d => d.startsWith('20240903-') && d.endsWith('ALS-GeoJSON'),
  )!
  const features = await inputs(dir)
  const untouched = structuredClone(features)
  expect(retainReviewedAlsPremises(untouched, '2024-09-02.0', rules).size).toBe(0)
  expect(untouched).toEqual(features)
  const guard = fixture.sourceGuards[0]!
  const changed = features.find(
    f =>
      f.sourceFile === guard.sourceFile &&
      f.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId ===
        guard.csu,
  )!
  changed.feature.geometry!.coordinates![0]! += 0.01
  expect(() => validateSeptemberReviewedAlsSources(features, '2024-09-03.0')).toThrow(
    'source evidence changed',
  )
  expect(
    retirements.decisions
      .find(d => d.id === 'september-2024-shui-chun-reviewed-retirements')!
      .previousAddresses.map(a => a.id),
  ).toEqual([
    'ss-a5ec2486-4b0f-562e-9c86-1e606164bda3',
    'ss-ed688b6c-20c9-5f8e-9aa9-64c9eee31143',
  ])
})

test('September retirement approvals require the exact reviewed identities and evidence', () => {
  const decision = retirements.decisions.find(
    d => d.id === 'september-2024-shui-chun-reviewed-retirements',
  )!
  const before: AlsMembership = {
    schemaVersion: 1,
    sourceVersion: '2024-09-02.0',
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
    sourceVersion: '2024-09-03.0',
    addresses: [],
    collections: [],
    sources: [],
    aliases: [],
  }
  const approved = buildAlsDeletionReport(before, after)
  expect(approved.requiresReview).toBe(false)
  expect(approved.reviewedRetirements.length).toBe(2)
  const changed = structuredClone(before)
  changed.addresses[0]!.coordinates![0] += 0.01
  expect(buildAlsDeletionReport(changed, after).requiresReview).toBe(true)
  expect(
    buildAlsDeletionReport(
      { ...before, sourceVersion: '2024-09-01.0' },
      { ...after, sourceVersion: '2024-09-02.0' },
    ).requiresReview,
  ).toBe(true)
})

const validateSeptemberReviewedAlsSources = (
  rows: Parameters<typeof validateReviewedAlsSources>[0],
  version: string,
) =>
  validateReviewedAlsSources(
    rows,
    version,
    'hkgov-dpo-address-september-deletion-retentions',
  )
