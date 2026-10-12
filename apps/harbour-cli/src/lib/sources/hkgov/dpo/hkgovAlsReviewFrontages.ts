import { strict as assert } from 'node:assert'
import { alsReviewOperations } from './hkgovAlsReviewProgram'
import {
  formatEnPremisesAddress,
  formatZhPremisesAddress,
} from './hkgovAlsNormalisation'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'
import type {
  BlockFrontages,
  Frontage,
  ReconstructedFrontages,
  ReviewGuard,
} from './hkgovAlsReviewOperationSchema'

const matches = (row: PreparedHkgovAlsRow, selector: ReviewGuard) =>
  Object.entries(selector).every(
    ([key, value]) => row[key as keyof PreparedHkgovAlsRow] === value,
  )

export function applyReviewedAlsFrontages(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  for (const operation of alsReviewOperations) {
    if (
      (operation.code !== 'reconcile-block-frontages' &&
        operation.code !== 'reconstruct-frontages') ||
      version < operation.sourceVersionFrom
    )
      continue
    if (operation.code === 'reconcile-block-frontages')
      for (const decision of operation.decisions)
        reconcileBlockFrontages(rows, decision)
    else
      for (const decision of operation.decisions) reconstructFrontages(rows, decision)
  }
}

function patchReviewedFrontage(
  template: PreparedHkgovAlsRow,
  frontage: Frontage,
  decision: ReconstructedFrontages,
): PreparedHkgovAlsRow {
  const row = structuredClone(template)
  const en = JSON.parse(row.engPremisesAddressJson ?? '{}')
  const zh = JSON.parse(row.chiPremisesAddressJson ?? '{}')
  en.EngStreet = {
    ...en.EngStreet,
    BuildingNoFrom: frontage.fromNumber,
    ...(frontage.toNumber
      ? { BuildingNoTo: frontage.toNumber }
      : { BuildingNoTo: undefined }),
    StreetName: frontage.street,
  }
  zh.ChiStreet = {
    ...zh.ChiStreet,
    BuildingNoFrom: frontage.fromNumber,
    ...(frontage.toNumber
      ? { BuildingNoTo: frontage.toNumber }
      : { BuildingNoTo: undefined }),
    StreetName: frontage.zhStreet,
  }
  row.id = row.canonicalId = row.identityBuildingId = frontage.id
  row.identityAlias = null
  row.identityKey = row.identityContinuityKey = frontage.identityKey
  row.identityMatchMethod = decision.identityMatchMethod
  row.identityNumberFrom = frontage.fromNumber
  row.identityNumberTo = frontage.toNumber
  row.identityRouteNames = JSON.stringify([frontage.street, frontage.zhStreet])
  row.enStreetName = frontage.street
  row.enStreetNumberFrom = frontage.fromNumber
  row.enStreetNumberTo = frontage.toNumber
  row.zhHantStreetName = frontage.zhStreet
  row.zhHantStreetNumberFrom = frontage.fromNumber
  row.zhHantStreetNumberTo = frontage.toNumber
  row.engPremisesAddressJson = JSON.stringify(en)
  row.chiPremisesAddressJson = JSON.stringify(zh)
  row.enFormattedAddress = formatEnPremisesAddress(en)
  row.zhHantFormattedAddress = formatZhPremisesAddress(zh)
  row.curatedGranularity = 'building'
  row.parentAddressId = undefined
  row.hierarchyCuration = JSON.stringify({
    id: decision.id,
    curationFile: decision.curationFile,
    authority: decision.authority,
  })
  row.sources = JSON.stringify({
    ...JSON.parse(row.sources),
    [decision.frontageProvenanceKey]: {
      id: decision.id,
      sourceRecordId: decision.sourceRecordId,
      authority: decision.authority,
      derivedFromCurrentPremise: decision.derivedFromCurrentPremise,
    },
  })
  row.identitySummary = {
    ...row.identitySummary,
    streetName: frontage.street,
    streetNumberFrom: frontage.fromNumber,
    streetNumberTo: frontage.toNumber,
  }
  return row
}

