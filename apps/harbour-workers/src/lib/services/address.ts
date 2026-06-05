import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/repository'
import type { DatasetProcessingMessage } from '@repo/core'
import type { AddressI18nPayload, AddressRow } from '@repo/db/schema'

import { and, eq } from 'drizzle-orm'

import { divisions, divisionsI18n } from '@repo/db/schema'

import {
  closeCurrentAddressVersion,
  deleteMissingCurrentAddresses,
  getCurrentAddressVersionMap,
  insertAddressVersionRows,
  upsertAddressCurrentState,
} from '../db/address'
import {
  asNonEmptyString,
  asString,
  createHash,
  stableJsonStringify,
} from '../utils'
import { createAsyncBufferFromR2, readParquetObjectsInBatches } from '../parquetR2'

import type { HarbourWorkerBucket } from './division'
import type { AddressVersionSnapshot } from '../db/address'

type DivisionLookupMaps = {
  areaByEn: Map<string, string>
  countryId: string | null
  districtByEn: Map<string, string>
}

export type ProcessAddressDatasetResult = {
  deletedRows: number
  insertedVersions: number
  localizedRows: number
  processedRows: number
  statsRows: number
  unchangedRows: number
}

const ADDRESS_BATCH_SIZE = 128
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

type PointGeometry = {
  type: 'Point'
  coordinates: [number, number]
}

export async function processAddressDataset(
  db: HarbourReadableDb & HarbourWritableDb,
  bucket: HarbourWorkerBucket,
  message: DatasetProcessingMessage,
): Promise<ProcessAddressDatasetResult> {
  const file = await createAsyncBufferFromR2(bucket, message.rawObjectKey)
  const divisionLookup = await loadDivisionLookupMaps(db)
  const currentRows = await getCurrentAddressVersionMap(db, message.regionCode, {
    buildAddressBaseHashInput,
    buildMatchKey,
    normalizeAddressI18nSnapshotRow,
  })
  const currentRowsByMatchKey = new Map<string, AddressVersionSnapshot>()

  for (const snapshot of currentRows.values()) {
    if (snapshot.matchKey && !currentRowsByMatchKey.has(snapshot.matchKey)) {
      currentRowsByMatchKey.set(snapshot.matchKey, snapshot)
    }
  }

  const seenIds = new Set<string>()
  let processedRows = 0
  let insertedVersions = 0
  let unchangedRows = 0
  let localizedRows = 0

  for await (const batch of readParquetObjectsInBatches(file, ADDRESS_BATCH_SIZE)) {
    for (const row of batch) {
      const normalized =
        message.source === 'overture'
          ? normalizeOvertureAddressRow(row, divisionLookup)
          : normalizePreparedHkgovAddressRow(row)
      const matchedCurrent =
        currentRows.get(normalized.sourceId) ??
        (normalized.matchKey ? currentRowsByMatchKey.get(normalized.matchKey) : null) ??
        null
      const addressId = matchedCurrent?.id ?? normalized.sourceId
      const base: AddressRow = {
        ...normalized.base,
        id: addressId,
      }
      const i18n = normalized.i18n.map(row => ({
        ...row,
        addressId,
      }))
      const versionHash = await createHash({
        base: buildAddressBaseHashInput(base),
        i18n,
      })

      processedRows += 1
      localizedRows += i18n.length
      seenIds.add(addressId)

      if (matchedCurrent?.versionHash === versionHash) {
        unchangedRows += 1
        await insertAddressVersionRows(
          db,
          message,
          {
            ...base,
            updatedAt: new Date().toISOString(),
          },
          i18n,
          versionHash,
          new Date().toISOString(),
        )
        continue
      }

      if (matchedCurrent) {
        await closeCurrentAddressVersion(db, matchedCurrent.id, message.snapshotMonth)
      }

      insertedVersions += 1

      const now = new Date().toISOString()
      await upsertAddressCurrentState(
        db,
        {
          ...base,
          createdAt: matchedCurrent ? now : now,
          updatedAt: now,
        },
        i18n,
      )
      await insertAddressVersionRows(db, message, { ...base, createdAt: now, updatedAt: now }, i18n, versionHash, now)
    }
  }

  const deletedRows =
    message.source === 'overture'
      ? await deleteMissingCurrentAddresses(db, message.snapshotMonth, currentRows, seenIds)
      : 0

  return {
    deletedRows,
    insertedVersions,
    localizedRows,
    processedRows,
    statsRows: 0,
    unchangedRows,
  }
}

