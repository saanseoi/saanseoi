import { geographicDivisionClassification } from '../../../../../db/src/divisionTaxonomy'
import type { DivisionHierarchyEntry } from '@repo/db'
import type { ReviewDivision, ReviewInventory } from './geographicReview'

export type HierarchyCatalogue = {
  schemaVersion: number
  nodes: Record<string, { name: string | null; class: string }>
  paths: Record<string, string[]>
}
export type CompactReviewInventory = Omit<ReviewInventory, 'divisions'> & {
  divisions: Array<
    Omit<ReviewDivision, 'category' | 'level' | 'hierarchies'> & {
      hierarchies: Record<
        string,
        Array<{
          path: string
          evidence?: Record<
            string,
            Pick<DivisionHierarchyEntry, 'full_containment' | 'containment_geometry'>
          >
        }>
      >
    }
  >
}

/** Expand at the review boundary; source fixtures retain each path only once. */
export function expandReviewInventory(
  inventory: CompactReviewInventory,
  catalogue: HierarchyCatalogue,
): ReviewInventory {
  if (inventory.schemaVersion !== 2 || catalogue.schemaVersion !== 1)
    throw new Error('Unsupported review inventory or hierarchy catalogue schema.')
  const ids = new Set(inventory.divisions.map(division => division.id))
  if (ids.size !== inventory.divisions.length)
    throw new Error('Duplicate review division.')
  return {
    ...inventory,
    divisions: inventory.divisions.map(division => {
      const classification = geographicDivisionClassification(division.class)
      if (!classification) throw new Error(`Unknown division class: ${division.class}`)
      const hierarchies = Object.fromEntries(
        Object.entries(division.hierarchies).map(([category, references]) => [
          category,
          references.map(reference => {
            const path = catalogue.paths[reference.path]
            if (
              !path ||
              new Set(path).size !== path.length ||
              path.includes(division.id)
            )
              throw new Error(`Invalid hierarchy path: ${reference.path}`)
            for (const id of Object.keys(reference.evidence ?? {}))
              if (!path.includes(id))
                throw new Error(`Evidence outside hierarchy path: ${id}`)
            return path.map(id => {
              const node = catalogue.nodes[id]
              if (!node || !ids.has(id))
                throw new Error(`Unknown review ancestor: ${id}`)
              return { id, ...node, ...reference.evidence?.[id] }
            })
          }),
        ]),
      )
      if (!hierarchies.full) throw new Error(`Missing full hierarchy: ${division.id}`)
      return {
        ...division,
        ...classification,
        hierarchies: hierarchies as ReviewDivision['hierarchies'],
      }
    }),
  }
}
