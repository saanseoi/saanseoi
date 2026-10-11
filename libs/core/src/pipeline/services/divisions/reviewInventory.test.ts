import { expect, test } from 'bun:test'
import { compactExample } from './reviewGraph.fixtures'
const { inventory: fixture, catalogue } = compactExample
import { expandReviewInventory, type CompactReviewInventory } from './reviewInventory'
import { compactReviewInventory } from './compactReviewInventory'

const inventory = fixture as unknown as CompactReviewInventory

test('all review paths round-trip with child-specific evidence and stable identities', () => {
  const expanded = expandReviewInventory(inventory, catalogue)
  const compacted = compactReviewInventory(expanded, catalogue)
  expect(compacted.inventory).toEqual(inventory)
  expect(compacted.catalogue).toEqual(catalogue)
  expect(expanded.divisions.every(row => row.category && row.level !== undefined)).toBe(
    true,
  )
  const evidence = expanded.divisions.flatMap(row =>
    Object.values(row.hierarchies)
      .flat(2)
      .filter(node => Object.hasOwn(node!, 'full_containment')),
  )
  expect(evidence.length).toBeGreaterThan(0)
})

test('missing paths and references fail rather than silently losing ancestry', () => {
  expect(() => expandReviewInventory(inventory, { ...catalogue, paths: {} })).toThrow(
    'Invalid hierarchy path',
  )
  expect(() => expandReviewInventory(inventory, { ...catalogue, nodes: {} })).toThrow(
    'Unknown review ancestor',
  )
})
