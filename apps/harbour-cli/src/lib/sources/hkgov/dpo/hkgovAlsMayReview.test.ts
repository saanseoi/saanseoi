import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-may-deletion-retentions.json'
import { readAls3dFeatures } from './hkgovAls3d'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { consolidateEquivalentHkgovAlsPremises } from './hkgovAlsEvidence'
import {
  retainReviewedAlsPremises,
  applyReviewedAlsPremiseRetentions,
  finishReviewedAlsPremiseRetentions,
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
  const out: HkgovAlsSourceFeature[] = []
  for (const file of new Set(rules.map(r => r.sourceFile))) {
    const csus = new Set(rules.filter(r => r.sourceFile === file).flatMap(r => r.csus))
    for await (const f of readAls3dFeatures(`data/hkgov/dpo/ALS/${dir}/${file}`)) {
      if (
        f.featureIndexOneBased !== 1 &&
        !csus.has(
          f.feature.properties.Address.PremisesAddress.BuildingCsuInformation?.CsuId ??
            '',
        )
      )
        continue
      const feature = structuredClone(f.feature)
      feature.geometry.coordinates = feature.geometry.coordinates.slice(0, 2)
      out.push({
        sourceFile: file,
        featureIndexOneBased: f.featureIndexOneBased,
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
      })
    }
  }
  return out
}
function prepare(features: HkgovAlsSourceFeature[], version: string) {
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
  applyReviewedAlsPremiseRetentions(rows, applications)
  const distinct = consolidateEquivalentHkgovAlsPremises(rows).rows
  finishReviewedAlsPremiseRetentions(distinct)
  return distinct
}
test('May decisions preserve all 18 identities, building levels and distinct generic premises across source deliveries', async () => {
  for (const dir of (await readdir('data/hkgov/dpo/ALS'))
    .filter(d => d.endsWith('ALS-GeoJSON'))
    .sort()) {
    const version = `${dir.slice(0, 4)}-${dir.slice(4, 6)}-${dir.slice(6, 8)}.0`
    if (version < '2025-05-22.0') continue
    const features = await inputs(dir)
    const rows = prepare(features, version)
    expect(new Set(rows.map(r => r.id)).size).toBe(rows.length)
    for (const rule of rules) {
      const matches = rows.filter(r => r.id === rule.canonicalId)
      expect(matches, `${version}: ${rule.id}`).toHaveLength(1)
      expect(String(matches[0]!.curatedGranularity)).toBe(
        String(rule.patch.granularity),
      )
      expect(matches[0]!.identityAlias).not.toBe(matches[0]!.id)
    }
    const byCase = (n: number) =>
      rows.find(r => r.id === fixture.review.find(e => e.number === n)!.previous.id)!
    expect(byCase(13).enStreetNumberFrom).toBe('11')
    expect(byCase(13).enStreetNumberTo).toBe('15')
    expect(byCase(6).enBuildingName).toBe('EC HEALTHCARE TOWER')
    expect(byCase(17).enBuildingName).toBe('HOLLYWOOD HILL')
    for (const n of [5, 7, 8, 9, 11, 18]) {
      expect(byCase(n).enBuildingName).toBe('LOK YUEN HOUSE')
      expect(byCase(n).enEstateName).toBeNull()
    }
    if (version === '2025-05-22.0') {
      for (const n of [3, 12, 14, 16, 19]) {
        const e = fixture.review.find(e => e.number === n)!
        expect(
          rows.some(r => r.id === e.candidates[0]!.address.id),
          `distinct broader/unnamed candidate ${n}`,
        ).toBe(true)
      }
      const changed = structuredClone(features)
      const f = changed.find(
        f =>
          f.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation
            ?.CsuId === rules.find(r => r.id === 'may-2025-reviewed-6')!.csus[0],
      )!
      f.feature.geometry!.coordinates![0]! += 0.001
      expect(() => retainReviewedAlsPremises(changed, version, rules)).toThrow()
    }
  }
}, 120000)

test('Wong’s Factory Building retirement approval rejects changed predecessor evidence', async () => {
  const { buildAlsDeletionReport } = await import('./hkgovAlsDeletionPreflight')
  const { default: approvals } = await import(
    '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-approved-retirements.json'
  )
  const decision = approvals.decisions.find(
    d => d.id === 'may-2025-wongs-factory-building-closure',
  )!
  const addresses = structuredClone(decision.previousAddresses).map(a => ({
    ...a,
    coordinates: [a.coordinates[0]!, a.coordinates[1]!] as [number, number],
  }))
  const before = {
    schemaVersion: 1 as const,
    sourceVersion: '2025-04-26.0',
    addresses,
    collections: [],
    aliases: [],
    sources: addresses.flatMap(a =>
      a.sourceIds.map(id => ({ id, kind: '2d' as const, canonicalIds: [a.id] })),
    ),
  }
  const after = {
    schemaVersion: 1 as const,
    sourceVersion: '2025-05-22.0',
    addresses: [],
    collections: [],
    aliases: [],
    sources: [],
  }
  expect(buildAlsDeletionReport(before, after).requiresReview).toBeFalse()
  expect(buildAlsDeletionReport(before, after).reviewedRetirements).toHaveLength(1)
  before.addresses[0]!.coordinates = [114, 22]
  expect(buildAlsDeletionReport(before, after).requiresReview).toBeTrue()
})
