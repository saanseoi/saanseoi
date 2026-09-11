import {
  getPublicationReadiness,
  publicationScopeCondition,
  publicationLogicalSnapshot,
} from './publicationState'
import type { CurrentDatabase } from '@repo/db'
import type { BBox } from '@repo/core/pipeline/geojson.ts'
import { and, asc, eq, sql } from '@repo/db'
import { getTableColumns } from '@repo/db'
import { currentSchema } from '@repo/db'
import type { RequestedApiLocaleSelection } from '@repo/core/apiLocales'
import { MAX_PLACE_RESULTS } from '../lib/api-limits'

const {
  divisions,
  divisionsI18n,
  places,
  placesCells,
  placesDivision,
  placesFts,
  placeSearchScopes,
  placesFtsMatch,
  placesI18n,
} = currentSchema

type PlaceLookup = {
  placeId: string
  snapshotId: string
}

type I18nLookup = {
  placeId: string
  snapshotId: string
  locale?: string
}

type H3Lookup = {
  snapshotId: string
  h3Level: number
  h3Cell: string
  limit?: number
}

type FtsLookup = {
  snapshotId: string
  locale?: string
  query: string
  limit?: number
}

export type PlaceLocaleValue = {
  name: string | null
  nameVariant: string[] | null
  nameAlts: string | null
  brandName: string | null
  brandNameVariant: string[] | null
  brandNameAlts: string | null
  freeformAddress: string | null
  accessHint?: string | null
  provenance: {
    isMachineTranslated: string[]
    isHumanVerified: string[]
    isLocaleInferred: boolean
  } | null
}

export type PlaceRecord = {
  place: {
    snapshotId: string
    id: string
    releaseId: string
    addressSnapshotId: string | null
    address2dId: string | null
    address3dId: string | null
    address3dUnitId?: string | null
    address3dMembership?: 'established' | 'unresolved' | null
    lng: number
    lat: number
    bbox: BBox | null
    operatingStatus: string | null
    basicCategory: string | null
    taxonomyPrimary: string | null
    taxonomyHierarchy: unknown
    taxonomyAlternates: unknown
    wikidataId: string | null
    websites: unknown
    socials: unknown
    emails: unknown
    phones: unknown
    confidence: number | null
    sources: unknown
    firstSeenMonth: string
    lastSeenMonth: string
    createdAt: string
    updatedAt: string
  }
  i18n: Record<string, PlaceLocaleValue>
  divisionIds: string[]
}

export function normalisePlaceBbox(value: unknown): BBox | null {
  const coordinates = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && !Array.isArray(value)
      ? [
          (value as Record<string, unknown>).xmin,
          (value as Record<string, unknown>).ymin,
          (value as Record<string, unknown>).xmax,
          (value as Record<string, unknown>).ymax,
        ]
      : null

  if (
    coordinates?.length !== 4 ||
    coordinates.some(
      coordinate => typeof coordinate !== 'number' || !Number.isFinite(coordinate),
    )
  ) {
    return null
  }

  return [coordinates[0], coordinates[1], coordinates[2], coordinates[3]]
}

type PlaceListLookup = {
  snapshotId: string
  limit?: number
  offset?: number
  basicCategory?: string
  taxonomyPrimary?: string
  operatingStatus?: string
  divisionId?: string
  localeSelection: RequestedApiLocaleSelection
}

export async function hasCurrentPlaceSnapshot(db: CurrentDatabase, snapshotId: string) {
  return (await getPublicationReadiness(db, 'place', [snapshotId])) !== null
}

export async function getPlaceCurrent(db: CurrentDatabase, lookup: PlaceLookup) {
  const row = await db
    .select({
      ...getTableColumns(places),
      snapshotId: sql<string>`${lookup.snapshotId}`,
      addressSnapshotId: places.addressSnapshotId,
    })
    .from(places)
    .where(
      and(
        publicationScopeCondition('place', places.snapshotId, [lookup.snapshotId]),
        eq(places.id, lookup.placeId),
      ),
    )
    .limit(1)
    .get()

  return row ? { ...row, bbox: normalisePlaceBbox(row.bbox) } : null
}

