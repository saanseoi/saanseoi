import type { DatasetProcessingMessage } from '../../../types'
import {
  resolvePublishedSnapshotForResourceTypeRegionCohortKey,
  resolveLatestPublishedSnapshotForResourceType,
  resolveLatestPublishedSnapshotForResourceTypeRegion,
} from '../../../lib/db/metaRegistry'
import type { HarbourReadableDb } from '../../../lib/db/types'
import type { AddressI18nPayload, AddressRow } from '@repo/db/currentSchema'
import { and, currentSchema, eq } from '@repo/db'
import type { CurrentDatabase, MetaDatabase } from '@repo/db'

import { asNonEmptyString } from '../../utils'
import type { NormalizedAddressRecord, SerializedAddressDivisionLookup } from './types'

type DivisionLookupMaps = {
  areaByCode: Map<OvertureSourceAreaCode, string>
  areaByEn: Map<string, string>
  countryId: string | null
  districtByCode: Map<OvertureSourceDistrictCode, string>
  districtByEn: Map<string, string>
  snapshotId: string
}

type PointGeometry = {
  type: 'Point'
  coordinates: [number, number]
}

const CHINA_NAME_ALIASES = new Set([
  'CHINA',
  'P.R. CHINA',
  'PRC',
  'CHINA PRC',
  'CHINA, PRC',
  "THE PEOPLE'S REPUBLIC OF CHINA",
])
const AREA_NAME_ALIASES = new Map<string, string>([
  ['HK', 'HONG KONG'],
  ['KLN', 'KOWLOON'],
  ['NT', 'NEW TERRITORIES'],
])
type OvertureSourceAreaCode = NonNullable<
  NonNullable<NormalizedAddressRecord['source']['overture']>['area']
>
type OvertureSourceDistrictCode = NonNullable<
  NonNullable<NormalizedAddressRecord['source']['overture']>['district']
>
const OVERTURE_SOURCE_AREA_CODES = new Map<string, OvertureSourceAreaCode>([
  ['HK', 'HK'],
  ['HONG KONG', 'HK'],
  ['KL', 'KL'],
  ['KLN', 'KL'],
  ['KOWLOON', 'KL'],
  ['NT', 'NT'],
  ['NEW TERRITORIES', 'NT'],
])
const OVERTURE_SOURCE_DISTRICT_CODES = new Map<string, OvertureSourceDistrictCode>([
  ['CENTRAL', 'CW'],
  ['CENTRAL AND WESTERN', 'CW'],
  ['EASTERN', 'EST'],
  ['ISLANDS', 'ILD'],
  ['KOWLOON CITY', 'KLC'],
  ['KWAI TSING', 'KC'],
  ['KWUN TONG', 'KT'],
  ['NORTH', 'NTH'],
  ['SAI KUNG', 'SK'],
  ['SHA TIN', 'ST'],
  ['SHAM SHUI PO', 'SSP'],
  ['SOUTHERN', 'STH'],
  ['TAI PO', 'TP'],
  ['TSUEN WAN', 'TW'],
  ['TUEN MUN', 'TM'],
  ['WAN CHAI', 'WC'],
  ['WONG TAI SIN', 'WTS'],
  ['YAU TSIM MONG', 'YTM'],
  ['YUEN LONG', 'YL'],
])
const OVERTURE_AREA_CODE_NAMES = new Map<OvertureSourceAreaCode, string[]>([
  ['HK', ['HONG KONG ISLAND', 'HONG KONG']],
  ['KL', ['KOWLOON']],
  ['NT', ['NEW TERRITORIES']],
])
const OVERTURE_DISTRICT_CODE_NAMES = new Map<OvertureSourceDistrictCode, string[]>([
  ['CW', ['CENTRAL AND WESTERN DISTRICT', 'CENTRAL DISTRICT']],
  ['EST', ['EASTERN DISTRICT']],
  ['ILD', ['ISLANDS DISTRICT']],
  ['KLC', ['KOWLOON CITY DISTRICT']],
  ['KC', ['KWAI TSING DISTRICT']],
  ['KT', ['KWUN TONG DISTRICT']],
  ['NTH', ['NORTH DISTRICT']],
  ['SK', ['SAI KUNG DISTRICT']],
  ['ST', ['SHA TIN DISTRICT']],
  ['SSP', ['SHAM SHUI PO DISTRICT']],
  ['STH', ['SOUTHERN DISTRICT']],
  ['TP', ['TAI PO DISTRICT']],
  ['TW', ['TSUEN WAN DISTRICT']],
  ['TM', ['TUEN MUN DISTRICT']],
  ['WC', ['WAN CHAI DISTRICT']],
  ['WTS', ['WONG TAI SIN DISTRICT']],
  ['YTM', ['YAU TSIM MONG DISTRICT']],
  ['YL', ['YUEN LONG DISTRICT']],
])

