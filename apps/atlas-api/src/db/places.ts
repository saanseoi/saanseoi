import type { z } from 'zod'
import type { SearchResponseSchema } from '../schema/places'
import { distanceMetres } from '../services/divisionGeocoding'
import {
  placeSearchKey,
  readPlaceSearchCursor,
  writePlaceSearchCursor,
} from './placeSearchCursor'
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
import { MAX_PLACE_RESULTS } from '../lib/api-limits'

const { places, placesCells, placesFts, placeSearchScopes, placesI18n } = currentSchema

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
  basicCategory?: string
  taxonomyPrimary?: string
  operatingStatus?: string
  snapshotId: string
  h3Level: number
  h3Cell: string
  limit?: number
  offset?: number
}

type FtsLookup = {
  nearLat?: number
  nearLng?: number
  maxDistance?: number
  cursor?: string
  basicCategory?: string
  taxonomyPrimary?: string
  operatingStatus?: string
  snapshotId: string
  locale?: string
  query: string
  limit?: number
  taxonomyCategory?: string
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
        lookup.basicCategory
          ? eq(places.basicCategory, lookup.basicCategory)
          : undefined,
        lookup.taxonomyPrimary
          ? eq(places.taxonomyPrimary, lookup.taxonomyPrimary)
          : undefined,
        lookup.operatingStatus
          ? eq(places.operatingStatus, lookup.operatingStatus)
          : undefined,
        placeGeographicCondition(),
      ),
    )
    .orderBy(asc(places.id))
    .limit(limit + 1)
    .offset(lookup.offset ?? 0)
    .all()
  return { places: rows.slice(0, limit), hasMore: rows.length > limit }
}

