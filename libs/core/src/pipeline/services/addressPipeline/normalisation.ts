import type { AddressI18nPayload, AddressRow } from '@repo/db/currentSchema'

import { asNonEmptyString, asString, createHash } from '../../utils'
import type { NormalisedAddressRecord } from './types'

export function normaliseAddressRowForPipeline(row: Record<string, unknown>) {
  return normalisePreparedHkgovAddressRow(row)
}

/**
 * Returns the publisher source record fields used to version an ALS source row.
 *
 * Prepared ALS rows include release and ingestion bookkeeping alongside the
 * publisher data. Those values naturally change on every upload and must not
 * create a new source record when the address itself is unchanged.
 */
export function buildHkgovAlsSourceHashInput(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !HKGOV_ALS_SOURCE_HASH_OMITTED_KEYS.has(key)),
  )
}

/**
 * Compares a prepared row with a current source record.
 *
 * Existing rows may retain the earlier whole-row hash. Rehashing their stored
 * raw properties with the source record-only input lets the new comparison take
 * effect without first rewriting every source-row primary key.
 */
export async function isUnchangedHkgovAlsSourcePayload(
  current:
    | {
        rawProperties?: Record<string, unknown> | null
        sourcePayloadHash: string | null
      }
    | null
    | undefined,
  sourcePayloadHash: string,
) {
  if (!current) return false

  if (current.rawProperties) {
    return (
      (await createHash(buildHkgovAlsSourceHashInput(current.rawProperties))) ===
      sourcePayloadHash
    )
  }

  return current.sourcePayloadHash === sourcePayloadHash
}

const HKGOV_ALS_SOURCE_HASH_OMITTED_KEYS = new Set([
  'areaId',
  'canonicalId',
  'cohortKey',
  'country',
  'countryId',
  'divisionSnapshotId',
  'districtId',
  'id',
  'identityAlias',
  'identityBuildingId',
  'identityContinuityKey',
  'identityKey',
  'identityMatchMethod',
  'identityNumberFrom',
  'identityNumberTo',
  'identityRouteNames',
  'identitySummary',
  'region',
  'sourceFeatureIndexOneBased',
  'sourceFile',
  'sources',
  'sourceVersion',
  'theme',
  'type',
])

export function dedupeNormalisedAddressRows(rows: NormalisedAddressRecord[]) {
  return [
    ...new Map(
      rows.map(row => [
        row.sourceId,
        {
          ...row,
          i18n: dedupeAddressI18nRows(row.i18n, row.sourceId),
        },
      ]),
    ).values(),
  ]
}

export function dedupeAddressI18nRows<T extends { addressId: string; locale: string }>(
  rows: T[],
  fallbackAddressId?: string,
) {
  return [
    ...new Map(
      rows.map(row => [
        `${row.addressId || fallbackAddressId || ''}\0${row.locale}`,
        row,
      ]),
    ).values(),
  ]
}