export async function loadDivisionLookupMaps(
  metaDb: MetaDatabase,
  db: CurrentDatabase,
  regionCode: DatasetProcessingMessage['regionCode'],
  cohortKey?: string | null,
) {
  const metaReadDb = metaDb as unknown as HarbourReadableDb
  const cohortDivisionSnapshot = cohortKey
    ? await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
        metaReadDb,
        'division',
        regionCode,
        cohortKey,
      )
    : null
  const activeDivisionSnapshot =
    cohortDivisionSnapshot ??
    (await resolveLatestPublishedSnapshotForResourceTypeRegion(
      metaReadDb,
      'division',
      regionCode,
    ))
  const fallbackDivisionSnapshot =
    activeDivisionSnapshot ??
    (await resolveLatestPublishedSnapshotForResourceType(metaReadDb, 'division'))

  if (!fallbackDivisionSnapshot) {
    throw new Error('Published division snapshot not found.')
  }

  const resolvedRows = await loadDivisionLookupRows(db, fallbackDivisionSnapshot.id)

  const areaByCode = new Map<OvertureSourceAreaCode, string>()
  const areaByEn = new Map<string, string>()
  const districtByCode = new Map<OvertureSourceDistrictCode, string>()
  const districtByEn = new Map<string, string>()
  let countryId: string | null = null

  for (const row of resolvedRows) {
    const names = collectDivisionLookupNames(row)
    const [name] = names

    if (!name) {
      continue
    }

    if (row.level === 1 || row.type === 'area') {
      for (const lookupName of names) {
        areaByEn.set(lookupName, row.id)
      }

      const areaCode = resolveAreaCodeFromDivisionNames(names)

      if (areaCode) {
        areaByCode.set(areaCode, row.id)
      }
    }

    if (row.level === 2 || row.type === 'district') {
      for (const lookupName of names) {
        districtByEn.set(lookupName, row.id)
      }

      const districtCode = resolveDistrictCodeFromDivisionNames(names)

      if (districtCode) {
        districtByCode.set(districtCode, row.id)
      }
    }

    if (row.level === 0 && CHINA_NAME_ALIASES.has(name)) {
      countryId = row.id
    }
  }

  return {
    areaByCode,
    areaByEn,
    countryId,
    districtByCode,
    districtByEn,
    snapshotId: fallbackDivisionSnapshot.id,
  } satisfies DivisionLookupMaps
}

export function serializeDivisionLookupMaps(
  lookup: DivisionLookupMaps,
): SerializedAddressDivisionLookup {
  return {
    areaByCode: Object.fromEntries(lookup.areaByCode),
    countryId: lookup.countryId,
    districtByCode: Object.fromEntries(lookup.districtByCode),
    snapshotId: lookup.snapshotId,
  }
}

export function deserializeDivisionLookupMaps(
  lookup: SerializedAddressDivisionLookup,
): DivisionLookupMaps {
  return {
    areaByCode: new Map(Object.entries(lookup.areaByCode)) as Map<
      OvertureSourceAreaCode,
      string
    >,
    areaByEn: new Map(),
    countryId: lookup.countryId,
    districtByCode: new Map(Object.entries(lookup.districtByCode)) as Map<
      OvertureSourceDistrictCode,
      string
    >,
    districtByEn: new Map(),
    snapshotId: lookup.snapshotId,
  }
}

async function loadDivisionLookupRows(db: CurrentDatabase, snapshotId: string) {
  return (await db
    .select({
      id: currentSchema.divisions.id,
      level: currentSchema.divisions.level,
      type: currentSchema.divisions.type,
      locale: currentSchema.divisionsI18n.locale,
      name: currentSchema.divisionsI18n.name,
      nameAlts: currentSchema.divisionsI18n.nameAlts,
      nameVariant: currentSchema.divisionsI18n.nameVariant,
    })
    .from(currentSchema.divisions)
    .innerJoin(
      currentSchema.divisionsI18n,
      and(
        eq(currentSchema.divisions.snapshotId, currentSchema.divisionsI18n.snapshotId),
        eq(currentSchema.divisions.id, currentSchema.divisionsI18n.divisionId),
      ),
    )
    .where(
      and(
        eq(currentSchema.divisions.snapshotId, snapshotId),
        eq(currentSchema.divisionsI18n.locale, 'en'),
      ),
    )
    .all()) as Array<{
    id: string
    level: number
    locale: string
    name: string | null
    nameAlts: string | null
    nameVariant: unknown
    type: string
  }>
}

