import { requireDefined } from '@repo/core/requireDefined'
import { strict as assert } from 'node:assert'
import { buildDeterministicUuidV5 } from '@repo/db'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-commercial-retentions.json'
import type { Als3dFeature } from './hkgovAls3d'
import {
  curationProvenance,
  resolveHkgovAlsCurationVerification,
  type HkgovAlsCurationApplication,
} from './hkgovAlsCurationLifecycle'
import type { HkgovAlsSourceFeature, PreparedHkgovAlsRow } from './hkgovAlsTypes'
const curationFile = 'hkgov-dpo-address-commercial-retentions.json'
const namespace = '377f574f-1f19-5606-a633-c1cf57938268'
type Rule = (typeof fixture.retentions)[number]
function active(version: string) {
  return fixture.retentions.flatMap(rule => {
    const application = rule.application as HkgovAlsCurationApplication
    const verification = resolveHkgovAlsCurationVerification(
      version,
      rule.sourceVersions,
      application,
    )
    return verification
      ? [
          {
            rule,
            curation: curationProvenance({
              id: rule.id,
              application,
              sourceVersion: version,
              verification,
            }),
          },
        ]
      : []
  })
}
function matches(rule: Rule, f: HkgovAlsSourceFeature['feature'] | Als3dFeature) {
  const p = f.properties?.Address?.PremisesAddress
  return (
    rule.csus.includes(p?.BuildingCsuInformation?.CsuId ?? '') ||
    (p?.EngPremisesAddress?.EngEstate?.EstateName === rule.estate &&
      [rule.name, rule.name.replace(' (2)', ' 2')].includes(
        p?.EngPremisesAddress?.BuildingName ?? '',
      ))
  )
}

/** Reconcile only the reviewed centres; preserve each original assertion and its point. */
export function retainAlsCommercialPremises(
  features: HkgovAlsSourceFeature[],
  version: string,
) {
  const provenance = new Map<string, unknown>()
  for (const { rule, curation } of active(version)) {
    if (
      !features.some(
        s =>
          s.feature.properties?.Address?.PremisesAddress?.EngPremisesAddress?.EngEstate
            ?.EstateName === rule.estate,
      )
    )
      continue
    const originals = features.filter(s => matches(rule, s.feature))
    if (originals.length) continue
    const evidence = rule.evidence
      .flatMap(e =>
        e.sourceVersions
          .filter(v => v <= version)
          .map(v => ({ feature: e.feature, version: v })),
      )
      .sort((a, b) => a.version.localeCompare(b.version))
      .at(-1)
    assert(evidence, `Commercial retention ${rule.id}: missing dated evidence`)
    const feature = structuredClone(
      evidence.feature,
    ) as unknown as HkgovAlsSourceFeature['feature']
    const p = requireDefined(
      requireDefined(requireDefined(feature.properties).Address).PremisesAddress,
    )
    requireDefined(p.BuildingCsuInformation).CsuId = rule.csu
    requireDefined(p.EngPremisesAddress).BuildingName = rule.name
    const discard = new Set(originals)
    features.splice(0, features.length, ...features.filter(s => !discard.has(s)), {
      feature,
      sourceFile: curationFile,
      featureIndexOneBased: fixture.retentions.indexOf(rule) + 1,
    })
    provenance.set(rule.csu, {
      id: rule.id,
      curationFile,
      curation,
      evidenceSourceVersion: evidence.version,
      evidenceAssertion: evidence.feature,
      originalAssertions: originals,
    })
  }
  return provenance
}
export function labelAlsCommercialRetentions(
  rows: PreparedHkgovAlsRow[],
  provenance: Map<string, unknown>,
) {
  for (const row of rows)
    if (row.sourceFile === curationFile) {
      const rule = fixture.retentions.find(r => r.csu === row.hkgovCsuId)
      assert(
        rule && provenance.has(rule.csu),
        'Missing commercial retention provenance',
      )
      row.identityAlias = row.id
      row.id =
        row.canonicalId =
        row.identityBuildingId =
          `ss-${buildDeterministicUuidV5(namespace, rule.id)}`
      row.identityKey =
        row.identityContinuityKey = `reviewed-commercial-retention:${rule.id}`
      row.identityMatchMethod = 'reviewed-commercial-retention'
      row.sources = JSON.stringify({
        ...JSON.parse(row.sources),
        hkgovAlsCommercialRetention: provenance.get(rule.csu),
      })
    }
}
/** No inventory is authorised for either centre; a new publisher inventory requires review. */
export function assertAlsCommercialInventoryAbsent(
  feature: Als3dFeature,
  version: string,
) {
  for (const { rule } of active(version))
    if (matches(rule, feature)) {
      const p = feature.properties.Address.PremisesAddress
      assert.equal(
        p.EngPremisesAddress?.Eng3dAddress?.length ?? 0,
        0,
        `Commercial retention ${rule.id}: unexpected English inventory`,
      )
      assert.equal(
        p.ChiPremisesAddress?.Chi3dAddress?.length ?? 0,
        0,
        `Commercial retention ${rule.id}: unexpected Chinese inventory`,
      )
    }
}
