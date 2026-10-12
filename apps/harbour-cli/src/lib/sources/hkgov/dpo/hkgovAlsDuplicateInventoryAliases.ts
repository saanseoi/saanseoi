import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-duplicate-inventory-owners.json'
import { alsMembershipHash } from './hkgovAlsMembership'
import type { AlsMembership, AlsMembershipCollection } from './hkgovAlsMembership'

/** Consolidate only a complete duplicate of an already existing canonical inventory. */
export function duplicateInventoryUnitAliases(
  previous: AlsMembership | null | undefined,
  current: AlsMembership,
  resolveOwner: (id: string) => string,
) {
  const replacements: Array<{
    from: string
    to: string
    previousCollectionId: string
    collectionId: string
  }> = []
  if (!previous) return replacements
  const before = new Map(previous.collections.map(c => [c.ownerId, c]))
  const after = new Map(current.collections.map(c => [c.ownerId, c]))
  const tokens = (c: AlsMembershipCollection) =>
    new Map(c.units.map(([id, ...value]) => [JSON.stringify(value), id]))
  for (const source of previous.collections) {
    const reviewed = fixture.decisions.find(
      d =>
        current.sourceVersion >= d.sourceVersionFrom &&
        source.ownerId === d.duplicateOwner.id &&
        alsMembershipHash(
          previous.addresses.find(a => a.id === source.ownerId) ?? null,
        ) === alsMembershipHash(d.duplicateOwner) &&
        alsMembershipHash(
          current.addresses.find(a => a.id === source.ownerId) ?? null,
        ) === alsMembershipHash(d.currentDuplicateOwner) &&
        alsMembershipHash(
          previous.addresses.find(a => a.id === d.canonicalOwner.id) ?? null,
        ) === alsMembershipHash(d.previousCanonicalOwner) &&
        alsMembershipHash(
          current.addresses.find(a => a.id === d.canonicalOwner.id) ?? null,
        ) === alsMembershipHash(d.canonicalOwner),
    )
    const owner = reviewed?.canonicalOwner.id ?? resolveOwner(source.ownerId)
    if (owner === source.ownerId || after.has(source.ownerId)) continue
    const canonicalBefore = before.get(owner)
    const canonicalAfter = after.get(owner)
    if (!canonicalBefore || !canonicalAfter || !source.units.length) continue
    if (
      source.units.length !== canonicalBefore.units.length ||
      source.units.length !== canonicalAfter.units.length
    )
      continue
    const sourceTokens = tokens(source)
    const previousTokens = tokens(canonicalBefore)
    const currentTokens = tokens(canonicalAfter)
    // Repeated tokens, different labels, partial matches or regenerated canonical
    // IDs cannot prove duplicate consolidation.
    if (
      sourceTokens.size !== source.units.length ||
      previousTokens.size !== source.units.length ||
      currentTokens.size !== source.units.length ||
      [...sourceTokens.keys()].some(
        key =>
          !previousTokens.has(key) ||
          currentTokens.get(key) !== previousTokens.get(key),
      )
    )
      continue
    for (const [key, from] of sourceTokens) {
      const to = currentTokens.get(key)!
      if (from !== to)
        replacements.push({
          from,
          to,
          previousCollectionId: source.id,
          collectionId: canonicalAfter.id,
        })
    }
  }
  return replacements.sort((a, b) => a.from.localeCompare(b.from))
}
