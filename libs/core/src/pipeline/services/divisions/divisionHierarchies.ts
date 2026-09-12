import {
  emptyDivisionHierarchies,
  geographicDivisionClassification,
  type DivisionHierarchies,
  type DivisionHierarchyEntry,
} from '@repo/db'
import { buildDisplayName } from '../../../displayName'

export type ClassifiedAncestor = {
  division_id: string
  class: string
  i18n?: { 'zh-hant'?: { name?: string | null }; en?: { name?: string | null } }
}

/** Project each evidenced path independently: never form a Cartesian product. */
export function materialiseDivisionHierarchies(
  divisionId: string,
  paths: readonly (readonly ClassifiedAncestor[])[],
): DivisionHierarchies {
  const result = emptyDivisionHierarchies()
  for (const path of paths) {
    const ancestors = path.filter(entry => entry.division_id !== divisionId)
    if (new Set(ancestors.map(entry => entry.division_id)).size !== ancestors.length) {
      throw new Error(`Cyclic or duplicate hierarchy ancestors for ${divisionId}.`)
    }
    const entries = ancestors.map(entry => ({
      id: entry.division_id,
      name: buildDisplayName({
        'zh-hant': entry.i18n?.['zh-hant']?.name,
        en: entry.i18n?.en?.name,
      }),
      class: entry.class,
    }))
    const category = (entry: DivisionHierarchyEntry) =>
      geographicDivisionClassification(entry.class)?.category
    const administrative = entries.filter(entry => category(entry) === 'administrative')
    const locality = entries.findLast(entry => category(entry) === 'locality')
    const hoods = entries.filter(entry => category(entry) === 'hood')
    const localPath = [...(locality ? [locality] : []), ...hoods]
    // Other geographic domains retain their evidenced ancestry without pretending
    // their planning/statistical classes belong to the geographic taxonomy.
    const other = entries.filter(entry => !category(entry))
    appendUniquePath(result.administrative, administrative)
    appendUniquePath(result.locality, localPath)
    appendUniquePath(result.full, [
      ...administrative,
      ...localPath.filter(entry => entry.class !== 'city'),
      ...other,
    ])
  }
  return result
}

function appendUniquePath(
  paths: DivisionHierarchyEntry[][],
  path: DivisionHierarchyEntry[],
) {
  if (!path.length) return
  const key = JSON.stringify(path.map(entry => entry.id))
  if (
    !paths.some(existing => JSON.stringify(existing.map(entry => entry.id)) === key)
  ) {
    paths.push(path)
  }
}

/** Union of stored entries for includes/search; it does not reconstruct paths. */
export function divisionHierarchyEntries(hierarchies: DivisionHierarchies | null) {
  const entries = new Map<string, DivisionHierarchyEntry>()
  for (const paths of Object.values(hierarchies ?? emptyDivisionHierarchies())) {
    for (const path of paths) for (const entry of path) entries.set(entry.id, entry)
  }
  return [...entries.values()]
}
