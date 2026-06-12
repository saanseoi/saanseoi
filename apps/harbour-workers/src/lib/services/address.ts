import type { DatasetProcessingMessage } from '@repo/core'
import { resolveReleaseSetForType } from '@repo/core/db/meta-repository'
import type {
  CurrentDatabase,
  HistoryDatabase,
  MetaDatabase,
  sourceSchema,
  SourceDatabase,
} from '@repo/db'
import type { AddressI18nPayload, AddressRow } from '@repo/db/currentSchema'

import { eq } from 'drizzle-orm'

import { currentSchema } from '@repo/db'

import {
  closeCurrentAddressVersion,
  deleteMissingCurrentAddresses,
  getCurrentAddressVersionMap,
  insertAddressVersionRows,
  upsertAddressCurrentState,
} from '../db/address'
import {
  buildSourceDatasetId,
  buildSourceReleaseId,
  insertSourceHkgovAlsAddress2dI18n,
  insertSourceHkgovAlsAddresses2d,
  insertSourceOvertureAddress2dI18n,
  insertSourceOvertureAddresses2d,
  resetSourceReleaseRows,
} from '../db/source'
import { asNonEmptyString, createHash, stableJsonStringify } from '../utils'
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
  metaDb: MetaDatabase,
  currentDb: CurrentDatabase,
  historyDb: HistoryDatabase,
  bucket: HarbourWorkerBucket,
  message: DatasetProcessingMessage,
  sourceDb?: SourceDatabase,
): Promise<ProcessAddressDatasetResult> {
  const file = await createAsyncBufferFromR2(bucket, message.rawObjectKey)
  const environment = resolveShardEnvironment()
  const releaseSet = await resolveReleaseSetForType(metaDb, message.type)

  if (!releaseSet) {
    throw new Error(`Release set not found for type: ${message.type}`)
  }

  const divisionLookup = await loadDivisionLookupMaps(currentDb)
  const currentRows = await getCurrentAddressVersionMap(historyDb, message.regionCode, {
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

  if (sourceDb) {
    await resetSourceReleaseRows(sourceDb, message)
  }

  for await (const batch of readParquetObjectsInBatches(file, ADDRESS_BATCH_SIZE)) {
    const overtureSourceRows: Array<
      typeof sourceSchema.sourceOvertureAddresses2d.$inferInsert
    > = []
    const overtureSourceI18nRows: Array<
      typeof sourceSchema.sourceOvertureAddress2dI18n.$inferInsert
    > = []
    const hkgovSourceRows: Array<
      typeof sourceSchema.sourceHkgovAlsAddresses2d.$inferInsert
    > = []
    const hkgovSourceI18nRows: Array<
      typeof sourceSchema.sourceHkgovAlsAddress2dI18n.$inferInsert
    > = []

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

      if (sourceDb) {
        const releaseId = buildSourceReleaseId(message)
        const datasetId = buildSourceDatasetId(message)
        const sourcePayloadHash = await createHash(row)

        if (message.source === 'overture') {
          overtureSourceRows.push({
            releaseId,
            datasetId,
            sourceRecordId: normalized.sourceId,
            sourcePayloadHash,
            regionCode: message.regionCode,
            version: asOptionalInteger(row.version),
            geometryJson: stableJsonStringify(base.geometry),
            bboxJson: stableJsonStringify(base.otBbox),
            streetName:
              i18n.find(localized => localized.locale === 'en')?.streetName ?? null,
            streetNumber:
              i18n.find(localized => localized.locale === 'en')?.streetNumber ?? null,
            sourcesJson: stableJsonStringify(base.sources),
            rawPropertiesJson: stableJsonStringify(row),
          })

          overtureSourceI18nRows.push(
            ...i18n.map(localized => ({
              releaseId,
              sourceRecordId: normalized.sourceId,
              locale: localized.locale,
              streetName: localized.streetName,
              locality: null,
              region: null,
              country: null,
            })),
          )
        } else {
          hkgovSourceRows.push({
            releaseId,
            datasetId,
            sourceRecordId: normalized.sourceId,
            sourcePayloadHash,
            regionCode: message.regionCode,
            geoAddress: asNonEmptyString(row.geoAddress),
            csuId: asNonEmptyString(row.hkgovCsuId) ?? asNonEmptyString(row.geoAddress),
            x: asNumber(row.easting),
            y: asNumber(row.northing),
            geometryJson: asNonEmptyString(row.geometryJson),
            districtCode: null,
            districtName:
              asNonEmptyString(row.enDistrict) ?? asNonEmptyString(row.zhHantDistrict),
            estateName:
              asNonEmptyString(row.enEstateName) ??
              asNonEmptyString(row.zhHantEstateName),
            buildingName:
              asNonEmptyString(row.enBuildingName) ??
              asNonEmptyString(row.zhHantBuildingName),
            blockNumber: null,
            blockDescriptor: null,
            phaseName: null,
            phaseNumber: null,
            floor: null,
            unit: null,
            streetNumber:
              asNonEmptyString(row.enStreetNumberFrom) ??
              asNonEmptyString(row.zhHantStreetNumberFrom),
            streetName:
              asNonEmptyString(row.enStreetName) ??
              asNonEmptyString(row.zhHantStreetName),
            villageName: null,
            dataOwner: 'hkgov-als',
            rawPayloadJson: stableJsonStringify(row),
          })

          hkgovSourceI18nRows.push(
            ...i18n.map(localized => ({
              releaseId,
              sourceRecordId: normalized.sourceId,
              locale: localized.locale,
              formattedAddress: localized.formattedAddress,
              buildingName: localized.buildingName,
              buildingNumberFrom: localized.buildingNumberFrom,
              buildingNumberTo: localized.buildingNumberTo,
              blockType: localized.blockType,
              blockNumber: localized.blockNumber,
              blockTypeBeforeNumber: localized.blockTypeBeforeNumber,
              phaseName: localized.phaseName,
              phaseNumber: localized.phaseNumber,
              estateName: localized.estateName,
              streetNumber: localized.streetNumber,
              streetName: localized.streetName,
              villageName: null,
              districtName:
                localized.locale === 'zh-hant'
                  ? asNonEmptyString(row.zhHantDistrict)
                  : asNonEmptyString(row.enDistrict),
            })),
          )
        }
      }

      if (matchedCurrent?.versionHash === versionHash) {
        unchangedRows += 1
        await insertAddressVersionRows(
          metaDb,
          historyDb,
          message,
          {
            ...base,
            updatedAt: new Date().toISOString(),
          },
          i18n,
          versionHash,
          new Date().toISOString(),
          environment,
        )
        continue
      }

      if (matchedCurrent) {
        await closeCurrentAddressVersion(
          historyDb,
          matchedCurrent.id,
          releaseSet.id,
          message.snapshotMonth,
        )
      }

      insertedVersions += 1

      const now = new Date().toISOString()
      await upsertAddressCurrentState(
        currentDb,
        {
          ...base,
          createdAt: matchedCurrent ? now : now,
          updatedAt: now,
        },
        i18n,
      )
      await insertAddressVersionRows(
        metaDb,
        historyDb,
        message,
        { ...base, createdAt: now, updatedAt: now },
        i18n,
        versionHash,
        now,
        environment,
      )
    }

    if (!sourceDb) {
      continue
    }

    if (message.source === 'overture') {
      await insertSourceOvertureAddresses2d(sourceDb, overtureSourceRows)
      await insertSourceOvertureAddress2dI18n(sourceDb, overtureSourceI18nRows)
    } else {
      await insertSourceHkgovAlsAddresses2d(sourceDb, hkgovSourceRows)
      await insertSourceHkgovAlsAddress2dI18n(sourceDb, hkgovSourceI18nRows)
    }
  }

  const deletedRows =
    message.source === 'overture'
      ? await deleteMissingCurrentAddresses(
          currentDb,
          historyDb,
          releaseSet.id,
          message.snapshotMonth,
          currentRows,
          seenIds,
        )
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

function resolveShardEnvironment(): 'preview' | 'production' {
  const baseUrl = process.env.HARBOUR_BASE_URL ?? ''
  return /production/i.test(baseUrl) ? 'production' : 'preview'
}

async function loadDivisionLookupMaps(db: CurrentDatabase) {
  const rows = (await db
    .select({
      id: currentSchema.divisions.id,
      level: currentSchema.divisions.level,
      type: currentSchema.divisions.type,
      locale: currentSchema.divisionsI18n.locale,
      otName: currentSchema.divisionsI18n.otName,
    })
    .from(currentSchema.divisions)
    .innerJoin(
      currentSchema.divisionsI18n,
      eq(currentSchema.divisions.id, currentSchema.divisionsI18n.divisionId),
    )
    .where(eq(currentSchema.divisionsI18n.locale, 'en'))
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
      streetNumber: otNumber,
      streetName: otStreet,
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
      geometry: parsePointGeometry(row.geometry),
      identifiers: null,
      otBbox: row.bbox ?? null,
      sources: {
        overture: pruneEmptyValues(row.sources),
      },
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
      geometry: parseOptionalJson(row.geometryJson),
      identifiers: parseOptionalJson(row.identifiersJson),
      otBbox: null,
      sources: parseOptionalJson(row.sourcesJson),
      createdAt: '',
      updatedAt: '',
    } satisfies Omit<AddressRow, 'id'>,
    i18n,
  }
}

function buildAddressBaseHashInput(
  base: Omit<AddressRow, 'createdAt' | 'updatedAt'> | AddressRow,
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
    otBbox: base.otBbox,
    sources: base.sources,
  } satisfies Omit<AddressRow, 'createdAt' | 'updatedAt'>
}

function normalizeAddressI18nSnapshotRow(row: AddressI18nPayload) {
  return row
}

function buildMatchKey(input: {
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

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asOptionalInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}
