import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-september-2025-continuity.json'
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

test('September reuses six existing identity decisions and preserves Cape Collinson continuity', async () => {
  const dir = (await readdir('data/hkgov/dpo/ALS')).find(
    d => d.startsWith('20250903') && d.endsWith('ALS-GeoJSON'),
  )!
  const rows = prepare(await inputs(dir), '2025-09-03.0')
  for (const rule of rules)
    expect(
      rows.filter(r => r.id === rule.canonicalId),
      rule.id,
    ).toHaveLength(1)
  const get = (n: number) =>
    rows.find(
      r =>
        r.id ===
        rules.find(r => r.id === `september-2025-continuity-${n}`)!.canonicalId,
    )!
  expect(get(22).enBuildingName).toBe('GR8 INNO TECH CENTRE')
  expect(get(27).enEstateName).toBe('CAPE COLLINSON CREMATORIUM')
  expect(get(27).curatedGranularity).toBe('complex')
  for (const [n, tower] of [
    [8, 2],
    [14, 3],
    [19, 5],
    [21, 1],
  ])
    expect(get(n!).enBuildingName).toBe(`GRAND CENTRAL TOWER ${tower}`)
})
