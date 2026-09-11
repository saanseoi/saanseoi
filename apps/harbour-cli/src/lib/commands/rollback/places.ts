import type { Database } from 'bun:sqlite'
import { latLngToCell } from 'h3-js'
import { and, eq, historySchema, metaSchema, sql } from '@repo/db'
import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  resolveSnapshotReplayPlan,
  type SnapshotReplayStep,
} from '@repo/core/db/metaRegistry'
import {
  resolveSnapshotVersionState,
  type ReplayShard,
} from '@repo/core/pipeline/db/snapshotReplay'
import { PlaceDependencyView } from '../../pipeline/places/placeDependencyView.ts'
import { createPlaceSearchDependencies } from '../../pipeline/places/placeSearchDependencies.ts'
import { canonicalPlaceJson } from '../../pipeline/places/placeHistory.ts'
import { readAddressDivisionSnapshotId } from '../../pipeline/places/placeSnapshotDependencies.ts'
import { PLACE_H3_LEVELS } from '../../pipeline/places/processLocalPlaceSqlUploadConfig.ts'

type Base = {
  id: string
  lng: number
  lat: number
  addressSnapshotId: string | null
  addressDependencyHash: string | null
  address2dId: string | null
  address3dId: string | null
  address3dUnitId: string | null
}
type Definition = {
  level: number | null
  locales: { locale: string; name: string | null }[]
}
type Link = {
  placeId: string
  divisionId: string
  divisionSnapshotId: string
  definition: Definition
}
type Entities = Record<string, string[]>
type Locale = { placeId: string; locale: string; searchDependencyText: string | null }
type Input = {
  current: Database
  metaDb: HarbourReadableDb
  historyTargets: readonly { bindingName: string; db: HarbourReadableDb }[]
  snapshotId: string
  scopeId: string
}

