import { requireDefined } from '@repo/core/requireDefined'
import { strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-house-retentions.json'
import { als3dHash, readAls3dFeatures, type Als3dFeature } from './hkgovAls3d'
import {
  curationProvenance,
  resolveHkgovAlsCurationVerification,
  type HkgovAlsCurationApplication,
} from './hkgovAlsCurationLifecycle'
import type { HkgovAlsSourceFeature, PreparedHkgovAlsRow } from './hkgovAlsTypes'

const curationFile = 'hkgov-dpo-address-house-retentions.json'
type Rule = (typeof fixture.retentions)[number]
const premise = (f: Als3dFeature) => f.properties.Address.PremisesAddress
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
function matches(rule: Rule, feature: Als3dFeature) {
  const p = premise(feature)
  return (
    rule.csus.includes(p.BuildingCsuInformation?.CsuId ?? '') ||
    (p.EngPremisesAddress?.EngEstate?.EstateName === rule.estate &&
      p.EngPremisesAddress?.BuildingName === rule.name)
  )
}
function retain(
  rule: Rule,
  originals: Als3dFeature[],
  version: string,
  kind: '2d' | '3d',
) {
  const assertions = kind === '2d' ? rule.assertions2d : rule.assertions3d
  const assertion =
    assertions.find(a => a.sourceVersions.includes(version)) ??
    assertions.find(a =>
      a.sourceVersions.includes(rule.application.lastVerifiedSourceVersion),
    )
  assert(assertion, `House retention ${rule.id}: missing reviewed release`)
  assert.deepEqual(
    originals.map(als3dHash).sort(),
    assertion.hashes,
    `House retention ${rule.id}: publisher assertions changed`,
  )
  const evidence = kind === '2d' ? rule.evidence2d : rule.evidence3d
  const rich = originals.find(
    f =>
      premise(f).EngPremisesAddress?.BuildingName === rule.name &&
      premise(f).BuildingCsuInformation?.CsuId === rule.csus[0] &&
      (kind === '2d' || premise(f).EngPremisesAddress?.Eng3dAddress?.length),
  )
  const dated = evidence
    .flatMap(e =>
      e.sourceVersions.filter(v => v <= version).map(v => ({ e, version: v })),
    )
    .sort((a, b) => a.version.localeCompare(b.version))
    .at(-1)
  const chosen = rule.retainOriginalCoordinates ? evidence[0] : dated?.e
  assert(chosen, `House retention ${rule.id}: missing dated evidence`)
  const feature = structuredClone(
    !rule.retainOriginalCoordinates && rich ? rich : chosen.feature,
  ) as Als3dFeature
  return {
    feature,
    evidenceSourceVersion: !rule.retainOriginalCoordinates
      ? rich
        ? version
        : requireDefined(dated).version
      : chosen.evidenceSourceVersion,
  }
}

/** Coalesce reviewed empty aliases only after checking complete bilingual source assertions. */
export function retainAlsHouses(features: HkgovAlsSourceFeature[], version: string) {
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
    const originals = features.filter(s => matches(rule, s.feature as Als3dFeature))
    const retained = retain(
      rule,
      originals.map(s => s.feature as Als3dFeature),
      version,
      '2d',
    )
    const discarded = new Set(originals)
    features.splice(0, features.length, ...features.filter(s => !discarded.has(s)), {
      feature: retained.feature as HkgovAlsSourceFeature['feature'],
      sourceFile: curationFile,
      featureIndexOneBased: fixture.retentions.indexOf(rule) + 1,
    })
    provenance.set(requireDefined(rule.csus[0]), {
      id: rule.id,
      curationFile,
      curation,
      evidenceSourceVersion: retained.evidenceSourceVersion,
      originalAssertions: originals,
    })
  }
  return provenance
}
export function labelAlsHouseRetentions(
  rows: PreparedHkgovAlsRow[],
  provenance: Map<string, unknown>,
) {
  for (const row of rows)
    if (row.sourceFile === curationFile) {
      assert(
        provenance.has(requireDefined(row.hkgovCsuId)),
        'Missing house retention provenance',
      )
      row.sources = JSON.stringify({
        ...JSON.parse(row.sources),
        hkgovAlsHouseRetention: provenance.get(requireDefined(row.hkgovCsuId)),
      })
      row.identityMatchMethod = 'reviewed-house-retention'
    }
}

/** Stream unrelated records unchanged; retain only explicitly reviewed houses. */
export async function* readAls3dWithHouseRetentions(
  file: string,
  version: string,
  rows: PreparedHkgovAlsRow[],
) {
  const rules = active(version).filter(({ rule }) =>
    rows.some(r => r.enEstateName === rule.estate),
  )
  const captured = new Map<
    Rule,
    { feature: Als3dFeature; featureIndexOneBased: number }[]
  >()
  for await (const record of readAls3dFeatures(file)) {
    const entry = rules.find(({ rule }) => matches(rule, record.feature))
    if (!entry) {
      yield { ...record, houseRetention: undefined }
      continue
    }
    captured.set(entry.rule, [...(captured.get(entry.rule) ?? []), record])
  }
  for (const { rule, curation } of rules) {
    const originals = captured.get(rule) ?? []
    const retained = retain(
      rule,
      originals.map(r => r.feature),
      version,
      '3d',
    )
    yield {
      feature: retained.feature,
      featureIndexOneBased: originals[0]?.featureIndexOneBased ?? 1,
      houseRetention: {
        id: rule.id,
        curationFile,
        curation,
        evidenceSourceVersion: retained.evidenceSourceVersion,
        originalAssertions: originals,
      },
    }
  }
}
