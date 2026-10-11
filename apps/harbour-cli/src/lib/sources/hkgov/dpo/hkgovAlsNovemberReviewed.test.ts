import {
  applyNovemberReviewedIdentityAliases,
  applyNovember2025ReviewedShops,
} from './hkgovAlsNovember2025Review'
import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-november-2025-reviewed-retentions.json'
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

test('November reviewed retentions preserve all approved identities and classifications', async () => {
  const dir = (await readdir('data/hkgov/dpo/ALS')).find(
    d => d.startsWith('20251104') && d.endsWith('ALS-GeoJSON'),
  )!
  const rows = prepare(await inputs(dir), '2025-11-04.0')
  const aliases = applyNovemberReviewedIdentityAliases(rows, '2025-11-04.0')
  expect(rules).toHaveLength(126)
  for (const rule of rules)
    expect(
      rows.filter(r => r.id === rule.canonicalId),
      rule.id,
    ).toHaveLength(1)
  const get = (n: number) =>
    rows.find(
      r =>
        r.id === rules.find(r => r.id === `november-2025-reviewed-${n}`)!.canonicalId,
    )!
  expect(get(9).curatedGranularity).toBe('building')
  expect(get(40).enBuildingName).toBe('SILKA FAR EAST HOTEL HONG KONG')
  expect(get(53).id).toBe('ss-3b312a6c-e54e-5f69-ac84-a150afb33311')
  expect(aliases.size).toBe(3)
  expect(get(109).enBuildingName).toBe('DORSETT KAI TAK HONG KONG')
  expect(get(113).enBuildingName).toBe('CLP HEADQUARTERS')
  expect(get(131).curatedGranularity).toBe('building')
  expect(get(134).curatedGranularity).toBe('building')
  expect(get(135).curatedGranularity).toBe('complex')
  expect(
    rows.filter(r => r.enFormattedAddress?.includes('SHEK KONG BARRACKS')),
  ).toHaveLength(113)
})

test('Lok Yuen preserves both building frontages and seven shops with explicit parents', () => {
  const thistle = 'ss-17b4e0a7-ebeb-5ce6-b213-9da513f97727',
    nelson = 'ss-9fe9c6db-2a07-53b0-893c-69b8588c0b58'
  const shops = [
    ['ss-b685bacd-6920-5b5b-aea2-607143ba10d6', '2L', 'NELSON STREET'],
    ['ss-fc1db7ea-f561-5091-be89-d408e6ab89a8', '2M', 'NELSON STREET'],
    ['ss-8cf21582-cbbe-55b9-8f65-736967225eb8', '21', 'THISTLE STREET'],
    ['ss-2e35911e-652d-5ef1-baad-c0dbbbe6b096', '23', 'THISTLE STREET'],
    ['ss-6aff2daf-4330-525d-b729-f13ee8474ad0', '19', 'THISTLE STREET'],
    ['ss-7aaf8289-05c4-5c16-92ed-e71c087092f0', '17', 'THISTLE STREET'],
    ['ss-6f6fbe7e-97d4-52dd-86e7-eaa29370ef3c', '15', 'THISTLE STREET'],
  ]
  const rows = [
    { id: thistle },
    { id: nelson },
    ...shops.map(([id, number, street]) => ({
      id,
      enBuildingName: 'LOK YUEN HOUSE',
      enStreetName: street,
      enStreetNumberFrom: number,
    })),
  ] as Parameters<typeof applyNovember2025ReviewedShops>[0]
  applyNovember2025ReviewedShops(rows, '2025-11-04.0')
  expect(rows).toHaveLength(9)
  for (const row of rows.slice(2)) {
    expect(row.curatedGranularity).toBe('unit')
    expect(row.parentAddressId).toBe(
      row.enStreetName === 'NELSON STREET' ? nelson : thistle,
    )
  }
  rows[2]!.enStreetNumberFrom = '2N'
  expect(() => applyNovember2025ReviewedShops(rows, '2025-11-04.0')).toThrow()
})
