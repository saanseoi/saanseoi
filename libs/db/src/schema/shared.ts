import { sql } from 'drizzle-orm'
import { customType, integer, real, text } from 'drizzle-orm/sqlite-core'

export const streetEvidenceAssetRoles = [
  'gazettePlan',
  'gazettePlanPreview',
  'governmentNotice',
  'historicalGovernmentNotice',
  'sourceArchive',
  'sourcePage',
  'sourcePdf',
] as const

export type StreetEvidenceAssetRole = (typeof streetEvidenceAssetRoles)[number]

export const streetLocaleCodes = ['en', 'zh-Hant'] as const

export type StreetLocaleCode = (typeof streetLocaleCodes)[number]

export const streetStatuses = ['active', 'deleted'] as const

export type StreetStatus = (typeof streetStatuses)[number]

export const streetChangelogKinds = [
  'gazette',
  'description_change',
  'corrigendum',
  'notice_of_name_change',
  'name_change',
  'deleted',
] as const

export type StreetChangelogKind = (typeof streetChangelogKinds)[number]

export const streetNameChangeStatuses = ['intended', 'effective', 'withdrawn'] as const

export type StreetNameChangeStatus = (typeof streetNameChangeStatuses)[number]

export const streetNameChangeStreetRoles = ['old', 'new'] as const

export type StreetNameChangeStreetRole = (typeof streetNameChangeStreetRoles)[number]

export function isStreetChangelogKind(value: string): value is StreetChangelogKind {
  return (streetChangelogKinds as readonly string[]).includes(value)
}

/** A preserved source artefact and the original publisher link it represents. */
export type EvidenceAsset<TRole extends string = string> = {
  assetId: string
  assetUrl: string
  byteLength: number
  contentHash: string
  label?: string | null
  manifest: {
    assetId: string
    assetUrl: string
    contentHash: string
    objectKey: string
  }
  mediaType: string
  objectKey: string
  originalUrl: string
  // Publisher-level identifier, when the artefact represents one.
  // - Government Notice PDF: `G.N. 377`
  // - Gazette plan PDF: `YLRM223`
  publisherIdentifier?: string | null
  retrievedAt: string
  role: TRole
  sourcePageLocale?: StreetLocaleCode
  sourcePageUrl?: string
}

export type StreetEvidenceAsset = EvidenceAsset<StreetEvidenceAssetRole>

export const jsonText = <T = unknown>(name: string) =>
  text(name, { mode: 'json' }).$type<T>()

/**
 * A binary value stored in a legacy SQLite TEXT-affinity column. SQLite retains
 * the bound BLOB storage class, allowing pre-release source shards to avoid a
 * table rebuild while keeping compressed payloads binary.
 */
export const binaryText = customType<{
  data: Uint8Array
  driverData: Uint8Array
  driverOutput: ArrayBuffer | Uint8Array
}>({
  dataType() {
    return 'text'
  },
  fromDriver(value) {
    return value instanceof Uint8Array ? value : new Uint8Array(value)
  },
  toDriver(value) {
    return value
  },
})

/** JSON text for ordinary geometries, or a compressed BLOB for large geometry rows. */
export const jsonTextOrBinary = customType<{
  data: unknown
  driverData: unknown
  driverOutput: ArrayBuffer | Uint8Array | string
}>({
  dataType() {
    return 'text'
  },
  fromDriver(value) {
    if (typeof value === 'string') return JSON.parse(value) as unknown
    return value instanceof Uint8Array ? value : new Uint8Array(value)
  },
  toDriver(value) {
    return value instanceof Uint8Array || value instanceof ArrayBuffer
      ? value
      : JSON.stringify(value)
  },
})

export const isoTimestamp = (name: string) => text(name)

export const defaultIsoTimestamp = (name: string) =>
  isoTimestamp(name).default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)

export const toIsoTimestamp = (value: Date | string = new Date()) =>
  (typeof value === 'string' ? new Date(value) : value).toISOString()

export const primaryUuid = (name: string) =>
  text(name)
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

export const timestamps = {
  createdAt: defaultIsoTimestamp('createdAt').notNull(),
  updatedAt: defaultIsoTimestamp('updatedAt')
    .$onUpdate(() => /* @__PURE__ */ toIsoTimestamp())
    .notNull(),
}