function normalisePreparedHkgovAddressRow(row: Record<string, unknown>) {
  const sourceId = requireText(row.id, 'Prepared HKGov ALS row is missing `id`.')
  const canonicalId = requireText(
    row.canonicalId ?? row.id,
    'Prepared HKGov ALS row is missing `canonicalId`.',
  )
  const districtId = asNonEmptyString(row.districtId)
  const otStreet =
    asNonEmptyString(row.enStreetName) ?? asNonEmptyString(row.zhHantStreetName)
  const enBuildingNumber = getBuildingNumberComponents(row, 'en')
  const zhHantBuildingNumber = getBuildingNumberComponents(row, 'zh-hant')
  const coverageComponents = new Set<string>()
  const i18n: AddressI18nPayload[] = []
  const enPhase = getPreparedPhaseFields(row, 'en')
  const zhHantPhase = getPreparedPhaseFields(row, 'zh-hant')

  if (asNonEmptyString(row.enFormattedAddress)) {
    i18n.push({
      addressId: sourceId,
      locale: 'en',
      formattedAddress: requireText(
        row.enFormattedAddress,
        'Missing en formatted address.',
      ),
      buildingName: asNonEmptyString(row.enBuildingName),
      buildingNumberExpression: enBuildingNumber.expression,
      buildingNumberFrom: enBuildingNumber.from,
      buildingNumberTo: enBuildingNumber.to,
      buildingNumberConnector: null,
      ...normaliseBlockFields(row.enBlockDescriptor, row.enBlockNumber, 'en'),
      ...normalisePhaseFields(enPhase.name, enPhase.ref),
      estateName: asNonEmptyString(row.enEstateName),
      streetName: asNonEmptyString(row.enStreetName),
    })
  }

  if (asNonEmptyString(row.zhHantFormattedAddress)) {
    i18n.push({
      addressId: sourceId,
      locale: 'zh-hant',
      formattedAddress: requireText(
        row.zhHantFormattedAddress,
        'Missing zh-hant formatted address.',
      ),
      buildingName: asNonEmptyString(row.zhHantBuildingName),
      buildingNumberExpression: zhHantBuildingNumber.expression,
      buildingNumberFrom: zhHantBuildingNumber.from,
      buildingNumberTo: zhHantBuildingNumber.to,
      buildingNumberConnector: null,
      ...normaliseBlockFields(
        row.zhHantBlockDescriptor,
        row.zhHantBlockNumber,
        'zh-hant',
      ),
      ...normalisePhaseFields(zhHantPhase.name, zhHantPhase.ref),
      estateName: asNonEmptyString(row.zhHantEstateName),
      streetName: asNonEmptyString(row.zhHantStreetName),
    })
  }

  for (const localised of i18n) {
    if (localised.streetName) coverageComponents.add('street_name')
    if (localised.buildingNumberFrom || localised.buildingNumberTo)
      coverageComponents.add('building_number')
    if (localised.buildingName) coverageComponents.add('building_name')
    if (localised.estateName) coverageComponents.add('estate_name')
    if (localised.phaseName || localised.phaseRef) coverageComponents.add('phase')
    if (localised.blockType || localised.blockRef) coverageComponents.add('block')
  }
  if (asNonEmptyString(row.enVillageName) || asNonEmptyString(row.zhHantVillageName)) {
    coverageComponents.add('village_name')
  }

  return {
    canonicalId,
    sourceId,
    matchKey: buildMatchKey({
      districtId,
      buildingNumberFrom: enBuildingNumber.from,
      buildingNumberTo: enBuildingNumber.to,
      streetName: otStreet,
    }),
    base: {
      divisionSnapshotId: requireText(
        row.divisionSnapshotId,
        'Prepared HKGov ALS row is missing `divisionSnapshotId`.',
      ),
      streetSnapshotId: null,
      streetId: null,
      hamletId: null,
      microhoodId: null,
      villageId: null,
      neighbourhoodId: null,
      macrohoodId: null,
      townId: null,
      districtId,
      areaId: asNonEmptyString(row.areaId),
      countryId: asNonEmptyString(row.countryId),
      geometry: parseOptionalJson(row.geometry),
      identifiers: parseOptionalJson(row.identifiers),
      bbox: null,
      sources: parseOptionalJson(row.sources),
    } satisfies Omit<AddressRow, 'id' | 'snapshotId' | 'createdAt' | 'updatedAt'>,
    coverageComponents: [...coverageComponents],
    i18n,
    source: {},
  }
}

export function buildAddressBaseHashInput(
  base: Omit<
    AddressRow,
    'createdAt' | 'updatedAt' | 'snapshotId' | 'divisionSnapshotId' | 'streetSnapshotId'
  >,
) {
  return {
    id: base.id,
    streetId: base.streetId,
    hamletId: base.hamletId,
    microhoodId: base.microhoodId,
    villageId: base.villageId,
    neighbourhoodId: base.neighbourhoodId,
    macrohoodId: base.macrohoodId,
    townId: base.townId,
    districtId: base.districtId,
    areaId: base.areaId,
    countryId: base.countryId,
    geometry: base.geometry,
    identifiers: base.identifiers,
    bbox: base.bbox,
    sources: excludeReleaseProvenance(base.sources),
  } satisfies Omit<
    AddressRow,
    'createdAt' | 'updatedAt' | 'snapshotId' | 'divisionSnapshotId' | 'streetSnapshotId'
  >
}

