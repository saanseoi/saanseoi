import { chunkArray } from '@repo/core/pipeline/utils.ts'
import { placeDivisionFieldNames } from '@repo/db'
import {
  placeDivisionDisplaySql,
  placeAddressSnapshotSql,
} from '@repo/core/pipeline/services/places/publicationDependencies'
import { normalisePlaceBbox } from '@repo/core/pipeline/services/places/placeGeometry'
import { parseI18nMeta } from '@repo/db'
import {
  geographicMembershipSql,
  geographicFilterContext,
} from '../lib/geographicFilterContext'
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
import {
  placeSearchKey,
  readPlaceSearchCursor,
  writePlaceSearchCursor,
} from './placeSearchCursor'
import { MAX_PLACE_RESULTS } from '../lib/api-limits'

const {
  places,
  placesCells,
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
  offset?: number
}

type FtsLookup = {
  snapshotId: string
  locale?: string
  query: string
  limit?: number
  cursor?: string
  basicCategory?: string
  taxonomyPrimary?: string
  taxonomyCategory?: string
  operatingStatus?: string
  includePreview?: boolean
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
  meta: import('@repo/db').I18nMeta
}

export type PlaceRecord = {
  place: {
    snapshotId: string
    id: string
    resourceReleaseId: string
    addressSnapshotId: string | null
    countryId?: string | null
    areaId?: string | null
    districtId?: string | null
    townId?: string | null
    ruralAreaId?: string | null
    macrohoodId?: string | null
    neighbourhoodId?: string | null
    villageId?: string | null
    microhoodId?: string | null
    hamletId?: string | null
    islandId?: string | null
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
    identifiers: { wikidata: { brandId: string } } | null
    websites: unknown
    socials: unknown
    emails: unknown
    phones: unknown
    confidence: number | null
    sources: unknown
    firstSeenMonth: string
    lastSeenMonth: string
    createdAt: string
  }
  i18n: Record<string, PlaceLocaleValue>
  divisionIds: string[]
  divisionDefinitions?: import('@repo/db').PlaceDivisionDefinitionSet
}

export { normalisePlaceBbox } from '@repo/core/pipeline/services/places/placeGeometry'

type PlaceListLookup = {
  id?: string
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
      addressSnapshotId: sql<string | null>`${sql.raw(placeAddressSnapshotSql())}`,
    })
    .from(places)
    .where(
      and(
        publicationScopeCondition('place', places.scopeId, [lookup.snapshotId]),
        eq(places.id, lookup.placeId),
        placeGeographicCondition(),
      ),
    )
    .limit(1)
    .get()

  return row
    ? {
        ...row,
        lng: row.geometry.coordinates[0],
        lat: row.geometry.coordinates[1],
        lastSeenMonth: '',
        bbox: normalisePlaceBbox(row.bbox),
      }
    : null
}

