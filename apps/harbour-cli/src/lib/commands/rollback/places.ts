import type { Database } from 'bun:sqlite'
import {
  resolveSnapshotReplayPlan,
  type SnapshotReplayStep,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  type ReplayShard,
  resolveSnapshotVersionState,
} from '@repo/core/pipeline/db/snapshotReplay'
import { and, eq, historySchema } from '@repo/db'
import { latLngToCell } from 'h3-js'
import { PlaceDependencyView } from '../../pipeline/places/placeDependencyView.ts'
import { canonicalPlaceJson } from '../../pipeline/places/placeHistory.ts'
import { createPlaceSearchDependencies } from '../../pipeline/places/placeSearchDependencies.ts'
import { PLACE_H3_LEVELS } from '../../pipeline/places/processLocalPlaceSqlUploadConfig.ts'
import {
  type PlaceDivisionLink,
  restorePlaceDivisionLinks,
} from './placeDivisionLinks.ts'
import { resolveValidatedProjectionVersions } from './projectionReplay.ts'

export type PlaceRollbackBase = {
  id: string
  lng: number
  lat: number
  addressSnapshotId: string | null
  addressDependencyHash: string | null
  address2dId: string | null
  address3dId: string | null
  address3dUnitId: string | null
}
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
        .all(input.scopeId) as PlaceRollbackBase[]
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
  const expected = await resolveValidatedProjectionVersions({
    metaDb: input.metaDb,
    historyTargets: input.historyTargets,
    snapshotId: input.snapshotId,
    recordTypes: ['place'],
  })
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
    const links = await restorePlaceDivisionLinks(input, plan, shards, bases, view)
    for (const base of bases.values()) {
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

async function validateLocaleDependencies(
  input: Input,
  plan: SnapshotReplayStep[],
  shards: ReadonlyMap<string, ReplayShard>,
  bases: ReadonlyMap<string, PlaceRollbackBase>,
  locales: Locale[],
  links: ReadonlyMap<string, PlaceDivisionLink>,
  view: PlaceDependencyView,
  dependencies: ReturnType<typeof createPlaceSearchDependencies>,
) {
  const versions = await resolveSnapshotVersionState(plan, shards, ['placeI18n'])
  const originPlans = new Map<string, Promise<SnapshotReplayStep[]>>()
  const originBases = new Map<string, Promise<PlaceRollbackBase>>()
  const linksByPlace = new Map<string, PlaceDivisionLink[]>()
  for (const link of links.values()) {
    const group = linksByPlace.get(link.placeId) ?? []
    group.push(link)
    linksByPlace.set(link.placeId, group)
  }
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
          eq(history.snapshotId, version.snapshotId),
        ),
      )
      .get()
    const text = locale.searchDependencyText
      ? JSON.parse(locale.searchDependencyText)
      : null
    if (
      !original ||
      typeof original.snapshotId !== 'string' ||
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
              eq(base.snapshotId, baseVersion.snapshotId),
            ),
          )
          .get()
        if (!row) throw new Error(`Missing original Place content ${locale.placeId}.`)
        return row as PlaceRollbackBase
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
    const names = (linksByPlace.get(locale.placeId) ?? []).flatMap(link =>
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
