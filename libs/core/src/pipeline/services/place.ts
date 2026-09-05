import { createHash } from '../utils'

export type PlaceI18nRecord = {
  locale: string
  name: string | null
  nameAlts: string | null
  nameVariant: string[] | null
  isLocaleInferred: boolean
  brandName: string | null
  brandNameAlts: string | null
  brandNameVariant: string[] | null
}

export type NormalisedPlace = {
  id: string
  lng: number
  lat: number
  bbox: unknown
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
  addresses: string[] | null
  confidence: number | null
  sources: unknown[]
  firstSeenMonth: string
  lastSeenMonth: string
  i18n: PlaceI18nRecord[]
  raw: Record<string, unknown>
}

export type PlaceAddressReference = {
  ids: string[]
  texts: string[]
}

export function normaliseOverturePlace(
  row: Record<string, unknown>,
  sourceVersion: string,
): NormalisedPlace | null {
  const id = asString(row.id)
  const coordinates = pointCoordinates(row.geometry)
  if (!id || !coordinates) return null

  const names = namedValues(row.names)
  const brand = asRecord(row.brand)
  const brandNames = namedValues(brand?.names)
  const categories = asRecord(row.categories)
  const taxonomy = asRecord(row.taxonomy)
  const taxonomyPrimary = asString(taxonomy?.primary) ?? asString(categories?.primary)
  const sourceValues = asArray(row.sources)
  const month = sourceVersion.slice(0, 7)

  return {
    id,
    lng: coordinates[0],
    lat: coordinates[1],
    bbox: jsonValue(row.bbox),
    operatingStatus: asString(row.operating_status),
    basicCategory:
      asString(row.basic_category) ?? asString(row.basicCategory) ?? taxonomyPrimary,
    taxonomyPrimary,
    taxonomyHierarchy: jsonValue(taxonomy?.hierarchy),
    taxonomyAlternates: jsonValue(categories?.alternate ?? taxonomy?.alternate),
    wikidataId: asString(brand?.wikidata),
    websites: jsonValue(row.websites),
    socials: jsonValue(row.socials),
    emails: jsonValue(row.emails),
    phones: jsonValue(row.phones),
    addresses: buildPlaceAddresses(row.addresses),
    confidence: asNumber(row.confidence),
    sources: sourceValues,
    firstSeenMonth: month,
    lastSeenMonth: month,
    i18n: mergePlaceI18n(names, brandNames),
    raw: row,
  }
}

export async function hashNormalisedPlace(place: NormalisedPlace) {
  return createHash({
    id: place.id,
    lng: place.lng,
    lat: place.lat,
    bbox: place.bbox,
    operatingStatus: place.operatingStatus,
    basicCategory: place.basicCategory,
    taxonomyPrimary: place.taxonomyPrimary,
    taxonomyHierarchy: place.taxonomyHierarchy,
    taxonomyAlternates: place.taxonomyAlternates,
    wikidataId: place.wikidataId,
    websites: place.websites,
    socials: place.socials,
    emails: place.emails,
    phones: place.phones,
    addresses: place.addresses,
    confidence: place.confidence,
    i18n: place.i18n,
  })
}

/**
 * Hashes the complete place materialisation, including the reference snapshots
 * used for its address and division joins. Reference snapshots are part of the
 * published result even when the linked canonical IDs remain unchanged.
 */
export async function hashPlaceMaterialisation(
  place: NormalisedPlace,
  references: {
    addressSnapshotId: string
    divisionSnapshotId: string
    addressId: string | null
    divisionIds: string[]
    contentHash?: string
  },
) {
  return createHash({
    contentHash: references.contentHash ?? (await hashNormalisedPlace(place)),
    addressSnapshotId: references.addressSnapshotId,
    divisionSnapshotId: references.divisionSnapshotId,
    addressId: references.addressId,
    divisionIds: references.divisionIds,
  })
}

/** Extracts publisher address references without assuming the Overture address
 * identifiers are SaanSeoi address identifiers. ALS remains the canonical
 * address source, so callers may use the textual values as a best-effort join.
 */
export function extractPlaceAddressReference(value: unknown): PlaceAddressReference {
  const records = Array.isArray(value) ? value : [value]
  const ids = new Set<string>()
  const texts = new Set<string>()

  for (const record of records) {
    if (typeof record === 'string') {
      if (record.trim()) texts.add(record.trim())
      continue
    }
    const object = asRecord(record)
    if (!object) continue
    const id = asString(object.id) ?? asString(object.address_id)
    if (id) ids.add(id)
    const freeform = asString(object.freeform)
    if (freeform) texts.add(freeform)
  }

  return { ids: [...ids], texts: [...texts] }
}

/** Reads the publisher country used by the Hong Kong Places inclusion filter. */
export function getPlaceAddressCountry(value: unknown): string | null {
  const address = Array.isArray(value) ? asRecord(value[0]) : null
  return asString(address?.country)
}