export async function listPlaceI18n(db: CurrentDatabase, lookup: I18nLookup) {
  const conditions = [
    publicationScopeCondition('place', placesI18n.scopeId, [lookup.snapshotId]),
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
  const row = await db
    .select({
      ...getTableColumns(places),
      definition: sql<
        import('@repo/db').PlaceDivisionDefinitionSet
      >`json(${sql.raw(placeDivisionDisplaySql())})`.mapWith(
        (value): import('@repo/db').PlaceDivisionDefinitionSet =>
          typeof value === 'string' ? JSON.parse(value) : value,
      ),
    })
    .from(places)
    .where(
      and(
        publicationScopeCondition('place', places.scopeId, [lookup.snapshotId]),
        eq(places.id, lookup.placeId),
      ),
    )
    .get()
  const ids = new Set(
    placeDivisionFieldNames.flatMap(field => (row?.[field] ? [row[field]!] : [])),
  )
  const rows = Object.entries(row?.definition ?? {})
    .filter(([id]) => ids.has(id))
    .map(([divisionId, definition]) => ({ divisionId, definition }))

  return rows
    .flatMap(({ divisionId, definition }) => {
      const locales = definition.locales.filter(
        value => !lookup.locale || value.locale === lookup.locale,
      )
      return (locales.length ? locales : [{ locale: null, name: null }]).map(value => ({
        divisionId,
        level: definition.level,
        locale: value.locale,
        name: value.name,
      }))
    })
    .sort(
      (a, b) =>
        (a.level ?? -1) - (b.level ?? -1) ||
        (a.locale ?? '').localeCompare(b.locale ?? ''),
    )
}

export async function listPlacesByH3Cell(db: CurrentDatabase, lookup: H3Lookup) {
  const limit = Math.min(lookup.limit ?? 50, MAX_PLACE_RESULTS)
  const rows = await db
    .select({
      placeId: places.id,
      resourceReleaseId: places.resourceReleaseId,
      basicCategory: places.basicCategory,
      taxonomyPrimary: places.taxonomyPrimary,
      taxonomyHierarchy: places.taxonomyHierarchy,
      taxonomyAlternates: places.taxonomyAlternates,
      operatingStatus: places.operatingStatus,
      lat: sql<number>`json_extract(${places.geometry}, '$.coordinates[1]')`,
      lng: sql<number>`json_extract(${places.geometry}, '$.coordinates[0]')`,
      h3Level: placesCells.h3Level,
      h3Cell: placesCells.h3Cell,
    })
    .from(placesCells)
    .innerJoin(
      places,
      and(eq(places.scopeId, placesCells.scopeId), eq(places.id, placesCells.id)),
    )
    .where(
      and(
        publicationScopeCondition('place', placesCells.scopeId, [lookup.snapshotId]),
        eq(placesCells.h3Level, lookup.h3Level),
        eq(placesCells.h3Cell, lookup.h3Cell),
        placeGeographicCondition(),
      ),
    )
    .orderBy(asc(places.id))
    .limit(limit + 1)
    .offset(lookup.offset ?? 0)
    .all()
  return { places: rows.slice(0, limit), hasMore: rows.length > limit }
}

/** Return a bounded, fully filtered discovery page from the current published index.
 * @param db Current publication database.
 * @param lookup Text, classification filters, preview projection and continuation.
 * @returns Matching establishments and a publication-bound continuation.
 * @remarks Classification is applied before the limit; previews share the search query.
 */
export async function searchPlacesFtsPage(db: CurrentDatabase, lookup: FtsLookup) {
  try {
    if (!(await hasCurrentPlaceSnapshot(db, lookup.snapshotId)))
      throw new Error('Place search is not ready for the latest published release.')
    const readSearchScope = () =>
      db
        .select({
          scopeId: placeSearchScopes.scopeId,
          physicalScopeId:
            sql<string>`${currentSchema.placePublicationState.scopeId}`.as(
              'physicalScopeId',
            ),
          publicationToken: currentSchema.placePublicationState.publicationToken,
        })
        .from(placeSearchScopes)
        .innerJoin(
          currentSchema.placePublicationState,
          and(
            eq(
              currentSchema.placePublicationState.snapshotId,
              placeSearchScopes.snapshotId,
            ),
            eq(currentSchema.placePublicationState.status, 'current'),
            sql`${currentSchema.placePublicationState.preparedAt} IS NOT NULL`,
            sql`${currentSchema.placePublicationState.publicationToken} <> ''`,
          ),
        )
        .where(eq(placeSearchScopes.snapshotId, lookup.snapshotId))
        .get()
    const ready = await readSearchScope()
    if (!ready)
      throw new Error('Place search is not ready for the latest published release.')
    const geography = geographicFilterContext()
    const key = await placeSearchKey({
      query: lookup.query,
      locale: lookup.locale ?? null,
      snapshotId: lookup.snapshotId,
      publication: ready,
      basicCategory: lookup.basicCategory ?? null,
      taxonomyPrimary: lookup.taxonomyPrimary ?? null,
      taxonomyCategory: lookup.taxonomyCategory ?? null,
      operatingStatus: lookup.operatingStatus ?? null,
      geography: geography
        ? {
            ...geography,
            groups: geography.groups.map(group => [...group].sort()),
            divisionClasses: geography.divisionClasses
              ? [...geography.divisionClasses].sort()
              : null,
          }
        : null,
    })
    const cursor = readPlaceSearchCursor(lookup.cursor, key)
    const limit = Math.min(lookup.limit ?? 20, MAX_PLACE_RESULTS)
    // Select one matching localisation per establishment before applying the page limit.
    const rows = await db
      .select({
        rowid: lookup.locale
          ? sql<number>`${placesFts}.rowid`
          : sql<number>`min(${placesFts}.rowid)`,
        ...(lookup.includePreview
          ? {
              geometry: places.geometry,
              phones: places.phones,
              basicCategory: places.basicCategory,
              taxonomyPrimary: places.taxonomyPrimary,
              taxonomyHierarchy: places.taxonomyHierarchy,
              taxonomyAlternates: places.taxonomyAlternates,
              operatingStatus: places.operatingStatus,
              i18nJson: sql<string>`coalesce((select json_group_object(${placesI18n.locale}, json_object(
            'name', ${placesI18n.name}, 'brandName', ${placesI18n.brandName},
            'freeformAddress', ${placesI18n.freeformAddress}
          )) from ${placesI18n} where ${placesI18n.scopeId} = ${places.scopeId}
            and ${placesI18n.placeId} = ${places.id}), '{}')`,
            }
          : {}),
        placeId: places.id,
        resourceReleaseId: places.resourceReleaseId,
        locale: placesFts.locale,
        nameText: placesFts.nameText,
        brandText: placesFts.brandText,
      })
      .from(placesFts)
      .innerJoin(placeSearchScopes, eq(placesFts.scopeId, placeSearchScopes.scopeId))
      .innerJoin(
        places,
        and(
          eq(places.scopeId, ready.physicalScopeId),
          eq(places.id, placesFts.placeId),
        ),
      )
      .where(
        and(
          eq(placeSearchScopes.snapshotId, lookup.snapshotId),
          lookup.locale ? eq(placesFts.locale, lookup.locale) : undefined,
          placesFtsMatch(lookup.query),
          lookup.locale ? sql`${placesFts}.rowid > ${cursor.rowid}` : undefined,
          lookup.basicCategory
            ? eq(places.basicCategory, lookup.basicCategory)
            : undefined,
          lookup.taxonomyPrimary
            ? eq(places.taxonomyPrimary, lookup.taxonomyPrimary)
            : undefined,
          lookup.taxonomyCategory
            ? sql`(${places.taxonomyPrimary} = ${lookup.taxonomyCategory}
            OR EXISTS (SELECT 1 FROM json_each(${places.taxonomyHierarchy}) category
              WHERE category.value = ${lookup.taxonomyCategory}))`
            : undefined,
          lookup.operatingStatus === 'open_or_unknown'
            ? sql`(${places.operatingStatus} IS NULL OR ${places.operatingStatus} IN ('open', 'unknown', ''))`
            : lookup.operatingStatus && lookup.operatingStatus !== 'any'
              ? eq(places.operatingStatus, lookup.operatingStatus)
              : undefined,
          placeGeographicCondition(),
        ),
      )
      .groupBy(...(lookup.locale ? [] : [places.id]))
      .having(
        lookup.locale ? undefined : sql`min(${placesFts}.rowid) > ${cursor.rowid}`,
      )
      .orderBy(lookup.locale ? sql`${placesFts}.rowid` : sql`min(${placesFts}.rowid)`)
      .limit(limit + 1)
      .all()
    const after = await readSearchScope()
    if (JSON.stringify(after) !== JSON.stringify(ready))
      throw new Error('Place search is not ready for the latest published release.')
    const page = rows.slice(0, limit)
    return {
      results: page.map(row => ({
        placeId: row.placeId,
        resourceReleaseId: row.resourceReleaseId,
        locale: row.locale,
        nameText: row.nameText,
        brandText: row.brandText,
        ...(lookup.includePreview
          ? {
              preview: {
                place: {
                  id: row.placeId,
                  resourceReleaseId: row.resourceReleaseId,
                  geometry: row.geometry!,
                  phones: row.phones ?? null,
                  basicCategory: row.basicCategory ?? null,
                  operatingStatus: row.operatingStatus ?? null,
                  taxonomy: {
                    primary: row.taxonomyPrimary ?? null,
                    hierarchy: row.taxonomyHierarchy ?? null,
                    alternates: row.taxonomyAlternates ?? null,
                  },
                },
                i18n: JSON.parse(row.i18nJson ?? '{}') as Record<
                  string,
                  {
                    name: string | null
                    brandName: string | null
                    freeformAddress: string | null
                  }
                >,
              },
            }
          : {}),
      })),
      nextCursor:
        rows.length > limit
          ? writePlaceSearchCursor({ key, rowid: page[page.length - 1]!.rowid })
          : null,
    }
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

/** Read a bounded search result array for callers that do not request pagination.
 * @param db Current publication database.
 * @param lookup Search inputs.
 * @returns Fully filtered discovery results.
 */
export async function searchPlacesFts(db: CurrentDatabase, lookup: FtsLookup) {
  return (await searchPlacesFtsPage(db, lookup)).results
}

function buildPlaceI18nCondition(localeSelection: RequestedApiLocaleSelection) {
  return and(
    eq(placesI18n.scopeId, places.scopeId),
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
        'meta', json(${placesI18n.meta})
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

function asPlaceMeta(value: unknown): import('@repo/db').I18nMeta {
  return parseI18nMeta(typeof value === 'string' ? JSON.parse(value) : value)
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
            meta: asPlaceMeta(record.meta),
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

function scalarDivisionIdsSql() {
  return sql<string>`json_array(${sql.join(
    placeDivisionFieldNames.map(field => places[field]),
    sql`, `,
  )})`
}
function placeGeographicCondition() {
  const all = scalarDivisionIdsSql()
  return geographicMembershipSql(all, undefined, targetClass =>
    targetClass === 'district'
      ? sql`case when ${places.districtId} is not null then json_array(${places.districtId}) else ${all} end`
      : all,
  )
}

function buildPlaceConditions(
  lookup: Pick<
    PlaceListLookup,
    | 'id'
    | 'snapshotId'
    | 'basicCategory'
    | 'taxonomyPrimary'
    | 'operatingStatus'
    | 'divisionId'
  >,
) {
  return [
    publicationScopeCondition('place', places.scopeId, [lookup.snapshotId]),
    placeGeographicCondition(),
    lookup.id ? eq(places.id, lookup.id) : undefined,
    lookup.basicCategory ? eq(places.basicCategory, lookup.basicCategory) : undefined,
    lookup.taxonomyPrimary
      ? eq(places.taxonomyPrimary, lookup.taxonomyPrimary)
      : undefined,
    lookup.operatingStatus
      ? eq(places.operatingStatus, lookup.operatingStatus)
      : undefined,
    lookup.divisionId
      ? sql`(${places.scopeId}, ${places.id}) in (${sql.join(
          chunkArray([...placeDivisionFieldNames], 5).map(
            fields =>
              sql`select * from (${sql.join(
                fields.map(
                  field =>
                    sql`select ${places.scopeId}, ${places.id} from ${places} where ${publicationScopeCondition('place', places.scopeId, [lookup.snapshotId])} and ${places[field]} = ${lookup.divisionId}`,
                ),
                sql` UNION `,
              )})`,
          ),
          sql` UNION `,
        )})`
      : undefined,
  ].filter(condition => condition !== undefined)
}

type PlaceListRow = PlaceRecord['place'] & {
  i18n: string
  divisionIds: string
  definition: string | null
}

function mapPlaceRow(row: PlaceListRow): PlaceRecord {
  const { divisionIds, i18n, definition, ...place } = row
  return {
    place: { ...place, bbox: normalisePlaceBbox(place.bbox) },
    i18n: parsePlaceI18n(i18n),
    divisionIds: parseDivisionIds(divisionIds),
    divisionDefinitions: definition ? JSON.parse(definition) : {},
  }
}

export async function listPlaceRecordsCurrent(
  db: CurrentDatabase,
  lookup: PlaceListLookup,
): Promise<PlaceRecord[]> {
  const i18n = buildPlaceI18nJsonSelection(lookup.localeSelection)
  const divisionIds = scalarDivisionIdsSql()
  const rows = await db
    .select({
      snapshotId: publicationLogicalSnapshot('place', places.scopeId),
      id: places.id,
      resourceReleaseId: places.resourceReleaseId,
      addressSnapshotId: sql<string | null>`${sql.raw(placeAddressSnapshotSql())}`,
      address2dId: places.address2dId,
      address3dId: places.address3dId,
      address3dUnitId: places.address3dUnitId,
      address3dMembership: places.address3dMembership,
      lng: sql<number>`json_extract(${places.geometry}, '$.coordinates[0]')`,
      lat: sql<number>`json_extract(${places.geometry}, '$.coordinates[1]')`,
      bbox: places.bbox,
      operatingStatus: places.operatingStatus,
      basicCategory: places.basicCategory,
      taxonomyPrimary: places.taxonomyPrimary,
      taxonomyHierarchy: places.taxonomyHierarchy,
      taxonomyAlternates: places.taxonomyAlternates,
      identifiers: places.identifiers,
      websites: places.websites,
      socials: places.socials,
      emails: places.emails,
      phones: places.phones,
      confidence: places.confidence,
      sources: places.sources,
      firstSeenMonth: places.firstSeenMonth,
      lastSeenMonth: sql<string>`''`,
      createdAt: places.createdAt,

      i18n,
      divisionIds,
      ...Object.fromEntries(
        placeDivisionFieldNames.map(field => [field, places[field]]),
      ),
      definition: sql<string | null>`${sql.raw(placeDivisionDisplaySql())}`,
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
