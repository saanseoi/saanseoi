import { strict as assert } from 'node:assert'
import { alsReviewOperations } from './hkgovAlsReviewProgram'
import { permitsAlsReviewIssue } from './hkgovAlsReviewPolicy'
import { reportAlsReviewIssue } from './hkgovAlsReviewIssue'
import type { AlsMembership } from './hkgovAlsMembership'

/** Equal counts are insufficient: every reviewed canonical unit ID must survive. */
export function validateReviewedAlsInventories(
  membership: AlsMembership,
  version: string,
  fixture?: string,
) {
  for (const operation of alsReviewOperations) {
    if (
      operation.code !== 'guard-inventory' ||
      version < operation.sourceVersionFrom ||
      (fixture && operation.fixture !== fixture)
    )
      continue
    for (const decision of operation.decisions) {
      const coalesced = 'canonicalId' in decision
      const ownerId = coalesced ? decision.canonicalId : decision.ownerId
      const owner = coalesced
        ? membership.addresses.find(a => a.id === ownerId)
        : undefined
      if (coalesced && !owner) continue
      const inventory = membership.collections.find(c => c.ownerId === ownerId)
      if (
        coalesced &&
        !inventory &&
        permitsAlsReviewIssue('reviewed-inventory-omission', version)
      ) {
        reportAlsReviewIssue({
          code: 'reviewed-inventory-omission',
          sourceVersion: version,
          decisionId: decision.id,
          curationFile: `${operation.fixture}.json`,
          decision,
          owner,
        })
        continue
      }
      assert(inventory, `${ownerId}: canonical inventory is missing`)
      assert.equal(
        inventory.units.length,
        decision.previousUnitCount,
        `${ownerId}: inventory count changed`,
      )
      const expected = coalesced
        ? decision.unitAliasPairs.map(([, id]) => id).sort()
        : decision.unitIds
      assert.deepEqual(
        inventory.units.map(([id]) => id).sort(),
        expected,
        `${ownerId}: canonical unit IDs changed`,
      )
    }
  }
}
