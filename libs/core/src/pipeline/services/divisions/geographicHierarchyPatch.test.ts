import { expect, test } from 'bun:test'
import patch from '../../../../../../fixtures/divisions/hk/geographic-hierarchy-patch.json'
import inventory from '../../../../../../fixtures/divisions/hk/geographic-review-inventory.json'
import islands from '../../../../../../fixtures/divisions/hk/island-areas.json'
import islandReview from '../../../../../../fixtures/meta/curations/saanseoi-island-review.json'
import { classifyIslandArea } from '../../../../../db/src/divisionTaxonomy'
import { geographicHierarchyPatchRule } from './geographicHierarchyPatch'

test('the hierarchy patch covers retained identities once and only references known review identities', () => {
  const originals = new Map([
    ...inventory.divisions.map(d => [d.id, d.class] as const),
    ...islands.map(
      island =>
        [
          island.id,
          island.areaKm2 > 0 ? classifyIslandArea(island.areaKm2) : 'minor_island',
        ] as const,
    ),
  ])
  const actions = new Map<string, { action: string; reviewRequired?: boolean }>(
    islandReview.curationPolicy.actions.map(action => [action.id, action]),
  )
  const aliases = new Set(
    islandReview.curationPolicy.aliasGroups.flatMap(group => group.aliasIds),
  )
  const required = new Set([
    ...inventory.divisions.map(division => division.id),
    ...islands
      .filter(island => {
        const action = actions.get(island.id)
        return (
          island.areaKm2 > 0 &&
          !aliases.has(island.id) &&
          !action?.reviewRequired &&
          !['exclude', 'no-geometry', 'reclassify', 'manual-review'].includes(
            action?.action ?? '',
          )
        )
      })
      .map(island => island.id),
  ])
  const ids = new Set(patch.entries.map(entry => entry.divisionId))
  expect(patch.entries).toHaveLength(ids.size)
  expect([...required].filter(id => !ids.has(id))).toEqual([])
  // Rejected supplemental rows may remain as review evidence until the next export.
  expect([...ids].filter(id => !originals.has(id))).toEqual([])
  for (const decision of patch.entries)
    expect(decision.expectedClass).toBe(originals.get(decision.divisionId)!)
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