/** Normalize punctuation in place search terms without changing source labels. */
function normalizePlaceSearchQuery(query: string): string {
  return query
    .replace(/[\p{P}\p{S}]+/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

type PlaceSearchResult = {
  preview?: z.infer<typeof SearchResponseSchema>['results'][number]['preview']
  placeId: string
  resourceReleaseId: string
  locale: string
  nameText: string | null
  brandText: string | null
}

/** Match all literal fragments with one bound parameter regardless of term count.
 * @param terms Normalised fragments, with SQL wildcard punctuation removed.
 * @param namesOnly Restrict the checked fields to names and brands.
 * @returns A residual predicate, used only after an indexed anchor when available.
 */
function placeLiteralMatch(
  terms: string[][],
  namesOnly: boolean,
): ReturnType<typeof sql> {
  const fields = namesOnly
    ? [placesFts.nameText, placesFts.brandText]
    : [
        placesFts.nameText,
        placesFts.brandText,
        placesFts.taxonomyText,
        placesFts.addressText,
        placesFts.divisionText,
        placesFts.streetText,
      ]
  return sql`NOT EXISTS (
    SELECT 1 FROM json_each(${JSON.stringify(terms)}) variants WHERE NOT EXISTS (
      SELECT 1 FROM json_each(variants.value) term WHERE ${sql.join(
        fields.map(field => sql`coalesce(${field}, '') LIKE '%' || term.value || '%'`),
        sql` OR `,
      )})
  )`
}

/** Build literal substring predicates with an indexed anchor whenever possible.
 * @param terms Normalised query fragments, combined with AND.
 * @param namesOnly Restrict matching to names and brands.
 * @returns A bound FTS expression plus residual checks for one/two-character terms.
 * @remarks Short fragments cannot use trigrams. Longer fragments in the same query
 * still narrow the scan; no user text is interpreted as FTS syntax or SQL wildcards.
 */
function placeSubstringMatch(
  terms: string[][],
  namesOnly: boolean,
): ReturnType<typeof sql> {
  const indexed = terms.filter(variants =>
    variants.every(term => [...term].length >= 3),
  )
  const short = terms.filter(variants => variants.some(term => [...term].length < 3))
  const conditions = short.length ? [placeLiteralMatch(short, namesOnly)] : []
  if (indexed.length) {
    const phrase = indexed
      .map(
        variants =>
          `(${variants.map(term => `"${term.replaceAll('"', '""')}"`).join(' OR ')})`,
      )
      .join(' AND ')
    conditions.unshift(
      sql`${placesFts} MATCH ${namesOnly ? `{nameText brandText} : (${phrase})` : phrase}`,
    )
  }
  return sql.join(conditions, sql` AND `)
}

/** Find literal fragments in the latest published Places index.
 * @param db Current publication database.
 * @param lookup Snapshot, query, optional locale and exact classification filters.
 * @returns A bounded page with name/brand hits first and an explicit continuation.
 * @remarks Short broad searches stop at the result limit without a catalogue-wide
 * sort/count. Stable FTS row order breaks ties; a broad query is not exhaustive.
 */
export async function searchPlacesFtsPage(
  db: CurrentDatabase,
  lookup: FtsLookup,
): Promise<{ results: PlaceSearchResult[]; nextCursor: string | null }> {
  const terms = [
    ...new Set(normalizePlaceSearchQuery(lookup.query).split(' ').filter(Boolean)),
  ].map(term => [...new Set([term, term.normalize('NFKC')])])
  if (!terms.length) return { results: [], nextCursor: null }
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
        .where(
          and(
            eq(placeSearchScopes.snapshotId, lookup.snapshotId),
            // A word-token index cannot satisfy the substring query contract.
            sql`exists (select 1 from sqlite_master where name = 'placeSearchFts' and sql like '%trigram%')`,
            lookup.locale
              ? undefined
              : sql`exists (select 1 from sqlite_master where name = 'placeSearchIdentities' and type = 'table')`,
          ),
        )
        .get()
    const ready = await readSearchScope()
    if (!ready)
      throw new Error('Place search is not ready for the latest published release.')
    const geography = geographicFilterContext()
    const key = await placeSearchKey({
      geography: geography
        ? {
            ...geography,
            groups: geography.groups.map(group => [...group].sort()),
            divisionClasses: geography.divisionClasses
              ? [...geography.divisionClasses].sort(([a], [b]) => a.localeCompare(b))
              : undefined,
          }
        : null,
      nearLat: lookup.nearLat ?? null,
      nearLng: lookup.nearLng ?? null,
      maxDistance: lookup.maxDistance ?? null,
      terms: terms.map(variants => JSON.stringify(variants)),
      taxonomyCategory: lookup.taxonomyCategory ?? null,
      snapshotId: lookup.snapshotId,
      locale: lookup.locale ?? null,
      basicCategory: lookup.basicCategory ?? null,
      taxonomyPrimary: lookup.taxonomyPrimary ?? null,
      operatingStatus: lookup.operatingStatus ?? null,
      publication: ready,
    })
    const cursor = readPlaceSearchCursor(lookup.cursor, key)
    const ownMatch = placeLiteralMatch(terms, true)
    const limit = Math.min(lookup.limit ?? 20, MAX_PLACE_RESULTS)
    // Two bounded passes prioritise names without sorting every match to a letter.
    const readBatch = (
      namesOnly: boolean,
      remaining: number,
      afterRow: number,
    ): Promise<
      (PlaceSearchResult & {
        rowid: number
        phase: 'names' | 'context'
        previewJson: string | null
        lng: number | null
        lat: number | null
      })[]
    > =>
      db
        .select({
          previewJson: lookup.includePreview
            ? sql<string>`json_object(
            'place', json_object('id', ${places.id}, 'resourceReleaseId', ${places.resourceReleaseId},
              'geometry', json(${places.geometry}), 'phones', json(${places.phones}),
              'basicCategory', ${places.basicCategory}, 'operatingStatus', ${places.operatingStatus},
              'taxonomy', json_object('primary', ${places.taxonomyPrimary},
                'hierarchy', json(${places.taxonomyHierarchy}), 'alternates', json(${places.taxonomyAlternates}))),
            'i18n', json(coalesce((select json_group_object(${placesI18n.locale}, json_object(
              'name', ${placesI18n.name}, 'brandName', ${placesI18n.brandName},
              'freeformAddress', ${placesI18n.freeformAddress})) from ${placesI18n}
              where ${placesI18n.scopeId} = ${places.scopeId} and ${placesI18n.placeId} = ${places.id}), '{}'))
          )`
            : sql<null>`NULL`,
          lng:
            lookup.nearLat === undefined
              ? sql<null>`NULL`
              : sql<number>`json_extract(${places.geometry}, '$.coordinates[0]')`,
          lat:
            lookup.nearLat === undefined
              ? sql<null>`NULL`
              : sql<number>`json_extract(${places.geometry}, '$.coordinates[1]')`,
          rowid: sql<number>`${placesFts}.rowid`,
          phase: sql<'names' | 'context'>`${namesOnly ? 'names' : 'context'}`,
          placeId: places.id,
          resourceReleaseId: places.resourceReleaseId,
          locale: placesFts.locale,
          nameText: sql<
            string | null
          >`CASE WHEN instr(${placesFts.nameText}, char(31)) > 0 THEN substr(${placesFts.nameText}, 1, instr(${placesFts.nameText}, char(31)) - 1) ELSE ${placesFts.nameText} END`,
          brandText: sql<
            string | null
          >`CASE WHEN instr(${placesFts.brandText}, char(31)) > 0 THEN substr(${placesFts.brandText}, 1, instr(${placesFts.brandText}, char(31)) - 1) ELSE ${placesFts.brandText} END`,
        })
        .from(placesFts)
        .innerJoin(placeSearchScopes, eq(placesFts.scopeId, placeSearchScopes.scopeId))
        .innerJoin(
          places,
          and(
            // Resolve the physical scope once so the (scopeId, id) primary key is usable.
            eq(places.scopeId, ready.physicalScopeId),
            eq(places.id, placesFts.placeId),
          ),
        )
        .where(
          and(
            eq(placeSearchScopes.snapshotId, lookup.snapshotId),
            lookup.locale ? eq(placesFts.locale, lookup.locale) : undefined,
            placeSubstringMatch(terms, namesOnly),
            // Choose a matching localisation once per Place, preserving name-first ranking.
            lookup.locale
              ? undefined
              : sql`NOT EXISTS (
              SELECT 1 FROM placeSearchIdentities identity
              JOIN placeSearchFts alternate ON alternate.rowid = identity.ftsRowid
              WHERE identity.scopeId = ${placesFts.scopeId}
                AND identity.placeId = ${placesFts.placeId}
                AND NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(terms)}) variants
                  WHERE NOT EXISTS (SELECT 1 FROM json_each(variants.value) term WHERE (coalesce(alternate.nameText, '') LIKE '%' || term.value || '%'
                    OR coalesce(alternate.brandText, '') LIKE '%' || term.value || '%'
                    OR coalesce(alternate.taxonomyText, '') LIKE '%' || term.value || '%'
                    OR coalesce(alternate.addressText, '') LIKE '%' || term.value || '%'
                    OR coalesce(alternate.divisionText, '') LIKE '%' || term.value || '%'
                    OR coalesce(alternate.streetText, '') LIKE '%' || term.value || '%')))
                AND (CASE WHEN NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(terms)}) variants
                    WHERE NOT EXISTS (SELECT 1 FROM json_each(variants.value) term WHERE (coalesce(alternate.nameText, '') LIKE '%' || term.value || '%'
                      OR coalesce(alternate.brandText, '') LIKE '%' || term.value || '%')))
                  THEN 0 ELSE 1 END) <= ${namesOnly ? 0 : 1}
                AND (alternate.rowid < ${placesFts}.rowid OR (${namesOnly ? 0 : 1} = 1
                  AND NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(terms)}) variants
                    WHERE NOT EXISTS (SELECT 1 FROM json_each(variants.value) term WHERE (coalesce(alternate.nameText, '') LIKE '%' || term.value || '%'
                      OR coalesce(alternate.brandText, '') LIKE '%' || term.value || '%')))))
            )`,
            // Seek after the previous row within its ranking phase; never rescan prior pages.
            sql`${placesFts}.rowid > ${afterRow}`,
            namesOnly ? undefined : sql`NOT ${ownMatch}`,
            // A conservative latitude band reduces hydration; exact circle checks precede pagination.
            lookup.nearLat === undefined
              ? undefined
              : sql`json_extract(${places.geometry}, '$.coordinates[1]') BETWEEN ${lookup.nearLat - ((lookup.maxDistance! / 6371008.8) * 180) / Math.PI} AND ${lookup.nearLat + ((lookup.maxDistance! / 6371008.8) * 180) / Math.PI}`,
            // Filter the full match set before limiting so selected categories retain recall.
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
        .orderBy(sql`${placesFts}.rowid`)
        .limit(remaining)
        .all()
    /** Scan text matches until a radius-filtered page is full or the phase is exhausted.
     * @param namesOnly Name/brand ranking phase.
     * @param remaining Page capacity including the continuation witness.
     * @returns Matches inside the circle before the public page limit is applied.
     */
    const readMatches = async (namesOnly: boolean, remaining: number) => {
      const matches: (PlaceSearchResult & {
        rowid: number
        phase: 'names' | 'context'
      })[] = []
      let afterRow =
        cursor.phase === (namesOnly ? 'names' : 'context') ? cursor.rowid : 0
      const batchSize =
        lookup.nearLat === undefined ? remaining : Math.max(100, remaining)
      while (matches.length < remaining) {
        const batch = await readBatch(namesOnly, batchSize, afterRow)
        for (const { lng, lat, previewJson, ...row } of batch) {
          if (
            lookup.nearLat !== undefined &&
            (lng === null ||
              lat === null ||
              distanceMetres([lookup.nearLng!, lookup.nearLat], [lng, lat]) >
                lookup.maxDistance!)
          )
            continue
          matches.push({
            ...row,
            ...(previewJson
              ? { preview: JSON.parse(previewJson) as PlaceSearchResult['preview'] }
              : {}),
          })
          if (matches.length === remaining) break
        }
        if (batch.length < batchSize) break
        afterRow = batch.at(-1)!.rowid
      }
      return matches
    }
    // One look-ahead row establishes continuation without an exhaustive count query.
    const rows = cursor.phase === 'names' ? await readMatches(true, limit + 1) : []
    if (rows.length <= limit)
      rows.push(...(await readMatches(false, limit + 1 - rows.length)))
    const after = await readSearchScope()
    if (
      after?.scopeId !== ready.scopeId ||
      after.physicalScopeId !== ready.physicalScopeId ||
      after.publicationToken !== ready.publicationToken
    )
      throw new Error('Place search is not ready for the latest published release.')
    const page = rows.slice(0, limit)
    const last = page.at(-1)
    return {
      results: page.map(({ rowid, phase, ...row }) => row),
      nextCursor:
        rows.length > limit && last
          ? writePlaceSearchCursor({ key, phase: last.phase, rowid: last.rowid })
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

/** Read one bounded discovery page for callers that do not request continuation.
 * @param db Current publication database.
 * @param lookup Query and classification filters.
 * @returns Name/brand matches followed by contextual matches.
 */
export async function searchPlacesFts(
  db: CurrentDatabase,
  lookup: FtsLookup,
): Promise<PlaceSearchResult[]> {
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

/**
 * Loads a page of published Places after selecting its bounded identity set.
 * @param db Current publication database.
 * @param lookup Publication, filters, pagination and locale selection.
 * @returns Complete records for the requested page.
 * @remarks Resolve translations and Division display data only for selected rows.
 */
export async function listPlaceRecordsCurrent(
  db: CurrentDatabase,
  lookup: PlaceListLookup,
): Promise<PlaceRecord[]> {
  const i18n = buildPlaceI18nJsonSelection(lookup.localeSelection)
  const divisionIds = scalarDivisionIdsSql()
  // Keep expensive correlated projections outside the offset/sort operation.
  const page = db
    .select({ scopeId: places.scopeId, id: places.id })
    .from(places)
    .where(and(...buildPlaceConditions(lookup)))
    .orderBy(asc(places.id))
    .limit(lookup.limit ?? 25)
    .offset(lookup.offset ?? 0)
    .as('placePage')
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
    .innerJoin(page, and(eq(page.scopeId, places.scopeId), eq(page.id, places.id)))
    .orderBy(asc(places.id))
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
