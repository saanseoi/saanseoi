import { applyReviewedAlsIdentityAliases } from './hkgovAlsReviewProgram'

import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-june-reviewed-retentions.json'
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
test('June reviewed retentions preserve eight identities and reuse the frontage policy', async () => {
  const dir = (await readdir('data/hkgov/dpo/ALS')).find(
    d => d.startsWith('20250620') && d.endsWith('ALS-GeoJSON'),
  )!
  const rows = prepare(await inputs(dir), '2025-06-20.0')
  for (const rule of rules) {
    const matches = rows.filter(r => r.id === rule.canonicalId)
    expect(matches, rule.id).toHaveLength(1)
    expect(matches[0]!.curatedGranularity).toBe(rule.patch.granularity)
  }
  expect(rows.filter(r => r.enBuildingName === 'WONG TECK BUILDING')).toHaveLength(2)
})
test('June reconciliations keep curated target IDs, retain provenance and reject changed evidence', () => {
  for (const decision of fixture.identityReconciliations) {
    const owner = {
      ...decision.targetGuard,
      id: decision.canonicalId,
      sources: JSON.stringify({ existingCuration: 'preserved' }),
    } as unknown as Parameters<typeof applyJuneReviewedIdentityAliases>[0][number]
    expect(applyJuneReviewedIdentityAliases([owner], '2025-05-22.0').size).toBe(0)
    const aliases = applyJuneReviewedIdentityAliases([owner], '2025-06-20.0')
    expect(aliases.get(decision.aliasIds[0]!)).toBe(decision.canonicalId)
    expect(JSON.parse(owner.sources).existingCuration).toBe('preserved')
    expect(owner.id).toBe(decision.canonicalId)
    expect(() =>
      applyJuneReviewedIdentityAliases(
        [owner, { ...owner, id: decision.aliasIds[0]! }],
        '2025-06-20.0',
      ),
    ).toThrow('independently present')
    owner.enStreetNumberFrom = '999'
    expect(() => applyJuneReviewedIdentityAliases([owner], '2025-06-20.0')).toThrow(
      'target evidence changed',
    )
  }
})

const applyJuneReviewedIdentityAliases = (
  rows: Parameters<typeof applyReviewedAlsIdentityAliases>[0],
  version: string,
) =>
  applyReviewedAlsIdentityAliases(
    rows,
    version,
    'hkgov-dpo-address-june-reviewed-retentions',
  )