export async function listPlaceI18n(db: CurrentDatabase, lookup: I18nLookup) {
  const conditions = [
    publicationScopeCondition('place', placesI18n.snapshotId, [lookup.snapshotId]),
    eq(placesI18n.placeId, lookup.placeId),
    lookup.locale ? eq(placesI18n.locale, lookup.locale) : undefined,
  ].filter(condition => condition !== undefined)

  return db
    .select({
      ...getTableColumns(placesI18n),
      snapshotId: sql<string>`${lookup.snapshotId}`,
    })
    .from(placesI18n)
    .where(and(...conditions))
    .orderBy(asc(placesI18n.locale))
    .all()
}

export async function listPlaceDivisions(db: CurrentDatabase, lookup: I18nLookup) {
  return db
    .select({
      divisionId: divisions.id,
      level: divisions.level,
      locale: divisionsI18n.locale,
      name: divisionsI18n.name,
    })
    .from(placesDivision)
    .innerJoin(
      divisions,
      and(
        eq(divisions.snapshotId, placesDivision.divisionSnapshotId),
        eq(divisions.id, placesDivision.divisionId),
      ),
    )
    .leftJoin(
      divisionsI18n,
      and(
        eq(divisionsI18n.snapshotId, divisions.snapshotId),
        eq(divisionsI18n.divisionId, divisions.id),
        lookup.locale ? eq(divisionsI18n.locale, lookup.locale) : undefined,
      ),
    )
    .where(
      and(
        publicationScopeCondition('place', placesDivision.placeSnapshotId, [
          lookup.snapshotId,
        ]),
        eq(placesDivision.placeId, lookup.placeId),
      ),
    )
    .orderBy(asc(divisions.level), asc(divisionsI18n.locale))
    .all()
}

export async function listPlacesByH3Cell(db: CurrentDatabase, lookup: H3Lookup) {
  return db
    .select({
      placeId: places.id,
      releaseId: places.releaseId,
      basicCategory: places.basicCategory,
      taxonomyPrimary: places.taxonomyPrimary,
      taxonomyHierarchy: places.taxonomyHierarchy,
      taxonomyAlternates: places.taxonomyAlternates,
      operatingStatus: places.operatingStatus,
      lat: places.lat,
      lng: places.lng,
      h3Level: placesCells.h3Level,
      h3Cell: placesCells.h3Cell,
    })
    .from(placesCells)
    .innerJoin(
      places,
      and(eq(places.snapshotId, placesCells.snapshotId), eq(places.id, placesCells.id)),
    )
    .where(
      and(
        publicationScopeCondition('place', placesCells.snapshotId, [lookup.snapshotId]),
        eq(placesCells.h3Level, lookup.h3Level),
        eq(placesCells.h3Cell, lookup.h3Cell),
      ),
    )
    .limit(Math.min(lookup.limit ?? 50, MAX_PLACE_RESULTS))
    .all()
}

