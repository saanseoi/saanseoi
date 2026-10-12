import { restoreAlsEstateGaps } from './hkgovAlsEstateGapRestorations'
import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-august-2025-continuity.json'
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
  restoreAlsEstateGaps(rows, version)
  const distinct = consolidateEquivalentHkgovAlsPremises(rows).rows
  finishReviewedAlsPremiseRetentions(distinct)
  return distinct
}
test('August continuity preserves four established identities', async () => {
  const dir = (await readdir('data/hkgov/dpo/ALS')).find(
    d => d.startsWith('20250813') && d.endsWith('ALS-GeoJSON'),
  )!
  const rows = prepare(await inputs(dir), '2025-08-13.0')
  for (const rule of rules)
    expect(
      rows.filter(r => r.id === rule.canonicalId),
      rule.id,
    ).toHaveLength(1)
  const estate = rows.find(
    r => r.id === rules.find(r => r.id === 'august-2025-continuity-19')!.canonicalId,
  )!
  expect(estate.curatedGranularity).toBe('complex')
  expect(estate.enEstateName).toBe('SOUTH HORIZONS')
})
