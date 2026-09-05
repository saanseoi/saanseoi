import { createHash } from '../utils'

export type PlaceI18nRecord = {
  locale: string
  name: string | null
  nameAlts: string | null
  nameVariant: string[] | null
  brandName: string | null
  brandNameAlts: string | null
  brandNameVariant: string[] | null
  freeformAddress: string | null
  provenance: PlaceI18nProvenance
}

export type PlaceI18nField = 'name' | 'brand' | 'freeformAddress'

export type PlaceLocaleEvidence = {
  field?: PlaceI18nField
  sourceLocale: string | null
  resolvedLocale: string
  script: 'han' | 'latin' | 'mixed' | 'other'
  conflict: boolean
  reason: string | null
}

export type PlaceI18nProvenance = {
  isMachineTranslated: PlaceI18nField[]
  isHumanVerified: PlaceI18nField[]
  isLocaleInferred: boolean
}

export type PlaceLocaleConflict = PlaceLocaleEvidence & {
  field: PlaceI18nField
  sourceText: string
}

export type PlaceLocalisationField = 'name' | 'brandName' | 'freeformAddress'

export type PlaceFieldLocaleStatistics = {
  valueCount: number
  providedCount: number
  inferredCount: number
  aiTranslatedCount: number
  humanTranslatedCount: number
  conflictCount: number
  missingCount: number
}

export type PlaceLocalisationStatistics = {
  totalPlaces: number
  fields: Map<string, PlaceFieldLocaleStatistics>
  referenceNameCount: number
  bilingualReferenceNameCount: number
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
  /** Transient resolver evidence; persisted through release audit actions only. */
  localeConflicts: PlaceLocaleConflict[]
  raw: Record<string, unknown>
}

export type PlaceAddressTexts = string[]

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
  const addressNames = addressNamedValues(row.addresses)
  const localeConflicts = [
    ...names.map(value => ({ ...value, field: 'name' as const })),
    ...brandNames.map(value => ({ ...value, field: 'brand' as const })),
    ...addressNames.map(value => ({ ...value, field: 'freeformAddress' as const })),
  ]
    .filter(value => value.evidence.conflict)
    .map(value => ({
      ...value.evidence,
      field: value.field,
      sourceText: value.value,
    }))
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
    i18n: mergePlaceI18n(names, brandNames, addressNames),
    localeConflicts,
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

/** Extracts publisher free-form address text for a best-effort ALS match.
 * Publisher identifiers are deliberately ignored: Overture does not provide
 * the SaanSeoi ALS premise identities used by the canonical Address tables.
 */
export function extractPlaceAddressTexts(value: unknown): PlaceAddressTexts {
  const records = Array.isArray(value) ? value : [value]
  const texts = new Set<string>()

  for (const record of records) {
    if (typeof record === 'string') {
      if (record.trim()) texts.add(record.trim())
      continue
    }
    const object = asRecord(record)
    if (!object) continue
    const freeform = asString(object.freeform)
    if (freeform) texts.add(freeform)
  }

  return [...texts]
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
    `WARNING: Overture Places ingestion stopped because ${multipleAddressPlaces.length} Place(s) contain more than one publisher address or localised address value. The current Place-to-address materialisation supports one canonical address. Reconsider the address <> place implementation before continuing. Affected Place IDs: ${preview}${remaining > 0 ? `, and ${remaining} more` : ''}.`,
  )
}

export function normalisePlaceText(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('en').replaceAll(/\s+/g, ' ').trim()
}

/**
 * Builds a convenient display label without inventing a locale or changing the
 * stable Place identifier.  This is deliberately a projection over i18n rows.
 */
export function derivePlaceReferenceName(
  localisations: Array<Pick<PlaceI18nRecord, 'locale' | 'name'>>,
) {
  const nonEmpty = localisations.filter(
    localised => typeof localised.name === 'string' && localised.name.trim(),
  )
  const traditional = nonEmpty.find(localised => localised.locale === 'zh-hant')
  const english = nonEmpty.find(localised => localised.locale === 'en')
  if (traditional?.name) {
    if (
      english?.name &&
      normalisePlaceText(traditional.name) !== normalisePlaceText(english.name) &&
      /\p{Script=Han}/u.test(traditional.name) &&
      !/\p{Script=Han}/u.test(english.name)
    ) {
      return `${traditional.name} ${english.name}`
    }
    return traditional.name
  }
  if (english?.name) return english.name
  return nonEmpty[0]?.name ?? null
}

