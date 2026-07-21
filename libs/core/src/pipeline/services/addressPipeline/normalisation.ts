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
  const otNumber = joinRange(row.enStreetNumberFrom, row.enStreetNumberTo)
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
      buildingNumberFrom: null,
      buildingNumberTo: null,
      blockType: asNonEmptyString(row.enBlockDescriptor),
      blockNumber: asNonEmptyString(row.enBlockNumber),
      blockTypeBeforeNumber:
        asNonEmptyString(row.enBlockDescriptor) && asNonEmptyString(row.enBlockNumber)
          ? true
          : null,
      phaseName: null,
      phaseNumber: null,
      estateName: asNonEmptyString(row.enEstateName),
      streetNumber: otNumber,
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
      buildingNumberFrom: null,
      buildingNumberTo: null,
      blockType: asNonEmptyString(row.zhHantBlockDescriptor),
      blockNumber: asNonEmptyString(row.zhHantBlockNumber),
      blockTypeBeforeNumber:
        asNonEmptyString(row.zhHantBlockDescriptor) &&
        asNonEmptyString(row.zhHantBlockNumber)
          ? true
          : null,
      phaseName: null,
      phaseNumber: null,
      estateName: asNonEmptyString(row.zhHantEstateName),
      streetNumber: joinRange(row.zhHantStreetNumberFrom, row.zhHantStreetNumberTo),
      streetName: asNonEmptyString(row.zhHantStreetName),
    })
  }

  for (const localised of i18n) {
    if (localised.streetName) coverageComponents.add('street_name')
    if (localised.streetNumber) coverageComponents.add('street_number')
    if (localised.buildingName) coverageComponents.add('building_name')
    if (localised.estateName) coverageComponents.add('estate_name')
    if (localised.phaseName || localised.phaseNumber) coverageComponents.add('phase')
    if (localised.blockType || localised.blockNumber) coverageComponents.add('block')
  }
  if (asNonEmptyString(row.enVillageName) || asNonEmptyString(row.zhHantVillageName)) {
    coverageComponents.add('village_name')
  }

  return {
    canonicalId,
    sourceId,
    matchKey: buildMatchKey({
      districtId,
      streetNumber: otNumber,
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
    buildingNumberFrom: row.buildingNumberFrom,
    buildingNumberTo: row.buildingNumberTo,
    blockType: row.blockType,
    blockNumber: row.blockNumber,
    blockTypeBeforeNumber: row.blockTypeBeforeNumber,
    phaseName: row.phaseName,
    phaseNumber: row.phaseNumber,
    estateName: row.estateName,
    streetNumber: row.streetNumber,
    streetName: row.streetName,
  } satisfies AddressI18nPayload
}

export function buildMatchKey(input: {
  districtId: string | null
  streetNumber: string | null
  streetName: string | null
}) {
  const districtId = asNonEmptyString(input.districtId)
  const street = normaliseNameToken(input.streetName)
  const number = normaliseNameToken(input.streetNumber)

  if (!districtId || !street || !number) {
    return null
  }

  return `${districtId}::${street}::${number}`
}

function normaliseNameToken(value: unknown) {
  const normalised = asNonEmptyString(value)?.trim().toUpperCase().replace(/\s+/g, ' ')
  return normalised ?? null
}

function joinRange(from: unknown, to: unknown) {
  const fromValue = asNonEmptyString(from)
  const toValue = asNonEmptyString(to)

  if (fromValue && toValue && fromValue !== toValue) {
    return `${fromValue}-${toValue}`
  }

  return fromValue ?? toValue ?? null
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