/** Reconstruct derived rows locally; publication and FTS remain the caller's responsibility. */
export async function restorePlaceDerivedRows(input: Input) {
  const bases = new Map(
    (
      input.current
        .query(
          'SELECT id,lng,lat,addressSnapshotId,addressDependencyHash,address2dId,address3dId,address3dUnitId FROM places WHERE snapshotId=?',
        )
        .all(input.scopeId) as Base[]
    ).map(row => [row.id, row]),
  )
  const locales = input.current
    .query(
      'SELECT placeId,locale,searchDependencyText FROM placesI18n WHERE snapshotId=?',
    )
    .all(input.scopeId) as Locale[]
  if (locales.some(row => !bases.has(row.placeId)))
    throw new Error('Place rollback has localisations without a base.')
  const plan = await resolveSnapshotReplayPlan(input.metaDb, input.snapshotId)
  if (plan.at(-1)?.snapshotId !== input.snapshotId)
    throw new Error(`Place rollback has no exact ancestry for ${input.snapshotId}.`)
  const shards = new Map<string, ReplayShard>(
    input.historyTargets.map(target => [target.bindingName, target]),
  )
  const expected = await resolveSnapshotVersionState(plan, shards, ['place'])
  const expectedIds = new Set([...expected.values()].map(row => row.recordId))
  if (
    expectedIds.size !== bases.size ||
    [...bases.keys()].some(id => !expectedIds.has(id))
  )
    throw new Error(
      'Place rollback base membership differs from exact snapshot history.',
    )
  const view = await PlaceDependencyView.create({
    metaDb: input.metaDb,
    historyTargets: input.historyTargets,
  })
  try {
    const dependencies = createPlaceSearchDependencies(view.db)
    const { links, entities } = await restoreDivisionLinks(
      input,
      plan,
      shards,
      bases,
      view,
      dependencies,
    )
    for (const base of bases.values()) {
      const resolved = entities.get(base.id)
      if (!resolved) throw new Error(`Missing Place source interpretation ${base.id}.`)
      for (const [name, id] of [
        ['address2d', base.address2dId],
        ['address3d', base.address3dId],
        ['address3dUnit', base.address3dUnitId],
      ] as const)
        if (
          canonicalPlaceJson(resolved[name] ?? []) !==
          canonicalPlaceJson(id ? [id] : [])
        )
          throw new Error(
            `Place rollback ${base.id} has inconsistent ${name} source evidence.`,
          )
      if (base.address2dId) {
        if (!base.addressSnapshotId || !base.addressDependencyHash)
          throw new Error(
            `Missing exact Place Address dependency hash or pointer for ${base.id}.`,
          )
        await view.prepare(base.addressSnapshotId)
        const restored = await dependencies({
          addressSnapshotId: base.addressSnapshotId,
          addressId: base.address2dId,
          address3dId: base.address3dId,
          address3dUnitId: base.address3dUnitId,
          divisionSnapshotId: '',
          divisionIds: [],
          locales: [],
        })
        if (restored.addressDependencyHash !== base.addressDependencyHash)
          throw new Error(
            `Place rollback Address dependency content differs for ${base.id}.`,
          )
      } else if (
        base.addressSnapshotId ||
        base.addressDependencyHash ||
        base.address3dId ||
        base.address3dUnitId
      ) {
        throw new Error(
          `Place rollback ${base.id} has an incomplete Address reference.`,
        )
      }
      if (
        !Number.isFinite(base.lng) ||
        !Number.isFinite(base.lat) ||
        Math.abs(base.lng) > 180 ||
        Math.abs(base.lat) > 90
      )
        throw new Error(`Place rollback ${base.id} has invalid coordinates.`)
    }
    await validateLocaleDependencies(
      input,
      plan,
      shards,
      bases,
      locales,
      links,
      view,
      dependencies,
    )
    input.current.transaction(() => {
      input.current
        .query('DELETE FROM placesDivision WHERE placeSnapshotId=?')
        .run(input.scopeId)
      input.current
        .query('DELETE FROM placesCells WHERE snapshotId=?')
        .run(input.scopeId)
      const insertLink = input.current.query(
        'INSERT INTO placesDivision(placeSnapshotId,placeId,divisionSnapshotId,divisionId,definition) VALUES (?,?,?,?,?)',
      )
      for (const link of links.values())
        insertLink.run(
          input.scopeId,
          link.placeId,
          link.divisionSnapshotId,
          link.divisionId,
          JSON.stringify(link.definition),
        )
      const insertCell = input.current.query(
        'INSERT INTO placesCells(snapshotId,id,h3Level,h3Cell) VALUES (?,?,?,?)',
      )
      for (const base of bases.values())
        for (const level of PLACE_H3_LEVELS)
          insertCell.run(
            input.scopeId,
            base.id,
            level,
            latLngToCell(base.lat, base.lng, level),
          )
    })()
    return {
      places: bases.size,
      divisionLinks: links.size,
      cells: bases.size * PLACE_H3_LEVELS.length,
    }
  } finally {
    await view.close()
  }
}

