import type { ReviewInventory, HierarchyPatch } from './geographicReview'
import { compactReviewInventory } from './compactReviewInventory'
const parent = {
  id: 'parent',
  name: 'District',
  class: 'district',
  full_containment: true,
}
const child = {
  id: 'child',
  category: 'hood',
  class: 'neighbourhood',
  level: 5,
  names: { en: 'Neighbourhood' },
  point: [1, 1],
  hierarchies: {
    administrative: [[parent]],
    locality: [],
    landform: [],
    full: [[parent]],
  },
}
export const expandedInventory: ReviewInventory = {
  schemaVersion: 1,
  region: 'hk',
  domain: 'geographic',
  cohort: 'test',
  releaseSet: 'test',
  divisions: [
    child,
    {
      id: 'parent',
      category: 'administrative',
      class: 'district',
      level: 2,
      names: { en: 'District' },
      point: [1, 1],
      hierarchies: { administrative: [], locality: [], landform: [], full: [] },
    },
  ],
}
export const compactExample = compactReviewInventory(expandedInventory)
export const expandedPatch: HierarchyPatch = {
  schemaVersion: 1,
  kind: 'geographic-hierarchy-patch',
  region: 'hk',
  domain: 'geographic',
  cohort: 'test',
  releaseSet: 'test',
  entries: expandedInventory.divisions.map(row => ({
    divisionId: row.id,
    expectedClass: row.class,
    status: 'geometry',
    point: row.point,
    parentIds: row.id === 'child' ? ['parent'] : [],
    competingParentIds: [],
    evidence: [],
    hierarchies: row.hierarchies,
  })),
}
