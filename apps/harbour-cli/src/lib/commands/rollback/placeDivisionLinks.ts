import { placeDivisionFieldNames } from '@repo/db'
import type { SnapshotReplayStep } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import type { ReplayShard } from '@repo/core/pipeline/db/snapshotReplay'
import {
  readPlacePublicationDependencies,
  replayPlaceDivisionDefinitions,
} from '@repo/core/pipeline/services/places/dependencyReplay'
import type { PlaceDependencyView } from '../../pipeline/places/placeDependencyView'
import type { PlaceRollbackBase } from './places'

export type PlaceDivisionLink = {
  placeId: string
  field?: import('@repo/db').PlaceDivisionField
  divisionId: string
  divisionSnapshotId: string
  definition: {
    level: number | null
    locales: { locale: string; name: string | null }[]
  }
}

/** Scalar memberships resolve together against the selected publication dependency. */
export async function restorePlaceDivisionLinks(
  input: { metaDb: HarbourReadableDb },
  plan: SnapshotReplayStep[],
  shards: ReadonlyMap<string, ReplayShard>,
  wanted: ReadonlyMap<string, PlaceRollbackBase>,
  _view: PlaceDependencyView,
): Promise<Map<string, PlaceDivisionLink>> {
  const selected = await readPlacePublicationDependencies(
    input.metaDb,
    plan.at(-1)!.snapshotId,
  )
  const definitions = await replayPlaceDivisionDefinitions(
    input.metaDb,
    shards,
    selected.division,
    [...wanted.values()].flatMap(base =>
      placeDivisionFieldNames.flatMap(field => (base[field] ? [base[field]!] : [])),
    ),
  )
  const links = new Map<string, PlaceDivisionLink>()
  for (const base of wanted.values())
    for (const field of placeDivisionFieldNames) {
      const id = base[field]
      if (!id) continue
      const definition = definitions[id]!
      links.set(JSON.stringify([base.id, id]), {
        placeId: base.id,
        field,
        divisionId: id,
        divisionSnapshotId: selected.division,
        definition,
      })
    }
  return links
}