export function normalizeAddressRowForPipeline(
  row: Record<string, unknown>,
  message: DatasetProcessingMessage,
  divisionLookup: DivisionLookupMaps,
) {
  return message.source === 'overture'
    ? normalizeOvertureAddressRow(row, divisionLookup)
    : normalizePreparedHkgovAddressRow(row)
}

export function dedupeNormalizedAddressRows(rows: NormalizedAddressRecord[]) {
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

function normalizeOvertureAddressRow(
  row: Record<string, unknown>,
  divisionLookup: DivisionLookupMaps,
) {
  const sourceId = requireText(row.id, 'Overture address row is missing `id`.')
  const addressLevels = normalizeAddressLevels(row.address_levels)
  const sourceArea = resolveOvertureSourceArea(addressLevels[0] ?? null)
  const sourceDistrict = resolveOvertureSourceDistrict(addressLevels[1] ?? null)
  const areaId = resolveAreaId(addressLevels[0] ?? null, sourceArea, divisionLookup)
  const districtId = resolveDistrictId(
    addressLevels[1] ?? null,
    sourceDistrict,
    divisionLookup,
  )
  const otStreet = asNonEmptyString(row.street)
  const otNumber = asNonEmptyString(row.number)
  const formattedAddress = formatAddress(otNumber, otStreet)

  return {
    sourceId,
    matchKey: buildMatchKey({
      districtId,
      streetNumber: otNumber,
      streetName: otStreet,
    }),
    base: {
      divisionSnapshotId: divisionLookup.snapshotId,
      streetSnapshotId: null,
      streetId: null,
      hamletId: null,
      microhoodId: null,
      villageId: null,
      neighbourhoodId: null,
      macrohoodId: null,
      townId: null,
      districtId,
      areaId,
      countryId: divisionLookup.countryId,
      geometry: parsePointGeometry(row.geometry),
      identifiers: null,
      bbox: row.bbox ?? null,
      sources: {
        overture: pruneEmptyValues(row.sources),
      },
    } satisfies Omit<AddressRow, 'id' | 'snapshotId' | 'createdAt' | 'updatedAt'>,
    i18n: formattedAddress
      ? [
          {
            addressId: sourceId,
            locale: 'en',
            formattedAddress,
            buildingName: null,
            buildingNumberFrom: null,
            buildingNumberTo: null,
            blockType: null,
            blockNumber: null,
            blockTypeBeforeNumber: null,
            phaseName: null,
            phaseNumber: null,
            estateName: null,
            streetNumber: otNumber,
            streetName: otStreet,
          } satisfies AddressI18nPayload,
        ]
      : [],
    source: {
      overture: {
        area: sourceArea,
        district: sourceDistrict,
        unit: null,
      },
    },
  }
}

function normalizePreparedHkgovAddressRow(row: Record<string, unknown>) {
  const sourceId = requireText(row.id, 'Prepared HKGov ALS row is missing `id`.')
  const districtId = asNonEmptyString(row.districtId)
  const otStreet =
    asNonEmptyString(row.enStreetName) ?? asNonEmptyString(row.zhHantStreetName)
  const otNumber = joinRange(row.enStreetNumberFrom, row.enStreetNumberTo)
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
      blockType: null,
      blockNumber: null,
      blockTypeBeforeNumber: null,
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
      blockType: null,
      blockNumber: null,
      blockTypeBeforeNumber: null,
      phaseName: null,
      phaseNumber: null,
      estateName: asNonEmptyString(row.zhHantEstateName),
      streetNumber: joinRange(row.zhHantStreetNumberFrom, row.zhHantStreetNumberTo),
      streetName: asNonEmptyString(row.zhHantStreetName),
    })
  }

  return {
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
    sources: base.sources,
  } satisfies Omit<
    AddressRow,
    'createdAt' | 'updatedAt' | 'snapshotId' | 'divisionSnapshotId' | 'streetSnapshotId'
  >
}

export function normalizeAddressI18nSnapshotRow(row: AddressI18nPayload) {
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
  const street = normalizeNameToken(input.streetName)
  const number = normalizeNameToken(input.streetNumber)

  if (!districtId || !street || !number) {
    return null
  }

  return `${districtId}::${street}::${number}`
}

function normalizeAddressLevels(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(item => {
      if (item && typeof item === 'object') {
        return asNonEmptyString((item as Record<string, unknown>).value)
      }

      return asNonEmptyString(item)
    })
    .filter((item): item is string => Boolean(item))
}

function resolveAreaId(
  value: string | null,
  sourceArea: OvertureSourceAreaCode | null,
  lookup: DivisionLookupMaps,
) {
  if (sourceArea) {
    const byCode = lookup.areaByCode.get(sourceArea)

    if (byCode) {
      return byCode
    }
  }

  const normalized = normalizeNameToken(value)

  if (!normalized) {
    return null
  }

  return lookup.areaByEn.get(AREA_NAME_ALIASES.get(normalized) ?? normalized) ?? null
}