export async function searchPlacesFts(db: CurrentDatabase, lookup: FtsLookup) {
  try {
    if (!(await hasCurrentPlaceSnapshot(db, lookup.snapshotId)))
      throw new Error('Place search is not ready for the latest published release.')
    const readSearchScope = () =>
      db
        .select({ scopeId: placeSearchScopes.scopeId })
        .from(placeSearchScopes)
        .where(eq(placeSearchScopes.snapshotId, lookup.snapshotId))
        .get()
    const ready = await readSearchScope()
    if (!ready)
      throw new Error('Place search is not ready for the latest published release.')
    const rows = await db
      .select({
        placeId: places.id,
        releaseId: places.releaseId,
        locale: placesFts.locale,
        nameText: placesFts.nameText,
        brandText: placesFts.brandText,
      })
      .from(placesFts)
      .innerJoin(placeSearchScopes, eq(placesFts.scopeId, placeSearchScopes.scopeId))
      .innerJoin(
        places,
        and(
          eq(
            publicationLogicalSnapshot('place', places.snapshotId),
            placeSearchScopes.snapshotId,
          ),
          eq(places.id, placesFts.placeId),
        ),
      )
      .where(
        and(
          eq(placeSearchScopes.snapshotId, lookup.snapshotId),
          lookup.locale ? eq(placesFts.locale, lookup.locale) : undefined,
          placesFtsMatch(lookup.query),
        ),
      )
      .limit(Math.min(lookup.limit ?? 20, MAX_PLACE_RESULTS))
      .all()
    const after = await readSearchScope()
    if (after?.scopeId !== ready.scopeId)
      throw new Error('Place search is not ready for the latest published release.')
    return rows
  } catch (error) {
    if (
      error instanceof Error &&
      /no such table: place(?:Search|PublicationState)/.test(
        `${error.message} ${error.cause}`,
      )
    ) {
      throw new Error('Place search is not ready for the latest published release.', {
        cause: error,
      })
    }

    throw error
  }
}

function buildPlaceI18nCondition(localeSelection: RequestedApiLocaleSelection) {
  return and(
    eq(placesI18n.snapshotId, places.snapshotId),
    eq(placesI18n.placeId, places.id),
    localeSelection.mode === 'requested' && localeSelection.locales.length > 0
      ? sql`${placesI18n.locale} in (
          select value from json_each(${JSON.stringify(localeSelection.locales)})
        )`
      : undefined,
  )
}

function buildPlaceI18nJsonSelection(localeSelection: RequestedApiLocaleSelection) {
  if (localeSelection.mode === 'none') return sql<string>`'{}'`

  return sql<string>`coalesce((
    select json_group_object(
      ${placesI18n.locale},
      json_object(
        'name', ${placesI18n.name},
        'nameVariant', ${placesI18n.nameVariant},
        'nameAlts', ${placesI18n.nameAlts},
        'brandName', ${placesI18n.brandName},
        'brandNameVariant', ${placesI18n.brandNameVariant},
        'brandNameAlts', ${placesI18n.brandNameAlts},
        'freeformAddress', ${placesI18n.freeformAddress},
        'accessHint', ${placesI18n.accessHint},
        'provenance', ${placesI18n.provenance}
      )
    )
    from ${placesI18n}
    where ${buildPlaceI18nCondition(localeSelection)}
  ), '{}')`
}

function asNullableString(value: unknown) {
  return typeof value === 'string' ? value : value === null ? null : null
}

function asNullableStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  if (typeof value !== 'string') return null

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : null
  } catch {
    return null
  }
}

function asPlaceProvenance(value: unknown): PlaceLocaleValue['provenance'] {
  const parsed =
    typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value) as unknown
          } catch {
            return null
          }
        })()
      : value
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const record = parsed as Record<string, unknown>
  return {
    isMachineTranslated: asNullableStringArray(record.isMachineTranslated) ?? [],
    isHumanVerified: asNullableStringArray(record.isHumanVerified) ?? [],
    isLocaleInferred: record.isLocaleInferred === true,
  }
}

function parsePlaceI18n(value: string): Record<string, PlaceLocaleValue> {
  const parsed = JSON.parse(value) as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(parsed).flatMap(([locale, raw]) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
      const record = raw as Record<string, unknown>
      return [
        [
          locale,
          {
            name: asNullableString(record.name),
            nameVariant: asNullableStringArray(record.nameVariant),
            nameAlts: asNullableString(record.nameAlts),
            brandName: asNullableString(record.brandName),
            brandNameVariant: asNullableStringArray(record.brandNameVariant),
            brandNameAlts: asNullableString(record.brandNameAlts),
            freeformAddress: asNullableString(record.freeformAddress),
            accessHint: asNullableString(record.accessHint),
            provenance: asPlaceProvenance(record.provenance),
          },
        ],
      ]
    }),
  )
}

