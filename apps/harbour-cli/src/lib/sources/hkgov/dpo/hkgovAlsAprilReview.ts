import { strict as assert } from 'node:assert'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-april-deletion-retentions.json'
import type { AlsMembership } from './hkgovAlsMembership'
import { als3dHash } from './hkgovAls3d'
import {
  formatEnPremisesAddress,
  formatZhPremisesAddress,
} from './hkgovAlsNormalisation'
import type { HkgovAlsSourceFeature, PreparedHkgovAlsRow } from './hkgovAlsTypes'

const aprilVersion = '2025-04-26.0'

const shiuKingFrontages = [
  {
    id: 'ss-2350ce85-0f68-5839-89d5-94086500dbe6',
    from: '177',
    to: '181',
    street: 'NGAU TAU KOK ROAD',
    zhStreet: '牛頭角道',
  },
  {
    id: 'ss-33e5d265-1d22-52e6-9155-4e439e59558d',
    from: '2',
    to: '8',
    street: 'ON WAH STREET',
    zhStreet: '安華街',
  },
  {
    id: 'ss-f5947d7b-082e-50cb-91da-dd6269799604',
    from: '10',
    to: null,
    street: 'CHUN WAH ROAD',
    zhStreet: '振華道',
  },
] as const

function patchShiuKingAddress(
  template: PreparedHkgovAlsRow,
  frontage: (typeof shiuKingFrontages)[number],
): PreparedHkgovAlsRow {
  const row = structuredClone(template)
  const en = JSON.parse(row.engPremisesAddressJson ?? '{}')
  const zh = JSON.parse(row.chiPremisesAddressJson ?? '{}')
  en.EngStreet = {
    ...en.EngStreet,
    BuildingNoFrom: frontage.from,
    ...(frontage.to ? { BuildingNoTo: frontage.to } : { BuildingNoTo: undefined }),
    StreetName: frontage.street,
  }
  zh.ChiStreet = {
    ...zh.ChiStreet,
    BuildingNoFrom: frontage.from,
    ...(frontage.to ? { BuildingNoTo: frontage.to } : { BuildingNoTo: undefined }),
    StreetName: frontage.zhStreet,
  }
  row.id = row.canonicalId = row.identityBuildingId = frontage.id
  row.identityAlias = null
  row.identityKey =
    row.identityContinuityKey = `april-shiu-king-building:${frontage.id}`
  row.identityMatchMethod = 'april-reviewed-address-reconciliation'
  row.identityNumberFrom = frontage.from
  row.identityNumberTo = frontage.to
  row.identityRouteNames = JSON.stringify([frontage.street, frontage.zhStreet])
  row.enStreetName = frontage.street
  row.enStreetNumberFrom = frontage.from
  row.enStreetNumberTo = frontage.to
  row.zhHantStreetName = frontage.zhStreet
  row.zhHantStreetNumberFrom = frontage.from
  row.zhHantStreetNumberTo = frontage.to
  row.engPremisesAddressJson = JSON.stringify(en)
  row.chiPremisesAddressJson = JSON.stringify(zh)
  row.enFormattedAddress = formatEnPremisesAddress(en)
  row.zhHantFormattedAddress = formatZhPremisesAddress(zh)
  row.curatedGranularity = 'building'
  row.parentAddressId = undefined
  row.hierarchyCuration = JSON.stringify({
    id: 'april-2025-shiu-king-frontages',
    curationFile: 'hkgov-dpo-address-april-deletion-retentions.json',
    authority: 'User-reviewed reconciliation, 2026-10-05',
  })
  row.sources = JSON.stringify({
    ...JSON.parse(row.sources),
    hkgovAlsAprilAddressSupplement: {
      id: 'april-2025-shiu-king-frontages',
      sourceRecordId: 'aae8ba0f-2d83-5af9-bdb3-09be07f043d8',
      authority: 'User-reviewed reconciliation, 2026-10-05',
      derivedFromCurrentPremise: '6 ON WAH STREET',
    },
  })
  row.identitySummary = {
    ...row.identitySummary,
    streetName: frontage.street,
    streetNumberFrom: frontage.from,
    streetNumberTo: frontage.to,
  }
  return row
}

