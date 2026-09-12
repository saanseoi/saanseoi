import continuity from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-reviewed-continuity-decisions.json'
import { captureAlsPublisherSources } from '@repo/core/pipeline/services/sources/alsSourcePayload'
import { buildAlsMembership } from './hkgovAlsMembership'
import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-reviewed-premise-retentions.json'
import { consolidateEquivalentHkgovAlsPremises } from './hkgovAlsEvidence'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import {
  applyReviewedAlsPremiseRetentions,
  finishReviewedAlsPremiseRetentions,
  retainReviewedAlsPremises,
} from './hkgovAlsReviewedPremiseRetentions'
import type { HkgovAlsSourceFeature } from './hkgovAlsTypes'

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
const decisions = fixture.rules as unknown as NonNullable<
  Parameters<typeof retainReviewedAlsPremises>[2]
>
const allRules = [...fixture.rules, ...continuity.rules]
function prepare(
  features: HkgovAlsSourceFeature[],
  version: string,
  selected = decisions,
) {
  const applications = retainReviewedAlsPremises(features, version, selected)
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
  const originals = rows.map(r => [r.engPremisesAddressJson, r.chiPremisesAddressJson])
  applyReviewedAlsPremiseRetentions(rows, applications)
  expect(rows.map(r => [r.engPremisesAddressJson, r.chiPremisesAddressJson])).toEqual(
    originals,
  )
  const distinct = consolidateEquivalentHkgovAlsPremises(rows).rows
  finishReviewedAlsPremiseRetentions(distinct)
  return distinct
}
const targets = new Set(allRules.flatMap(r => r.csus))

test('all 30 releases preserve identities, restore omissions and separate Tin Wang complex from its houses', async () => {
  let count = 0
  for (const dir of (await readdir('data/hkgov/dpo/ALS'))
    .filter(d => d.endsWith('ALS-GeoJSON'))
    .sort()) {
    const version = `${dir.slice(0, 4)}-${dir.slice(4, 6)}-${dir.slice(6, 8)}.0`
    const features: HkgovAlsSourceFeature[] = []
    for (const sourceFile of new Set(allRules.map(r => r.sourceFile))) {
      const data = await Bun.file(`data/hkgov/dpo/ALS/${dir}/${sourceFile}`).json()
      for (const [i, feature] of data.features.entries()) {
        if (
          targets.has(
            feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId,
          )
        )
          features.push({ feature, sourceFile, featureIndexOneBased: i + 1 })
      }
    }
    const raw = JSON.stringify(features)
    const rows = prepare(
      structuredClone(features),
      version,
      allRules as unknown as typeof decisions,
    )
    expect(JSON.stringify(features)).toBe(raw)
    expect(rows.length).toBe(40)
    expect(new Set(rows.map(r => r.id)).size).toBe(40)
    for (const rule of allRules)
      expect(rows.some(r => r.id === rule.canonicalId)).toBeTrue()
    const complex = rows.find(
      r => r.curatedGranularity === 'complex' && r.enEstateName === 'TIN WANG COURT',
    )!
    expect(complex.enEstateName).toBe('TIN WANG COURT')
    expect(complex.enBuildingName).toBeNull()
    const houses = rows.filter(r => r.parentAddressId === complex.id)
    expect(houses.map(r => r.enBlockNumber).sort()).toEqual(['A', 'B', 'C'])
    expect(houses.find(r => r.enBlockNumber === 'B')?.geometry).toBe(
      '{"type":"Point","coordinates":[114.186855,22.344509]}',
    )
    const el = rows.filter(r => r.enEstateName === 'EL FUTURO')
    expect(el.length).toBe(24)
    expect(el.filter(r => r.enBuildingName?.startsWith('HOUSE ')).length).toBe(22)
    expect(el.find(r => r.enBuildingName === 'TOWER 1')?.zhHantBuildingName).toBe('座1')
    expect(el.find(r => r.enBuildingName === 'TOWER 2')?.zhHantBuildingName).toBe('座2')
    expect(
      rows.find(r => r.enBuildingName === 'THE HARMONIE')?.zhHantBuildingName,
    ).toBe('映築')
    const victoria = rows.filter(r => r.enEstateName?.startsWith('VICTORIA '))
    expect(victoria.map(r => r.enBlockNumber).sort()).toEqual(['A', 'B'])
    expect(victoria.every(r => r.enBuildingName === null)).toBeTrue()
    expect(
      rows.find(r => r.id === 'ss-368ef116-ff81-5a5a-9d72-c97dd7f5b47b')
        ?.enFormattedAddress,
    ).toContain('28 KWAI WING ROAD')
    expect(
      rows.find(r => r.id === 'ss-8e5a2ce8-0f7b-52c9-93c0-0a62f289c416')
        ?.enBuildingName,
    ).toBe('WOFOO JOSEPH LEE STUDENT ACTIVITY CENTRE')
    expect(
      rows.find(r => r.id === 'ss-5339b729-833f-5598-a7c1-244d04f9535f')
        ?.curatedGranularity,
    ).toBe('complex')
    expect(
      rows.find(r => r.id === 'ss-2f1e0c99-1cb1-57f4-91fa-cbd61e251e39')?.enBlockNumber,
    ).toBe('1')
    expect(
      rows.find(r => r.id === 'ss-c7823e0e-6b7b-5a64-a9b8-8ad19aa96bef')?.enBlockNumber,
    ).toBe('2')
    count++
  }
  expect(count).toBe(30)
})

