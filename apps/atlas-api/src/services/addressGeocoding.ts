import { containsReviewPoint } from '../schema/geocodingFootprint'
import { normaliseAddressText, parseAddress } from './addressParsing'
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
    : scoreAddress(
        record,
        (query.address ?? query.placename)!,
        query.address !== undefined,
      )

  if (
    query.footprint &&
    (!coordinates || !containsReviewPoint(coordinates, query.footprint))
  )
    return null
  return (
    reverse
      ? distance === null || (!query.footprint && distance > query.maxDistance)
      : score === 0
  )
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

/** Component scores never allow a numeric substring to establish an address match. */
export function scoreAddress(
  record: Pick<AddressRecord, 'i18n'>,
  input: string,
  addressQuery = true,
) {
  const parsed = parseAddress(input)
  let best = 0
  for (const value of Object.values(record.i18n)) {
    if (addressQuery && parsed.street && parsed.numbers) {
      const stored = parseAddress(value.formattedAddress)
      const street = normaliseAddressText(value.streetName ?? stored.street ?? '')
      const requested = parsed.street
      const exactStreet = street === requested
      // A locality prefix or section qualifier is weaker evidence, not an authored alias.
      const partialStreet =
        ` ${street} `.includes(` ${requested} `) ||
        ` ${requested} `.includes(` ${street} `) ||
        (/\p{Script=Han}/u.test(street) &&
          (requested.endsWith(street) || street.endsWith(requested)))
      if (!street || (!exactStreet && !partialStreet)) continue
      const from = Number(
        (value.buildingNumberFrom ?? '').match(/^\d+/)?.[0] ?? stored.numbers?.[0],
      )
      const to = Number(
        (value.buildingNumberTo ?? '').match(/^\d+/)?.[0] ??
          (value.buildingNumberFrom ? from : (stored.numbers?.[1] ?? from)),
      )
      if (!Number.isFinite(from) || !Number.isFinite(to)) continue
      const [low, high] = parsed.numbers
      if (low > high || from > to || high < from || low > to) continue
      if (
        value.buildingNumberTo &&
        value.buildingNumberConnector !== '-' &&
        !(low <= from && from <= high) &&
        !(low <= to && to <= high)
      )
        continue
      // Hong Kong ranges with same-parity endpoints describe that street side.
      const queryParity = low % 2 === high % 2 ? low % 2 : null
      const storedParity = from % 2 === to % 2 ? from % 2 : null
      if (queryParity !== null && storedParity !== null && queryParity !== storedParity)
        continue
      const exactNumber = low === from && high === to
      const named = [value.buildingName, value.estateName].some(
        name => name && matchesBuildingName(parsed.text, name),
      )
      best = Math.max(
        best,
        (exactStreet ? 0.8 : 0.65) + (exactNumber ? 0.1 : 0) + (named ? 0.09 : 0),
      )
      continue
    }
    const names = addressQuery
      ? [value.formattedAddress, value.buildingName, value.estateName]
      : [value.buildingName, value.estateName, value.streetName]
    best = Math.max(
      best,
      nameScore(
        parsed.text,
        names.map(name => (name ? normaliseAddressText(name) : name)),
      ),
    )
    // Full, unparsed listings can still contain a complete named building.
    for (const name of [value.buildingName]) {
      const normalised = name && normaliseAddressText(name)
      if (
        normalised &&
        normalised.length >= 4 &&
        ` ${parsed.text} `.includes(` ${normalised} `)
      )
        best = Math.max(best, 0.75)
    }
  }
  return best
}

function matchesBuildingName(text: string, name: string) {
  const normalised = normaliseAddressText(name)
  if (` ${text} `.includes(` ${normalised} `)) return true
  if (/\p{Script=Han}/u.test(normalised) && text.includes(normalised)) return true
  const words = normalised.split(' ')
  // Preserve the distinguishing leading word: One IFC is not Two IFC.
  if (words.length < 3 || words.some(word => !/^[a-z]+$/.test(word))) return false
  const abbreviated = `${words[0]} ${words
    .slice(1)
    .map(word => word[0])
    .join('')}`
  return ` ${text} `.includes(` ${abbreviated} `)
}
