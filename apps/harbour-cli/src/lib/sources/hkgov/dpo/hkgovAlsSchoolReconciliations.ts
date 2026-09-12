import { strict as assert } from 'node:assert'
import { buildDeterministicUuidV5 } from '@repo/db'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-school-reconciliations.json'
import { als3dHash } from './hkgovAls3d'
import {
  formatEnPremisesAddress,
  formatZhPremisesAddress,
} from './hkgovAlsNormalisation'
import type {
  HkgovLocalisedPremisesAddress,
  PreparedHkgovAlsRow,
} from './hkgovAlsTypes'

const sourceFile = 'hkgov-dpo-address-school-reconciliations.json'
const namespace = '3fc33c3e-2837-4fc7-a331-439be8c2c981'

function rowEvidence(row: PreparedHkgovAlsRow) {
  return {
    csu: row.hkgovCsuId,
    geoAddress: row.geoAddress,
    geometry: JSON.parse(row.geometry ?? 'null'),
    en: JSON.parse(row.engPremisesAddressJson ?? 'null'),
    zh: JSON.parse(row.chiPremisesAddressJson ?? 'null'),
  }
}

/** Reconcile exact school assertions while retaining every raw assertion. */
export function applyReviewedSchoolReconciliations(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  for (const rule of fixture.reconciliations) {
    if (!rule.sourceVersions.includes(version)) continue
    const candidates = rows
      .filter(row => rule.csus.includes(row.hkgovCsuId ?? ''))
      .sort((a, b) => (a.hkgovCsuId ?? '').localeCompare(b.hkgovCsuId ?? ''))
    if (!candidates.length) continue

    const hash = als3dHash(candidates.map(rowEvidence))
    assert(
      rule.assertions.some(
        assertion =>
          assertion.hash === hash && assertion.sourceVersions.includes(version),
      ),
      `School reconciliation ${rule.id}: source changed; review required`,
    )
    const owners = candidates.filter(row => row.hkgovCsuId === rule.ownerCsu)
    assert.equal(owners.length, 1, `School reconciliation ${rule.id}: owner changed`)
    assert(owners[0], `School reconciliation ${rule.id}: owner missing`)
    const owner = owners[0]
    const sourceEvidence = candidates.map(row => ({
      addressId: row.id,
      canonicalId: row.canonicalId,
      sourceVersion: row.sourceVersion,
      sourceFile: row.sourceFile,
      sourceFeatureIndexOneBased: row.sourceFeatureIndexOneBased,
      ...rowEvidence(row),
    }))

    const en = JSON.parse(
      owner.engPremisesAddressJson ?? '{}',
    ) as HkgovLocalisedPremisesAddress
    const zh = JSON.parse(
      owner.chiPremisesAddressJson ?? '{}',
    ) as HkgovLocalisedPremisesAddress
    owner.enBuildingName = rule.enBuildingName
    owner.zhHantBuildingName = rule.zhBuildingName
    owner.enFormattedAddress = formatEnPremisesAddress({
      ...en,
      BuildingName: rule.enBuildingName,
    })
    owner.zhHantFormattedAddress = formatZhPremisesAddress({
      ...zh,
      BuildingName: rule.zhBuildingName,
    })
    owner.identitySummary = {
      ...owner.identitySummary,
      buildingName: rule.enBuildingName,
    }
    owner.identityAlias = owner.id
    owner.id =
      owner.canonicalId =
      owner.identityBuildingId =
        `ss-${buildDeterministicUuidV5(namespace, rule.id)}`
    owner.identityKey = owner.identityContinuityKey = `reviewed-school:${rule.id}`
    owner.identityMatchMethod = 'reviewed-school-reconciliation'
    owner.sources = JSON.stringify({
      ...JSON.parse(owner.sources),
      hkgovAlsSchoolReconciliation: {
        id: rule.id,
        authority: rule.authority,
        decision: rule.decision,
        curationFile: sourceFile,
        sourceVersion: version,
        sourceEvidence,
      },
    })

    const discarded = new Set(candidates.filter(row => row !== owner))
    rows.splice(0, rows.length, ...rows.filter(row => !discarded.has(row)))
  }
}