export function buildPlaceLocalisationStatistics(
  places: Array<
    Pick<NormalisedPlace, 'id' | 'i18n'> &
      Partial<Pick<NormalisedPlace, 'localeConflicts'>>
  >,
): PlaceLocalisationStatistics {
  const fields = new Map<string, PlaceFieldLocaleStatistics>()
  const fieldNames: PlaceLocalisationField[] = ['name', 'brandName', 'freeformAddress']
  const ensure = (field: PlaceLocalisationField, locale: string) => {
    const key = `${field}\u0000${locale}`
    const existing = fields.get(key)
    if (existing) return existing
    const created = {
      valueCount: 0,
      providedCount: 0,
      inferredCount: 0,
      aiTranslatedCount: 0,
      humanTranslatedCount: 0,
      conflictCount: 0,
      missingCount: 0,
    }
    fields.set(key, created)
    return created
  }

  let referenceNameCount = 0
  let bilingualReferenceNameCount = 0
  for (const place of places) {
    const referenceName = derivePlaceReferenceName(place.i18n)
    if (referenceName) referenceNameCount += 1
    const hasTraditional = place.i18n.some(
      row => row.locale === 'zh-hant' && Boolean(row.name),
    )
    const hasEnglish = place.i18n.some(row => row.locale === 'en' && Boolean(row.name))
    const traditionalName = place.i18n.find(
      row => row.locale === 'zh-hant' && Boolean(row.name),
    )?.name
    const englishName = place.i18n.find(
      row => row.locale === 'en' && Boolean(row.name),
    )?.name
    const isBilingualReferenceName =
      hasTraditional &&
      hasEnglish &&
      Boolean(traditionalName && englishName) &&
      referenceName === `${traditionalName} ${englishName}`
    if (isBilingualReferenceName) bilingualReferenceNameCount += 1

    for (const field of fieldNames) {
      for (const row of place.i18n) {
        const value = row[field]
        const stats = ensure(field, row.locale)
        if (!value) continue
        stats.valueCount += 1
        const provenanceField: PlaceI18nField = field === 'brandName' ? 'brand' : field
        const isMachineTranslated =
          row.provenance.isMachineTranslated.includes(provenanceField)
        const isHumanVerified = row.provenance.isHumanVerified.includes(provenanceField)
        if (isMachineTranslated) stats.aiTranslatedCount += 1
        if (isHumanVerified) stats.humanTranslatedCount += 1
        if (!isMachineTranslated && !isHumanVerified) {
          if (row.provenance.isLocaleInferred) stats.inferredCount += 1
          else stats.providedCount += 1
        }
        if (
          place.localeConflicts?.some(
            evidence =>
              evidence.resolvedLocale === row.locale &&
              evidence.field === provenanceField,
          )
        )
          stats.conflictCount += 1
      }
    }
  }
  for (const field of fieldNames) {
    for (const locale of ['en', 'zh-hant', 'zh-hans']) ensure(field, locale)
  }
  for (const stats of fields.values())
    stats.missingCount = places.length - stats.valueCount
  return {
    totalPlaces: places.length,
    fields,
    referenceNameCount,
    bilingualReferenceNameCount,
  }
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
  addressNames: NamedValue[],
): PlaceI18nRecord[] {
  const locales = new Set(
    [...names, ...brandNames, ...addressNames].map(value => value.locale),
  )
  return [...locales].sort().map(locale => {
    const name = names.filter(value => value.locale === locale)
    const brand = brandNames.filter(value => value.locale === locale)
    const addresses = addressNames.filter(value => value.locale === locale)
    const values = [...name, ...brand, ...addresses]
    return {
      locale,
      name: name[0]?.value ?? null,
      nameAlts: joinAlternates(name),
      nameVariant: name.length > 1 ? name.slice(1).map(value => value.value) : null,
      brandName: brand[0]?.value ?? null,
      brandNameAlts: joinAlternates(brand),
      brandNameVariant:
        brand.length > 1 ? brand.slice(1).map(value => value.value) : null,
      freeformAddress: addresses[0]?.value ?? null,
      provenance: {
        isMachineTranslated: [],
        isHumanVerified: [],
        isLocaleInferred: values.some(value => value.inferred),
      },
    }
  })
}

export type NamedValue = {
  locale: string
  value: string
  inferred: boolean
  evidence: PlaceLocaleEvidence
}