function oneSoho(): HkgovAlsSourceFeature {
  const r = fixture.rules.find(r => r.id === 'one-soho')!
  return {
    feature: structuredClone(
      r.evidence.feature,
    ) as unknown as HkgovAlsSourceFeature['feature'],
    sourceFile: r.sourceFile,
    featureIndexOneBased: 1,
  }
}

test('future releases retain known evidence as unverified; revocation stops new application', () => {
  const version = '2026-09-30.0'
  const row = prepare([oneSoho()], version)[0]!
  expect(
    JSON.parse(row.sources).hkgovAlsReviewedPremiseRetention.curation
      .verificationStatus,
  ).toBe('unverified')
  const rule = structuredClone(fixture.rules.find(r => r.id === 'one-soho')!)
  rule.application.state = 'revoked'
  const decisions = [rule] as unknown as NonNullable<
    Parameters<typeof retainReviewedAlsPremises>[2]
  >
  expect(retainReviewedAlsPremises([oneSoho()], version, decisions).size).toBe(0)
  expect(retainReviewedAlsPremises([oneSoho()], '2024-07-25.0', decisions).size).toBe(1)
})

test('rejects changed evidence and ambiguous matches without modifying the publisher', () => {
  const f = oneSoho()
  f.feature.geometry!.coordinates = [114.5, 22.5]
  expect(() => retainReviewedAlsPremises([f], '2026-09-30.0', decisions)).toThrow(
    'source evidence changed',
  )
  expect(() =>
    retainReviewedAlsPremises([oneSoho(), oneSoho()], '2026-09-30.0', decisions),
  ).toThrow('ambiguous premise evidence')
  expect(retainReviewedAlsPremises([], '2026-09-30.0', decisions).size).toBe(0)
})

test('replays a future omission within its own district', () => {
  const f = oneSoho()
  f.feature.properties!.Address!.PremisesAddress!.BuildingCsuInformation!.CsuId =
    'unrelated'
  const features = [f]
  const applications = retainReviewedAlsPremises(features, '2026-09-30.0', decisions)
  expect(applications.size).toBe(1)
  expect(features.length).toBe(2)
  expect(features[1]!.sourceFile).toBe(
    'hkgov-dpo-address-reviewed-premise-retentions.json',
  )
})

test('membership preserves current raw sources and marks reconstructed addresses as curation evidence', async () => {
  const f = oneSoho()
  f.feature.properties!.Address!.PremisesAddress!.BuildingCsuInformation!.CsuId =
    'unrelated'
  const features = [f]
  const version = '2026-09-30.0'
  const publisherSources = await captureAlsPublisherSources(features, version)
  const rows = prepare(features, version)
  const membership = buildAlsMembership({
    sourceVersion: version,
    rows,
    publisherSources,
    collections: [],
    sources3d: [],
    aliases: new Map(),
  })
  const restored = membership.addresses.find(
    a => a.id === fixture.rules.find(r => r.id === 'one-soho')!.canonicalId,
  )!
  expect(restored.sourceIds).toEqual([])
  expect(
    restored.curations.some(c =>
      c.includes('hkgov-dpo-address-reviewed-premise-retentions.json'),
    ),
  ).toBeTrue()
  expect(membership.sources).toHaveLength(1)
})