/** Reconcile April tower addresses and restore Shiu King frontage/sub-premises structure. */
export function applyAprilReviewedAlsReconciliations(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  if (version < aprilVersion) return

  const seasideRows = rows.filter(
    row => row.enEstateName === 'SEASIDE SONATA' && row.enBlockDescriptor === 'TOWER',
  )
  if (seasideRows.length) {
    const towerNumbers = [...new Set(seasideRows.map(row => row.enBlockNumber))]
      .filter((value): value is string => Boolean(value))
      .sort()
    assert.deepEqual(
      towerNumbers,
      ['1', '2', '3', '5'],
      'Seaside Sonata should contain Towers 1, 2, 3 and 5; Tower 4 does not exist',
    )
    for (const towerNumber of towerNumbers) {
      const towerRows = seasideRows.filter(row => row.enBlockNumber === towerNumber)
      assert(towerRows.length > 0, `Seaside Sonata Tower ${towerNumber} is missing`)
      const preferredNumber = towerNumber === '2' ? '203' : '201'
      const owner =
        towerRows.find(row => row.enStreetNumberFrom === preferredNumber) ??
        towerRows[0]!
      const aliases = [
        ...towerRows.filter(row => row !== owner).map(row => row.id),
        ...(towerNumber === '2'
          ? [
              'ss-27686a7f-a722-51a6-8afe-b00d61f44984',
              'ss-65537b62-a551-5834-9c81-ea327319d269',
            ]
          : []),
      ]
      for (const duplicate of towerRows) {
        if (duplicate !== owner) rows.splice(rows.indexOf(duplicate), 1)
      }
      if (aliases.length) {
        owner.sources = JSON.stringify({
          ...JSON.parse(owner.sources),
          hkgovAlsReviewedIdentityCoalescence: {
            curationFile: 'hkgov-dpo-address-april-deletion-retentions.json',
            aliasIds: aliases,
          },
          reviewedIdentityAliases: [
            ...new Set([
              ...(JSON.parse(owner.sources).reviewedIdentityAliases ?? []),
              ...aliases,
            ]),
          ],
        })
      }
      const row = owner
      const en = JSON.parse(row.engPremisesAddressJson ?? '{}')
      const zh = JSON.parse(row.chiPremisesAddressJson ?? '{}')
      en.EngStreet = { ...en.EngStreet, BuildingNoFrom: '201', BuildingNoTo: '218' }
      zh.ChiStreet = { ...zh.ChiStreet, BuildingNoFrom: '201', BuildingNoTo: '218' }
      row.enStreetNumberFrom = row.zhHantStreetNumberFrom = '201'
      row.enStreetNumberTo = row.zhHantStreetNumberTo = '218'
      row.identityNumberFrom = '201'
      row.identityNumberTo = '218'
      row.identityKey =
        row.identityContinuityKey = `april-seaside-sonata-tower:${towerNumber}`
      row.engPremisesAddressJson = JSON.stringify(en)
      row.chiPremisesAddressJson = JSON.stringify(zh)
      row.enFormattedAddress = formatEnPremisesAddress(en)
      row.zhHantFormattedAddress = formatZhPremisesAddress(zh)
      row.identitySummary = {
        ...row.identitySummary,
        streetNumberFrom: '201',
        streetNumberTo: '218',
      }
      row.sources = JSON.stringify({
        ...JSON.parse(row.sources),
        hkgovAlsAprilAddressReconciliation: {
          authority: 'User-reviewed reconciliation, 2026-10-05',
          curationFile: 'hkgov-dpo-address-april-deletion-retentions.json',
          sharedRange: '201-218 HAI TAN STREET',
        },
      })
    }
  }

  const currentShop = rows.find(
    row =>
      row.hkgovCsuId === '4037420364T20241122' &&
      row.enBuildingName === 'SIU KING BUILDING' &&
      row.enStreetName === 'ON WAH STREET' &&
      row.enStreetNumberFrom === '6',
  )
  if (!currentShop) return
  const existingIds = new Set(rows.map(row => row.id))
  for (const frontage of shiuKingFrontages)
    assert(
      !existingIds.has(frontage.id),
      `${frontage.id}: Shiu King frontage already exists`,
    )

  const shopId = 'ss-9f77c50f-9932-532a-89c3-47efffeba555'
  const previousShop = rows.find(row => row.id === shopId && row !== currentShop)
  const previousAliases = previousShop?.identityAlias
    ? [previousShop.identityAlias]
    : []
  const shop = structuredClone(currentShop)
  shop.id = shop.canonicalId = shop.identityBuildingId = shopId
  shop.identityAlias = currentShop.id
  shop.identityKey = shop.identityContinuityKey = 'april-shiu-king-shop-subpremise'
  shop.identityMatchMethod = 'april-reviewed-address-reconciliation'
  shop.identitySummary = {
    ...shop.identitySummary,
    buildingName: null,
    role: 'shop sub-premises',
  }
  const shopEn = JSON.parse(shop.engPremisesAddressJson ?? '{}')
  const shopZh = JSON.parse(shop.chiPremisesAddressJson ?? '{}')
  delete shopEn.BuildingName
  delete shopZh.BuildingName
  shop.engPremisesAddressJson = JSON.stringify(shopEn)
  shop.chiPremisesAddressJson = JSON.stringify(shopZh)
  shop.enBuildingName = null
  shop.zhHantBuildingName = null
  shop.enFormattedAddress = formatEnPremisesAddress(shopEn)
  shop.zhHantFormattedAddress = formatZhPremisesAddress(shopZh)
  shop.curatedGranularity = 'unit'
  shop.parentAddressId = 'ss-33e5d265-1d22-52e6-9155-4e439e59558d'
  shop.hierarchyCuration = JSON.stringify({
    id: 'april-2025-shiu-king-shop-subpremise',
    curationFile: 'hkgov-dpo-address-april-deletion-retentions.json',
    authority: 'User-reviewed reconciliation, 2026-10-05',
  })
  shop.sources = JSON.stringify({
    ...JSON.parse(shop.sources),
    ...(previousAliases.length
      ? {
          hkgovAlsReviewedIdentityCoalescence: {
            curationFile: 'hkgov-dpo-address-april-deletion-retentions.json',
            aliasIds: previousAliases,
          },
          reviewedIdentityAliases: previousAliases,
        }
      : {}),
    hkgovAlsReviewedPremiseRetention: {
      curationFile: 'hkgov-dpo-address-april-deletion-retentions.json',
    },
    hkgovAlsAprilShopSubpremise: {
      curationFile: 'hkgov-dpo-address-april-deletion-retentions.json',
      authority: 'User-reviewed reconciliation, 2026-10-05',
      sourceRecordId: 'aae8ba0f-2d83-5af9-bdb3-09be07f043d8',
      predecessor: previousShop
        ? {
            id: previousShop.id,
            sourceVersion: previousShop.sourceVersion,
            csuId: previousShop.hkgovCsuId,
          }
        : null,
    },
  })

  const buildingRows = shiuKingFrontages.map(frontage =>
    patchShiuKingAddress(currentShop, frontage),
  )
  if (previousShop) rows.splice(rows.indexOf(previousShop), 1)
  const currentIndex = rows.indexOf(currentShop)
  rows.splice(currentIndex, 1, ...buildingRows, shop)
}

