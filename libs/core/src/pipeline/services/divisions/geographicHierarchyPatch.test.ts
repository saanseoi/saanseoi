import { expect, test } from 'bun:test'
import patch from '../../../../../../fixtures/divisions/hk/geographic-hierarchy-patch.json'
import inventory from '../../../../../../fixtures/divisions/hk/geographic-review-inventory.json'
import { geographicHierarchyPatchRule } from './geographicHierarchyPatch'

test('the hierarchy patch covers every retained geographic division exactly once', () => {
  expect(patch.entries).toHaveLength(1820)
  expect(new Set(patch.entries.map(e => e.divisionId))).toEqual(
    new Set(inventory.divisions.map(d => d.id)),
  )
  const originals = new Map(inventory.divisions.map(d => [d.id, d]))
  for (const decision of patch.entries)
    expect(decision.expectedClass).toBe(originals.get(decision.divisionId)!.class)
})
test('applies the exact cohort after classification, preserving other sources and rejecting class drift', () => {
  const input = {
    id: '3707878f-080b-42cf-aecf-89fef56a066a',
    class: 'major_island',
    hierarchies: { administrative: [], locality: [], landform: [], full: [] },
    source: { source: 'overture', regionCode: 'hk', sourceVersion: '2026-08-19.0' },
  }
  expect(geographicHierarchyPatchRule.execute(input)).toEqual(
    patch.entries.find(e => e.divisionId === input.id)!.hierarchies,
  )
  expect(
    geographicHierarchyPatchRule.execute({
      ...input,
      source: { ...input.source, sourceVersion: '2026-07-22.0' },
    }),
  ).toBe(input.hierarchies)
  expect(() =>
    geographicHierarchyPatchRule.execute({ ...input, class: 'area' }),
  ).toThrow('does not match')
})
