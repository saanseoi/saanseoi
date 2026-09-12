import universityHill from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-university-hill-retentions.json'
import continuity from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-reviewed-continuity-decisions.json'
import { strict as assert } from 'node:assert'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-reviewed-premise-retentions.json'
import { als3dHash } from './hkgovAls3d'
import {
  curationProvenance,
  resolveHkgovAlsCurationVerification,
  type HkgovAlsCurationApplication,
} from './hkgovAlsCurationLifecycle'
import {
  formatEnPremisesAddress,
  formatZhPremisesAddress,
} from './hkgovAlsNormalisation'
import type {
  HkgovAlsFeature,
  HkgovAlsSourceFeature,
  PreparedHkgovAlsRow,
} from './hkgovAlsTypes'

type Rule = {
  id: string
  authority: string
  sourceFile: string
  csus: string[]
  canonicalId: string
  retain: boolean
  role?: string
  parentRule?: string
  publisherTower?: { estate: string; name: string; section: string; number: string }
  application: HkgovAlsCurationApplication
  assertions: { version: string; hashes: string[] }[]
  evidence: { sourceVersion: string; feature: HkgovAlsFeature }
  externalEvidence?: unknown
  patch: {
    enName?: string | null
    zhName?: string | null
    blockNumber?: string | null
    granularity?: 'complex' | 'building' | 'unknown'
    enEstate?: string | null
    zhEstate?: string | null
    clearPhase?: boolean
    preserveStructure?: boolean
    coordinates?: number[]
  }
}
const rules = [
  ...fixture.rules,
  ...continuity.rules,
  ...universityHill.rules,
] as unknown as Rule[]
const curationFile = 'hkgov-dpo-address-reviewed-premise-retentions.json'
const locator = (file: string, index: number) => `${file}:${index}`
const hash = (feature: HkgovAlsFeature) =>
  als3dHash([feature.properties?.Address?.PremisesAddress, feature.geometry])

/** Validate publisher evidence before other curations, then replay genuine omissions. */
export function retainReviewedAlsPremises(
  features: HkgovAlsSourceFeature[],
  version: string,
  decisions: readonly Rule[] = rules,
) {
  const applications = new Map<
    string,
    { rule: Rule; retained: boolean; verification: 'verified' | 'unverified' }
  >()
  for (const rule of decisions) {
    // A district-only preparation must never acquire another district's premises.
    if (!features.some(f => f.sourceFile === rule.sourceFile)) continue
    const verification = resolveHkgovAlsCurationVerification(
      version,
      rule.assertions.map(a => a.version),
      rule.application,
    )
    if (!verification) continue
    const matches = features.filter(f => {
      const p = f.feature.properties?.Address?.PremisesAddress
      if (
        f.sourceFile !== rule.sourceFile ||
        !rule.csus.includes(p?.BuildingCsuInformation?.CsuId ?? '')
      )
        return false
      if (rule.publisherTower) {
        const e = p?.EngPremisesAddress,
          t = rule.publisherTower
        return (
          e?.EngEstate?.EstateName === t.estate &&
          (e.BuildingName === t.name ||
            (e.BuildingName === t.section && String(e.EngBlock?.BlockNo) === t.number))
        )
      }
      const named = Boolean(
        p?.EngPremisesAddress?.BuildingName || p?.ChiPremisesAddress?.BuildingName,
      )
      if (rule.role === 'unblocked')
        return !p?.EngPremisesAddress?.EngBlock && !p?.ChiPremisesAddress?.ChiBlock
      return !rule.role || (rule.role === 'complex' ? !named : named)
    })
    assert(matches.length <= 1, `${rule.id}: ambiguous premise evidence`)
    const assertion = rule.assertions.find(a => a.version === version)
    const accepted = assertion?.hashes ?? rule.assertions.flatMap(a => a.hashes)
    for (const match of matches)
      assert(
        accepted.includes(hash(match.feature)),
        `${rule.id}: source evidence changed`,
      )
    if (assertion)
      assert.equal(
        matches.length,
        assertion.hashes.length,
        `${rule.id}: historical premise presence changed`,
      )
    let retained = false
    if (!matches.length && rule.retain) {
      const feature = structuredClone(rule.evidence.feature)
      assert(
        rule.assertions.some(a => a.hashes.includes(hash(feature))),
        `${rule.id}: retained evidence changed`,
      )
      const restored = {
        feature,
        sourceFile: curationFile,
        featureIndexOneBased: rules.findIndex(r => r.id === rule.id) + 1,
      }
      assert(restored.featureIndexOneBased > 0, `${rule.id}: missing fixture identity`)
      features.push(restored)
      matches.push(restored)
      retained = true
    }
    for (const f of matches)
      applications.set(locator(f.sourceFile, f.featureIndexOneBased), {
        rule,
        retained,
        verification,
      })
  }
  return applications
}

type Applications = ReturnType<typeof retainReviewedAlsPremises>