export function validateAprilInferredAlsSources(
  features: HkgovAlsSourceFeature[],
  version: string,
) {
  if (version < '2025-04-26.0') return
  for (const guard of fixture.sourceGuards) {
    if (!features.some(f => f.sourceFile === guard.sourceFile)) continue
    const expected = guard.assertions.find(a => a.version === version)
    assert(expected, `${guard.csu}: unreviewed April source release`)
    const hashes = features
      .filter(
        f =>
          f.sourceFile === guard.sourceFile &&
          f.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation
            ?.CsuId === guard.csu,
      )
      .map(f =>
        als3dHash([f.feature.properties?.Address?.PremisesAddress, f.feature.geometry]),
      )
      .sort()
    assert.deepEqual(hashes, expected.hashes, `${guard.csu}: April source changed`)
  }
}

export function validateAprilRetainedInventories(
  membership: AlsMembership,
  version: string,
) {
  if (version < '2025-04-26.0') return
  for (const decision of fixture.inventories) {
    const inventory = membership.collections.find(c => c.ownerId === decision.ownerId)
    assert(inventory, `${decision.ownerId}: retained April inventory is missing`)
    assert.equal(inventory.units.length, decision.previousUnitCount)
    assert.deepEqual(
      inventory.units.map(([id]) => id).sort(),
      decision.unitIds,
      `${decision.ownerId}: April unit identities changed`,
    )
  }
}