export function namedValues(
  value: unknown,
  options: { defaultHanLocale?: 'zh-hant' | 'zh-hans' } = {},
): NamedValue[] {
  const output: NamedValue[] = []
  visitNamedValue(value, output, null, false, options.defaultHanLocale ?? 'zh-hant')
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
  inheritedLocale: string | null,
  inheritedExplicit: boolean,
  defaultHanLocale: 'zh-hant' | 'zh-hans',
) {
  if (typeof value === 'string' && value.trim()) {
    output.push(
      resolveNamedValue(value, inheritedLocale, inheritedExplicit, defaultHanLocale),
    )
    return
  }
  if (Array.isArray(value)) {
    for (const item of value)
      visitNamedValue(
        item,
        output,
        inheritedLocale,
        inheritedExplicit,
        defaultHanLocale,
      )
    return
  }
  const record = asRecord(value)
  if (!record) return
  const explicitLocaleValue = asString(record.language) ?? asString(record.lang)
  const explicitLocale = explicitLocaleValue
    ? normaliseLocale(explicitLocaleValue)
    : inheritedLocale
  const explicit = Boolean(explicitLocaleValue) || inheritedExplicit
  const explicitValue = asString(record.value) ?? asString(record.name)
  if (explicitValue) {
    output.push(
      resolveNamedValue(explicitValue, explicitLocale, explicit, defaultHanLocale),
    )
  }
  for (const [key, nested] of Object.entries(record)) {
    if (key === 'value' || key === 'name' || key === 'language' || key === 'lang')
      continue
    const keyLocale = localeFromKey(key)
    visitNamedValue(
      nested,
      output,
      keyLocale ?? explicitLocale,
      Boolean(keyLocale) || explicit,
      defaultHanLocale,
    )
  }
}

function resolveNamedValue(
  text: string,
  explicitLocale: string | null,
  hasExplicitLocale: boolean,
  defaultHanLocale: 'zh-hant' | 'zh-hans',
): NamedValue {
  const script = scriptOf(text)
  const strongLatin =
    script === 'latin' || (script === 'other' && /[\p{L}\p{N}]/u.test(text))
  let locale = explicitLocale
  let conflict = false
  let reason: string | null = null

  if (script === 'han') {
    if (explicitLocale === 'en') {
      locale = defaultHanLocale
      conflict = hasExplicitLocale
      reason = 'Han text was labelled en.'
    } else if (explicitLocale === 'zh') {
      locale = defaultHanLocale
    } else if (!explicitLocale || explicitLocale === 'und') {
      locale = defaultHanLocale
    }
  } else if (script === 'mixed' && (!explicitLocale || explicitLocale === 'zh')) {
    locale = defaultHanLocale
  } else if (
    strongLatin &&
    (explicitLocale === 'zh' || explicitLocale?.startsWith('zh-'))
  ) {
    locale = 'en'
    conflict = hasExplicitLocale
    reason = 'Strong Latin or alphanumeric text was labelled Chinese.'
  } else if (!locale && strongLatin) {
    locale = 'en'
  }

  locale ??= explicitLocale ?? 'und'
  return {
    locale,
    value: text.trim(),
    inferred:
      !hasExplicitLocale ||
      conflict ||
      (explicitLocale === 'zh' && (script === 'han' || script === 'mixed')),
    evidence: {
      sourceLocale: explicitLocale,
      resolvedLocale: locale,
      script,
      conflict,
      reason,
    },
  }
}

function addressNamedValues(value: unknown) {
  const output: NamedValue[] = []
  const records = Array.isArray(value) ? value : [value]
  for (const item of records) {
    if (typeof item === 'string') {
      output.push(...namedValues(item))
      continue
    }
    const record = asRecord(item)
    if (!record) continue
    const freeform = record.freeform
    const locale = asString(record.language) ?? asString(record.lang)
    if (locale && typeof freeform === 'string') {
      output.push(...namedValues({ value: freeform, language: locale }))
    } else {
      output.push(...namedValues(freeform))
    }
  }
  return output
}

function scriptOf(value: string): PlaceLocaleEvidence['script'] {
  const hasHan = /\p{Script=Han}/u.test(value)
  const hasLatin = /\p{Script=Latin}/u.test(value)
  if (hasHan && hasLatin) return 'mixed'
  if (hasHan) return 'han'
  if (hasLatin) return 'latin'
  return 'other'
}

function joinAlternates(values: NamedValue[]) {
  const alternates = values.slice(1).map(value => value.value)
  return alternates.length > 0 ? alternates.join(' | ') : null
}

function localeFromKey(value: string) {
  const normalised = normaliseLocale(value)
  return /^(?:en|zh|zh(?:-hans|-hant)?|ja|ko|fr|de|es|pt|it|ru|ar)$/.test(normalised)
    ? normalised
    : null
}

function normaliseLocale(value: string) {
  const lower = value.trim().toLowerCase().replaceAll('_', '-')
  if (lower === 'eng' || lower === 'english') return 'en'
  if (lower === 'zho' || lower === 'chi' || lower === 'cmn') return 'zh'
  if (
    lower === 'yue' ||
    lower === 'zh-hk' ||
    lower === 'zh-mo' ||
    lower === 'zh-tw' ||
    lower.startsWith('zh-hant')
  )
    return 'zh-hant'
  if (lower === 'zh-cn' || lower === 'zh-sg' || lower.startsWith('zh-hans'))
    return 'zh-hans'
  if (lower === 'en-us' || lower === 'en-gb' || lower.startsWith('en-')) return 'en'
  if (lower === 'zh') return 'zh'
  return lower || 'und'
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