async function loadDivisionLookupMaps(db: HarbourReadableDb) {
  const rows = (await db
    .select({
      id: divisions.id,
      level: divisions.level,
      type: divisions.type,
      locale: divisionsI18n.locale,
      otName: divisionsI18n.otName,
    })
    .from(divisions)
    .innerJoin(divisionsI18n, eq(divisions.id, divisionsI18n.divisionId))
    .where(eq(divisionsI18n.locale, 'en'))
    .all()) as Array<{
    id: string
    level: number
    locale: string
    otName: string | null
    type: string
  }>

  const areaByEn = new Map<string, string>()
  const districtByEn = new Map<string, string>()
  let countryId: string | null = null

  for (const row of rows) {
    const name = normalizeNameToken(row.otName)

    if (!name) {
      continue
    }

    if (row.level === 1 || row.type === 'area') {
      areaByEn.set(name, row.id)
    }

    if (row.level === 2 || row.type === 'district') {
      districtByEn.set(name, row.id)
    }

    if (row.level === 0 && CHINA_NAME_ALIASES.has(name)) {
      countryId = row.id
    }
  }

  return {
    areaByEn,
    countryId,
    districtByEn,
  } satisfies DivisionLookupMaps
}

function normalizeOvertureAddressRow(
  row: Record<string, unknown>,
  divisionLookup: DivisionLookupMaps,
) {
  const sourceId = requireText(row.id, 'Overture address row is missing `id`.')
  const addressLevels = normalizeAddressLevels(row.address_levels)
  const areaId = resolveAreaId(addressLevels[0] ?? null, divisionLookup)
  const districtId = resolveDistrictId(addressLevels[1] ?? null, divisionLookup)
  const otStreet = asNonEmptyString(row.street)
  const otNumber = asNonEmptyString(row.number)
  const formattedAddress = formatAddress(otNumber, otStreet)

  return {
    sourceId,
    matchKey: buildMatchKey({
      districtId,
      otNumber,
      otStreet,
    }),
    base: {
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
      geometry: stableJsonStringify(parsePointGeometry(row.geometry)),
      identifiersJson: null,
      otStreet,
      otNumber,
      otBboxJson: stableJsonStringify(row.bbox),
      otVersion: asString(row.version),
      sourcesJson: stableJsonStringify({
        overture: pruneEmptyValues(row.sources),
      }),
      createdAt: '',
      updatedAt: '',
    } satisfies Omit<AddressRow, 'id'>,
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
  }
}

function normalizePreparedHkgovAddressRow(row: Record<string, unknown>) {
  const sourceId = requireText(row.id, 'Prepared HKGov ALS row is missing `id`.')
  const districtId = asNonEmptyString(row.districtId)
  const otStreet = asNonEmptyString(row.enStreetName) ?? asNonEmptyString(row.zhHantStreetName)
  const otNumber = joinRange(row.enStreetNumberFrom, row.enStreetNumberTo)
  const i18n: AddressI18nPayload[] = []

  if (asNonEmptyString(row.enFormattedAddress)) {
    i18n.push({
      addressId: sourceId,
      locale: 'en',
      formattedAddress: requireText(row.enFormattedAddress, 'Missing en formatted address.'),
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
      otNumber,
      otStreet,
    }),
    base: {
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
      geometry: asNonEmptyString(row.geometryJson),
      identifiersJson: asNonEmptyString(row.identifiersJson),
      otStreet,
      otNumber,
      otBboxJson: null,
      otVersion: asNonEmptyString(row.sourceVersion),
      sourcesJson: asNonEmptyString(row.sourcesJson),
      createdAt: '',
      updatedAt: '',
    } satisfies Omit<AddressRow, 'id'>,
    i18n,
  }
}

function buildAddressBaseHashInput(base: Omit<AddressRow, 'createdAt' | 'updatedAt'> | AddressRow) {
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
    identifiersJson: base.identifiersJson,
    otStreet: base.otStreet,
    otNumber: base.otNumber,
    otBboxJson: base.otBboxJson,
    otVersion: base.otVersion,
    sourcesJson: base.sourcesJson,
  } satisfies Omit<AddressRow, 'createdAt' | 'updatedAt'>
}

function normalizeAddressI18nSnapshotRow(row: AddressI18nPayload) {
  return row
}

function buildMatchKey(input: {
  districtId: string | null
  otNumber: string | null
  otStreet: string | null
}) {
  const districtId = asNonEmptyString(input.districtId)
  const street = normalizeNameToken(input.otStreet)
  const number = normalizeNameToken(input.otNumber)

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

function resolveAreaId(value: string | null, lookup: DivisionLookupMaps) {
  const normalized = normalizeNameToken(value)

  if (!normalized) {
    return null
  }

  return lookup.areaByEn.get(AREA_NAME_ALIASES.get(normalized) ?? normalized) ?? null
}

function resolveDistrictId(value: string | null, lookup: DivisionLookupMaps) {
  const normalized = normalizeNameToken(value)

  if (!normalized) {
    return null
  }

  return lookup.districtByEn.get(normalized) ?? null
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