const RELEASE_PROVENANCE_KEYS = new Set([
  'cohortKey',
  'publicationDate',
  'releaseCode',
  'releaseDate',
  'releaseId',
  'sourceFile',
  'sourceVersion',
])

function excludeReleaseProvenance(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(excludeReleaseProvenance)
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !RELEASE_PROVENANCE_KEYS.has(key))
      .map(([key, child]) => [key, excludeReleaseProvenance(child)]),
  )
}

export function normaliseAddressI18nSnapshotRow(row: AddressI18nPayload) {
  return row
}

export function buildAddressI18nHashInput(
  row: AddressI18nPayload & {
    snapshotId?: string
  },
) {
  return {
    addressId: row.addressId,
    locale: row.locale,
    formattedAddress: row.formattedAddress,
    buildingName: row.buildingName,
    buildingNumberExpression: row.buildingNumberExpression,
    buildingNumberFrom: row.buildingNumberFrom,
    buildingNumberTo: row.buildingNumberTo,
    buildingNumberConnector: row.buildingNumberConnector,
    blockExpression: row.blockExpression,
    blockType: row.blockType,
    blockRef: row.blockRef,
    blockTypeBeforeNumber: row.blockTypeBeforeNumber,
    phaseExpression: row.phaseExpression,
    phaseName: row.phaseName,
    phaseRef: row.phaseRef,
    estateName: row.estateName,
    streetName: row.streetName,
  } satisfies AddressI18nPayload
}

export type AddressBuildingNumberLookupRow = {
  addressId: string
  buildingNumber: string
  derivation:
    | 'integer_alternating'
    | 'integer_consecutive'
    | 'latin_suffix_consecutive'
    | null
  evidence: 'derived_member' | 'source_endpoint' | 'source_member'
  numericStem: string | null
}

/**
 * Produces exact lookup aliases from structured address components. A bare
 * numeric stem is deliberately not an alias for a suffixed range (for example
 * `5` is not a building inside `5A-5C`); callers use `numericStem` only when
 * they explicitly offer partial matching.
 */
export function buildAddressBuildingNumberLookupRows(
  rows: Array<
    Pick<AddressI18nPayload, 'addressId'> & {
      buildingNumberConnector?: string | null
      buildingNumberFrom?: string | null
      buildingNumberTo?: string | null
    }
  >,
): AddressBuildingNumberLookupRow[] {
  const lookups = new Map<string, AddressBuildingNumberLookupRow>()

  const add = (
    addressId: string,
    value: string | null,
    evidence: AddressBuildingNumberLookupRow['evidence'],
    derivation: AddressBuildingNumberLookupRow['derivation'] = null,
  ) => {
    const buildingNumber = normaliseBuildingNumber(value)
    if (!buildingNumber) return

    const lookup: AddressBuildingNumberLookupRow = {
      addressId,
      buildingNumber,
      numericStem: getBuildingNumberNumericStem(buildingNumber),
      evidence,
      derivation,
    }
    const key = `${addressId}\0${buildingNumber}`
    const current = lookups.get(key)
    // Source evidence wins over derived evidence when locales overlap.
    if (!current || current.evidence === 'derived_member') lookups.set(key, lookup)
  }

  for (const row of rows) {
    add(row.addressId, row.buildingNumberFrom ?? null, 'source_endpoint')
    add(row.addressId, row.buildingNumberTo ?? null, 'source_endpoint')

    if (row.buildingNumberConnector !== '-') continue
    const from = normaliseBuildingNumber(row.buildingNumberFrom ?? null)
    const to = normaliseBuildingNumber(row.buildingNumberTo ?? null)
    if (!from || !to) continue

    const integerRange = getIntegerRangeMembers(from, to)
    if (integerRange) {
      for (const member of integerRange.members) {
        if (member !== from && member !== to) {
          add(row.addressId, member, 'derived_member', integerRange.derivation)
        }
      }
      continue
    }

    const suffixRange = getLatinSuffixRangeMembers(from, to)
    if (suffixRange) {
      for (const member of suffixRange) {
        if (member !== from && member !== to) {
          add(row.addressId, member, 'derived_member', 'latin_suffix_consecutive')
        }
      }
    }
  }

  return [...lookups.values()]
}

