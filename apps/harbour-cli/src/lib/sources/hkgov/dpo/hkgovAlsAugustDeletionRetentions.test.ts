import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-august-deletion-retentions.json'
import { readAls3dFeatures } from './hkgovAls3d'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
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
const targets = new Set(rules.flatMap(r => r.csus))
async function sourceFeatures(dir: string) {
  const features: HkgovAlsSourceFeature[] = []
  for (const sourceFile of new Set(rules.map(r => r.sourceFile))) {
    for await (const row of readAls3dFeatures(
      `data/hkgov/dpo/ALS/${dir}/${sourceFile}`,
    )) {
      if (
        row.featureIndexOneBased === 1 ||
        targets.has(
          row.feature.properties.Address.PremisesAddress.BuildingCsuInformation
            ?.CsuId ?? '',
        )
      )
        features.push({
          ...row,
          feature: {
            ...row.feature,
            geometry: {
              ...row.feature.geometry,
              coordinates: [
                row.feature.geometry.coordinates[0]!,
                row.feature.geometry.coordinates[1]!,
              ],
            },
          },
          sourceFile,
        })
    }
  }
  return features
}

test('review retains all 20 identities across deliveries without touching the two completed cohorts', async () => {
  let count = 0
  const deliveries = (await readdir('data/hkgov/dpo/ALS'))
    .filter(d => d.endsWith('ALS-GeoJSON'))
    .sort()
  for (const dir of deliveries) {
    const version = `${dir.slice(0, 4)}-${dir.slice(4, 6)}-${dir.slice(6, 8)}.0`
    const originals = await sourceFeatures(dir)
    const originalJson = JSON.stringify(originals)
    const features = structuredClone(originals)
    const applications = retainReviewedAlsPremises(features, version, rules)
    expect(JSON.stringify(originals)).toBe(originalJson)
    if (version < '2024-08-21.0') {
      expect(applications.size).toBe(0)
      expect(features).toEqual(originals)
      continue
    }
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
    const rawJson = rows.map(r => [r.engPremisesAddressJson, r.chiPremisesAddressJson])
    applyReviewedAlsPremiseRetentions(rows, applications)
    finishReviewedAlsPremiseRetentions(rows)
    expect(rows.map(r => [r.engPremisesAddressJson, r.chiPremisesAddressJson])).toEqual(
      rawJson,
    )
    for (const rule of rules) {
      const retained = rows.filter(r => r.id === rule.canonicalId)
      expect(retained.length, `${version}: ${rule.id}`).toBe(1)
      expect(retained[0]?.curatedGranularity).toBe(
        rule.patch.granularity === 'unknown' ? undefined : rule.patch.granularity,
      )
    }
    const campus = rows.find(r => r.id === rules[17]!.canonicalId)!
    const amenities = rows.find(r => r.id === rules[6]!.canonicalId)!
    expect(campus.curatedGranularity).toBe('complex')
    expect(amenities.parentAddressId).toBe(campus.id)
    expect(amenities.id).not.toBe(campus.id)
    const terra = rows.find(r => r.id === rules[13]!.canonicalId)!
    expect(terra.enBuildingName).toBe('TERRA')
    expect(terra.zhHantBuildingName).toBe('隆敍')
    count++
  }
  expect(count).toBe(deliveries.filter(d => d.slice(0, 8) >= '20240821').length)
}, 120_000)

test('unreviewed returning evidence fails closed', () => {
  const rule = rules[13]!
  const feature = structuredClone(rule.evidence.feature)
  feature.geometry!.coordinates = [114.5, 22.5]
  expect(() =>
    retainReviewedAlsPremises(
      [{ feature, sourceFile: rule.sourceFile, featureIndexOneBased: 1 }],
      '2026-09-30.0',
      rules,
    ),
  ).toThrow('source evidence changed')
})
