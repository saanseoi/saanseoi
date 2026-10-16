import { permitsAlsReviewIssue } from './hkgovAlsReviewPolicy'
import { reportAlsReviewIssue } from './hkgovAlsReviewIssue'
import { alsReviewOperations } from './hkgovAlsReviewProgram'
import type { ReviewedPremiseRetention as Rule } from './hkgovAlsReviewRetentionSchema'
import { strict as assert } from 'node:assert'
import { als3dHash } from './hkgovAls3d'
import {
  curationProvenance,
  resolveHkgovAlsCurationVerification,
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

const rules = alsReviewOperations.flatMap(operation =>
  operation.code === 'retain-premise' ? operation.decisions : [],
)

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
    {
      rule: Rule
      retained: boolean
      verification: 'verified' | 'unverified'
      sourceAssertions: {
        sourceFile: string
        featureIndexOneBased: number
        sourceVersion: string
      }[]
    }
  >()
  for (const rule of decisions) {
    if (rule.sourceVersionFrom && version < rule.sourceVersionFrom) continue
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
      if (rule.premiseSelectors) {
        const en = p?.EngPremisesAddress
        const selector = [
          en?.BuildingName ?? null,
          en?.EngEstate?.EstateName ?? null,
          en?.EngStreet?.StreetName ?? null,
          en?.EngStreet?.BuildingNoFrom ?? null,
          en?.EngStreet?.BuildingNoTo ?? null,
          en?.EngBlock?.BlockDescriptor ?? null,
          en?.EngBlock?.BlockNo ?? null,
          en?.EngVillage ?? null,
          p?.ChiPremisesAddress?.ChiVillage ?? null,
          en?.EngPhase ?? null,
          p?.ChiPremisesAddress?.ChiPhase ?? null,
        ]
        return rule.premiseSelectors.some(
          s => JSON.stringify(s) === JSON.stringify(selector.slice(0, s.length)),
        )
      }
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
    assert(
      rule.coalesce || matches.length <= 1,
      `${rule.id}: ambiguous premise evidence`,
    )
    const assertion = rule.assertions.find(a => a.version === version)
    const accepted = assertion?.hashes ?? rule.assertions.flatMap(a => a.hashes)
    if (
      !assertion &&
      verification === 'unverified' &&
      permitsAlsReviewIssue('unverified-curation', version) &&
      matches.some(match => !accepted.includes(hash(match.feature)))
    ) {
      reportAlsReviewIssue({
        code: 'unverified-curation',
        sourceVersion: version,
        decisionId: rule.id,
        curationFile: rule.curationFile ?? curationFile,
        decision: rule,
        records: matches,
        message:
          'Publisher evidence changed beyond verified curation coverage; leave source records unchanged pending investigation.',
      })
      continue
    }
    for (const match of matches)
      assert(
        accepted.includes(hash(match.feature)),
        `${rule.id}: source evidence changed in ${version}`,
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
        sourceFile: rule.curationFile ?? curationFile,
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
        sourceAssertions: matches.map(m => ({
          sourceFile: m.sourceFile,
          featureIndexOneBased: m.featureIndexOneBased,
          sourceVersion: version,
        })),
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
    const { rule, retained, verification, sourceAssertions } = application
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
      row.enBlockDescriptor = patch.blockNumber
        ? (patch.blockDescriptor ?? 'BLK')
        : null
      row.zhHantBlockDescriptor = patch.blockNumber
        ? (patch.zhBlockDescriptor ?? '座')
        : null
      row.blockDescriptorPrecedenceIndicator = patch.blockNumber ? 'Y' : null
      if (patch.blockNumber) {
        en.EngBlock = {
          BlockNo: patch.blockNumber,
          BlockDescriptor: patch.blockDescriptor ?? 'BLK',
          BlockDescriptorPrecedenceIndicator: 'Y',
        }
        zh.ChiBlock = {
          BlockNo: patch.blockNumber,
          BlockDescriptor: patch.zhBlockDescriptor ?? '座',
        }
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
    if ('enPhaseName' in patch) {
      row.enPhaseName = patch.enPhaseName ?? null
      row.enPhaseRef = null
      if (en.EngEstate && patch.enPhaseName)
        en.EngEstate.EngPhase = { PhaseName: patch.enPhaseName }
    }
    if ('zhPhaseName' in patch) {
      row.zhHantPhaseName = patch.zhPhaseName ?? null
      row.zhHantPhaseRef = null
      if (zh.ChiEstate && patch.zhPhaseName)
        zh.ChiEstate.ChiPhase = { PhaseName: patch.zhPhaseName }
    }
    if (patch.enStreet) {
      row.enStreetName = patch.enStreet
      en.EngStreet = { ...en.EngStreet, StreetName: patch.enStreet }
    }
    if (patch.zhStreet) {
      row.zhHantStreetName = patch.zhStreet
      zh.ChiStreet = { ...zh.ChiStreet, StreetName: patch.zhStreet }
    }
    if (patch.clearVillage) {
      row.enVillageName = row.zhHantVillageName = null
      row.enVillageNumberFrom = row.enVillageNumberTo = null
      row.zhHantVillageNumberFrom = row.zhHantVillageNumberTo = null
      delete en.EngVillage
      delete zh.ChiVillage
    }
    if (patch.clearVillageNumber) {
      row.enVillageNumberFrom = row.enVillageNumberTo = null
      row.zhHantVillageNumberFrom = row.zhHantVillageNumberTo = null
      if (en.EngVillage) {
        delete en.EngVillage.BuildingNoFrom
        delete en.EngVillage.BuildingNoTo
      }
      if (zh.ChiVillage) {
        delete zh.ChiVillage.BuildingNoFrom
        delete zh.ChiVillage.BuildingNoTo
      }
    }
    if (patch.clearPhase) {
      row.enPhaseName = row.zhHantPhaseName = null
      row.enPhaseRef = row.zhHantPhaseRef = null
      if (en.EngEstate) delete en.EngEstate.EngPhase
      if (zh.ChiEstate) delete zh.ChiEstate.ChiPhase
    }
    if (patch.streetNumberFrom) {
      row.enStreetNumberFrom = row.zhHantStreetNumberFrom = patch.streetNumberFrom
      row.enStreetNumberTo = row.zhHantStreetNumberTo = patch.streetNumberTo ?? null
      en.EngStreet = {
        ...en.EngStreet,
        BuildingNoFrom: patch.streetNumberFrom,
        BuildingNoTo: patch.streetNumberTo,
      }
      zh.ChiStreet = {
        ...zh.ChiStreet,
        BuildingNoFrom: patch.streetNumberFrom,
        BuildingNoTo: patch.streetNumberTo,
      }
    }
    row.enFormattedAddress = formatEnPremisesAddress(en)
    row.zhHantFormattedAddress = formatZhPremisesAddress(zh)
    if (!patch.preserveStructure)
      row.curatedGranularity = patch.granularity ?? 'building'
    if (patch.granularity)
      row.hierarchyCuration = JSON.stringify({
        id: rule.id,
        curationFile: rule.curationFile ?? curationFile,
        authority: rule.authority,
      })
    if (rule.sharedProvisionalId)
      assert.equal(
        row.id,
        rule.sharedProvisionalId,
        `${rule.id}: shared provisional identity changed`,
      )
    row.identityAlias =
      rule.sharedProvisionalId || row.id === rule.canonicalId ? null : row.id
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
        curationFile: rule.curationFile ?? curationFile,
        authority: rule.authority,
        retained,
        evidence: rule.evidence,
        externalEvidence: rule.externalEvidence,
        sourceAssertions,
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

/** Apply curated geometry and parentage after the general estate/coordinate passes. */
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
        curationFile: rule.curationFile ?? curationFile,
        authority: rule.authority,
        parentRule: rule.parentRule,
      })
    }
    if (rule.role === 'complex') row.parentAddressId = undefined
  }
}