function normaliseBuildingNumber(value: string | null) {
  return value?.trim().toUpperCase().replace(/\s+/g, ' ') || null
}

function getBuildingNumberNumericStem(value: string) {
  return /^(\d+)/.exec(value)?.[1] ?? null
}

function getIntegerRangeMembers(
  from: string,
  to: string,
): {
  derivation: 'integer_alternating' | 'integer_consecutive'
  members: string[]
} | null {
  if (!/^\d+$/.test(from) || !/^\d+$/.test(to)) return null
  const fromNumber = Number(from)
  const toNumber = Number(to)
  if (
    !Number.isSafeInteger(fromNumber) ||
    !Number.isSafeInteger(toNumber) ||
    fromNumber > toNumber
  ) {
    return null
  }

  const step = fromNumber % 2 === toNumber % 2 ? 2 : 1
  return {
    derivation:
      step === 1 ? ('integer_consecutive' as const) : ('integer_alternating' as const),
    members: Array.from(
      { length: Math.floor((toNumber - fromNumber) / step) + 1 },
      (_, index) => String(fromNumber + index * step),
    ),
  }
}

function getLatinSuffixRangeMembers(from: string, to: string) {
  const fromMatch = /^(\d+)([A-Z])$/.exec(from)
  const toMatch = /^(\d+)([A-Z])$/.exec(to)
  if (!fromMatch || !toMatch || fromMatch[1] !== toMatch[1]) return null

  const fromSuffix = fromMatch[2]
  const toSuffix = toMatch[2]
  const numericStem = fromMatch[1]
  if (!fromSuffix || !toSuffix || !numericStem) return null
  const start = fromSuffix.charCodeAt(0)
  const end = toSuffix.charCodeAt(0)
  if (start > end) return null

  return Array.from(
    { length: end - start + 1 },
    (_, index) => `${numericStem}${String.fromCharCode(start + index)}`,
  )
}

export function buildMatchKey(input: {
  buildingNumberFrom: string | null
  buildingNumberTo: string | null
  districtId: string | null
  streetName: string | null
}) {
  const districtId = asNonEmptyString(input.districtId)
  const street = normaliseNameToken(input.streetName)
  const from = normaliseNameToken(input.buildingNumberFrom)
  const to = normaliseNameToken(input.buildingNumberTo)

  if (!districtId || !street || !from) {
    return null
  }

  return `${districtId}::${street}::${from}\0${to ?? ''}`
}

function normaliseNameToken(value: unknown) {
  const normalised = asNonEmptyString(value)?.trim().toUpperCase().replace(/\s+/g, ' ')
  return normalised ?? null
}

function getBuildingNumberComponents(
  row: Record<string, unknown>,
  locale: 'en' | 'zh-hant',
) {
  const isEnglish = locale === 'en'
  const streetName = asNonEmptyString(
    row[isEnglish ? 'enStreetName' : 'zhHantStreetName'],
  )
  const from = asNonEmptyString(
    row[
      isEnglish
        ? streetName
          ? 'enStreetNumberFrom'
          : 'enVillageNumberFrom'
        : streetName
          ? 'zhHantStreetNumberFrom'
          : 'zhHantVillageNumberFrom'
    ],
  )
  const to = asNonEmptyString(
    row[
      isEnglish
        ? streetName
          ? 'enStreetNumberTo'
          : 'enVillageNumberTo'
        : streetName
          ? 'zhHantStreetNumberTo'
          : 'zhHantVillageNumberTo'
    ],
  )

  return {
    expression: from && (!to || to === from) ? from : null,
    from,
    to,
  }
}

function normaliseBlockFields(
  descriptor: unknown,
  ref: unknown,
  locale: 'en' | 'zh-hant',
) {
  const descriptorValue = asNonEmptyString(descriptor)
  const refValue = asNonEmptyString(ref)
  const normalised = normaliseBlockDescriptor(descriptorValue)
  const expressionDescriptor =
    locale === 'en' ? (normalised.expression ?? descriptorValue) : descriptorValue
  const blockExpression =
    locale === 'en'
      ? [expressionDescriptor, refValue].filter(Boolean).join(' ') || null
      : [refValue, expressionDescriptor].filter(Boolean).join('') || null

  return {
    blockExpression,
    blockType: normalised.type,
    blockRef: refValue,
    blockTypeBeforeNumber: descriptorValue && refValue ? locale === 'en' : null,
  }
}

