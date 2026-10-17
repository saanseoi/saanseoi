import {
  divisionFields,
  type DivisionReferences,
  type DivisionMembership,
} from '../divisions/divisionMembership'

/** Consume only the resolver's scalar result; ancestor evidence cannot widen Place membership. */
export function supportedPlaceMembership(
  association: ReturnType<DivisionMembership['resolve']>,
) {
  const references: DivisionReferences = Object.fromEntries(
    [...new Set(Object.values(divisionFields))].map(field => [
      field,
      association.references[field] ?? null,
    ]),
  )
  const divisionIds = [
    ...new Set(
      Object.values(references).filter((id): id is string => typeof id === 'string'),
    ),
  ].sort()
  return {
    references,
    divisionIds,
    evidence: association.evidence.filter(row => divisionIds.includes(row.divisionId)),
  }
}
