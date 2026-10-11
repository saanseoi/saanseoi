import { buildDeterministicUuidV5 } from '@repo/db'
import type { DivisionHierarchyEntry } from '@repo/db'
import type { ReviewInventory } from './geographicReview'
import type { HierarchyCatalogue } from './reviewInventory'

/** Stable path identities depend on ancestry order, never translated labels. */
export function compactReviewInventory(
  inventory: ReviewInventory,
  seed: HierarchyCatalogue = { schemaVersion: 1, nodes: {}, paths: {} },
) {
  const catalogue = structuredClone(seed)
  if (catalogue.schemaVersion !== 1)
    throw new Error('Unsupported hierarchy catalogue schema.')
  const divisions = inventory.divisions.map(
    ({ category: _, level: __, hierarchies, ...division }) => ({
      ...division,
      hierarchies: Object.fromEntries(
        Object.entries(hierarchies).map(([category, paths]) => [
          category,
          paths!.map(path => {
            const ids = path.map(node => node.id)
            const id = buildDeterministicUuidV5(
              '7a3c5e91-95c2-5c93-8e3c-7d5b5d3bb6e7',
              `hierarchy:${JSON.stringify(ids)}`,
            )
            catalogue.paths[id] = ids
            const evidence: Record<
              string,
              Pick<DivisionHierarchyEntry, 'full_containment' | 'containment_geometry'>
            > = {}
            for (const { id: nodeId, name, class: cls, ...annotation } of path) {
              const node = { name, class: cls }
              if (
                catalogue.nodes[nodeId] &&
                JSON.stringify(catalogue.nodes[nodeId]) !== JSON.stringify(node)
              )
                throw new Error(`Conflicting hierarchy node: ${nodeId}`)
              catalogue.nodes[nodeId] = node
              if (Object.keys(annotation).length) evidence[nodeId] = annotation
            }
            return { path: id, ...(Object.keys(evidence).length ? { evidence } : {}) }
          }),
        ]),
      ),
    }),
  )
  return { inventory: { ...inventory, schemaVersion: 2, divisions }, catalogue }
}