async function restoreDivisionLinks(
  input: Input,
  plan: SnapshotReplayStep[],
  shards: ReadonlyMap<string, ReplayShard>,
  bases: ReadonlyMap<string, Base>,
  view: PlaceDependencyView,
  dependencies: ReturnType<typeof createPlaceSearchDependencies>,
) {
  const wanted = JSON.stringify([...bases.keys()])
  const active = new Set<string>()
  const entities = new Map<string, Entities>()
  let links = new Map<string, Link>()
  for (const step of plan) {
    const changes = historySchema.snapshotVersionChanges
    const seen = new Set<string>()
    for (const binding of new Set(step.shards.map(row => row.bindingName))) {
      const shard = shards.get(binding)
      if (!shard) throw new Error(`Missing Place rollback history binding ${binding}.`)
      let cursor: string | undefined
      while (true) {
        const rows = await shard.db
          .select({
            id: changes.recordId,
            locale: changes.locale,
            operation: changes.operation,
          })
          .from(changes)
          .where(
            and(
              eq(changes.snapshotId, step.snapshotId),
              eq(changes.recordType, 'place'),
              sql`${changes.recordId} IN (SELECT value FROM json_each(${wanted}))`,
              cursor === undefined ? undefined : sql`${changes.recordId} > ${cursor}`,
            ),
          )
          .orderBy(changes.recordId)
          .limit(512)
          .all()
        for (const row of rows) {
          if (seen.has(row.id) || row.locale)
            throw new Error(`Ambiguous Place membership ${step.snapshotId}/${row.id}.`)
          seen.add(row.id)
          if (row.operation === 'delete') active.delete(row.id)
          else active.add(row.id)
        }
        cursor = rows.at(-1)?.id
        if (rows.length < 512) break
      }
    }
    await applySourceChanges(step, shards, wanted, entities)
    for (const id of bases.keys()) {
      const recorded = entities.get(id)?.place ?? []
      if (
        active.has(id)
          ? recorded.length !== 1 || recorded[0] !== id
          : recorded.length !== 0
      )
        throw new Error(
          `Place source membership differs from history for ${step.snapshotId}/${id}.`,
        )
    }
    const divisionIds = [
      ...new Set([...active].flatMap(id => entities.get(id)?.division ?? [])),
    ].sort()
    const next = new Map<string, Link>()
    if (divisionIds.length) {
      const assembly = await input.metaDb
        .select({ summary: metaSchema.metaSnapshotAssemblyRuns.selectionSummaryJson })
        .from(metaSchema.metaSnapshotAssemblyRuns)
        .where(eq(metaSchema.metaSnapshotAssemblyRuns.snapshotId, step.snapshotId))
        .get()
      const selected = (
        assembly?.summary as
          | { lookupSnapshotIds?: { address?: string; division?: string } }
          | undefined
      )?.lookupSnapshotIds
      if (!selected?.address || !selected.division)
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
      await view.prepare(selected.address)
      const definitions = (
        await dependencies({
          addressSnapshotId: selected.address,
          addressId: null,
          divisionSnapshotId: selected.division,
          divisionIds,
          locales: [],
        })
      ).divisionDefinitions
      for (const placeId of active)
        for (const divisionId of entities.get(placeId)?.division ?? []) {
          const definition = definitions[divisionId]
          if (!definition)
            throw new Error(
              `Missing Place Division definition ${selected.division}/${divisionId}.`,
            )
          const key = JSON.stringify([placeId, divisionId])
          const previous = links.get(key)
          next.set(key, {
            placeId,
            divisionId,
            definition,
            divisionSnapshotId:
              previous &&
              canonicalPlaceJson(previous.definition) === canonicalPlaceJson(definition)
                ? previous.divisionSnapshotId
                : selected.division,
          })
        }
    }
    links = next
  }
  return { links, entities }
}

async function applySourceChanges(
  step: SnapshotReplayStep,
  shards: ReadonlyMap<string, ReplayShard>,
  wanted: string,
  state: Map<string, Entities>,
) {
  const table = historySchema.sourceResolutions
  const seen = new Set<string>()
  for (const binding of new Set(step.shards.map(row => row.bindingName))) {
    const shard = shards.get(binding)
    if (!shard)
      throw new Error(`Missing Place source interpretation binding ${binding}.`)
    let cursor: { release: string; id: string; hash: string } | undefined
    while (true) {
      const rows = await shard.db
        .select({
          release: table.sourceReleaseId,
          id: table.sourceRecordId,
          hash: table.sourceVersionHash,
          resolutions: table.resolutions,
        })
        .from(table)
        .where(
          and(
            eq(table.scopeId, `snapshot:${step.snapshotId}`),
            eq(table.snapshotId, step.snapshotId),
            sql`${table.sourceRecordId} IN (SELECT value FROM json_each(${wanted}))`,
            cursor
              ? sql`(${table.sourceReleaseId},${table.sourceRecordId},${table.sourceVersionHash}) > (${cursor.release},${cursor.id},${cursor.hash})`
              : undefined,
          ),
        )
        .orderBy(table.sourceReleaseId, table.sourceRecordId, table.sourceVersionHash)
        .limit(512)
        .all()
      for (const row of rows) {
        const entities = row.resolutions?.entities
        if (
          seen.has(row.id) ||
          !entities ||
          typeof entities !== 'object' ||
          Array.isArray(entities) ||
          Object.values(entities).some(
            ids => !Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id),
          )
        )
          throw new Error(
            `Invalid or ambiguous Place source interpretation ${step.snapshotId}/${row.id}.`,
          )
        seen.add(row.id)
        state.set(row.id, entities)
      }
      cursor = rows.at(-1)
      if (rows.length < 512) break
    }
  }
}

