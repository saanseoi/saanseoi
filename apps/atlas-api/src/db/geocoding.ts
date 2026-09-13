import { and, asc, currentSchema, sql, type CurrentDatabase } from '@repo/db'
import type { GeocodingQuery } from '../schema/geocoding'
import { publicationScopeCondition } from './publicationState'
import { listAddressRecordsCurrentByIds } from './addresses'

/** Candidate prefilter only: distances and ranking are evaluated after hydration. */
export async function* addressGeocodingCandidates(
  db: CurrentDatabase,
  snapshotIds: string[],
  query: GeocodingQuery,
) {
  const { address2d: address, address2dI18n: names } = currentSchema
  const text = (query.address ?? query.placename)?.toLowerCase().trim()
  const latitudeDelta = ((query.maxDistance / 6371008.8) * 180) / Math.PI
  // Latitude prefilter is conservative across poles and the antimeridian.
  const selection =
    text !== undefined && [...text].some(character => character.charCodeAt(0) > 127)
      ? sql`1 = 1`
      : text !== undefined
        ? sql`exists (select 1 from ${names} where ${names.snapshotId} = ${address.snapshotId} and ${names.addressId} = ${address.id} and (${
            query.address !== undefined
              ? sql`instr(lower(${names.formattedAddress}), ${text}) > 0`
              : sql`instr(lower(coalesce(${names.buildingName}, '')), ${text}) > 0 or instr(lower(coalesce(${names.estateName}, '')), ${text}) > 0 or instr(lower(coalesce(${names.streetName}, '')), ${text}) > 0`
          }))`
        : sql`json_extract(${address.geometry}, '$.type') = 'Point' and json_extract(${address.geometry}, '$.coordinates[1]') between ${query.lat! - latitudeDelta} and ${query.lat! + latitudeDelta}`
  let after: string | undefined
  for (;;) {
    const ids = await db
      .selectDistinct({ id: address.id })
      .from(address)
      .where(
        and(
          publicationScopeCondition('address', address.snapshotId, snapshotIds),
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