/** Retains only publisher free-form addresses in the canonical Place row. */
export function buildPlaceAddresses(value: unknown): string[] | null {
  const records = Array.isArray(value) ? value : [value]
  const freeforms = records.flatMap(record => {
    if (typeof record === 'string' && record.trim()) return [record.trim()]
    const object = asRecord(record)
    const freeform = asString(object?.freeform)
    return freeform ? [freeform] : []
  })
  return freeforms.length > 0 ? freeforms : null
}

/** Stops ingestion before materialisation while the Place-to-address model is single-valued. */
export function assertPlaceAddressCardinality(places: NormalisedPlace[]) {
  const multipleAddressPlaces = places.filter(
    place => Array.isArray(place.raw.addresses) && place.raw.addresses.length > 1,
  )
  if (multipleAddressPlaces.length === 0) return

  const preview = multipleAddressPlaces
    .slice(0, 10)
    .map(place => place.id)
    .join(', ')
  const remaining =
    multipleAddressPlaces.length - Math.min(10, multipleAddressPlaces.length)
  throw new Error(
    `WARNING: Overture Places ingestion stopped because ${multipleAddressPlaces.length} Place(s) contain more than one address. The current Place-to-address materialisation supports one canonical address. Reconsider the address <> place implementation before continuing. Affected Place IDs: ${preview}${remaining > 0 ? `, and ${remaining} more` : ''}.`,
  )
}

export function normalisePlaceText(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('en').replaceAll(/\s+/g, ' ').trim()
}

export function pointCoordinates(value: unknown): [number, number] | null {
  const geometry = asRecord(value)
  if (geometry?.type !== 'Point') return null
  const coordinates = geometry.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null
  const lng = Number(coordinates[0])
  const lat = Number(coordinates[1])
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
}

function mergePlaceI18n(
  names: NamedValue[],
  brandNames: NamedValue[],
): PlaceI18nRecord[] {
  const locales = new Set([...names, ...brandNames].map(value => value.locale))
  return [...locales].sort().map(locale => {
    const name = names.filter(value => value.locale === locale)
    const brand = brandNames.filter(value => value.locale === locale)
    return {
      locale,
      name: name[0]?.value ?? null,
      nameAlts: joinAlternates(name),
      nameVariant: name.length > 1 ? name.slice(1).map(value => value.value) : null,
      isLocaleInferred: name.some(value => value.inferred),
      brandName: brand[0]?.value ?? null,
      brandNameAlts: joinAlternates(brand),
      brandNameVariant:
        brand.length > 1 ? brand.slice(1).map(value => value.value) : null,
    }
  })
}

type NamedValue = { locale: string; value: string; inferred: boolean }

function namedValues(value: unknown): NamedValue[] {
  const output: NamedValue[] = []
  visitNamedValue(value, output, 'en', true)
  const deduped = new Map<string, NamedValue>()
  for (const item of output) {
    const key = `${item.locale}\u0000${item.value}`
    if (!deduped.has(key)) deduped.set(key, item)
  }
  return [...deduped.values()]
}

function visitNamedValue(
  value: unknown,
  output: NamedValue[],
  inheritedLocale: string,
  inherited: boolean,
) {
  if (typeof value === 'string' && value.trim()) {
    output.push({ locale: inheritedLocale, value: value.trim(), inferred: inherited })
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) visitNamedValue(item, output, inheritedLocale, inherited)
    return
  }
  const record = asRecord(value)
  if (!record) return
  const locale = normaliseLocale(
    asString(record.language) ?? asString(record.lang) ?? inheritedLocale,
  )
  const explicitValue = asString(record.value) ?? asString(record.name)
  if (explicitValue) {
    output.push({
      locale,
      value: explicitValue,
      inferred: !record.language && !record.lang,
    })
  }
  for (const [key, nested] of Object.entries(record)) {
    if (key === 'value' || key === 'name' || key === 'language' || key === 'lang')
      continue
    const nestedLocale = localeFromKey(key) ?? locale
    visitNamedValue(nested, output, nestedLocale, !localeFromKey(key))
  }
}

function joinAlternates(values: NamedValue[]) {
  const alternates = values.slice(1).map(value => value.value)
  return alternates.length > 0 ? alternates.join(' | ') : null
}

function localeFromKey(value: string) {
  const normalised = normaliseLocale(value)
  return /^(?:en|zh(?:-hans|-hant)?|ja|ko|fr|de|es|pt|it|ru|ar)$/.test(normalised)
    ? normalised
    : null
}

function normaliseLocale(value: string) {
  const lower = value.trim().toLowerCase().replaceAll('_', '-')
  if (lower === 'eng' || lower === 'english') return 'en'
  if (lower === 'zho' || lower === 'chi' || lower === 'cmn') return 'zh-hans'
  if (lower === 'yue' || lower === 'zh-hk') return 'zh-hant'
  return lower || 'en'
}

function jsonValue(value: unknown) {
  return value === undefined ? null : value
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