function getPreparedPhaseFields(
  row: Record<string, unknown>,
  locale: 'en' | 'zh-hant',
) {
  const isEnglish = locale === 'en'
  const nameKey = isEnglish ? 'enPhaseName' : 'zhHantPhaseName'
  const refKey = isEnglish ? 'enPhaseRef' : 'zhHantPhaseRef'
  const rawKey = isEnglish ? 'engPremisesAddressJson' : 'chiPremisesAddressJson'
  const estateKey = isEnglish ? 'EngEstate' : 'ChiEstate'
  const phaseKey = isEnglish ? 'EngPhase' : 'ChiPhase'
  const raw = asRecord(parseOptionalJson(row[rawKey]))
  const estate = asRecord(raw?.[estateKey])
  const phase = asRecord(estate?.[phaseKey])

  return {
    name: asNonEmptyString(row[nameKey]) ?? asString(phase?.PhaseName),
    ref: asNonEmptyString(row[refKey]) ?? asString(phase?.PhaseNo),
  }
}

function normalisePhaseFields(name: unknown, ref: unknown) {
  const nameValue = asNonEmptyString(name)
  const refValue = asNonEmptyString(ref)
  const split = nameValue ? splitPhaseNameReference(nameValue, refValue) : null
  const phaseName = split?.name ?? nameValue
  const phaseRef = split?.ref ?? refValue

  return {
    phaseExpression: [phaseName, phaseRef].filter(Boolean).join(' ') || null,
    phaseName,
    phaseRef,
  }
}

function splitPhaseNameReference(name: string, ref: string | null) {
  const match = /^(?<stem>.*?)(?:\s*)(?<token>[0-9]+[A-Z]?|[IVXLCDM]+[A-Z]?)$/i.exec(
    name,
  )
  const stem = match?.groups?.stem?.trim()
  const token = match?.groups?.token
  if (!stem || !token || /(?:&|\bAND)$/i.test(stem)) return null

  const tokenValue = parsePhaseReferenceToken(token)
  if (!tokenValue) return null

  const shouldSplit = ref
    ? phaseReferenceTokensEqual(token, ref)
    : canInferPhaseReference(token, tokenValue)
  if (!shouldSplit) return null

  return { name: stem, ref: ref ?? token }
}

function canInferPhaseReference(
  token: string,
  parsed: { number: number; suffix: string },
) {
  if (/^[0-9]/.test(token)) return true
  if (parsed.suffix) return false
  // Match the premise-number guard: a single-letter Roman value is ambiguous
  // without an explicit PhaseNo, so it is not inferred from PhaseName alone.
  return token.length > 1
}

function phaseReferenceTokensEqual(left: string, right: string) {
  if (left.toUpperCase() === right.toUpperCase()) return true
  const leftValue = parsePhaseReferenceToken(left)
  const rightValue = parsePhaseReferenceToken(right)
  return Boolean(
    leftValue &&
      rightValue &&
      leftValue.number === rightValue.number &&
      leftValue.suffix.toUpperCase() === rightValue.suffix.toUpperCase(),
  )
}

function parsePhaseReferenceToken(value: string) {
  const token = value.toUpperCase()
  const arabic = /^(?<number>[1-9]\d*)(?<suffix>[A-Z]?)$/.exec(token)
  if (arabic?.groups?.number) {
    return {
      number: Number(arabic.groups.number),
      suffix: arabic.groups.suffix ?? '',
    }
  }

  const roman = /^(?<roman>[MDCLXVI]+)(?<suffix>[A-Z]?)$/.exec(token)
  if (!roman?.groups?.roman) return null
  const romanNumber = parseRomanNumeral(roman.groups.roman)
  if (romanNumber == null) return null
  return {
    number: romanNumber,
    suffix: roman.groups.suffix ?? '',
  }
}

