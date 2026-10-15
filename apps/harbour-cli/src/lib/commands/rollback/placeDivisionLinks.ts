import { createHash } from 'node:crypto'
import {
  placeDivisionFieldNames,
  historySchema,
  type PlaceDivisionDefinitionSet,
} from '@repo/db'
import type { SnapshotReplayStep } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { readSnapshotDependencies } from '@repo/core/pipeline/db/snapshotDependencies'
import {
  type ReplayShard,
  resolveSnapshotVersionState,
} from '@repo/core/pipeline/db/snapshotReplay'
import { and, currentSchema, eq, getTableColumns } from '@repo/db'
import { createDivisionMembership } from '../../pipeline/divisions/divisionMembership'
import type { PlaceDependencyView } from '../../pipeline/places/placeDependencyView'
import { canonicalPlaceJson } from '../../pipeline/places/placeHistory'
import {
  readAddressDivisionAreaSnapshotId,
  readAddressDivisionSnapshotId,
} from '../../pipeline/places/placeSnapshotDependencies'
import type { PlaceRollbackBase } from './places'
import { readExactProjectionRows } from './projectionReplay'

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

/** Rebuild the serving index using the same spatial membership rules as ingestion. */
export async function restorePlaceDivisionLinks(
  input: { metaDb: HarbourReadableDb },
  plan: SnapshotReplayStep[],
  shards: ReadonlyMap<string, ReplayShard>,
  wanted: ReadonlyMap<string, PlaceRollbackBase>,
  view: PlaceDependencyView,
): Promise<Map<string, PlaceDivisionLink>> {
  const finalState = await resolveSnapshotVersionState(
    plan,
    shards,
    ['place'],
    [...wanted.keys()],
  )
  const retainedBases: PlaceRollbackBase[] = []
  for await (const rows of readExactProjectionRows(
    { recordType: 'place', table: 'places', id: 'id' },
    finalState.values(),
  ))
    retainedBases.push(...(rows as unknown as PlaceRollbackBase[]))
  const scalarIds = new Set(
    retainedBases.filter(row => row.divisionDefinitionSetId).map(row => row.id),
  )
  if (scalarIds.size && scalarIds.size < retainedBases.length) {
    const modern = await restorePlaceDivisionLinks(
      input,
      plan,
      shards,
      new Map([...wanted].filter(([id]) => scalarIds.has(id))),
      view,
    )
    const older = await restorePlaceDivisionLinks(
      input,
      plan,
      shards,
      new Map([...wanted].filter(([id]) => !scalarIds.has(id))),
      view,
    )
    return new Map([...modern, ...older])
  }
  if (retainedBases.every(row => row.divisionDefinitionSetId)) {
    const links = new Map<string, PlaceDivisionLink>()
    const sets = new Map<string, PlaceDivisionDefinitionSet>()
    for (const base of retainedBases) {
      const serving = wanted.get(base.id)
      if (
        !serving ||
        serving.divisionDefinitionSetId !== base.divisionDefinitionSetId ||
        placeDivisionFieldNames.some(field => serving[field] !== base[field])
      )
        throw new Error(`Place scalar references differ from exact history ${base.id}.`)
      const setId = base.divisionDefinitionSetId!
      if (!sets.has(setId))
        sets.set(setId, await readRetainedPlaceDefinitionSet(shards, setId))
      const definition = sets.get(setId)!
      const ids = new Set(
        placeDivisionFieldNames.flatMap(field => (base[field] ? [base[field]!] : [])),
      )
      if (
        ids.size !== Object.keys(definition).length ||
        Object.keys(definition).some(id => !ids.has(id))
      )
        throw new Error(
          `Place scalar memberships differ from retained definitions ${base.id}.`,
        )
      for (const [divisionId, entry] of Object.entries(definition))
        links.set(JSON.stringify([base.id, divisionId]), {
          placeId: base.id,
          divisionId,
          divisionSnapshotId: entry.divisionSnapshotId,
          definition: { level: entry.level, locales: entry.locales },
        })
    }
    return links
  }
  let links = new Map<string, PlaceDivisionLink>()
  const indices = new Map<string, Promise<Awaited<ReturnType<typeof loadIndex>>>>()
  for (let index = 0; index < plan.length; index++) {
    const step = plan[index]!
    const state = await resolveSnapshotVersionState(
      plan.slice(0, index + 1),
      shards,
      ['place'],
      [...wanted.keys()],
    )
    const next = new Map<string, PlaceDivisionLink>()
    if (state.size) {
      const selected = await readSnapshotDependencies(input.metaDb, step.snapshotId)
      if (!selected.address || !selected.division)
        throw new Error(
          `Place snapshot ${step.snapshotId} has no exact Address/Division assembly selection.`,
        )
      if (
        (await readAddressDivisionSnapshotId(input.metaDb, selected.address)) !==
        selected.division
      )
        throw new Error(
          `Place snapshot ${step.snapshotId} has inconsistent exact Division selections.`,
        )
      let promise = indices.get(selected.address)
      if (!promise) {
        promise = loadIndex(input.metaDb, view, selected.address, selected.division)
        indices.set(selected.address, promise)
      }
      const { membership, definitions } = await promise
      for await (const rows of readExactProjectionRows(
        { recordType: 'place', table: 'places', id: 'id' },
        state.values(),
      )) {
        for (const row of rows) {
          const geometry = row.geometry as { coordinates: [number, number] }
          const base = {
            ...row,
            lng: geometry.coordinates[0],
            lat: geometry.coordinates[1],
          } as PlaceRollbackBase
          if (
            !Number.isFinite(base.lng) ||
            !Number.isFinite(base.lat) ||
            Math.abs(base.lng) > 180 ||
            Math.abs(base.lat) > 90
          )
            throw new Error(`Place rollback ${base.id} has invalid coordinates.`)
          let address: typeof currentSchema.address2d.$inferSelect | undefined
          if (base.address2dId) {
            if (!base.addressSnapshotId)
              throw new Error(`Missing exact Place Address pointer for ${base.id}.`)
            await view.prepare(base.addressSnapshotId)
            address = await view.db
              .select(getTableColumns(currentSchema.address2d))
              .from(currentSchema.address2d)
              .where(
                and(
                  eq(currentSchema.address2d.scopeId, base.addressSnapshotId),
                  eq(currentSchema.address2d.id, base.address2dId),
                ),
              )
              .get()
            if (!address)
              throw new Error(
                `Missing Place Address ${base.address2dId} at ${base.addressSnapshotId}.`,
              )
          }
          const association = membership.resolve({
            lng: base.lng,
            lat: base.lat,
            fallback: address,
            fallbackMethod: 'address',
          })
          for (const divisionId of Object.values(association.references).filter(
            (id): id is string => typeof id === 'string',
          )) {
            const definition = definitions.get(divisionId)
            if (!definition)
              throw new Error(
                `Missing Place Division definition ${selected.division}/${divisionId}.`,
              )
            const key = JSON.stringify([base.id, divisionId])
            const previous = links.get(key)
            next.set(key, {
              placeId: base.id,
              field: Object.entries(association.references).find(
                ([, id]) => id === divisionId,
              )?.[0] as import('@repo/db').PlaceDivisionField,
              divisionId,
              definition,
              divisionSnapshotId:
                previous &&
                canonicalPlaceJson(previous.definition) ===
                  canonicalPlaceJson(definition)
                  ? previous.divisionSnapshotId
                  : selected.division,
            })
          }
        }
      }
    }
    links = next
  }
  return links
}

