import { requireDefined } from '@repo/core/requireDefined'
import { AssertionError, strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-aliased-premise-coalescences.json'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'
import { AlsCurationReviewError, reportAlsCurationGuard } from './hkgovAlsReviewIssue'

const curationFile = 'hkgov-dpo-address-aliased-premise-coalescences.json'

/**
 * Coalesce reviewed cross-CSU aliases only when their structured building
 * identity, point and bilingual source assertions still agree.
 */
export function coalesceAlsAliasedPremises(
  rows: PreparedHkgovAlsRow[],
  version: string,
  skipCurationChecks = false,
) {
  const ownerIdByAliasId = new Map<string, string>()
  for (const decision of fixture.coalescences) {
    if (version < decision.sourceVersionFrom || version > decision.sourceVersionTo)
      continue
    const owners = rows.filter(row => row.hkgovCsuId === decision.owner.csu)
    const aliases = rows.filter(row => row.hkgovCsuId === decision.aliasCsu)
    const reviewError = (error: AssertionError) =>
      new AlsCurationReviewError({
        code: 'curation-guard-mismatch',
        status: 'unresolved',
        sourceVersion: version,
        curationFile,
        decisionId: decision.id,
        message: error.message,
        decision,
        assertion: {
          actual: error.actual,
          expected: error.expected,
          operator: error.operator,
        },
        records: [
          ...owners.map(row => ({ role: 'owner', row })),
          ...aliases.map(row => ({ role: 'alias', row })),
        ],
      })
    if (owners.length === 0 && aliases.length === 0) continue
    if ('sharedBuilding' in decision) {
      const ownerStreet = requireDefined(decision.ownerStreet)
      try {
        assert.equal(
          owners.length,
          2,
          `ALS alias ${decision.id}: paired assertions changed`,
        )
        assert.equal(
          aliases.length,
          2,
          `ALS alias ${decision.id}: paired assertions changed`,
        )
        const owner = owners.find(row => row.enStreetName === ownerStreet.en.StreetName)
        const alias = owners.find(row => row.enStreetName === null)
        if (!owner || !alias)
          throw new Error(`ALS alias ${decision.id}: paired assertions are missing`)
        const ownerEn = JSON.parse(owner.engPremisesAddressJson ?? 'null')
        const ownerZh = JSON.parse(owner.chiPremisesAddressJson ?? 'null')
        const aliasEn = JSON.parse(alias.engPremisesAddressJson ?? 'null')
        const aliasZh = JSON.parse(alias.chiPremisesAddressJson ?? 'null')
        assert.equal(ownerEn?.BuildingName, decision.owner.enBuildingName)
        assert.equal(ownerZh?.BuildingName, decision.owner.zhHantBuildingName)
        assert.equal(aliasEn?.BuildingName, decision.owner.enBuildingName)
        assert.equal(aliasZh?.BuildingName, decision.owner.zhHantBuildingName)
        assert.deepEqual(ownerEn?.EngStreet, ownerStreet.en)
        assert.deepEqual(ownerZh?.ChiStreet, ownerStreet.zh)
        assert.equal(aliasEn?.EngStreet ?? null, null)
        assert.equal(aliasZh?.ChiStreet ?? null, null)
        assert.equal(owner.enEstateName, decision.estate)
        assert.equal(owner.zhHantEstateName, decision.zhEstate)
        assert.equal(alias.enEstateName, decision.estate)
        assert.equal(alias.zhHantEstateName, decision.zhEstate)
        assert.equal(
          owner.geometry,
          alias.geometry,
          `ALS alias ${decision.id}: point changed`,
        )
      } catch (error) {
        if (!(error instanceof AssertionError)) throw error
        if (!skipCurationChecks) throw reviewError(error)
        reportAlsCurationGuard(version, curationFile, decision.id, error)
        continue
      }
      const owner = requireDefined(
        owners.find(row => row.enStreetName === ownerStreet.en.StreetName),
      )
      const alias = requireDefined(owners.find(row => row.enStreetName === null))
      const aliasEn = JSON.parse(alias.engPremisesAddressJson ?? 'null')
      const aliasZh = JSON.parse(alias.chiPremisesAddressJson ?? 'null')
      owner.sources = JSON.stringify({
        ...JSON.parse(owner.sources ?? '{}'),
        hkgovAlsAliasedPremiseCoalescence: {
          ...decision,
          curationFile,
          sourceVersion: version,
          suppressedAddress: {
            addressId: alias.id,
            canonicalId: alias.canonicalId,
            identityKey: alias.identityKey,
            geometry: JSON.parse(alias.geometry ?? 'null'),
            sources: JSON.parse(alias.sources ?? '{}'),
            engPremisesAddress: aliasEn,
            chiPremisesAddress: aliasZh,
          },
        },
      })
      ownerIdByAliasId.set(alias.id, owner.id)
      continue
    }
    const coordinateSelection =
      'coordinateSelection' in decision &&
      decision.coordinateSelection &&
      version >= decision.coordinateSelection.sourceVersionFrom &&
      version <= decision.coordinateSelection.sourceVersionTo
        ? decision.coordinateSelection
        : null
    try {
      assert.equal(owners.length, 1, `ALS alias ${decision.id}: owner changed`)
      assert.equal(aliases.length, 1, `ALS alias ${decision.id}: alias changed`)
      const owner = owners[0]
      const alias = aliases[0]
      if (!owner || !alias)
        throw new Error(`ALS alias ${decision.id}: premise is missing`)
      const ownerEn = JSON.parse(owner.engPremisesAddressJson ?? 'null')
      const ownerZh = JSON.parse(owner.chiPremisesAddressJson ?? 'null')
      const aliasEn = JSON.parse(alias.engPremisesAddressJson ?? 'null')
      const aliasZh = JSON.parse(alias.chiPremisesAddressJson ?? 'null')

      assert.equal(ownerEn?.BuildingName, decision.owner.enBuildingName)
      assert.equal(ownerZh?.BuildingName, decision.owner.zhHantBuildingName)
      assert.equal(aliasEn?.BuildingName ?? null, null)
      assert.equal(aliasZh?.BuildingName ?? null, null)
      assert.equal(ownerEn?.EngBlock ?? null, null)
      assert.equal(ownerZh?.ChiBlock ?? null, null)
      assert.equal(aliasEn?.EngBlock?.BlockDescriptor, 'BLK')
      assert.equal(aliasEn?.EngBlock?.BlockNo, decision.blockRef)
      assert.equal(aliasZh?.ChiBlock?.BlockDescriptor, '座')
      assert.equal(aliasZh?.ChiBlock?.BlockNo, decision.blockRef)
      assert.equal(alias.enBlockDescriptor, 'BLK')
      assert.equal(alias.enBlockNumber, decision.blockRef)
      assert.equal(alias.zhHantBlockDescriptor, '座')
      assert.equal(alias.zhHantBlockNumber, decision.blockRef)
      for (const row of [owner, alias]) {
        assert.equal(row.enEstateName, decision.estate)
        assert.equal(row.zhHantEstateName, decision.zhEstate)
        assert.equal(row.enStreetName, 'TIN SHUI ROAD')
        assert.equal(row.zhHantStreetName, '天瑞路')
        assert.equal(row.enStreetNumberFrom, '88')
        assert.equal(row.zhHantStreetNumberFrom, '88')
      }
      if (coordinateSelection) {
        assert.equal(coordinateSelection.selected, 'alias')
        assert.deepEqual(
          JSON.parse(owner.geometry ?? 'null'),
          { type: 'Point', coordinates: coordinateSelection.ownerCoordinates },
          `ALS alias ${decision.id}: owner point changed`,
        )
        assert.deepEqual(
          JSON.parse(alias.geometry ?? 'null'),
          { type: 'Point', coordinates: coordinateSelection.aliasCoordinates },
          `ALS alias ${decision.id}: alias point changed`,
        )
      } else {
        assert.equal(
          owner.geometry,
          alias.geometry,
          `ALS alias ${decision.id}: point changed`,
        )
      }
    } catch (error) {
      if (!(error instanceof AssertionError)) throw error
      if (!skipCurationChecks) throw reviewError(error)
      reportAlsCurationGuard(version, curationFile, decision.id, error)
      // A stale curation must not merge or rewrite the publisher assertions.
      continue
    }

    const owner = requireDefined(owners[0])
    const alias = requireDefined(aliases[0])
    const aliasEn = JSON.parse(alias.engPremisesAddressJson ?? 'null')
    const aliasZh = JSON.parse(alias.chiPremisesAddressJson ?? 'null')

    const publisherOwnerGeometry = JSON.parse(owner.geometry ?? 'null')
    if (coordinateSelection) owner.geometry = alias.geometry
    owner.sources = JSON.stringify({
      ...JSON.parse(owner.sources ?? '{}'),
      hkgovAlsAliasedPremiseCoalescence: {
        ...decision,
        curationFile,
        sourceVersion: version,
        ...(coordinateSelection
          ? {
              coordinateReview: {
                publisherOwnerGeometry,
                publisherAliasGeometry: JSON.parse(alias.geometry ?? 'null'),
                derivedGeometry: JSON.parse(owner.geometry ?? 'null'),
              },
            }
          : {}),
        suppressedAddress: {
          addressId: alias.id,
          canonicalId: alias.canonicalId,
          identityKey: alias.identityKey,
          geometry: JSON.parse(alias.geometry ?? 'null'),
          sources: JSON.parse(alias.sources ?? '{}'),
          engPremisesAddress: aliasEn,
          chiPremisesAddress: aliasZh,
        },
      },
    })
    ownerIdByAliasId.set(alias.id, owner.id)
  }
  return ownerIdByAliasId
}
