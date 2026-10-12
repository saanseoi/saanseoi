import { strict as assert } from 'node:assert'
import { alsReviewOperations } from './hkgovAlsReviewProgram'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

/** Classification runs after identity resolution; the original reviewed guard is mandatory. */
export function classifyReviewedAlsPremises(
  rows: PreparedHkgovAlsRow[],
  version: string,
  phase: 'shops' | 'final-parents',
  fixture?: string,
) {
  for (const operation of alsReviewOperations) {
    if (
      operation.code !== 'classify-premise' ||
      operation.phase !== phase ||
      version < operation.sourceVersionFrom ||
      (fixture && operation.collection !== fixture)
    )
      continue
    for (const d of operation.decisions) {
      const row = rows.find(r => r.id === d.id)
      if (!row) continue
      assert(
        rows.some(r => r.id === d.parentId),
        `${d.id}: reviewed parent must be retained`,
      )
      for (const [key, expected] of Object.entries(d.targetGuard))
        assert.deepEqual(
          row[key as keyof PreparedHkgovAlsRow],
          expected,
          `${d.id}: child evidence changed (${key})`,
        )
      if (d.granularity) row.curatedGranularity = d.granularity
      row.parentAddressId = d.parentId
      row.hierarchyCuration = JSON.stringify(d.provenance)
    }
  }
}

/** Retain the rejected publisher assertion on its reviewed surviving owner. */
export function suppressReviewedAlsDuplicates(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  for (const operation of alsReviewOperations) {
    if (
      operation.code !== 'suppress-duplicate-premise' ||
      version < operation.sourceVersionFrom
    )
      continue
    const curationFile = `${operation.fixture}.json`
    for (const suppression of operation.decisions) {
      const removed = rows.filter(
        r =>
          r.hkgovCsuId === suppression.csu &&
          r.enStreetNumberFrom === suppression.streetNumber &&
          r.enBuildingName === suppression.buildingName,
      )
      if (!removed.length) continue
      const owner = rows.find(
        r =>
          JSON.parse(r.sources).hkgovAlsReviewedPremiseRetention?.id ===
          suppression.retainRule,
      )
      assert(owner, `${suppression.id}: renamed building is missing`)
      owner.sources = JSON.stringify({
        ...JSON.parse(owner.sources),
        reviewedDemolishedDuplicate: {
          id: suppression.id,
          curationFile,
          authority: suppression.authority,
          assertions: removed.map(r => ({
            sourceFile: r.sourceFile,
            sourceFeatureIndexOneBased: r.sourceFeatureIndexOneBased,
            publisherSource: r.publisherSource,
          })),
        },
      })
      const excluded = new Set(removed)
      rows.splice(0, rows.length, ...rows.filter(r => !excluded.has(r)))
    }
  }
}

/** Derive the reviewed parent without claiming an independent publisher assertion. */
export function deriveReviewedAlsParents(rows: PreparedHkgovAlsRow[], version: string) {
  for (const operation of alsReviewOperations) {
    if (operation.code !== 'derive-parent' || version < operation.sourceVersionFrom)
      continue
    const curationFile = `${operation.fixture}.json`
    for (const group of operation.decisions) {
      const children = rows.filter(
        r =>
          r.sourceFile === group.sourceFile &&
          r.hkgovCsuId === group.csu &&
          r.id !== group.parentId,
      )
      let parent = rows.find(r => r.id === group.parentId)
      if (group.derivedParent && !parent) {
        const template = rows.find(
          r =>
            JSON.parse(r.sources).hkgovAlsReviewedPremiseRetention?.id ===
            group.parentRule,
        )
        if (!template) continue // Other district inputs cannot supply this derived parent.
        parent = {
          ...template,
          id: group.parentId,
          canonicalId: group.parentId,
          hkgovCsuId: null,
          geoAddress: null,
          publisherSource: null,
          identifiers: JSON.stringify({ curationId: group.id }),
          sources: JSON.stringify({
            reviewedBuildingParent: {
              id: group.id,
              curationFile,
              authority: operation.authority,
              derivedFrom: template.id,
            },
          }),
          sourceFile: curationFile,
          sourceFeatureIndexOneBased: 0,
          identityAlias: null,
          identityBuildingId: group.parentId,
          identityKey: group.parentId,
          identityContinuityKey: group.parentId,
          identityMatchMethod: 'reviewed-address-hierarchy',
          engPremisesAddressJson: null,
          chiPremisesAddressJson: null,
          enStreetName: null,
          zhHantStreetName: null,
          enStreetNumberFrom: null,
          enStreetNumberTo: null,
          zhHantStreetNumberFrom: null,
          zhHantStreetNumberTo: null,
          identityNumberFrom: null,
          identityNumberTo: null,
          enFormattedAddress: template.enBuildingName,
          zhHantFormattedAddress: template.zhHantBuildingName,
          parentAddressId: undefined,
          curatedGranularity: 'building',
          hierarchyCuration: group.id,
        }
        rows.push(parent)
        children.push(template)
      }
      if (!parent) {
        assert(!children.length, `${group.id}: reviewed parent is missing`)
        continue
      }
      for (const child of children) {
        child.parentAddressId = parent.id
        child.curatedGranularity = group.childGranularity
        child.hierarchyCuration = JSON.stringify({
          id: group.id,
          curationFile,
          authority: operation.authority,
        })
      }
    }
  }
}

export function recordReviewedAlsCoalescences(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  for (const operation of alsReviewOperations) {
    if (
      operation.code !== 'record-coalescence' ||
      version < operation.sourceVersionFrom
    )
      continue
    for (const decision of operation.decisions) {
      const owner = rows.find(row => row.id === decision.canonicalId)
      if (!owner) continue
      assert.equal(
        owner.hkgovCsuId,
        decision.csu,
        `${decision.id}: publisher identity changed`,
      )
      assert.equal(
        owner.enBuildingName,
        decision.enName,
        `${decision.id}: named owner changed`,
      )
      owner.sources = JSON.stringify({
        ...JSON.parse(owner.sources),
        hkgovAlsReviewedIdentityCoalescence: {
          ...decision,
          curationFile: `${operation.fixture}.json`,
        },
      })
    }
  }
}

/** Sections retain their own native collection and unit namespace. */
export function reviewedAlsSectionOwnership(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  const ownership = new Map<
    string,
    { ownerId: string; physicalBuildingId: string; unresolvedSectionIds: string[] }
  >()
  for (const operation of alsReviewOperations) {
    if (
      operation.code !== 'preserve-section-ownership' ||
      version < operation.sourceVersionFrom
    )
      continue
    for (const group of operation.decisions) {
      if (group.childGranularity !== 'section') continue
      for (const id of group.childIds) {
        const row = rows.find(r => r.id === id)
        if (!row) continue
        assert.equal(
          row.parentAddressId,
          group.parentId,
          `${group.id}: section parent changed`,
        )
        assert.equal(
          row.curatedGranularity,
          'section',
          `${group.id}: section granularity changed`,
        )
        ownership.set(id, {
          ownerId: id,
          physicalBuildingId: id,
          unresolvedSectionIds: [],
        })
      }
    }
  }
  return ownership
}

export function applyReviewedAlsDerivedHierarchy(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  suppressReviewedAlsDuplicates(rows, version)
  deriveReviewedAlsParents(rows, version)
}