export const sourceProvenance = {
  sources: jsonText('sources'),
  rawProperties: jsonText('rawProperties'),
  version: integer('version'),
}

export const geoBbox = {
  geometry: jsonTextOrBinary('geometry'),
  bbox: jsonText('bbox'),
}

export const canonicalDivision = {
  id: text('id').notNull(),
  identifiers: jsonText('identifiers'),
  level: integer('level').notNull(),
  type: text('type').notNull(),
  sourceKeys: jsonText('sourceKeys'),
  wikidata: text('wikidata'),
  hierarchy: jsonText('hierarchy'),
  cartography: jsonText('cartography'),
  sources: jsonText('sources'),
  ...geoBbox,
}

export const canonicalDivisionGeometry = {
  id: text('id').notNull(),
  variant: text('variant').notNull().default('overture'),
  bbox: jsonText('bbox'),
  geometry: jsonTextOrBinary('geometry'),
  sourceKeys: jsonText('sourceKeys'),
  sources: jsonText('sources'),
  type: text('type').notNull(),
  isLand: integer('isLand', { mode: 'boolean' }),
  isTerritorial: integer('isTerritorial', { mode: 'boolean' }),
}

export const canonicalDivisionI18n = {
  divisionId: text('divisionId').notNull(),
  locale: text('locale').notNull(),
  name: text('name'),
  nameVariant: jsonText('nameVariant'),
  nameAlts: text('nameAlts'),
  nameRules: jsonText('nameRules'),
  isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' }).notNull(),
}

/**
 * A district-level observation exposed by the Division Statistics API. The
 * source layer keeps the publisher's complete raw assertion and labels.
 */
export const canonicalDivisionStatistic = {
  id: text('id').notNull(),
  divisionId: text('divisionId').notNull(),
  districtCode: text('districtCode').notNull(),
  referenceYear: text('referenceYear').notNull(),
  landAreaSqKm: real('landAreaSqKm').notNull(),
  midYearPopulation: integer('midYearPopulation').notNull(),
  midYearPopulationDensityPerSqKm: integer('midYearPopulationDensityPerSqKm').notNull(),
  sourceKeys: jsonText('sourceKeys').notNull(),
  sources: jsonText('sources').notNull(),
}

/** Shared feature-level context for a set of statistic observations. */
export const canonicalStatsSeries = {
  id: text('id').notNull(),
  datasetCode: text('datasetCode').notNull(),
  sourceReleaseId: text('sourceReleaseId').notNull(),
  /** `<layerName>:<gml:id>` (or the equivalent stable publisher feature ID). */
  sourceFeatureId: text('sourceFeatureId').notNull(),
  /** Present only after a reviewed bridge to a canonical division exists. */
  divisionId: text('divisionId'),
  referencePeriodCode: text('referencePeriodCode').notNull(),
  referencePeriodStart: text('referencePeriodStart'),
  referencePeriodEnd: text('referencePeriodEnd'),
  referencePeriodGranularity: text('referencePeriodGranularity').notNull(),
  /** The source geography cohort used by this series, where applicable. */
  geographyCohortId: text('geographyCohortId'),
}

/**
 * A canonical statistic observation. Values are stored as publisher-independent
 * decimal text rather than floating point, so the value presented by the API
 * remains exact. `sourceValue` always retains the publisher's literal.
 */
export const canonicalStatsObservation = {
  id: text('id').notNull(),
  seriesId: text('seriesId').notNull(),
  /** Exact publisher property key, such as `t_pop` or `QTR_PH`. */
  sourceField: text('sourceField').notNull(),
  measureCode: text('measureCode').notNull(),
  /** Decimal text, never a floating point approximation. */
  numericValue: text('numericValue'),
  /** Categorical value where no numeric observation exists. */
  valueCode: text('valueCode'),
  unitCode: text('unitCode').notNull(),
  /** Decimal increment, e.g. `100` for a value rounded to the nearest hundred. */
  valuePrecision: text('valuePrecision'),
  observationStatus: text('observationStatus').notNull(),
  sourceValue: text('sourceValue').notNull(),
}

