import { and, asc, currentSchema, sql, type CurrentDatabase, type SQL } from '@repo/db'
import type { GeocodingQuery } from '../schema/geocoding'
import {
  publicationScopeCondition,
  PublicationReadUnavailableError,
} from './publicationState'
import { numberStems, parseAddress } from '../services/addressParsing'
import { listAddressRecordsCurrentByIds, type AddressRecord } from './addresses'
import { scoreAddress } from '../services/addressGeocoding'
import { geocodingTextSelection, type GeocodingTextSelection } from './geocodingText'

/** Candidate prefilter only: distances and ranking are evaluated after hydration. */
export async function* addressGeocodingCandidates(
  db: CurrentDatabase,
  snapshotIds: string[],
  query: GeocodingQuery,
  fallback = false,
) {
  // Text candidates combine indexed tokens and literal substrings before exact scoring.
  // Keep the exhaustive path for unprepared indexes and recall regression comparisons.
  const parsedText = query.address === undefined ? null : parseAddress(query.address)
  if (
    fallback ||
    (!query.footprint &&
      query.lat === undefined &&
      (!parsedText?.numbers || !numberStems(parsedText).length))
  ) {
    const selection = fallback
      ? undefined
      : await geocodingTextSelection(db, snapshotIds, query)
    yield* fallbackAddressCandidates(db, snapshotIds, query, selection)
    if (selection && !(await geocodingTextSelection(db, snapshotIds, query)))
      throw new PublicationReadUnavailableError('Address search index changed.')
    return
  }
  const { address2d: address, address2dI18n: names } = currentSchema
  const text = (query.address ?? query.placename)?.toLowerCase().trim()
  const parsed = query.address === undefined ? null : parseAddress(query.address)
  const stems = parsed ? numberStems(parsed) : []
  const numbers = currentSchema.address2dBuildingNumberLookup
  const latitudeDelta = ((query.maxDistance / 6371008.8) * 180) / Math.PI
  const longitudeDelta =
    query.lat !== undefined && Math.abs(query.lat) + latitudeDelta < 90
      ? (Math.asin(
          Math.min(
            1,
            Math.sin((latitudeDelta * Math.PI) / 180) /
              Math.cos((query.lat * Math.PI) / 180),
          ),
        ) *
          180) /
        Math.PI
      : 180
  const longitude = sql`json_extract(${address.geometry}, '$.coordinates[0]')`
  // Latitude prefilter is conservative across poles and the antimeridian.
  const footprintPoints = query.footprint
    ? query.footprint.type === 'Polygon'
      ? query.footprint.coordinates.flat()
      : query.footprint.coordinates.flat(2)
    : null
  const selection = footprintPoints
    ? sql`json_extract(${address.geometry}, '$.type') = 'Point' and ${longitude} between ${Math.min(...footprintPoints.map(p => p[0]))} and ${Math.max(...footprintPoints.map(p => p[0]))} and json_extract(${address.geometry}, '$.coordinates[1]') between ${Math.min(...footprintPoints.map(p => p[1]))} and ${Math.max(...footprintPoints.map(p => p[1]))}`
    : (fallback || (parsed?.numbers && !stems.length)) && text !== undefined
      ? sql`1 = 1`
      : stems.length
        ? sql`(${address.scopeId}, ${address.id}) in (select ${numbers.scopeId}, ${numbers.addressId} from ${numbers} where ${publicationScopeCondition('address', numbers.scopeId, snapshotIds)} and ${numbers.numericStem} in (select value from json_each(${JSON.stringify(stems)})))`
        : text !== undefined
          ? sql`exists (select 1 from ${names} where ${names.scopeId} = ${address.scopeId} and ${names.addressId} = ${address.id} and (
            instr(lower(${names.formattedAddress}), ${text}) > 0
            or (length(${names.buildingName}) >= 4 and instr(${text}, lower(${names.buildingName})) > 0)
            or (length(${names.premisesName}) >= 4 and instr(${text}, lower(${names.premisesName})) > 0)
            or instr(lower(coalesce(${names.streetName}, '')), ${text}) > 0
          ))`
          : sql`json_extract(${address.geometry}, '$.type') = 'Point' and json_extract(${address.geometry}, '$.coordinates[1]') between ${query.lat! - latitudeDelta} and ${query.lat! + latitudeDelta} and (abs(${longitude} - ${query.lng!}) <= ${longitudeDelta} or abs(${longitude} - ${query.lng!}) >= ${360 - longitudeDelta})`
  let after: string | undefined
  for (;;) {
    const ids = await db
      .selectDistinct({ id: address.id })
      .from(address)
      .where(
        and(
          publicationScopeCondition('address', address.scopeId, snapshotIds),
          selection,
          after === undefined ? undefined : sql`${address.id} > ${after}`,
        ),
      )
      .orderBy(asc(address.id))
      .limit(256)
      .all()
    if (!ids.length) return
    yield await listAddressRecordsCurrentByIds(db, {
      snapshotIds,
      addressIds: ids.map(row => row.id),
      localeSelection: { mode: 'all', locales: ['*'] },
    })
    after = ids.at(-1)!.id
  }
}

