import type { DivisionHierarchies } from '@repo/db'
import type { SourceResolutions } from '@repo/db/historySchema'

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

/** Capture archive evidence before normalising content, including unchanged records. */
export function divisionSourceResolutions(
  divisionId: string,
  curatedRow?: Record<string, unknown>,
): SourceResolutions {
  const result: SourceResolutions = { entities: { division: [divisionId] } }
  if (!curatedRow) return result
  const record =
    typeof curatedRow.record === 'string'
      ? JSON.parse(curatedRow.record)
      : curatedRow.record
  const hierarchy =
    typeof record.hierarchies === 'string'
      ? JSON.parse(record.hierarchies)
      : record.hierarchies
  const evidence: NonNullable<SourceResolutions['divisionContainment']>[string] = {}
  for (const paths of Object.values(hierarchy as DivisionHierarchies))
    for (const path of paths ?? [])
      for (const entry of path) {
        const source = entry as unknown as Record<string, unknown>
        const proof = (source.containmentGeometry ?? entry.containment_geometry) as
          | { division: string; ancestor: string }
          | undefined
        if (!proof) continue
        if (typeof proof.division !== 'string' || typeof proof.ancestor !== 'string')
          throw new Error(`Invalid containment evidence for ${divisionId}/${entry.id}.`)
        const prior = evidence[entry.id]
        if (
          prior &&
          (prior.division !== proof.division || prior.ancestor !== proof.ancestor)
        )
          throw new Error(
            `Conflicting containment evidence for ${divisionId}/${entry.id}.`,
          )
        evidence[entry.id] = { division: proof.division, ancestor: proof.ancestor }
      }
  if (Object.keys(evidence).length)
    result.divisionContainment = { [divisionId]: evidence }
  return result
}
