import type { AddressI18nPayload, AddressRow } from '@repo/db/currentSchema'

import { asNonEmptyString } from '../../utils'
import type { NormalisedAddressRecord } from './types'

export function normaliseAddressRowForPipeline(row: Record<string, unknown>) {
  return normalisePreparedHkgovAddressRow(row)
}

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
      blockExpression: buildBlockExpression(row.enBlockDescriptor, row.enBlockNumber),
      blockType: normaliseBlockType(row.enBlockDescriptor),
      blockRef: asNonEmptyString(row.enBlockNumber),
      blockTypeBeforeNumber:
        asNonEmptyString(row.enBlockDescriptor) && asNonEmptyString(row.enBlockNumber)
          ? true
          : null,
      phaseExpression: buildPhaseExpression(row.enPhaseName, row.enPhaseRef),
      phaseName: asNonEmptyString(row.enPhaseName),
      phaseRef: asNonEmptyString(row.enPhaseRef),
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
      blockExpression: buildBlockExpression(
        row.zhHantBlockDescriptor,
        row.zhHantBlockNumber,
      ),
      blockType: normaliseBlockType(row.zhHantBlockDescriptor),
      blockRef: asNonEmptyString(row.zhHantBlockNumber),
      blockTypeBeforeNumber:
        asNonEmptyString(row.zhHantBlockDescriptor) &&
        asNonEmptyString(row.zhHantBlockNumber)
          ? true
          : null,
      phaseExpression: buildPhaseExpression(row.zhHantPhaseName, row.zhHantPhaseRef),
      phaseName: asNonEmptyString(row.zhHantPhaseName),
      phaseRef: asNonEmptyString(row.zhHantPhaseRef),
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
  rows: AddressI18nPayload[],
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
    add(row.addressId, row.buildingNumberFrom, 'source_endpoint')
    add(row.addressId, row.buildingNumberTo, 'source_endpoint')

    if (row.buildingNumberConnector !== '-') continue
    const from = normaliseBuildingNumber(row.buildingNumberFrom)
    const to = normaliseBuildingNumber(row.buildingNumberTo)
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

function buildBlockExpression(descriptor: unknown, ref: unknown) {
  const descriptorValue = asNonEmptyString(descriptor)
  const refValue = asNonEmptyString(ref)
  return [descriptorValue, refValue].filter(Boolean).join(' ') || null
}

function buildPhaseExpression(name: unknown, ref: unknown) {
  const nameValue = asNonEmptyString(name)
  const refValue = asNonEmptyString(ref)
  return [nameValue, refValue].filter(Boolean).join(' ') || null
}

function normaliseBlockType(value: unknown): AddressI18nPayload['blockType'] {
  const descriptor = asNonEmptyString(value)?.toUpperCase()
  if (!descriptor) return null
  if (['BLK', 'BLKS', 'BLOCK', '座'].includes(descriptor)) return 'block'
  if (['HSE', 'HSES', 'HOUSE', '洋房'].includes(descriptor)) return 'house'
  if (descriptor === 'TOWER') return 'tower'
  if (descriptor === 'PHASE' || descriptor === '期') return 'phase'
  if (descriptor === 'VILLA') return 'villa'
  if (descriptor === 'MANSION') return 'mansion'
  if (['APT', 'APARTMENT'].includes(descriptor)) return 'apartment'
  if (descriptor === 'FLAT') return 'flat'
  if (descriptor === 'UNIT') return 'unit'
  if (descriptor === 'QUARTERS') return 'quarters'
  if (descriptor === 'STAGE') return 'stage'
  if (descriptor.includes('CARPARK')) return 'parking'
  if (descriptor === 'GARAGE') return 'garage'
  if (descriptor.includes('SHOPPING') || descriptor.includes('MALL')) return 'retail'
  if (descriptor.includes('COMMERCIAL')) return 'commercial'
  return 'other'
}

function parseOptionalJson(value: unknown) {
  const text = asNonEmptyString(value)

  if (!text) {
    return null
  }

  return JSON.parse(text) as unknown
}

function requireText(value: unknown, message: string) {
  const text = asNonEmptyString(value)

  if (!text) {
    throw new Error(message)
  }

  return text
}
