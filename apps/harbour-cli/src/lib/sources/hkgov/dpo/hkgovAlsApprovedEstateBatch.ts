import { requireDefined } from '@repo/core/requireDefined'
import { strict as assert } from 'node:assert'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-approved-estate-batch.json'
import { als3dHash, type Als3dFeature } from './hkgovAls3d'
import type { HkgovAlsFeature, PreparedHkgovAlsRow } from './hkgovAlsTypes'

const curationFile = 'hkgov-dpo-address-approved-estate-batch.json'
const inBounds = (version: string) =>
  version >= fixture.sourceVersionFrom && version <= fixture.sourceVersionTo
export function assertApprovedEmptyInventory(feature: Als3dFeature, version: string) {
  if (!inBounds(version)) return
  const p = feature.properties.Address.PremisesAddress,
    en = p.EngPremisesAddress,
    zh = p.ChiPremisesAddress
  const rule = fixture.duplicates.find(
    r =>
      r.csu === p.BuildingCsuInformation?.CsuId &&
      !en?.BuildingName &&
      en?.EngEstate?.EstateName === r.estate &&
      r.assertions.some(s => s.sourceVersions.includes(version)),
  )
  if (!rule) return
  assert.equal(
    en?.Eng3dAddress?.length ?? 0,
    0,
    `Duplicate ${rule.id}: English inventory is no longer empty`,
  )
  assert.equal(
    zh?.Chi3dAddress?.length ?? 0,
    0,
    `Duplicate ${rule.id}: Chinese inventory is no longer empty`,
  )
}
export function estateBatchSignature(feature: HkgovAlsFeature | Als3dFeature) {
  const p = structuredClone(feature.properties?.Address?.PremisesAddress)
  assert(p, 'Estate correction: source premise missing')
  const en = p.EngPremisesAddress as { Eng3dAddress?: unknown } | undefined
  const zh = p.ChiPremisesAddress as { Chi3dAddress?: unknown } | undefined
  if (en) delete en.Eng3dAddress
  if (zh) delete zh.Chi3dAddress
  return als3dHash([p, feature.geometry])
}

/** Exact bilingual source signatures guard the reviewed identifier, not CSU alone. */
export function resolveApprovedEstateCsu(
  feature: HkgovAlsFeature | Als3dFeature,
  version: string,
) {
  if (!inBounds(version)) return null
  const p = feature.properties?.Address?.PremisesAddress
  const rule = fixture.corrections.find(
    c =>
      c.csus.includes(p?.BuildingCsuInformation?.CsuId ?? '') &&
      c.name === p?.EngPremisesAddress?.BuildingName,
  )
  if (!rule) return null
  const signature = estateBatchSignature(feature)
  assert(
    rule.signatures.some(
      s => s.hash === signature && s.sourceVersions.includes(version),
    ),
    `CSU correction ${rule.id}: source evidence changed`,
  )
  const en = p?.EngPremisesAddress as { Eng3dAddress?: unknown[] } | undefined
  const zh = p?.ChiPremisesAddress as { Chi3dAddress?: unknown[] } | undefined
  if (en?.Eng3dAddress?.length || zh?.Chi3dAddress?.length) {
    assert(
      rule.inventoryHashes.includes(als3dHash([en?.Eng3dAddress, zh?.Chi3dAddress])),
      `CSU correction ${rule.id}: inventory changed`,
    )
  }
  return { csu: rule.to, decision: { ...rule, curationFile, sourceVersion: version } }
}

/** Remove only the empty source variants whose components add nothing to their owner. */
export function suppressApprovedEstateDuplicates(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  if (!inBounds(version)) return 0
  let suppressed = 0
  for (const rule of fixture.duplicates) {
    if (!rule.assertions.some(s => s.sourceVersions.includes(version))) continue
    if (!rows.some(r => r.enEstateName === rule.estate)) continue
    const aliases = rows.filter(
      r =>
        r.hkgovCsuId === rule.csu &&
        r.enEstateName === rule.estate &&
        !r.enBuildingName &&
        !r.zhHantBuildingName,
    )
    assert.equal(aliases.length, 1, `Duplicate ${rule.id}: alias changed`)
    const owners = rows.filter(
      r =>
        r.hkgovCsuId === rule.ownerCsu &&
        r.enBuildingName === rule.ownerName &&
        r.enEstateName === rule.estate,
    )
    assert.equal(owners.length, 1, `Duplicate ${rule.id}: owner changed`)
    const alias = requireDefined(aliases[0]),
      owner = requireDefined(owners[0])
    const rawEn = JSON.parse(requireDefined(alias.engPremisesAddressJson)),
      rawZh = JSON.parse(requireDefined(alias.chiPremisesAddressJson))
    const signature = estateBatchSignature({
      geometry: JSON.parse(requireDefined(alias.geometry)),
      properties: {
        Address: {
          PremisesAddress: {
            BuildingCsuInformation: { CsuId: requireDefined(alias.hkgovCsuId) },
            ChiPremisesAddress: rawZh,
            EngPremisesAddress: rawEn,
            GeoAddress: requireDefined(alias.geoAddress),
          },
        },
      },
    })
    assert(
      rule.assertions.some(
        s => s.hash === signature && s.sourceVersions.includes(version),
      ),
      `Duplicate ${rule.id}: source evidence changed`,
    )
    for (const [raw, field, block] of [
      [rawEn, 'engPremisesAddressJson', 'EngBlock'],
      [rawZh, 'chiPremisesAddressJson', 'ChiBlock'],
    ] as const) {
      const named = JSON.parse(requireDefined(owner[field]))
      delete named.BuildingName
      delete named[block]
      assert.deepEqual(named, raw, `Duplicate ${rule.id}: additional address data`)
    }
    assert.equal(alias.geoAddress, owner.geoAddress)
    assert.equal(alias.geometry, owner.geometry)
    owner.sources = JSON.stringify({
      ...JSON.parse(owner.sources),
      hkgovAlsApprovedDuplicate: {
        ...rule,
        curationFile,
        sourceVersion: version,
        suppressedAddress: { ...alias },
      },
    })
    rows.splice(rows.indexOf(alias), 1)
    suppressed++
  }
  return suppressed
}
