import type { DivisionHierarchies } from '@repo/db'
import { belongsInFullHierarchy } from './pipeline/services/divisions/divisionHierarchies'

type PublicEntry = {
  id: string
  name: string | null
  class: string
  fullContainment?: boolean | null
}
export type PublicDivisionHierarchies = {
  administrative?: PublicEntry[][]
  locality?: PublicEntry[][]
  landform?: PublicEntry[][]
  full: PublicEntry[][]
}

/** Apply public hierarchy display rules without changing stored evidence. */
export function publicDivisionHierarchies(
  hierarchies: DivisionHierarchies | PublicDivisionHierarchies,
): PublicDivisionHierarchies {
  return Object.fromEntries(
    Object.entries(hierarchies).map(([category, paths]) => [
      category,
      paths?.map(
        (
          path: Array<
            | DivisionHierarchies['full'][number][number]
            | PublicDivisionHierarchies['full'][number][number]
          >,
        ) =>
          path
            .filter(entry => category !== 'full' || belongsInFullHierarchy(entry))
            .map(entry => {
              const { id, name, class: klass } = entry
              // Native canonical storage and SaanSeoi source archives have separate contracts.
              const fullContainment =
                'fullContainment' in entry
                  ? entry.fullContainment
                  : 'full_containment' in entry
                    ? entry.full_containment
                    : undefined
              return {
                id,
                name,
                class: klass,
                ...(fullContainment !== undefined ? { fullContainment } : {}),
              }
            }),
      ),
    ]),
  ) as PublicDivisionHierarchies
}
