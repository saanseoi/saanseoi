import { classifyReviewedAlsPremises } from './hkgovAlsReviewHierarchy'
import { applyReviewedAlsIdentityAliases } from './hkgovAlsReviewProgram'

import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-august-2025-reviewed-retentions.json'
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

test('August decisions preserve names, selected identities and distinct buildings under complexes', async () => {
  const dir = (await readdir('data/hkgov/dpo/ALS')).find(
    d => d.startsWith('20250813') && d.endsWith('ALS-GeoJSON'),
  )!
  const rows = prepare(await inputs(dir), '2025-08-13.0')
  applyAugustReviewedParents(rows, '2025-08-13.0')
  const aliases = applyAugustReviewedIdentityAliases(rows, '2025-08-13.0')
  const get = (n: number) =>
    rows.find(
      r => r.id === rules.find(r => r.id === `august-2025-reviewed-${n}`)!.canonicalId,
    )!
  for (const rule of rules)
    expect(
      rows.filter(r => r.id === rule.canonicalId),
      rule.id,
    ).toHaveLength(1)
  expect(get(1).enBuildingName).toBe('LEE WANG BUILDING')
  expect(get(4).enBuildingName).toBe('THE UNIT SOHO')
  expect(get(7).enBuildingName).toBe('ARUNA')
  expect(get(8).enBuildingName).toBe('THE STELLAR')
  expect(get(14).enBuildingName).toBe('SOLO WORKSHOPS')
  expect(get(13).enEstateName).toBe('PALM SPRINGS')
  expect(get(13).enFormattedAddress).not.toContain('HSE')
  expect(get(10).curatedGranularity).toBe('complex')
  expect(get(11).parentAddressId).toBe(get(110).id)
  expect(get(15).parentAddressId).toBe(get(150).id)
  expect(get(200).parentAddressId).toBe(get(20).id)
  expect(get(21).enStreetName).toBe('HOI WANG ROAD')
  expect(get(21).curatedGranularity).toBe('complex')
  expect(aliases.get('ss-21e778ac-694a-58f0-be72-7c5190e9308a')).toBe(get(1).id)
  expect(aliases.get('ss-fbaa7241-3cbd-5805-ba18-c4e35192f738')).toBe(get(1).id)
  expect(aliases.get('ss-fac71bcb-a5d8-5f2d-8f93-cb7fb3a40a9a')).toBe(get(21).id)
})

const applyAugustReviewedIdentityAliases = (
  rows: Parameters<typeof applyReviewedAlsIdentityAliases>[0],
  version: string,
) =>
  applyReviewedAlsIdentityAliases(
    rows,
    version,
    'hkgov-dpo-address-august-2025-reviewed-retentions',
  )

const applyAugustReviewedParents = (
  rows: Parameters<typeof classifyReviewedAlsPremises>[0],
  version: string,
) => classifyReviewedAlsPremises(rows, version, 'final-parents', 'parentAssignments')