async function validateLocaleDependencies(
  input: Input,
  plan: SnapshotReplayStep[],
  shards: ReadonlyMap<string, ReplayShard>,
  bases: ReadonlyMap<string, Base>,
  locales: Locale[],
  links: ReadonlyMap<string, Link>,
  view: PlaceDependencyView,
  dependencies: ReturnType<typeof createPlaceSearchDependencies>,
) {
  const versions = await resolveSnapshotVersionState(plan, shards, ['placeI18n'])
  const originPlans = new Map<string, Promise<SnapshotReplayStep[]>>()
  const originBases = new Map<string, Promise<Base>>()
  for (const locale of locales) {
    const key = `placeI18n\u0000${locale.placeId}\u0000${locale.locale}`
    const version = versions.get(key)
    if (!version)
      throw new Error(
        `Missing exact Place localisation ${locale.placeId}/${locale.locale}.`,
      )
    versions.delete(key)
    const history = historySchema.placesI18n
    const original = await version.shard.db
      .select()
      .from(history)
      .where(
        and(
          eq(history.placeId, locale.placeId),
          eq(history.locale, locale.locale),
          eq(history.versionHash, version.versionHash),
        ),
      )
      .get()
    const text = locale.searchDependencyText
      ? JSON.parse(locale.searchDependencyText)
      : null
    if (
      !original ||
      canonicalPlaceJson(original.searchDependencyText) !== canonicalPlaceJson(text) ||
      !text ||
      typeof text !== 'object' ||
      Array.isArray(text) ||
      !['addressText', 'divisionText', 'streetText'].every(
        field => typeof text[field] === 'string',
      ) ||
      !(
        text.addressSnapshotId === null ||
        (typeof text.addressSnapshotId === 'string' && text.addressSnapshotId)
      )
    )
      throw new Error(
        `Missing or invalid retained Place search dependency text ${locale.placeId}/${locale.locale}.`,
      )
    let originPlan = originPlans.get(original.snapshotId)
    if (!originPlan) {
      originPlan = resolveSnapshotReplayPlan(input.metaDb, original.snapshotId)
      originPlans.set(original.snapshotId, originPlan)
    }
    const originKey = JSON.stringify([original.snapshotId, locale.placeId])
    let originBase = originBases.get(originKey)
    if (!originBase) {
      originBase = (async () => {
        const state = await resolveSnapshotVersionState(
          await originPlan,
          shards,
          ['place'],
          [locale.placeId],
        )
        const baseVersion = state.get(`place\u0000${locale.placeId}\u0000`)
        if (!baseVersion)
          throw new Error(
            `Missing original Place base for localisation ${locale.placeId}/${locale.locale}.`,
          )
        const base = historySchema.places
        const row = await baseVersion.shard.db
          .select()
          .from(base)
          .where(
            and(
              eq(base.id, locale.placeId),
              eq(base.versionHash, baseVersion.versionHash),
            ),
          )
          .get()
        if (!row) throw new Error(`Missing original Place content ${locale.placeId}.`)
        return row as Base
      })()
      originBases.set(originKey, originBase)
    }
    const base = await originBase
    if (
      (base.address2dId && !text.addressSnapshotId) ||
      (!base.address2dId && text.addressSnapshotId)
    )
      throw new Error(
        `Incomplete original Place localisation Address pointer ${locale.placeId}/${locale.locale}.`,
      )
    if (text.addressSnapshotId) await view.prepare(text.addressSnapshotId)
    const expected = (
      await dependencies({
        addressSnapshotId: text.addressSnapshotId ?? '',
        addressId: base.address2dId,
        address3dId: base.address3dId,
        address3dUnitId: base.address3dUnitId,
        divisionSnapshotId: '',
        divisionIds: [],
        locales: [locale.locale],
      })
    ).searchDependencies[locale.locale]
    const names = [...links.values()]
      .filter(link => link.placeId === locale.placeId)
      .flatMap(link =>
        link.definition.locales
          .filter(value => value.locale.toLowerCase() === locale.locale.toLowerCase())
          .map(value => value.name ?? ''),
      )
    const divisionText = [...new Set(names.filter(Boolean))].sort().join(',')
    if (
      !expected ||
      expected.addressText !== text.addressText ||
      expected.streetText !== text.streetText ||
      divisionText !== text.divisionText
    )
      throw new Error(
        `Place rollback search dependency content differs for ${locale.placeId}/${locale.locale}.`,
      )
    if (!bases.has(locale.placeId))
      throw new Error(`Orphan Place localisation ${locale.placeId}.`)
  }
  if (versions.size)
    throw new Error(
      'Place rollback localisation membership differs from exact snapshot history.',
    )
}