export const canonicalStatsMeasure = {
  datasetCode: text('datasetCode').notNull(),
  measureCode: text('measureCode').notNull(),
  sourceField: text('sourceField').notNull(),
  /** Exact publisher nullability declaration, when its schema supplies one. */
  sourceNullOption: text('sourceNullOption'),
  valueKind: text('valueKind').notNull(),
  unitCode: text('unitCode').notNull(),
}

export const canonicalStatsMeasureI18n = {
  datasetCode: text('datasetCode').notNull(),
  measureCode: text('measureCode').notNull(),
  locale: text('locale').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  /** False only when a machine translation filled a missing publisher locale. */
  isTranslationVerified: integer('isTranslationVerified', { mode: 'boolean' })
    .notNull()
    .default(true),
}

export const canonicalStatsDimension = {
  datasetCode: text('datasetCode').notNull(),
  dimensionCode: text('dimensionCode').notNull(),
}

export const canonicalStatsValue = {
  datasetCode: text('datasetCode').notNull(),
  dimensionCode: text('dimensionCode').notNull(),
  valueCode: text('valueCode').notNull(),
}

export const canonicalStatsValueI18n = {
  datasetCode: text('datasetCode').notNull(),
  dimensionCode: text('dimensionCode').notNull(),
  valueCode: text('valueCode').notNull(),
  locale: text('locale').notNull(),
  name: text('name').notNull(),
}

export const canonicalStatsSeriesDimension = {
  seriesId: text('seriesId').notNull(),
  dimensionCode: text('dimensionCode').notNull(),
  valueCode: text('valueCode').notNull(),
}

export const canonicalAddress2d = {
  id: text('id').notNull(),
  streetId: text('streetId'),
  hamletId: text('hamletId'),
  microhoodId: text('microhoodId'),
  villageId: text('villageId'),
  neighbourhoodId: text('neighbourhoodId'),
  macrohoodId: text('macrohoodId'),
  townId: text('townId'),
  districtId: text('districtId'),
  areaId: text('areaId'),
  countryId: text('countryId'),
  identifiers: jsonText('identifiers'),
  sources: jsonText('sources'),
  ...geoBbox,
}

export const addressBlockTypes = [
  'block',
  'building',
  'tower',
  'house',
  'villa',
  'mansion',
  'apartment',
  'flat',
  'unit',
  'quarters',
  'phase',
  'stage',
  'commercial',
  'retail',
  'parking',
  'garage',
  'other',
] as const

export const addressUnitTypes = [
  'flat',
  'room',
  'shop',
  'suite',
  'unit',
  'stall',
  'kiosk',
  'office',
  'other',
] as const

export const addressFloorTypes = [
  'floor',
  'ground_floor',
  'upper_ground_floor',
  'lower_ground_floor',
  'basement',
  'mezzanine',
  'concourse',
  'podium',
  'roof',
  'other',
] as const

export const canonicalAddress2dI18n = {
  addressId: text('addressId').notNull(),
  locale: text('locale').notNull(),
  formattedAddress: text('formattedAddress').notNull(),
  buildingName: text('buildingName'),
  buildingNumberExpression: text('buildingNumberExpression'),
  buildingNumberFrom: text('buildingNumberFrom'),
  buildingNumberTo: text('buildingNumberTo'),
  buildingNumberConnector: text('buildingNumberConnector'),
  blockExpression: text('blockExpression'),
  blockType: text('blockType', { enum: addressBlockTypes }),
  blockRef: text('blockRef'),
  blockTypeBeforeNumber: integer('blockTypeBeforeNumber', { mode: 'boolean' }),
  phaseExpression: text('phaseExpression'),
  phaseName: text('phaseName'),
  phaseRef: text('phaseRef'),
  estateName: text('estateName'),
  streetName: text('streetName'),
}

export const addressReferenceLookupEvidences = [
  'source_endpoint',
  'source_member',
  'derived_member',
] as const

export const addressReferenceLookupDerivations = [
  'integer_consecutive',
  'integer_alternating',
  'latin_suffix_consecutive',
] as const