function parseDivisionIds(value: string) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function buildPlaceConditions(
  lookup: Pick<
    PlaceListLookup,
    | 'snapshotId'
    | 'basicCategory'
    | 'taxonomyPrimary'
    | 'operatingStatus'
    | 'divisionId'
  >,
) {
  return [
    publicationScopeCondition('place', places.snapshotId, [lookup.snapshotId]),
    lookup.basicCategory ? eq(places.basicCategory, lookup.basicCategory) : undefined,
    lookup.taxonomyPrimary
      ? eq(places.taxonomyPrimary, lookup.taxonomyPrimary)
      : undefined,
    lookup.operatingStatus
      ? eq(places.operatingStatus, lookup.operatingStatus)
      : undefined,
    lookup.divisionId
      ? sql`exists (
          select 1
          from ${placesDivision}
          where ${placesDivision.placeSnapshotId} = ${places.snapshotId}
            and ${placesDivision.placeId} = ${places.id}
            and ${placesDivision.divisionId} = ${lookup.divisionId}
        )`
      : undefined,
  ].filter(condition => condition !== undefined)
}

type PlaceListRow = PlaceRecord['place'] & { i18n: string; divisionIds: string }

function mapPlaceRow(row: PlaceListRow): PlaceRecord {
  const { divisionIds, i18n, ...place } = row
  return {
    place: { ...place, bbox: normalisePlaceBbox(place.bbox) },
    i18n: parsePlaceI18n(i18n),
    divisionIds: parseDivisionIds(divisionIds),
  }
}

export async function listPlaceRecordsCurrent(
  db: CurrentDatabase,
  lookup: PlaceListLookup,
): Promise<PlaceRecord[]> {
  const i18n = buildPlaceI18nJsonSelection(lookup.localeSelection)
  const divisionIds = sql<string>`coalesce((
    select json_group_array(${placesDivision.divisionId})
    from ${placesDivision}
    where ${placesDivision.placeSnapshotId} = ${places.snapshotId}
      and ${placesDivision.placeId} = ${places.id}
  ), '[]')`
  const rows = await db
    .select({
      snapshotId: publicationLogicalSnapshot('place', places.snapshotId),
      id: places.id,
      releaseId: places.releaseId,
      addressSnapshotId: places.addressSnapshotId,
      address2dId: places.address2dId,
      address3dId: places.address3dId,
      address3dUnitId: places.address3dUnitId,
      address3dMembership: places.address3dMembership,
      lng: places.lng,
      lat: places.lat,
      bbox: places.bbox,
      operatingStatus: places.operatingStatus,
      basicCategory: places.basicCategory,
      taxonomyPrimary: places.taxonomyPrimary,
      taxonomyHierarchy: places.taxonomyHierarchy,
      taxonomyAlternates: places.taxonomyAlternates,
      wikidataId: places.wikidataId,
      websites: places.websites,
      socials: places.socials,
      emails: places.emails,
      phones: places.phones,
      confidence: places.confidence,
      sources: places.sources,
      firstSeenMonth: places.firstSeenMonth,
      lastSeenMonth: places.lastSeenMonth,
      createdAt: places.createdAt,
      updatedAt: places.updatedAt,
      i18n,
      divisionIds,
    })
    .from(places)
    .where(and(...buildPlaceConditions(lookup)))
    .orderBy(asc(places.id))
    .limit(lookup.limit ?? 25)
    .offset(lookup.offset ?? 0)
    .all()

  return rows.map(row => mapPlaceRow(row as PlaceListRow))
}

export async function countPlaceRecordsCurrent(
  db: CurrentDatabase,
  lookup: Omit<PlaceListLookup, 'limit' | 'offset' | 'localeSelection'>,
) {
  const row = await db
    .select({ count: sql<number>`count(*)` })
    .from(places)
    .where(and(...buildPlaceConditions(lookup)))
    .limit(1)
    .get()

  return Number(row?.count ?? 0)
}
