import { strict as assert } from 'node:assert'
import { buildDeterministicUuidV5 } from '@repo/db'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-complex-promotions.json'
import { als3dHash } from './hkgovAls3d'
import {
  formatEnPremisesAddress,
  formatZhPremisesAddress,
} from './hkgovAlsNormalisation'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'
import type { Als3dLocale } from './hkgovAls3d'

const sourceFile = 'hkgov-dpo-address-complex-promotions.json'
const namespace = '71c00c8c-f7ea-562a-8754-2d26a9a2eccd'

/** The promoted 2D assertion's residential inventory belongs to retained Block 1. */
export function reviewedComplexInventoryParents(rows: PreparedHkgovAlsRow[]) {
  return fixture.promotions.flatMap(rule => {
    const complex = rows.find(row => row.hierarchyCuration === rule.id)
    if (!complex) return []
    const evidence = JSON.parse(complex.sources).hkgovAlsComplexPromotion
      ?.sourceEvidence
    assert(
      evidence?.length === 1,
      `Complex promotion ${rule.id}: missing inventory evidence`,
    )
    const owners = rows.filter(
      row =>
        row.hkgovCsuId === rule.csu &&
        row.enEstateName === rule.estate &&
        row.enBuildingName === rule.buildingName &&
        row.enBlockNumber === '1',
    )
    assert(
      owners.length === 1 && owners[0],
      `Complex promotion ${rule.id}: inventory owner changed`,
    )
    return [
      {
        csu: rule.csu,
        en: evidence[0].en as Als3dLocale,
        zh: evidence[0].zh as Als3dLocale,
        owner: owners[0],
      },
    ]
  })
}

function rowEvidence(row: PreparedHkgovAlsRow) {
  return {
    csu: row.hkgovCsuId,
    geoAddress: row.geoAddress,
    geometry: JSON.parse(row.geometry ?? 'null'),
    en: JSON.parse(row.engPremisesAddressJson ?? 'null'),
    zh: JSON.parse(row.chiPremisesAddressJson ?? 'null'),
  }
}

/** Promote a reviewed blockless premise without consuming its numbered house. */
export function applyReviewedComplexPromotions(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  for (const rule of fixture.promotions) {
    if (!rule.sourceVersions.includes(version)) continue
    const candidates = rows.filter(row => {
      const en = JSON.parse(row.engPremisesAddressJson ?? '{}')
      return (
        row.hkgovCsuId === rule.csu &&
        row.enEstateName === rule.estate &&
        row.enBuildingName === rule.buildingName &&
        !en.EngBlock
      )
    })
    if (!candidates.length) continue
    assert.equal(
      candidates.length,
      1,
      `Complex promotion ${rule.id}: source count changed`,
    )
    assert(candidates[0], `Complex promotion ${rule.id}: source missing`)
    const candidate = candidates[0]
    const hash = als3dHash([rowEvidence(candidate)])
    assert(
      rule.assertions.some(
        assertion =>
          assertion.hash === hash && assertion.sourceVersions.includes(version),
      ),
      `Complex promotion ${rule.id}: source changed; review required`,
    )

    const blockOne = rows.filter(row => {
      const en = JSON.parse(row.engPremisesAddressJson ?? '{}')
      return row.hkgovCsuId === rule.csu && en.EngBlock?.BlockNo === '1'
    })
    assert.equal(blockOne.length, 1, `Complex promotion ${rule.id}: Block 1 changed`)

    const en = rule.canonical.en,
      zh = rule.canonical.zh,
      id = `ss-${buildDeterministicUuidV5(namespace, rule.id)}`
    const derived: PreparedHkgovAlsRow = {
      ...candidate,
      id,
      canonicalId: id,
      sourceFile,
      sourceFeatureIndexOneBased: fixture.promotions.indexOf(rule) + 1,
      geoAddress: null,
      hkgovCsuId: null,
      easting: null,
      northing: null,
      enPhaseName: null,
      enPhaseRef: null,
      zhHantPhaseName: null,
      zhHantPhaseRef: null,
      enPhaseRomanNumeralNormalisation: null,
      identifiers: null,
      identityAlias: null,
      identityBuildingId: id,
      identityKey: `reviewed-complex:${rule.id}`,
      identityContinuityKey: `reviewed-complex:${rule.id}`,
      identityMatchMethod: 'reviewed-complex-promotion',
      identitySummary: {
        estateName: rule.estate,
        buildingName: null,
        streetName: en.EngStreet.StreetName,
        streetNumberFrom: en.EngStreet.BuildingNoFrom,
      },
      identityNumberFrom: en.EngStreet.BuildingNoFrom,
      identityNumberTo: null,
      identityRouteNames: JSON.stringify([
        en.EngStreet.StreetName,
        zh.ChiStreet.StreetName,
      ]),
      geometry: JSON.stringify({ type: 'Point', coordinates: rule.coordinates }),
      engPremisesAddressJson: JSON.stringify(en),
      chiPremisesAddressJson: JSON.stringify(zh),
      enBuildingName: null,
      zhHantBuildingName: null,
      enBlockNumber: null,
      zhHantBlockNumber: null,
      enBlockDescriptor: null,
      zhHantBlockDescriptor: null,
      blockDescriptorPrecedenceIndicator: null,
      enBuildingNameRomanNumeralNormalisation: null,
      enBlockNumberRomanNumeralNormalisation: null,
      enStreetName: en.EngStreet.StreetName,
      enStreetNumberFrom: en.EngStreet.BuildingNoFrom,
      enStreetNumberTo: null,
      zhHantStreetName: zh.ChiStreet.StreetName,
      zhHantStreetNumberFrom: zh.ChiStreet.BuildingNoFrom,
      zhHantStreetNumberTo: null,
      enVillageName: null,
      enVillageNumberFrom: null,
      enVillageNumberTo: null,
      zhHantVillageName: null,
      zhHantVillageNumberFrom: null,
      zhHantVillageNumberTo: null,
      enFormattedAddress: formatEnPremisesAddress(en),
      zhHantFormattedAddress: formatZhPremisesAddress(zh),
      curatedGranularity: 'complex',
      hierarchyCuration: rule.id,
      sources: JSON.stringify({
        hkgovAlsComplexPromotion: {
          id: rule.id,
          authority: rule.authority,
          decision: rule.decision,
          curationFile: sourceFile,
          sourceVersion: version,
          sourceEvidence: [rowEvidence(candidate)],
        },
      }),
    }
    delete derived.parentAddressId
    delete derived.identityPreviousSummary
    rows.splice(rows.indexOf(candidate), 1, derived)
  }
}
