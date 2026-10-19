import { and, asc, currentSchema, sql, type CurrentDatabase } from '@repo/db'
import type { GeocodingQuery } from '../schema/geocoding'
import { publicationScopeCondition } from './publicationState'
import { numberStems, parseAddress } from '../services/addressParsing'
import { listAddressRecordsCurrentByIds } from './addresses'

/** Candidate prefilter only: distances and ranking are evaluated after hydration. */
export async function* addressGeocodingCandidates(
  db: CurrentDatabase,
  snapshotIds: string[],
  query: GeocodingQuery,
  fallback = false,
) {
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
