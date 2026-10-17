import type { StatisticFieldSources } from '../statisticFieldSources'
import { compactLocaleJson, parseI18nMeta, type I18nMeta } from '../i18nMeta'
import type { NotNull } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import type { SQLiteColumnBuilder } from 'drizzle-orm/sqlite-core'
import { customType, integer, real, text } from 'drizzle-orm/sqlite-core'
import type { Address3dUnit, Address3dUnitI18n } from '../address3d'
import { addressGranularities } from '../addressGranularity'
import type { DivisionHierarchies } from '../divisionTaxonomy'
import { stringifyGeoJson } from '../geoJsonSerialisation'

export const streetEvidenceAssetRoles = [
  'gazettePlan',
  'gazettePlanPreview',
  'governmentNotice',
  'historicalGovernmentNotice',
  'releaseSourceArchive',
  'resourceSourceArchive',
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
  customType<{ data: T; driverData: string }>({
    dataType: () => 'text',
    fromDriver: value =>
      (name === 'i18n' ? compactLocaleJson(JSON.parse(value)) : JSON.parse(value)) as T,
    toDriver: value =>
      stringifyGeoJson(name === 'i18n' ? compactLocaleJson(value) : value),
  })(name)

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
      : stringifyGeoJson(value)
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

/** Creation time for projected content; mutation timing belongs to publication state. */
export const createdAtTimestamp = {
  createdAt: defaultIsoTimestamp('createdAt').notNull(),
}

export const timestamps = {
  ...createdAtTimestamp,
  updatedAt: defaultIsoTimestamp('updatedAt')
    .$onUpdate(() => /* @__PURE__ */ toIsoTimestamp())
    .notNull(),
}

export const sourceProvenance = {
  sources: jsonText('sources'),
  properties: jsonText('properties'),
  version: integer('version'),
}

export const geoBbox = {
  geometry: jsonTextOrBinary('geometry'),
  bbox: jsonText('bbox'),
}

export function canonicalDivisionColumns<Required extends boolean>(required: Required) {
  return {
    id: text('id').notNull(),
    /** Curated statistical key, scoped by the selected Divisions domain. */
    divisionCode: text('divisionCode'),
    identifiers: jsonText('identifiers'),
    /** Canonical hierarchy level; absent for non-hierarchical geographies. */
    level: integer('level'),
    category: text('category', {
      enum: ['administrative', 'locality', 'hood', 'landform'],
    }),
    class: requiredColumn(text('class'), required),
    hierarchies: requiredColumn(
      text('hierarchies', { mode: 'json' }).$type<DivisionHierarchies>(),
      required,
    ),
    cartography: jsonText('cartography'),
    sources: jsonText('sources'),
    geometry: jsonTextOrBinary('geometry'),
  }
}

export const canonicalDivision = canonicalDivisionColumns(true)

export function canonicalDivisionGeometryColumns<Required extends boolean>(
  required: Required,
) {
  return {
    id: text('id').notNull(),
    variant: requiredColumn(text('variant').default('overture'), required),
    bbox: jsonText('bbox'),
    geometry: jsonTextOrBinary('geometry'),
    sources: jsonText('sources'),
    type: requiredColumn(text('type'), required),
    isLand: integer('isLand', { mode: 'boolean' }),
    isTerritorial: integer('isTerritorial', { mode: 'boolean' }),
  }
}

export const canonicalDivisionGeometry = canonicalDivisionGeometryColumns(true)

export function canonicalDivisionI18nColumns<Required extends boolean>(
  required: Required,
) {
  return {
    divisionId: text('divisionId').notNull(),
    locale: text('locale').notNull(),
    name: text('name'),
    nameVariant: jsonText('nameVariant'),
    nameAlts: text('nameAlts'),
    nameRules: jsonText('nameRules'),
    meta: i18nMetaColumn(required),
  }
}

export const canonicalDivisionI18n = canonicalDivisionI18nColumns(true)

export type CanonicalStatsGeography = {
  /** Disambiguates publisher geography codes that are only unique within a parent. */
  namespace?: string
  /**
   * Curated geometry companion for `include=areas` and `include=divisions`.
   *
   * The cohort is deliberately explicit: a statistics record must never
   * silently acquire a newer (or unrelated) geometry merely because it is the
   * latest Geographic release.
   */
  areaCompanion?: {
    cohortKey: string
    /** Divisions domain whose canonical identities own this companion. */
    domainCode: string
    variant: string
  }
  kind: string
  code: string
  class?: string
}

export type CanonicalStatsFieldSource = StatisticFieldSources[number]

/** Canonical structured period fields shared by source and API statistic rows. */
export function statisticsReferencePeriodColumns<Required extends boolean>(
  required: Required,
) {
  return {
    referencePeriodCode: requiredColumn(text('referencePeriodCode'), required),
    referencePeriodStart: text('referencePeriodStart'),
    referencePeriodEnd: text('referencePeriodEnd'),
    referencePeriodGranularity: requiredColumn(
      text('referencePeriodGranularity'),
      required,
    ),
    referencePeriodEndYear: requiredColumn(text('referencePeriodEndYear'), required),
  }
}

export const statisticsReferencePeriod = statisticsReferencePeriodColumns(true)

/** One dataset, exact period and semantic geography, shared by current and history. */
export function canonicalStatsRecordColumns<Required extends boolean>(
  required: Required,
) {
  return {
    id: text('id').notNull(),
    datasetCode: requiredColumn(text('datasetCode'), required),
    sourceReleaseId: requiredColumn(text('sourceReleaseId'), required),
    /** Stable constructed reference to the retained raw publisher feature. */
    sourceFeatureRef: requiredColumn(text('sourceFeatureRef'), required),
    /** Present only after a reviewed bridge to a canonical division exists. */
    divisionId: text('divisionId'),
    ...statisticsReferencePeriodColumns(required),
    /** Reviewed geography identity and its explicitly selected geometry companion. */
    geography: requiredColumn(jsonText<CanonicalStatsGeography>('geography'), required),
    /** Provenance of the last real change to each retained field. */
    fieldSources: requiredColumn(
      jsonText<StatisticFieldSources>('fieldSources').default([]),
      required,
    ),
    /** Immutable shared field-definition selection. */
    definitionSetId: requiredColumn(text('definitionSetId'), required),
    /** Publisher literals keyed by the stable reviewed field name. */
    values: requiredColumn(jsonText<Record<string, string>>('values'), required),
  }
}

export const canonicalStatsRecord = canonicalStatsRecordColumns(true)

/**
 * The semantic interpretation of a statistic. This remains independent from
 * whether its source value is numeric and from the unit used to express it.
 */
export const statsStatisticKinds = [
  'count',
  'quantity',
  'proportion',
  'ratio',
  'rate',
  'density',
  'index',
  'unreviewed',
] as const

export type StatsStatisticKind = (typeof statsStatisticKinds)[number]

export const statsAggregations = [
  'none',
  'total',
  'mean',
  'median',
  'minimum',
  'maximum',
  'percentile',
  'unreviewed',
] as const

export type StatsAggregation = (typeof statsAggregations)[number]

/**
 * The named interval over which a statistical quantity is expressed. This is
 * distinct from both its reference period and its statistical aggregation.
 */
export const statsPeriodicities = ['day', 'week', 'month', 'quarter', 'year'] as const

export type StatsPeriodicity = (typeof statsPeriodicities)[number]

export const statsFieldComparabilityReasons = [
  'economic-activity-status-classification-changed',
] as const

export type StatsFieldComparabilityReason =
  (typeof statsFieldComparabilityReasons)[number]

export const statsFieldComparabilityStatuses = ['caution'] as const

export type StatsFieldComparabilityStatus =
  (typeof statsFieldComparabilityStatuses)[number]

/** A source-declared caveat about comparisons between reference periods. */
export type StatsFieldComparability = {
  affectedReferencePeriods: string[]
  reason: StatsFieldComparabilityReason
  status: StatsFieldComparabilityStatus
}

/** A reusable, dimension-free statistical concept within one dataset. */
export function canonicalStatsMeasureColumns<Required extends boolean>(
  _required: Required,
) {
  return {
    datasetCode: text('datasetCode').notNull(),
    measureCode: text('measureCode').notNull(),
  }
}

export const canonicalStatsMeasure = canonicalStatsMeasureColumns(true)

export function canonicalStatsFieldColumns<Required extends boolean>(
  required: Required,
) {
  return {
    ...canonicalStatsMeasure,
    measureCode: requiredColumn(text('measureCode'), required),
    /** Immutable measure metadata paired with this field definition. */
    measureVersionHash: requiredColumn(
      text('measureVersionHash').default(''),
      required,
    ),
    fieldName: text('fieldName').notNull(),
    sourceField: requiredColumn(text('sourceField'), required),
    /** Curated analytical dimensions associated with this source field. */
    dimensions: requiredColumn(
      jsonText<Record<string, string>>('dimensions'),
      required,
    ),
    /** Source-declared caveat about comparisons between reference periods. */
    comparability: jsonText<StatsFieldComparability>('comparability'),
    /** Exact publisher nullability declaration, when its schema supplies one. */
    sourceNullOption: text('sourceNullOption'),
    /** Reviewed semantic form; distinct from numeric/categorical representation and unit. */
    statisticKind: requiredColumn(
      text('statisticKind', {
        enum: statsStatisticKinds,
      }).default('unreviewed'),
      required,
    ),
    /** Statistical aggregation applied before the publisher supplied this value. */
    aggregation: requiredColumn(
      text('aggregation', { enum: statsAggregations }).default('unreviewed'),
      required,
    ),
    /** Percentile rank (0-100) for percentile and median aggregations. */
    aggregationPercentile: real('aggregationPercentile'),
    /** Named interval over which the reported quantity is expressed, when applicable. */
    periodicity: text('periodicity', { enum: statsPeriodicities }),
    /** Canonical field used as the denominator, when the statistic has one. */
    denominatorFieldName: text('denominatorFieldName'),
    valueKind: requiredColumn(text('valueKind'), required),
    unitCode: requiredColumn(text('unitCode'), required),
  }
}

export const canonicalStatsField = canonicalStatsFieldColumns(true)

export function canonicalStatsMeasureI18nColumns<Required extends boolean>(
  required: Required,
) {
  return {
    ...canonicalStatsMeasure,
    locale: text('locale').notNull(),
    name: requiredColumn(text('name'), required),
    description: text('description'),
    meta: i18nMetaColumn(required),
  }
}

export const canonicalStatsMeasureI18n = canonicalStatsMeasureI18nColumns(true)

export function canonicalStatsFieldI18nColumns<Required extends boolean>(
  required: Required,
) {
  return {
    datasetCode: text('datasetCode').notNull(),
    fieldName: text('fieldName').notNull(),
    locale: text('locale').notNull(),
    name: requiredColumn(text('name'), required),
    description: text('description'),
    meta: i18nMetaColumn(required),
  }
}

export const canonicalStatsFieldI18n = canonicalStatsFieldI18nColumns(true)

export function canonicalStatsValueI18nColumns<Required extends boolean>(
  required: Required,
) {
  return {
    datasetCode: text('datasetCode').notNull(),
    dimensionCode: text('dimensionCode').notNull(),
    valueCode: text('valueCode').notNull(),
    locale: text('locale').notNull(),
    meta: i18nMetaColumn(required),
    name: requiredColumn(text('name'), required),
  }
}

export const canonicalStatsValueI18n = canonicalStatsValueI18nColumns(true)

export function canonicalAddress2dColumns<Required extends boolean>(
  required: Required,
) {
  return {
    id: text('id').notNull(),
    parentAddressId: text('parentAddressId'),
    granularity: requiredColumn(
      text('granularity', { enum: addressGranularities }).default('unknown'),
      required,
    ),
    streetId: text('streetId'),
    hamletId: text('hamletId'),
    microhoodId: text('microhoodId'),
    villageId: text('villageId'),
    neighbourhoodId: text('neighbourhoodId'),
    ruralAreaId: text('ruralAreaId'),
    macrohoodId: text('macrohoodId'),
    townId: text('townId'),
    landformId: text('landformId'),
    districtId: text('districtId'),
    areaId: text('areaId'),
    countryId: text('countryId'),
    /** External identifiers only; supplementary identity-generation keys belong to evidence. */
    identifiers: jsonText('identifiers'),
    sources: jsonText('sources'),
    geometry: jsonTextOrBinary('geometry'),
  }
}

export const canonicalAddress2d = canonicalAddress2dColumns(true)

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

export type AddressBlockType = (typeof addressBlockTypes)[number]

export function canonicalAddress2dI18nColumns<Required extends boolean>(
  required: Required,
) {
  return {
    addressId: text('addressId').notNull(),
    locale: text('locale').notNull(),
    meta: i18nMetaColumn(required),
    formattedAddress: requiredColumn(text('formattedAddress'), required),
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
}

export const canonicalAddress2dI18n = canonicalAddress2dI18nColumns(true)

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

export function canonicalAddress2dBuildingNumberLookupColumns<Required extends boolean>(
  required: Required,
) {
  return {
    addressId: text('addressId').notNull(),
    buildingNumber: text('buildingNumber').notNull(),
    numericStem: text('numericStem'),
    evidence: requiredColumn(
      text('evidence', { enum: addressReferenceLookupEvidences }),
      required,
    ),
    derivation: text('derivation', {
      enum: addressReferenceLookupDerivations,
    }),
  }
}

export const canonicalAddress2dBuildingNumberLookup =
  canonicalAddress2dBuildingNumberLookupColumns(true)

export function canonicalAddress3dI18nColumns<Required extends boolean>(
  required: Required,
) {
  return {
    address3dId: text('address3dId').notNull(),
    locale: text('locale').notNull(),
    meta: i18nMetaColumn(required),
    units: requiredColumn(
      jsonText<Record<string, Address3dUnitI18n>>('units'),
      required,
    ),
  }
}

export const canonicalAddress3dI18n = canonicalAddress3dI18nColumns(true)

export function canonicalAddress3dColumns<Required extends boolean>(
  required: Required,
) {
  return {
    id: text('id').notNull(),
    address2dId: requiredColumn(text('address2dId'), required),
    units: requiredColumn(jsonText<Address3dUnit[]>('units'), required),
    unitCount: requiredColumn(integer('unitCount'), required),
    contentHash: requiredColumn(text('contentHash'), required),
    /** Explicitly reviewed children whose unit membership remains unresolved. */
    unresolvedSectionIds: requiredColumn(
      jsonText<string[]>('unresolvedSectionIds'),
      required,
    ),
    sources: jsonText('sources'),
  }
}

export const canonicalAddress3d = canonicalAddress3dColumns(true)

export const placeDivisionFieldNames = [
  'countryId',
  'areaId',
  'districtId',
  'townId',
  'ruralAreaId',
  'macrohoodId',
  'neighbourhoodId',
  'villageId',
  'microhoodId',
  'hamletId',
  'landformId',
] as const

export type PlaceDivisionField = (typeof placeDivisionFieldNames)[number]
export type PlaceDivisionDefinitionSet = Record<
  string,
  {
    divisionSnapshotId: string
    level: number | null
    locales: { locale: string; name: string | null }[]
  }
>

export function placeDivisionColumns() {
  return {
    countryId: text('countryId'),
    areaId: text('areaId'),
    districtId: text('districtId'),
    townId: text('townId'),
    ruralAreaId: text('ruralAreaId'),
    macrohoodId: text('macrohoodId'),
    neighbourhoodId: text('neighbourhoodId'),
    villageId: text('villageId'),
    microhoodId: text('microhoodId'),
    hamletId: text('hamletId'),
    landformId: text('landformId'),
  }
}

export function canonicalPlaceColumns<Required extends boolean>(required: Required) {
  return {
    id: text('id').notNull(),
    resourceReleaseId: requiredColumn(text('resourceReleaseId'), required),
    /** Content identity of the referenced Address, selected unit and their localisations. */
    addressDependencyHash: text('addressDependencyHash'),
    addressSnapshotId: text('addressSnapshotId'),
    address2dId: text('address2dId'),
    address3dId: text('address3dId'),
    address3dUnitId: text('address3dUnitId'),
    address3dMembership: text('address3dMembership', {
      enum: ['established', 'unresolved'],
    }),
    ...placeDivisionColumns(),
    divisionDefinitionSetId: text('divisionDefinitionSetId'),
    geometry: requiredColumn(
      jsonText<{ type: 'Point'; coordinates: [number, number] }>('geometry'),
      required,
    ),
    bbox: jsonText<[number, number, number, number]>('bbox'),
    operatingStatus: text('operatingStatus'),
    basicCategory: text('basicCategory'),
    taxonomyPrimary: text('taxonomyPrimary'),
    taxonomyHierarchy: jsonText('taxonomyHierarchy'),
    taxonomyAlternates: jsonText('taxonomyAlternates'),
    identifiers: jsonText<{ wikidata: { brandId: string } }>('identifiers'),
    websites: jsonText('websites'),
    socials: jsonText('socials'),
    emails: jsonText('emails'),
    phones: jsonText('phones'),
    addresses: jsonText('addresses'),
    confidence: real('confidence'),
    sources: jsonText('sources'),
    firstSeenMonth: requiredColumn(text('firstSeenMonth'), required),
  }
}

export const canonicalPlace = canonicalPlaceColumns(true)

export function canonicalPlaceI18nColumns<Required extends boolean>(
  required: Required,
) {
  return {
    /** Exact dependency text and revision evidence resolved during local preparation. */
    searchDependencyText: jsonText<{
      addressSnapshotId: string | null
      addressText: string
      divisionText: string
      streetText: string
    }>('searchDependencyText'),
    placeId: text('placeId').notNull(),
    locale: text('locale').notNull(),
    name: text('name'),
    nameVariant: jsonText('nameVariant'),
    nameAlts: text('nameAlts'),
    brandName: text('brandName'),
    brandNameVariant: jsonText('brandNameVariant'),
    brandNameAlts: text('brandNameAlts'),
    freeformAddress: text('freeformAddress'),
    accessHint: text('accessHint'),
    meta: i18nMetaColumn(required),
  }
}

export const canonicalPlaceI18n = canonicalPlaceI18nColumns(true)

export function canonicalStreetColumns<Required extends boolean>(required: Required) {
  return {
    id: text('id').notNull(),
    /**
     * Monotonic materialised-state version for one persistent logical street.
     * This is deliberately separate from `versionHash`, which identifies the
     * immutable history row stored by the snapshot machinery.
     */
    version: requiredColumn(integer('version'), required),
    status: requiredColumn(text('status', { enum: streetStatuses }), required),
    deletedAt: text('deletedAt'),
    districtIds: jsonText<string[]>('districtIds'),
    /** Gazette date parsed directly from the authoritative Government Notice PDF. */
    gazetteDate: text('gazetteDate'),
    yearBuilt: jsonText('yearBuilt'),
    /** Government Notice references that establish the current street state. */
    noticeRefs: jsonText<string[]>('noticeRefs'),
    /** Government Notice PDFs and plans that establish the current street state. */
    evidenceAssets: jsonText<StreetEvidenceAsset[]>('evidenceAssets'),
    /** Source-record references that establish the current street state. */
    sources: jsonText('sources'),
  }
}

export const canonicalStreet = canonicalStreetColumns(true)

export function canonicalStreetI18nColumns<Required extends boolean>(
  required: Required,
) {
  return {
    streetId: text('streetId').notNull(),
    locale: text('locale').notNull(),
    meta: i18nMetaColumn(required),
    name: requiredColumn(text('name'), required),
    base: text('base'),
    designator: text('designator'),
    directionalPrefix: text('directionalPrefix'),
    directionalSuffix: text('directionalSuffix'),
    normalised: text('normalised'),
    description: text('description'),
  }
}

export const canonicalStreetI18n = canonicalStreetI18nColumns(true)

/** Payload fields are nullable in HISTORY so deletion events carry only identity. */
function requiredColumn<T extends SQLiteColumnBuilder, Required extends boolean>(
  column: T,
  required: Required,
): Required extends true ? NotNull<T> : T {
  return (required ? column.notNull() : column) as Required extends true
    ? NotNull<T>
    : T
}

/** NULL metadata means a supplied locale with unknown field provenance. */
function i18nMetaColumn<Required extends boolean>(_required: Required) {
  return customType<{ data: I18nMeta; driverData: string | null }>({
    dataType: () => 'text',
    fromDriver: value => parseI18nMeta(value === null ? null : JSON.parse(value)),
    toDriver: value => {
      const meta = parseI18nMeta(value)
      return meta === null ? null : JSON.stringify(meta)
    },
  })('meta')
}
