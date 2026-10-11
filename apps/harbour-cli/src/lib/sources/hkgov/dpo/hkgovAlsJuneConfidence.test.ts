import { expect, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-june-confidence-continuity.json'
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
test('June high-confidence matches preserve 11 predecessor IDs without replacing coexisting identities', async () => {
  const features = await inputs(
    (await readdir('data/hkgov/dpo/ALS')).find(
      d => d.startsWith('20250620') && d.endsWith('ALS-GeoJSON'),
    )!,
  )
  const rows = prepare(features, '2025-06-20.0')
  for (const rule of rules) {
    const matches = rows.filter(r => r.id === rule.canonicalId)
    expect(matches, rule.id).toHaveLength(1)
    expect(matches[0]!.identityAlias).not.toBe(rule.canonicalId)
  }
  expect(new Set(rows.map(r => r.id)).size).toBe(rows.length)
  const previous = JSON.parse(
    await readFile(
      '.local/hkgov-dpo/prepared/hkgov-hk-2025-05-22.0-address.parquet.membership.json',
      'utf8',
    ),
  )
  const previousIds = new Set(previous.addresses.map((a: { id: string }) => a.id))
  for (const rule of fixture.rules)
    expect(previousIds.has(rule.externalEvidence.selectedCandidateId)).toBe(false)
  expect(
    retainReviewedAlsPremises(structuredClone(features), '2025-05-22.0', rules).size,
  ).toBe(0)
})
test('June confidence rules reject changed publisher evidence', () => {
  const rule = rules[0]!
  const feature = structuredClone(rule.evidence.feature)
  if (feature.geometry?.type !== 'Point' || !feature.geometry.coordinates)
    throw new Error('Reviewed publisher evidence must contain a Point.')
  feature.geometry.coordinates[0] += 0.001
  expect(() =>
    retainReviewedAlsPremises(
      [{ sourceFile: rule.sourceFile, featureIndexOneBased: 1, feature }],
      '2025-06-20.0',
      [rule],
    ),
  ).toThrow('source evidence changed')
})