function resolveDistrictId(
  value: string | null,
  sourceDistrict: OvertureSourceDistrictCode | null,
  lookup: DivisionLookupMaps,
) {
  if (sourceDistrict) {
    const byCode = lookup.districtByCode.get(sourceDistrict)

    if (byCode) {
      return byCode
    }
  }

  const normalized = normalizeNameToken(value)

  if (!normalized) {
    return null
  }

  return lookup.districtByEn.get(normalized) ?? null
}

function collectDivisionLookupNames(row: {
  name: string | null
  nameAlts: string | null
  nameVariant: unknown
}) {
  const names = new Set<string>()
  const add = (value: unknown) => {
    const normalized = normalizeNameToken(value)

    if (normalized) {
      names.add(normalized)
    }
  }

  add(row.name)

  for (const alt of row.nameAlts?.split('|') ?? []) {
    add(alt)
  }

  if (Array.isArray(row.nameVariant)) {
    for (const variant of row.nameVariant) {
      add(variant)
    }
  }

  return [...names]
}

function resolveAreaCodeFromDivisionNames(names: string[]) {
  return resolveCodeFromDivisionNames(names, OVERTURE_AREA_CODE_NAMES)
}

function resolveDistrictCodeFromDivisionNames(names: string[]) {
  return resolveCodeFromDivisionNames(names, OVERTURE_DISTRICT_CODE_NAMES)
}

function resolveCodeFromDivisionNames<TCode extends string>(
  names: string[],
  codeNames: Map<TCode, string[]>,
) {
  for (const [code, candidates] of codeNames) {
    if (
      candidates.some(candidate =>
        names.some(name => name === candidate || name.endsWith(` ${candidate}`)),
      )
    ) {
      return code
    }
  }

  return null
}

function resolveOvertureSourceArea(value: string | null) {
  const normalized = normalizeNameToken(value)

  if (!normalized) {
    return null
  }

  return OVERTURE_SOURCE_AREA_CODES.get(normalized) ?? null
}

function resolveOvertureSourceDistrict(value: string | null) {
  const normalized = normalizeDistrictNameToken(value)

  if (!normalized) {
    return null
  }

  return OVERTURE_SOURCE_DISTRICT_CODES.get(normalized) ?? null
}

function normalizeDistrictNameToken(value: unknown) {
  const normalized = normalizeNameToken(value)?.replaceAll('&', 'AND')

  if (!normalized) {
    return null
  }

  return normalized.endsWith(' DISTRICT')
    ? normalized.slice(0, -' DISTRICT'.length)
    : normalized
}

function normalizeNameToken(value: unknown) {
  const normalized = asNonEmptyString(value)?.trim().toUpperCase().replace(/\s+/g, ' ')
  return normalized ?? null
}

function formatAddress(number: string | null, street: string | null) {
  if (number && street) {
    return `${number} ${street}`
  }

  return number ?? street ?? null
}

function joinRange(from: unknown, to: unknown) {
  const fromValue = asNonEmptyString(from)
  const toValue = asNonEmptyString(to)

  if (fromValue && toValue && fromValue !== toValue) {
    return `${fromValue}-${toValue}`
  }

  return fromValue ?? toValue ?? null
}

function pruneEmptyValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(pruneEmptyValues)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(([, nestedValue]) => {
        if (nestedValue === null || nestedValue === undefined) {
          return false
        }

        if (typeof nestedValue === 'string' && nestedValue.trim() === '') {
          return false
        }

        return true
      }),
    )
  }

  return value
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

function parsePointGeometry(value: unknown): PointGeometry | null {
  if (value && typeof value === 'object') {
    const candidate = value as Record<string, unknown>

    if (
      candidate.type === 'Point' &&
      Array.isArray(candidate.coordinates) &&
      candidate.coordinates.length >= 2 &&
      typeof candidate.coordinates[0] === 'number' &&
      typeof candidate.coordinates[1] === 'number'
    ) {
      return {
        type: 'Point',
        coordinates: [candidate.coordinates[0], candidate.coordinates[1]],
      }
    }
  }

  const bytes =
    value instanceof Uint8Array
      ? value
      : value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : ArrayBuffer.isView(value)
          ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
          : null

  if (!bytes || bytes.byteLength < 21) {
    return null
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const littleEndian = view.getUint8(0) === 1
  const geometryType = view.getUint32(1, littleEndian)

  if (geometryType !== 1) {
    return null
  }

  return {
    type: 'Point',
    coordinates: [view.getFloat64(5, littleEndian), view.getFloat64(13, littleEndian)],
  }
}

export function asOptionalInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}
