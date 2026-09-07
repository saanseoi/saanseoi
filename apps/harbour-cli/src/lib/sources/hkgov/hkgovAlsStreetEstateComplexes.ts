import { requireDefined } from '@repo/core/requireDefined'
import { strict as assert } from 'node:assert'
import { buildDeterministicUuidV5 } from '@repo/db'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-street-estate-complexes.json'
import upperFixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-upper-estate-complexes.json'
import { als3dHash, type Als3dFeature } from './hkgovAls3d'
import {
  curationProvenance,
  resolveHkgovAlsCurationVerification,
  type HkgovAlsCurationApplication,
} from './hkgovAlsCurationLifecycle'
import {
  formatEnPremisesAddress,
  formatZhPremisesAddress,
} from './hkgovAlsNormalisation'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'
const sourceFile = 'hkgov-dpo-address-street-estate-complexes.json'
const namespace = '71c00c8c-f7ea-562a-8754-2d26a9a2eccd'
type Rule = (typeof fixture.rules)[number] & {
  sourceCsu?: string
  retainSourcePremise?: boolean
  streetOverride?: { en: string; zh: string; number: string } | null
}
const rules: Rule[] = [...fixture.rules, ...upperFixture.rules]
function active(version: string) {
  return rules.flatMap(rule => {
    const application = rule.application as HkgovAlsCurationApplication | null,
      verification = resolveHkgovAlsCurationVerification(
        version,
        rule.sourceVersions,
        application ?? undefined,
      )
    return verification
      ? [
          {
            rule,
            curation: curationProvenance({
              id: rule.id,
              application: application ?? undefined,
              sourceVersion: version,
              verification,
            }),
          },
        ]
      : []
  })
}
function raw(row: PreparedHkgovAlsRow) {
  return {
    BuildingCsuInformation: { CsuId: row.hkgovCsuId },
    ChiPremisesAddress: JSON.parse(requireDefined(row.chiPremisesAddressJson)),
    EngPremisesAddress: JSON.parse(requireDefined(row.engPremisesAddressJson)),
    GeoAddress: row.geoAddress,
  }
}

/** Derive estate identities without assigning publisher house identifiers to the complex. */
export function applyReviewedStreetEstateComplexes(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  let count = 0
  for (const { rule, curation } of active(version)) {
    const curationFile = rule.sourceCsu
      ? 'hkgov-dpo-address-upper-estate-complexes.json'
      : sourceFile
    const estateRows = rows.filter(r => r.enEstateName === rule.estate)
    if (!estateRows.length) continue
    const aliases = estateRows.filter(r => {
      if (rule.sourceCsu) return r.hkgovCsuId === rule.sourceCsu
      const p = raw(r)
      return (
        !p.EngPremisesAddress.BuildingName ||
        p.EngPremisesAddress.BuildingName === rule.estate
      )
    })
    const hashes = aliases
      .map(r => als3dHash([raw(r), JSON.parse(requireDefined(r.geometry))]))
      .sort()
    const historical = rule.assertions.find(a => a.sourceVersions.includes(version))
    const permitted = historical ? [historical] : rule.assertions
    assert(
      permitted.some(a => JSON.stringify(a.hashes) === JSON.stringify(hashes)) ||
        (!historical && Boolean(rule.sourceCsu) && hashes.length === 0),
      `Street estate ${rule.id}: publisher alias changed`,
    )
    const evidence = rule.evidence
      .flatMap(e =>
        e.sourceVersions
          .filter(v => v <= version)
          .map(v => ({ feature: e.feature, version: v })),
      )
      .sort((a, b) => a.version.localeCompare(b.version))
      .at(-1)
    assert(evidence, `Street estate ${rule.id}: missing dated address evidence`)
    const p = structuredClone(evidence.feature.properties.Address.PremisesAddress),
      en = p.EngPremisesAddress,
      zh = p.ChiPremisesAddress
    // Component premises remain source evidence, not the derived estate's label.
    delete (en as { EngBlock?: unknown }).EngBlock
    delete (zh as { ChiBlock?: unknown }).ChiBlock
    if (rule.streetOverride) {
      en.EngStreet = {
        StreetName: rule.streetOverride.en,
        BuildingNoFrom: rule.streetOverride.number,
      }
      zh.ChiStreet = {
        StreetName: rule.streetOverride.zh,
        BuildingNoFrom: rule.streetOverride.number,
      }
    }
    const originalAliases = structuredClone(aliases)
    const template = aliases[0] ?? requireDefined(estateRows[0])
    const id = `ss-${buildDeterministicUuidV5(namespace, rule.id)}`
    const derived: PreparedHkgovAlsRow = {
      ...template,
      id,
      canonicalId: id,
      sourceFile: curationFile,
      sourceFeatureIndexOneBased: rules.indexOf(rule) + 1,
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
      identityKey: `reviewed-street-estate:${rule.id}`,
      identityContinuityKey: `reviewed-street-estate:${rule.id}`,
      identityMatchMethod: 'reviewed-street-estate',
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
      geometry: JSON.stringify({
        type: 'Point',
        coordinates: rule.coordinates ?? evidence.feature.geometry.coordinates,
      }),
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
        hkgovAlsStreetEstateComplex: {
          id: rule.id,
          sourceFile: curationFile,
          curation,
          authority: rule.authority,
          evidenceSourceVersion: evidence.version,
          evidenceAssertion: evidence.feature,
          originalAliases,
          geometryAuthority: rule.coordinates
            ? 'User supplied estate marker'
            : 'Dated estate address assertion',
        },
      }),
    }
    delete derived.parentAddressId
    delete derived.identityPreviousSummary
    const discard = new Set(rule.retainSourcePremise ? [] : aliases)
    rows.splice(0, rows.length, ...rows.filter(r => !discard.has(r)), derived)
    count++
  }
  return { complexCount: count }
}

/** An estate-level alias cannot carry a house inventory without a fresh review. */
export function assertStreetEstateAliasInventoryEmpty(
  feature: Als3dFeature,
  version: string,
) {
  const p = feature.properties.Address.PremisesAddress
  if (p.EngPremisesAddress?.BuildingName) return
  for (const { rule } of active(version))
    if (
      !rule.retainSourcePremise &&
      (!rule.sourceCsu || p.BuildingCsuInformation?.CsuId === rule.sourceCsu) &&
      p.EngPremisesAddress?.EngEstate?.EstateName === rule.estate
    ) {
      assert.equal(
        p.EngPremisesAddress?.Eng3dAddress?.length ?? 0,
        0,
        `Street estate ${rule.id}: English alias inventory requires review`,
      )
      assert.equal(
        p.ChiPremisesAddress?.Chi3dAddress?.length ?? 0,
        0,
        `Street estate ${rule.id}: Chinese alias inventory requires review`,
      )
    }
}