function parseRomanNumeral(value: string) {
  const canonical =
    /^(?=[MDCLXVI]+$)M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/.test(
      value,
    )
  if (!canonical) return null

  const values: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  }
  let total = 0
  for (let index = 0; index < value.length; index += 1) {
    const current = values[value[index] ?? ''] ?? 0
    const next = values[value[index + 1] ?? ''] ?? 0
    total += current < next ? -current : current
  }
  return total
}

function normaliseBlockDescriptor(value: string | null) {
  const descriptor = value?.toUpperCase()
  if (!descriptor) return { expression: null, type: null }

  const canonical = ENGLISH_BLOCK_DESCRIPTOR_NORMALISATIONS.get(descriptor)
  if (canonical) return canonical

  const chineseType = CHINESE_BLOCK_DESCRIPTOR_TYPES.get(descriptor)
  if (chineseType) return { expression: null, type: chineseType }

  if (descriptor.includes('CARPARK') || descriptor === '停車場') {
    return { expression: null, type: 'parking' as const }
  }
  if (descriptor === 'GARAGE' || descriptor === '車房') {
    return { expression: null, type: 'garage' as const }
  }
  if (
    descriptor.includes('SHOPPING') ||
    descriptor.includes('MALL') ||
    descriptor === '商場'
  ) {
    return { expression: null, type: 'retail' as const }
  }
  if (descriptor.includes('COMMERCIAL')) {
    return { expression: null, type: 'commercial' as const }
  }
  return { expression: null, type: 'other' as const }
}

const ENGLISH_BLOCK_DESCRIPTOR_NORMALISATIONS = new Map<
  string,
  { expression: string; type: NonNullable<AddressI18nPayload['blockType']> }
>([
  ['BLK', { expression: 'BLK', type: 'block' }],
  ['BLKS', { expression: 'BLK', type: 'block' }],
  ['BLOCK', { expression: 'BLK', type: 'block' }],
  ['BLDG', { expression: 'BLDG', type: 'building' }],
  ['BUILDING', { expression: 'BLDG', type: 'building' }],
  ['TWR', { expression: 'TWR', type: 'tower' }],
  ['TOWER', { expression: 'TWR', type: 'tower' }],
  ['TOWERS', { expression: 'TWR', type: 'tower' }],
  ['HSE', { expression: 'HSE', type: 'house' }],
  ['HSES', { expression: 'HSE', type: 'house' }],
  ['HOUSE', { expression: 'HSE', type: 'house' }],
  ['APT', { expression: 'APT', type: 'apartment' }],
  ['APARTMENT', { expression: 'APT', type: 'apartment' }],
  ['PHASE', { expression: 'PHASE', type: 'phase' }],
  ['VILLA', { expression: 'VILLA', type: 'villa' }],
  ['MANSION', { expression: 'MANSION', type: 'mansion' }],
  ['FLAT', { expression: 'FLAT', type: 'flat' }],
  ['UNIT', { expression: 'UNIT', type: 'unit' }],
  ['QUARTERS', { expression: 'QUARTERS', type: 'quarters' }],
  ['STAGE', { expression: 'STAGE', type: 'stage' }],
  ['GARAGE', { expression: 'GARAGE', type: 'garage' }],
])

const CHINESE_BLOCK_DESCRIPTOR_TYPES = new Map<
  string,
  NonNullable<AddressI18nPayload['blockType']>
>([
  ['座', 'block'],
  ['前座', 'block'],
  ['中座', 'block'],
  ['後座', 'block'],
  ['大廈', 'building'],
  ['樓', 'building'],
  ['房屋', 'building'],
  ['低座', 'building'],
  ['屋', 'house'],
  ['洋房', 'house'],
  ['村屋', 'house'],
  ['石屋', 'house'],
  ['住宅', 'house'],
  ['期', 'phase'],
  ['別墅', 'villa'],
  ['室', 'flat'],
  ['單位', 'unit'],
  ['宿舍', 'quarters'],
  ['牧師宿舍', 'quarters'],
])

function parseOptionalJson(value: unknown) {
  const text = asNonEmptyString(value)

  if (!text) {
    return null
  }

  return JSON.parse(text) as unknown
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function requireText(value: unknown, message: string) {
  const text = asNonEmptyString(value)

  if (!text) {
    throw new Error(message)
  }

  return text
}