export const canonicalAddress2dBuildingNumberLookup = {
  addressId: text('addressId').notNull(),
  buildingNumber: text('buildingNumber').notNull(),
  numericStem: text('numericStem'),
  evidence: text('evidence', { enum: addressReferenceLookupEvidences }).notNull(),
  derivation: text('derivation', {
    enum: addressReferenceLookupDerivations,
  }),
}

export const canonicalAddress3dI18n = {
  address3dId: text('address3dId').notNull(),
  locale: text('locale').notNull(),
  formattedAddressPart: text('formattedAddressPart').notNull(),
  accessHint: text('accessHint'),
  unitPortion: text('unitPortion'),
  unitExpression: text('unitExpression'),
  unitRef: text('unitRef'),
  unitType: text('unitType', { enum: addressUnitTypes }),
  floorExpression: text('floorExpression'),
  floorRef: text('floorRef'),
  floorType: text('floorType', { enum: addressFloorTypes }),
}

export const canonicalAddress3dUnitRefLookup = {
  address3dId: text('address3dId').notNull(),
  unitRef: text('unitRef').notNull(),
  numericStem: text('numericStem'),
  evidence: text('evidence', { enum: addressReferenceLookupEvidences }).notNull(),
  derivation: text('derivation', {
    enum: addressReferenceLookupDerivations,
  }),
}

export const canonicalPlace = {
  id: text('id').notNull(),
  releaseId: text('releaseId').notNull(),
  addressSnapshotId: text('addressSnapshotId'),
  address2dId: text('address2dId'),
  address3dId: text('address3dId'),
  lng: real('lng').notNull(),
  lat: real('lat').notNull(),
  bbox: jsonText('bbox'),
  operatingStatus: text('operatingStatus'),
  basicCategory: text('basicCategory'),
  taxonomyPrimary: text('taxonomyPrimary'),
  taxonomyHierarchy: jsonText('taxonomyHierarchy'),
  taxonomyAlternates: jsonText('taxonomyAlternates'),
  brandWikidata: text('brandWikidata'),
  websites: jsonText('websites'),
  socials: jsonText('socials'),
  emails: jsonText('emails'),
  phones: jsonText('phones'),
  addresses: jsonText('addresses'),
  confidence: real('confidence'),
  sourceKeys: jsonText('sourceKeys'),
  sources: jsonText('sources'),
  firstSeenMonth: text('firstSeenMonth').notNull(),
  lastSeenMonth: text('lastSeenMonth').notNull(),
}

export const canonicalPlaceI18n = {
  placeId: text('placeId').notNull(),
  locale: text('locale').notNull(),
  name: text('name'),
  nameVariant: jsonText('nameVariant'),
  nameAlts: text('nameAlts'),
  isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' }).notNull(),
  brandName: text('brandName'),
  brandNameVariant: jsonText('brandNameVariant'),
  brandNameAlts: text('brandNameAlts'),
}

export const canonicalStreet = {
  id: text('id').notNull(),
  /**
   * Monotonic materialised-state version for one persistent logical street.
   * This is deliberately separate from `versionHash`, which identifies the
   * immutable history row stored by the snapshot machinery.
   */
  version: integer('version').notNull(),
  status: text('status', { enum: streetStatuses }).notNull(),
  deletedAt: text('deletedAt'),
  districtIds: jsonText<string[]>('districtIds'),
  /** Gazette date parsed directly from the authoritative Government Notice PDF. */
  gazetteDate: text('gazetteDate'),
  yearBuilt: jsonText('yearBuilt'),
  /** Government Notice references that establish the current street state. */
  noticeRefs: jsonText<string[]>('noticeRefs'),
  /** Government Notice PDFs and plans that establish the current street state. */
  evidenceAssets: jsonText<StreetEvidenceAsset[]>('evidenceAssets'),
  sourceKeys: jsonText('sourceKeys'),
}

export const canonicalStreetI18n = {
  streetId: text('streetId').notNull(),
  locale: text('locale').notNull(),
  name: text('name').notNull(),
  base: text('base'),
  designator: text('designator'),
  directionalPrefix: text('directionalPrefix'),
  directionalSuffix: text('directionalSuffix'),
  normalised: text('normalised'),
  description: text('description'),
}
