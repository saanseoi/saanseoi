import type { DivisionHierarchies } from '@repo/db'

/** Strip only optimisation evidence; ancestry and containment results are content. */
export function divisionHierarchyContent<T>(hierarchies: T): T {
  if (!hierarchies || typeof hierarchies !== 'object') return hierarchies
  const result = structuredClone(hierarchies) as unknown as DivisionHierarchies
  for (const paths of Object.values(result))
    for (const path of paths ?? [])
      for (const entry of path) {
        delete entry.containment_geometry
        delete (entry as unknown as Record<string, unknown>).containmentGeometry
      }
  return result as T
}