/** Scan lightweight locale rows using the exact scorer before loading full records.
 * @param db Current publication database.
 * @param snapshotIds Publication-pinned address snapshots.
 * @param query Forward lookup and ranking options.
 * @param selection Optional conservative text candidate filter.
 * @returns Matching records only; each identity is hydrated once across all locales.
 * @remarks The caller retains publication guards and final ranking. No match is truncated.
 */
async function* fallbackAddressCandidates(
  db: CurrentDatabase,
  snapshotIds: string[],
  query: GeocodingQuery,
  selection?: GeocodingTextSelection,
): AsyncGenerator<AddressRecord[]> {
  const names = currentSchema.address2dI18n
  let cursor: { scopeId: string; addressId: string; locale: string } | undefined
  const matched = new Set<string>()
  for (;;) {
    // Keyset pagination follows the locale table's composite primary key.
    const rows = await db
      .select({
        scopeId: sql<string>`${names.scopeId}`.as('scopeId'),
        addressId: sql<string>`${names.addressId}`.as('addressId'),
        locale: sql<string>`${names.locale}`.as('locale'),
        meta: sql<null>`NULL`.as('meta'),
        formattedAddress: sql<string>`${names.formattedAddress}`.as('formattedAddress'),
        buildingName: sql<string | null>`${names.buildingName}`.as('buildingName'),
        premisesName: sql<string | null>`${names.premisesName}`.as('premisesName'),
        streetName: sql<string | null>`${names.streetName}`.as('streetName'),
        buildingNumberFrom: sql<string | null>`${names.buildingNumberFrom}`.as(
          'buildingNumberFrom',
        ),
        buildingNumberTo: sql<string | null>`${names.buildingNumberTo}`.as(
          'buildingNumberTo',
        ),
        buildingNumberConnector: sql<
          string | null
        >`${names.buildingNumberConnector}`.as('buildingNumberConnector'),
      })
      .from(selection?.byRowId ? sql`${names} NOT INDEXED` : names)
      .where(
        and(
          publicationScopeCondition('address', names.scopeId, snapshotIds),
          selection?.condition,
          cursor
            ? sql`(${names.scopeId}, ${names.addressId}, ${names.locale}) > (${cursor.scopeId}, ${cursor.addressId}, ${cursor.locale})`
            : undefined,
        ),
      )
      .orderBy(asc(names.scopeId), asc(names.addressId), asc(names.locale))
      .limit(2048)
      .all()
    if (!rows.length) return
    const ids: string[] = []
    for (const row of rows) {
      if (matched.has(row.addressId)) continue
      if (
        !scoreAddress(
          { i18n: { [row.locale]: row } },
          (query.address ?? query.placename)!,
          query.address !== undefined,
        )
      )
        continue
      matched.add(row.addressId)
      ids.push(row.addressId)
    }
    // The existing loader binds IDs through JSON and restores every source locale.
    if (ids.length)
      yield await listAddressRecordsCurrentByIds(db, {
        snapshotIds,
        addressIds: ids,
        localeSelection: { mode: 'all', locales: ['*'] },
      })
    cursor = rows.at(-1)!
  }
}