async function loadIndex(
  metaDb: HarbourReadableDb,
  view: PlaceDependencyView,
  addressSnapshotId: string,
  divisionSnapshotId: string,
) {
  await view.prepare(addressSnapshotId)
  const areaSnapshotId = await readAddressDivisionAreaSnapshotId(
    metaDb,
    addressSnapshotId,
  )
  const divisions = await view.db
    .select(getTableColumns(currentSchema.divisions))
    .from(currentSchema.divisions)
    .where(eq(currentSchema.divisions.scopeId, divisionSnapshotId))
    .all()
  const areas = await view.db
    .select(getTableColumns(currentSchema.divisionAreas))
    .from(currentSchema.divisionAreas)
    .where(eq(currentSchema.divisionAreas.scopeId, areaSnapshotId))
    .all()
  const locales = await view.db
    .select(getTableColumns(currentSchema.divisionsI18n))
    .from(currentSchema.divisionsI18n)
    .where(eq(currentSchema.divisionsI18n.scopeId, divisionSnapshotId))
    .all()
  const definitions = new Map<string, PlaceDivisionLink['definition']>(
    divisions.map(row => [row.id, { level: row.level, locales: [] }]),
  )
  for (const row of locales) {
    const definition = definitions.get(row.divisionId)
    if (!definition) throw new Error(`Orphan Division localisation ${row.divisionId}.`)
    definition.locales.push({ locale: row.locale, name: row.name })
  }
  for (const definition of definitions.values())
    definition.locales.sort((a, b) => a.locale.localeCompare(b.locale))
  return { membership: createDivisionMembership(divisions, areas), definitions }
}

/** Read immutable shared evidence from every retained shard, rejecting conflicting copies. */
export async function readRetainedPlaceDefinitionSet(
  shards: ReadonlyMap<string, ReplayShard>,
  id: string | null,
): Promise<PlaceDivisionDefinitionSet> {
  if (!id) return {}
  let retained: PlaceDivisionDefinitionSet | undefined
  for (const shard of shards.values()) {
    const row = await shard.db
      .select()
      .from(historySchema.placeDivisionDefinitions)
      .where(eq(historySchema.placeDivisionDefinitions.id, id))
      .get()
    if (!row) continue
    if (retained && canonicalPlaceJson(retained) !== canonicalPlaceJson(row.definition))
      throw new Error(`Conflicting retained Place definition set ${id}.`)
    retained = row.definition as PlaceDivisionDefinitionSet
  }
  if (!retained) throw new Error(`Missing retained Place definition set ${id}.`)
  if (createHash('sha256').update(canonicalPlaceJson(retained)).digest('hex') !== id)
    throw new Error(`Invalid retained Place definition set content address ${id}.`)
  return retained
}
