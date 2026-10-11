import { expect, test } from 'bun:test'
import {
  geographicHierarchyFixture,
  geographicHierarchyPatchRule,
} from './geographicHierarchyPatch'
import { curationHierarchy } from './curationInventory'
import { expandedInventory } from './reviewGraph.fixtures'

test('explicit parent decisions contain identities rather than copied labels or classifications', () => {
  expect(geographicHierarchyFixture.purpose).toBeTruthy()
  const ids = new Set<string>()
  for (const entry of geographicHierarchyFixture.entries) {
    expect(ids.has(entry.divisionId)).toBe(false)
    ids.add(entry.divisionId)
    for (const path of entry.paths) {
      expect(new Set(path).size).toBe(path.length)
      expect(path).not.toContain(entry.divisionId)
      expect(path.every(id => typeof id === 'string')).toBe(true)
    }
  }
})
test('a non-overridden hierarchy is preserved without a generated fixture dependency', () => {
  const child = expandedInventory.divisions[0]!
  expect(
    geographicHierarchyPatchRule.execute({
      id: child.id,
      class: child.class,
      hierarchies: child.hierarchies,
      inventory: expandedInventory,
    }),
  ).toBe(child.hierarchies)
})
test('an explicit child cannot reference an absent ancestor', () => {
  const decision = geographicHierarchyFixture.entries[0]!
  const child = { ...expandedInventory.divisions[0]!, id: decision.divisionId }
  expect(() => curationHierarchy({ ...expandedInventory, divisions: [child] })).toThrow(
    'Unknown curated ancestor',
  )
})
