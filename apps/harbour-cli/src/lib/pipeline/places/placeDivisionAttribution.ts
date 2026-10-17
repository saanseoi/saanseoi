import type { DivisionHierarchies } from '@repo/db'
import {
  divisionFields,
  type DivisionMembership,
  type MembershipDivision,
} from '../divisions/divisionMembership'

/** Index the values supplied by each record without reading its ancestor records. */
export function createPlaceDivisionAttribution(divisions: MembershipDivision[]) {
  const supplied = new Map(
    divisions.map(row => {
      const hierarchy =
        typeof row.hierarchies === 'string'
          ? (JSON.parse(row.hierarchies) as DivisionHierarchies)
          : row.hierarchies
      const paths = hierarchy?.full ?? []
      const values = new Map<string, string>()
      for (const entry of paths[0] ?? []) {
        const field = divisionFields[entry.class as keyof typeof divisionFields]
        if (
          field &&
          paths.every(
            path =>
              path.some(
                other => other.id === entry.id && other.class === entry.class,
              ) &&
              path.every(
                other =>
                  divisionFields[other.class as keyof typeof divisionFields] !==
                    field || other.id === entry.id,
              ),
          )
        )
          values.set(field, entry.id)
      }
      const ownField = divisionFields[row.class as keyof typeof divisionFields]
      if (ownField) values.set(ownField, row.id)
      return [row.id, values] as const
    }),
  )

  return (association: ReturnType<DivisionMembership['resolve']>) => {
    const candidates = association.evidence
      .map(evidence => ({
        ...evidence,
        properties: [...(supplied.get(evidence.divisionId) ?? [])]
          .filter(
            ([field, id]) =>
              association.references[field as keyof typeof association.references] ===
              id,
          )
          .map(([field]) => field),
      }))
      .sort(
        (a, b) =>
          Number(a.method === 'ancestry') - Number(b.method === 'ancestry') ||
          b.properties.length - a.properties.length ||
          a.divisionId.localeCompare(b.divisionId),
      )
    const sources: Record<string, string> = {}
    for (const candidate of candidates) {
      for (const property of candidate.properties)
        sources[property] ??= candidate.divisionId
    }
    for (const [field, id] of Object.entries(association.references))
      if (id && !sources[field])
        throw new Error(`Missing Place Division source for ${field}: ${id}.`)
    return sources
  }
}
