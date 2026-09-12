import { requireDefined } from '@repo/core/requireDefined'
import { strict as assert } from 'node:assert'
import { buildDeterministicUuidV5 } from '@repo/db'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-estate-complex-decisions.json'
import { als3dHash } from './hkgovAls3d'
import {
  formatEnPremisesAddress,
  formatZhPremisesAddress,
} from './hkgovAlsNormalisation'
import type { HkgovAlsSourceFeature, PreparedHkgovAlsRow } from './hkgovAlsTypes'

const curationFile = 'hkgov-dpo-address-estate-complex-decisions.json'
const namespace = 'dc092f1c-4a88-5f27-a53e-18f456b333e1'

/** Reconstruct the reviewed estate premise only when no estate-level replacement exists. */
export function reconstructReviewedEstateComplexes(
  source: HkgovAlsSourceFeature[],
  version: string,
) {
  for (const rule of fixture.rules.filter(r => r.reconstruct)) {
    const expected = rule.assertions.find(a => a.version === version)
    if (!expected) continue
    const estate = source.filter(
      s =>
        s.feature.properties?.Address?.PremisesAddress?.EngPremisesAddress?.EngEstate
          ?.EstateName === rule.estate,
    )
    if (!estate.length) continue
    const candidates = source.filter(
      s =>
        s.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation
          ?.CsuId === rule.csu,
    )
    if (candidates.length) continue
    const other = estate.filter(s => {
      const p = s.feature.properties?.Address?.PremisesAddress
      const name = p?.EngPremisesAddress?.BuildingName
      return (
        p?.BuildingCsuInformation?.CsuId !== rule.csu && (!name || name === rule.estate)
      )
    })
    if (other.length) continue
    if (!candidates.length)
      source.push({
        feature: structuredClone(
          rule.evidence.feature,
        ) as unknown as HkgovAlsSourceFeature['feature'],
        sourceFile: curationFile,
        featureIndexOneBased: fixture.rules.indexOf(rule) + 1,
      })
  }
}

/** Canonical complex/building distinctions leave bilingual source JSON available to 3D matching. */
export function applyReviewedEstateComplexes(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  for (const rule of fixture.rules) {
    const expected = rule.assertions.find(a => a.version === version)
    if (!expected || !rows.some(r => r.enEstateName === rule.estate)) continue
    const sourceBlock = 'sourceBlock' in rule ? rule.sourceBlock : undefined
    const candidates = rows.filter(
      r =>
        r.hkgovCsuId === rule.csu &&
        (!sourceBlock ||
          (!r.enBuildingName &&
            !r.zhHantBuildingName &&
            r.enEstateName === rule.estate &&
            r.enBlockNumber === sourceBlock)),
    )
    if (rule.reconstruct && !candidates.some(row => row.sourceFile === curationFile))
      continue
    assert.equal(candidates.length, 1, `${rule.id}: unique premise required`)
    const row = requireDefined(candidates[0])
    const en = JSON.parse(requireDefined(row.engPremisesAddressJson)),
      zh = JSON.parse(requireDefined(row.chiPremisesAddressJson))
    const evidence = {
      BuildingCsuInformation: { CsuId: row.hkgovCsuId },
      ChiPremisesAddress: zh,
      EngPremisesAddress: en,
      GeoAddress: row.geoAddress,
    }
    const hash = als3dHash([evidence, JSON.parse(requireDefined(row.geometry))])
    const reconstructed = row.sourceFile === curationFile
    assert(
      (reconstructed &&
        !expected.hashes.length &&
        hash ===
          als3dHash([
            rule.evidence.feature.properties.Address.PremisesAddress,
            rule.evidence.feature.geometry,
          ])) ||
        expected.hashes.includes(hash),
      `${rule.id}: evidence changed`,
    )
    const original = {
      id: row.id,
      en,
      zh,
      geometry: JSON.parse(requireDefined(row.geometry)),
    }
    if (rule.action === 'complex') {
      row.enBuildingName = row.zhHantBuildingName = null
      delete en.BuildingName
      delete zh.BuildingName
      if (sourceBlock) {
        delete en.EngBlock
        delete zh.ChiBlock
        row.enBlockNumber = row.zhHantBlockNumber = null
        row.enBlockDescriptor = row.zhHantBlockDescriptor = null
      }
      row.curatedGranularity = 'complex'
    } else {
      row.enBuildingName = en.BuildingName = 'SHUN LEE COMMERCIAL CENTRE (PHASE II)'
      row.zhHantBuildingName = zh.BuildingName = '順利商場(二期)'
      row.curatedGranularity = 'building'
    }
    row.enFormattedAddress = formatEnPremisesAddress(en)
    row.zhHantFormattedAddress = formatZhPremisesAddress(zh)
    row.identityAlias = row.id
    row.id =
      row.canonicalId =
      row.identityBuildingId =
        `ss-${buildDeterministicUuidV5(namespace, rule.id)}`
    row.identityKey = row.identityContinuityKey = `reviewed-estate-complex:${rule.id}`
    row.identityMatchMethod = 'reviewed-estate-complex'
    row.identitySummary = { ...row.identitySummary, buildingName: row.enBuildingName }
    row.hierarchyCuration = rule.id
    row.sources = JSON.stringify({
      ...JSON.parse(row.sources),
      hkgovAlsEstateComplex: {
        id: rule.id,
        curationFile,
        authority: fixture.authority,
        sourceVersion: version,
        reconstructed,
        evidenceSourceVersion: reconstructed ? rule.evidence.sourceVersion : version,
        original,
        ...(reconstructed ? { sourceEvidence: rule.evidence } : {}),
      },
    })
  }
  const estate = rows.find(r => r.hierarchyCuration === 'shun-lee-estate')
  const centre = rows.find(r => r.hierarchyCuration === 'shun-lee-commercial-phase-ii')
  if (estate && centre) centre.parentAddressId = estate.id
}
