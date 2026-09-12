import { requireDefined } from '@repo/core/requireDefined'
import { strict as assert } from 'node:assert'
import { buildDeterministicUuidV5 } from '@repo/db'
import { loadHouseRetentionFixture } from './hkgovAlsHouseRetentionEvidence.ts'
import { als3dHash, readAls3dFeatures, type Als3dFeature } from './hkgovAls3d'
import {
  curationProvenance,
  resolveHkgovAlsCurationVerification,
  type HkgovAlsCurationApplication,
} from './hkgovAlsCurationLifecycle'
import type { HkgovAlsSourceFeature, PreparedHkgovAlsRow } from './hkgovAlsTypes'
import {
  formatEnPremisesAddress,
  formatZhPremisesAddress,
} from './hkgovAlsNormalisation'

const curationFile = 'hkgov-dpo-address-house-retentions.json'
const fixture = loadHouseRetentionFixture()
type Rule = (typeof fixture.retentions)[number]
const premise = (f: Als3dFeature) => f.properties.Address.PremisesAddress
function active(version: string) {
  return fixture.retentions.flatMap(rule => {
    const application = (rule.application ?? undefined) as
      | HkgovAlsCurationApplication
      | undefined
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
function retain(rule: Rule, version: string, kind: '2d' | '3d') {
  const evidence = kind === '2d' ? rule.evidence2d : rule.evidence3d
  const datedEvidence = evidence
    .flatMap(e =>
      e.sourceVersions.filter(v => v <= version).map(v => ({ e, version: v })),
    )
    .sort((a, b) => a.version.localeCompare(b.version))
    .at(-1)
  const dated =
    datedEvidence ??
    ('backfillBeforeEvidence' in rule && rule.backfillBeforeEvidence
      ? evidence
          .flatMap(e => e.sourceVersions.map(version => ({ e, version })))
          .sort((a, b) => a.version.localeCompare(b.version))[0]
      : undefined)
  const chosen = rule.retainOriginalCoordinates ? evidence[0] : dated?.e
  assert(chosen, `House retention ${rule.id}: missing dated evidence`)
  assert.equal(
    als3dHash(chosen.feature),
    chosen.hash,
    `House retention ${rule.id}: retained evidence changed`,
  )
  const feature = structuredClone(chosen.feature) as Als3dFeature
  if (
    'canonicalEnBuildingName' in rule &&
    typeof rule.canonicalEnBuildingName === 'string'
  ) {
    requireDefined(premise(feature).EngPremisesAddress).BuildingName =
      rule.canonicalEnBuildingName
  }
  if ('backfillBeforeEvidence' in rule && rule.backfillBeforeEvidence) {
    const bilingual = rule.evidence2d.find(
      e => e.feature.properties.Address.PremisesAddress.ChiPremisesAddress.ChiEstate,
    )?.feature.properties.Address.PremisesAddress
    assert(
      bilingual?.ChiPremisesAddress.ChiEstate,
      `House retention ${rule.id}: missing reviewed estate membership`,
    )
    const p = premise(feature)
    requireDefined(p.EngPremisesAddress).EngEstate = { EstateName: rule.estate }
    requireDefined(p.ChiPremisesAddress).ChiEstate = {
      EstateName: bilingual.ChiPremisesAddress.ChiEstate.EstateName,
    }
  }
  return {
    feature,
    evidenceSourceVersion: !rule.retainOriginalCoordinates
      ? requireDefined(dated).version
      : chosen.evidenceSourceVersion,
  }
}

/** Fill missing named houses without replacing publisher records or unnamed aliases. */
export function retainAlsHouses(features: HkgovAlsSourceFeature[], version: string) {
  const provenance = new Map<string, unknown>()
  for (const { rule, curation } of active(version)) {
    if (
      !features.some(
        s =>
          s.feature.properties?.Address?.PremisesAddress?.EngPremisesAddress?.EngEstate
            ?.EstateName === rule.estate,
      ) &&
      !(
        'materialiseWithoutEstate' in rule &&
        rule.materialiseWithoutEstate &&
        features.some(
          s =>
            s.feature.properties?.Address?.PremisesAddress?.EngPremisesAddress
              ?.EngDistrict ===
            rule.evidence2d[0]?.feature.properties.Address.PremisesAddress
              .EngPremisesAddress.EngDistrict,
        )
      )
    )
      continue
    const originals = features.filter(s => matches(rule, s.feature as Als3dFeature))
    if (
      originals.some(s => {
        const p = premise(s.feature as Als3dFeature)
        return p.EngPremisesAddress?.BuildingName || p.ChiPremisesAddress?.BuildingName
      })
    )
      continue
    const retained = retain(rule, version, '2d')
    features.push({
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
      const rule = fixture.retentions.find(rule =>
        rule.csus.includes(row.hkgovCsuId ?? ''),
      )
      if (rule && 'backfillBeforeEvidence' in rule && rule.backfillBeforeEvidence) {
        const bilingual = rule.evidence2d.find(
          e =>
            e.feature.properties.Address.PremisesAddress.ChiPremisesAddress.ChiEstate,
        )?.feature.properties.Address.PremisesAddress
        assert(
          bilingual?.ChiPremisesAddress.ChiEstate,
          `House retention ${rule.id}: missing bilingual estate evidence`,
        )
        row.enEstateName = rule.estate
        row.zhHantEstateName = bilingual.ChiPremisesAddress.ChiEstate.EstateName
        row.enFormattedAddress = formatEnPremisesAddress({
          ...JSON.parse(requireDefined(row.engPremisesAddressJson)),
          EngEstate: { EstateName: row.enEstateName },
        })
        row.zhHantFormattedAddress = formatZhPremisesAddress({
          ...JSON.parse(requireDefined(row.chiPremisesAddressJson)),
          ChiEstate: { EstateName: row.zhHantEstateName },
        })
        const id = `ss-${buildDeterministicUuidV5('3fc33c3e-2837-4fc7-a331-439be8c2c981', rule.id)}`
        row.identityAlias = row.id
        row.id = row.canonicalId = row.identityBuildingId = id
        row.identityKey =
          row.identityContinuityKey = `reviewed-house-retention:${rule.id}`
        row.identitySummary = { ...row.identitySummary, estateName: rule.estate }
      }
    }
}

/** Stream unrelated records unchanged; retain only explicitly reviewed houses. */
export async function* readAls3dWithHouseRetentions(
  file: string,
  version: string,
  rows: PreparedHkgovAlsRow[],
) {
  const rules = active(version).filter(
    ({ rule }) =>
      !('addressOnly' in rule && rule.addressOnly) &&
      rows.some(r => r.enEstateName === rule.estate) &&
      rows.some(
        r => r.sourceFile === curationFile && rule.csus.includes(r.hkgovCsuId ?? ''),
      ),
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
    yield { ...record, houseRetention: undefined }
  }
  for (const { rule, curation } of rules) {
    const originals = captured.get(rule) ?? []
    if (
      originals.some(s => {
        const p = premise(s.feature)
        return (
          p.EngPremisesAddress?.BuildingName ||
          p.ChiPremisesAddress?.BuildingName ||
          p.EngPremisesAddress?.Eng3dAddress?.length ||
          p.ChiPremisesAddress?.Chi3dAddress?.length
        )
      })
    )
      continue
    const retained = retain(rule, version, '3d')
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