function reconcileBlockFrontages(
  rows: PreparedHkgovAlsRow[],
  decision: BlockFrontages,
) {
  const selectedRows = rows.filter(row => matches(row, decision.selector))
  if (selectedRows.length) {
    const towerNumbers = [...new Set(selectedRows.map(row => row.enBlockNumber))]
      .filter((value): value is string => Boolean(value))
      .sort()
    assert.deepEqual(
      towerNumbers,
      decision.blocks.map(block => block.number).sort(),
      `${decision.id}: reviewed block numbers changed`,
    )
    for (const towerNumber of towerNumbers) {
      const towerRows = selectedRows.filter(row => row.enBlockNumber === towerNumber)
      assert(towerRows.length > 0, `${decision.id}: block ${towerNumber} is missing`)
      const block = decision.blocks.find(block => block.number === towerNumber)!
      const preferredNumber = block.preferredNumber
      const owner =
        towerRows.find(row => row.enStreetNumberFrom === preferredNumber) ??
        towerRows[0]!
      const aliases = [
        ...towerRows.filter(row => row !== owner).map(row => row.id),
        ...block.aliasIds,
      ]
      for (const duplicate of towerRows) {
        if (duplicate !== owner) rows.splice(rows.indexOf(duplicate), 1)
      }
      if (aliases.length) {
        owner.sources = JSON.stringify({
          ...JSON.parse(owner.sources),
          hkgovAlsReviewedIdentityCoalescence: {
            curationFile: decision.curationFile,
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
      en.EngStreet = {
        ...en.EngStreet,
        BuildingNoFrom: decision.fromNumber,
        BuildingNoTo: decision.toNumber,
      }
      zh.ChiStreet = {
        ...zh.ChiStreet,
        BuildingNoFrom: decision.fromNumber,
        BuildingNoTo: decision.toNumber,
      }
      row.enStreetNumberFrom = row.zhHantStreetNumberFrom = decision.fromNumber
      row.enStreetNumberTo = row.zhHantStreetNumberTo = decision.toNumber
      row.identityNumberFrom = decision.fromNumber
      row.identityNumberTo = decision.toNumber
      row.identityKey = row.identityContinuityKey = block.identityKey
      row.engPremisesAddressJson = JSON.stringify(en)
      row.chiPremisesAddressJson = JSON.stringify(zh)
      row.enFormattedAddress = formatEnPremisesAddress(en)
      row.zhHantFormattedAddress = formatZhPremisesAddress(zh)
      row.identitySummary = {
        ...row.identitySummary,
        streetNumberFrom: decision.fromNumber,
        streetNumberTo: decision.toNumber,
      }
      row.sources = JSON.stringify({
        ...JSON.parse(row.sources),
        [decision.provenanceKey]: decision.provenance,
      })
    }
  }
}

function reconstructFrontages(
  rows: PreparedHkgovAlsRow[],
  decision: ReconstructedFrontages,
) {
  const currentShop = rows.find(row => matches(row, decision.selector))
  if (!currentShop) return
  const existingIds = new Set(rows.map(row => row.id))
  for (const frontage of decision.frontages)
    assert(
      !existingIds.has(frontage.id),
      `${frontage.id}: reviewed frontage already exists`,
    )

  const shopId = decision.subpremise.id
  const previousShop = rows.find(row => row.id === shopId && row !== currentShop)
  const previousAliases =
    previousShop?.identityAlias && previousShop.identityAlias !== shopId
      ? [previousShop.identityAlias]
      : []
  const shop = structuredClone(currentShop)
  shop.id = shop.canonicalId = shop.identityBuildingId = shopId
  shop.identityAlias = currentShop.id === shopId ? null : currentShop.id
  shop.identityKey = shop.identityContinuityKey = decision.subpremise.identityKey
  shop.identityMatchMethod = decision.identityMatchMethod
  shop.identitySummary = {
    ...shop.identitySummary,
    buildingName: null,
    role: decision.subpremise.role,
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
  shop.parentAddressId = decision.subpremise.parentId
  shop.hierarchyCuration = JSON.stringify({
    id: decision.subpremise.decisionId,
    curationFile: decision.curationFile,
    authority: decision.authority,
  })
  shop.sources = JSON.stringify({
    ...JSON.parse(shop.sources),
    ...(previousAliases.length
      ? {
          hkgovAlsReviewedIdentityCoalescence: {
            curationFile: decision.curationFile,
            aliasIds: previousAliases,
          },
          reviewedIdentityAliases: previousAliases,
        }
      : {}),
    hkgovAlsReviewedPremiseRetention: {
      curationFile: decision.curationFile,
    },
    [decision.subpremise.provenanceKey]: {
      curationFile: decision.curationFile,
      authority: decision.authority,
      sourceRecordId: decision.sourceRecordId,
      predecessor: previousShop
        ? {
            id: previousShop.id,
            sourceVersion: previousShop.sourceVersion,
            csuId: previousShop.hkgovCsuId,
          }
        : null,
    },
  })

  const buildingRows = decision.frontages.map(frontage =>
    patchReviewedFrontage(currentShop, frontage, decision),
  )
  if (previousShop) rows.splice(rows.indexOf(previousShop), 1)
  const currentIndex = rows.indexOf(currentShop)
  rows.splice(currentIndex, 1, ...buildingRows, shop)
}
