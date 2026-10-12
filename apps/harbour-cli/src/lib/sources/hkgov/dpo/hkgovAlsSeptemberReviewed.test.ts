import { classifyReviewedAlsPremises } from './hkgovAlsReviewHierarchy'
import { applyReviewedAlsIdentityAliases } from './hkgovAlsReviewProgram'

import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-september-2025-reviewed-retentions.json'
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

test('September decisions preserve names, selected identities and distinct buildings under complexes', async () => {
  const dir = (await readdir('data/hkgov/dpo/ALS')).find(
    d => d.startsWith('20250903') && d.endsWith('ALS-GeoJSON'),
  )!
  const rows = prepare(await inputs(dir), '2025-09-03.0')
  const aliases = applySeptemberReviewedIdentityAliases(rows, '2025-09-03.0')
  const get = (n: number) =>
    rows.find(
      r =>
        r.id === rules.find(r => r.id === `september-2025-reviewed-${n}`)!.canonicalId,
    )!
  for (const rule of rules)
    expect(
      rows.filter(r => r.id === rule.canonicalId),
      rule.id,
    ).toHaveLength(1)
  expect(get(4).enStreetNumberFrom).toBe('10')
  expect(get(4).enStreetNumberTo).toBe('12')
  expect(get(6).enBuildingName).toBe('TOWNPLACE WEST KOWLOON')
  expect(get(9).enBuildingName).toBe('DE HUA TOWER')
  expect(get(10).curatedGranularity).toBe('complex')
  expect(get(12).enBuildingName).toBe('MEGA GATEWAY')
  expect(get(16).enBuildingName).toBe('MU88')
  expect(get(17).enBuildingName).toBe('SOHO WEST')
  expect(get(18).enBuildingName).toBe('THE CLOUD')
  expect(get(24).enBuildingName).toBe('SIX PACIFIC PLACE')
  expect(get(25).curatedGranularity).toBe('building')
  expect(get(28).enBuildingName).toBe('KEW GREEN HOTEL MONGKOK')
  expect(get(28).zhHantBuildingName).toBe('旺角睿景酒店')
  for (const d of fixture.identityReconciliations)
    for (const id of d.aliasIds) expect(aliases.get(id)).toBe(d.canonicalId)
})

test('Tsing Fung shop frontages remain distinct units beneath the combined building', () => {
  const parentId = 'ss-2bc8efc1-3ac0-578a-9bd4-2e2ceb2da35e'
  const rows = [
    { id: parentId },
    ...[
      ['ss-fce72898-af79-51db-be6c-6247d0a7044f', '12'],
      ['ss-632d1f31-678e-5d10-b9bc-625cc645172d', '10'],
    ].map(([id, number]) => ({
      id,
      enBuildingName: 'TSING FUNG BUILDING',
      enStreetName: 'TSING FUNG STREET',
      enStreetNumberFrom: number,
    })),
  ] as Parameters<typeof applySeptember2025ReviewedShops>[0]
  applySeptember2025ReviewedShops(rows, '2025-09-03.0')
  for (const r of rows.slice(1)) {
    expect(r.curatedGranularity).toBe('unit')
    expect(r.parentAddressId).toBe(parentId)
  }
  rows[1]!.enStreetName = 'OTHER STREET'
  expect(() => applySeptember2025ReviewedShops(rows, '2025-09-03.0')).toThrow()
})

test('returned reviewed frontages preserve the selected identity and publisher evidence', async () => {
  const dir = (await readdir('data/hkgov/dpo/ALS')).find(
    d => d.startsWith('20250903') && d.endsWith('ALS-GeoJSON'),
  )!
  const rows = prepare(await inputs(dir), '2025-09-03.0')
  const decision = fixture.identityReconciliations.find(d => d.entry === 7)!
  const owner = rows.find(r => r.id === decision.canonicalId)!
  for (const guard of decision.previousGuards)
    rows.push({
      ...owner,
      id: guard.id,
      enFormattedAddress: guard.enFormattedAddress,
      zhHantFormattedAddress: guard.zhHantFormattedAddress,
      geometry: JSON.stringify({ type: 'Point', coordinates: guard.coordinates }),
      publisherSource: JSON.stringify({ sources: [{ returned: true }] }),
    })
  const aliases = applySeptemberReviewedIdentityAliases(rows, '2025-11-04.0')
  for (const id of decision.aliasIds) {
    expect(rows.some(r => r.id === id)).toBe(false)
    expect(aliases.get(id)).toBe(owner.id)
  }
  const evidence = JSON.parse(owner.sources)
    .hkgovAlsSeptemberReviewedIdentityReconciliation.returnedPublisherAssertions
  expect(evidence).toHaveLength(2)
  expect(JSON.parse(evidence[0].publisherSource).sources[0].returned).toBe(true)
  rows.push({
    ...owner,
    id: decision.aliasIds[0]!,
    enFormattedAddress: 'A DIFFERENT PREMISE',
  })
  expect(() => applySeptemberReviewedIdentityAliases(rows, '2025-11-04.0')).toThrow()
})

const applySeptemberReviewedIdentityAliases = (
  rows: Parameters<typeof applyReviewedAlsIdentityAliases>[0],
  version: string,
) =>
  applyReviewedAlsIdentityAliases(
    rows,
    version,
    'hkgov-dpo-address-september-2025-reviewed-retentions',
  )

const applySeptember2025ReviewedShops = (
  rows: Parameters<typeof classifyReviewedAlsPremises>[0],
  version: string,
) => classifyReviewedAlsPremises(rows, version, 'shops', 'september2025Shops')
