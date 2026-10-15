import { createHash } from 'node:crypto'
import { placeDivisionFieldNames, type PlaceDivisionDefinitionSet } from '@repo/db'
import {
  divisionFields,
  type DivisionReferences,
  type DivisionMembership,
} from '../divisions/divisionMembership'
import { canonicalPlaceJson } from './placeHistory'

/** Revision pointers inherit independently when the selected definition is equivalent. */
export function preparePlaceDivisionDefinitions(
  references: DivisionReferences,
  candidates: Record<
    string,
    Omit<PlaceDivisionDefinitionSet[string], 'divisionSnapshotId'>
  >,
  snapshotId: string,
  previous: PlaceDivisionDefinitionSet = {},
) {
  const scalars = Object.fromEntries(
    placeDivisionFieldNames.map(field => [field, references[field] ?? null]),
  )
  const definition: PlaceDivisionDefinitionSet = {}
  for (const id of [
    ...new Set(
      Object.values(scalars).filter((id): id is string => typeof id === 'string'),
    ),
  ].sort()) {
    const candidate = candidates[id]
    if (!candidate) throw new Error(`Missing exact Place Division definition ${id}.`)
    const value = {
      level: candidate.level,
      locales: [...candidate.locales].sort((a, b) => a.locale.localeCompare(b.locale)),
    }
    const retained = previous[id]
    definition[id] =
      retained &&
      canonicalPlaceJson({ level: retained.level, locales: retained.locales }) ===
        canonicalPlaceJson(value)
        ? retained
        : { divisionSnapshotId: snapshotId, ...value }
  }
  const id = createHash('sha256').update(canonicalPlaceJson(definition)).digest('hex')
  return { scalars, id, definition }
}

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