export function applyReviewedAlsPremiseRetentions(
  rows: PreparedHkgovAlsRow[],
  applications: Applications,
) {
  for (const row of rows) {
    const application = applications.get(
      locator(row.sourceFile, row.sourceFeatureIndexOneBased),
    )
    if (!application) continue
    const { rule, retained, verification } = application
    const en = JSON.parse(row.engPremisesAddressJson ?? '{}')
    const zh = JSON.parse(row.chiPremisesAddressJson ?? '{}')
    const patch = rule.patch
    if ('enName' in patch) {
      row.enBuildingName = patch.enName ?? null
      if (patch.enName) en.BuildingName = patch.enName
      else delete en.BuildingName
    }
    if ('zhName' in patch) {
      row.zhHantBuildingName = patch.zhName ?? null
      if (patch.zhName) zh.BuildingName = patch.zhName
      else delete zh.BuildingName
    }
    if ('blockNumber' in patch) {
      row.enBlockNumber = row.zhHantBlockNumber = patch.blockNumber ?? null
      row.enBlockDescriptor = patch.blockNumber ? 'BLK' : null
      row.zhHantBlockDescriptor = patch.blockNumber ? '座' : null
      row.blockDescriptorPrecedenceIndicator = patch.blockNumber ? 'Y' : null
      if (patch.blockNumber) {
        en.EngBlock = {
          BlockNo: patch.blockNumber,
          BlockDescriptor: 'BLK',
          BlockDescriptorPrecedenceIndicator: 'Y',
        }
        zh.ChiBlock = { BlockNo: patch.blockNumber, BlockDescriptor: '座' }
      } else {
        delete en.EngBlock
        delete zh.ChiBlock
      }
    }
    if ('enEstate' in patch) {
      row.enEstateName = patch.enEstate ?? null
      if (patch.enEstate) en.EngEstate = { EstateName: patch.enEstate }
      else delete en.EngEstate
    }
    if ('zhEstate' in patch) {
      row.zhHantEstateName = patch.zhEstate ?? null
      if (patch.zhEstate) zh.ChiEstate = { EstateName: patch.zhEstate }
      else delete zh.ChiEstate
    }
    if (patch.clearPhase) {
      row.enPhaseName = row.zhHantPhaseName = null
      row.enPhaseRef = row.zhHantPhaseRef = null
      if (en.EngEstate) delete en.EngEstate.EngPhase
      if (zh.ChiEstate) delete zh.ChiEstate.ChiPhase
    }
    row.enFormattedAddress = formatEnPremisesAddress(en)
    row.zhHantFormattedAddress = formatZhPremisesAddress(zh)
    if (!patch.preserveStructure)
      row.curatedGranularity =
        patch.granularity === 'unknown' ? undefined : (patch.granularity ?? 'building')
    row.identityAlias = row.id
    row.id = row.canonicalId = row.identityBuildingId = rule.canonicalId
    row.identityKey =
      row.identityContinuityKey = `reviewed-premise-retention:${rule.id}`
    row.identityMatchMethod = 'reviewed-premise-retention'
    row.identitySummary = {
      ...row.identitySummary,
      buildingName: row.enBuildingName,
      estateName: row.enEstateName,
    }
    row.sources = JSON.stringify({
      ...JSON.parse(row.sources),
      hkgovAlsReviewedPremiseRetention: {
        id: rule.id,
        curationFile,
        authority: rule.authority,
        retained,
        evidence: rule.evidence,
        externalEvidence: rule.externalEvidence,
        originalGeometry: JSON.parse(row.geometry ?? 'null'),
        curation: curationProvenance({
          application: rule.application,
          id: rule.id,
          sourceVersion: row.sourceVersion,
          verification,
        }),
      },
    })
  }
}

/** Apply reviewed geometry and parentage after the general estate/coordinate passes. */
export function finishReviewedAlsPremiseRetentions(rows: PreparedHkgovAlsRow[]) {
  const byRule = new Map(
    rows.flatMap(row => {
      const id = JSON.parse(row.sources).hkgovAlsReviewedPremiseRetention?.id as
        | string
        | undefined
      return id ? [[id, row] as const] : []
    }),
  )
  for (const rule of rules) {
    const row = byRule.get(rule.id)
    if (!row) continue
    if (rule.patch.coordinates) {
      row.geometry = JSON.stringify({
        type: 'Point',
        coordinates: rule.patch.coordinates,
      })
      row.identitySummary.longitude = rule.patch.coordinates[0]!.toFixed(5)
      row.identitySummary.latitude = rule.patch.coordinates[1]!.toFixed(5)
    }
    if (rule.parentRule) {
      const parent = byRule.get(rule.parentRule)
      assert(parent && parent.id !== row.id, `${rule.id}: distinct complex required`)
      row.parentAddressId = parent.id
      row.hierarchyCuration = JSON.stringify({
        id: rule.id,
        curationFile,
        authority: rule.authority,
        parentRule: rule.parentRule,
      })
    }
    if (rule.role === 'complex') row.parentAddressId = undefined
  }
}
