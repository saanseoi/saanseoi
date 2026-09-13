import type { AddressRecord } from '../db/addresses'
import type { GeocodingQuery } from '../schema/geocoding'
import { distanceMetres, nameScore, pointGeometry } from './divisionGeocoding'

export function rankAddress(record: AddressRecord, query: GeocodingQuery) {
  const coordinates = pointGeometry(record.address.geometry)
  const reverse = query.lat !== undefined
  const distance =
    reverse && coordinates
      ? distanceMetres([query.lng!, query.lat!], coordinates)
      : null
  const score = reverse
    ? 0
    : nameScore(
        (query.address ?? query.placename)!,
        Object.values(record.i18n).flatMap(value =>
          query.address !== undefined
            ? [value.formattedAddress]
            : [value.buildingName, value.estateName, value.streetName],
        ),
      )
  return (reverse ? distance === null || distance > query.maxDistance : score === 0)
    ? null
    : { record, coordinates, distance, score }
}
export function compareAddresses(
  a: NonNullable<ReturnType<typeof rankAddress>>,
  b: NonNullable<ReturnType<typeof rankAddress>>,
) {
  return (
    (a.distance !== null ? a.distance - b.distance! : b.score - a.score) ||
    a.record.address.id.localeCompare(b.record.address.id)
  )
}

/** Retain only the best page plus one tie witness, while counting every match. */
export async function collectAddressCandidates(
  pages: AsyncIterable<AddressRecord[]>,
  query: GeocodingQuery,
) {
  const best: Array<NonNullable<ReturnType<typeof rankAddress>>> = []
  let total = 0
  for await (const records of pages)
    for (const record of records) {
      const candidate = rankAddress(record, query)
      if (!candidate) continue
      total++
      best.push(candidate)
      best.sort(compareAddresses)
      if (best.length > query.limit + 1) best.pop()
    }
  return { records: best.map(candidate => candidate.record), total }
}
