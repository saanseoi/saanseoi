import type { DatasetProcessingMessage } from '@repo/core'
import {
  resolveLatestPublishedSnapshotForResourceType,
  resolveLatestPublishedSnapshotForResourceTypeRegion,
  resolveLatestSnapshotForResourceTypeExcludingId,
} from '@repo/core/db/metaRepository'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type {
  CurrentDatabase,
  HistoryDatabase,
  MetaDatabase,
  sourceSchema,
  SourceDatabase,
} from '@repo/db'
import type {
  AddressI18nPayload,
  AddressRow,
  NewAddressI18nRow,
} from '@repo/db/currentSchema'

import { and, eq } from 'drizzle-orm'

import { currentSchema } from '@repo/db'

import {
  alignAddressCurrentDivisionSnapshot,
  cloneAddressCurrentSnapshot,
  closeCurrentAddressVersions,
  deleteMissingCurrentAddressesByCurrentMarker,
  deleteMissingCurrentAddressesBySeenTable,
  deleteStaleAddressCurrentRows,
  dropSeenAddressIdTable,
  getCurrentAddressVersionLookup,
  hasCurrentAddressVersions,
  insertSeenAddressIds,
  insertAddressVersionRows,
  prepareAddressVersionInsertContext,
  prepareSeenAddressIdTable,
  replaceAddressCurrentI18n,
  touchAddressCurrentRows,
  upsertAddressCurrentStates,
} from '../db/address'
import {
  advanceSourceHkgovAlsAddress2dRelease,
  advanceSourceOvertureAddress2dRelease,
  buildSourceDatasetId,
  buildSourceReleaseId,
  closeSourceHkgovAlsAddress2dVersions,
  closeSourceOvertureAddress2dVersions,
  deleteMissingCurrentSourceHkgovAlsAddresses2dBySeenTable,
  deleteMissingCurrentSourceHkgovAlsAddresses2dByReleaseId,
  deleteMissingCurrentSourceOvertureAddresses2dBySeenTable,
  deleteMissingCurrentSourceOvertureAddresses2dByReleaseId,
  dropSeenSourceRecordIdTable,
  getCurrentSourceHkgovAlsAddress2dRecords,
  getCurrentSourceOvertureAddress2dRecords,
  hasCurrentSourceHkgovAlsAddress2dRecords,
  hasCurrentSourceOvertureAddress2dRecords,
  insertSeenSourceRecordIds,
  insertSourceHkgovAlsAddress2dI18nVersions,
  insertSourceHkgovAlsAddresses2dVersions,
  insertSourceOvertureAddress2dI18nVersions,
  insertSourceOvertureAddresses2dVersions,
  prepareSeenSourceRecordIdTable,
  replaceSourceHkgovAlsAddress2dI18nRows,
  replaceSourceOvertureAddress2dI18nRows,
  upsertSourceHkgovAlsAddresses2d,
  upsertSourceOvertureAddresses2d,
} from '../db/source'
import { asNonEmptyString, createHash } from '../utils'
import { createAsyncBufferFromR2, readParquetObjectsInBatches } from '../parquetR2'
import {
  createOperationTimer,
  readRuntimeMemoryUsage,
  resolveDataShardEnvironment,
  resolveDebugEnabled,
} from './shared'
import { writeAddressCurrentChunkStage } from './addressPipeline/currentStage'
import { finalizeAddressDatasetStage } from './addressPipeline/finalizeStage'
import { writeAddressHistoryChunkStage } from './addressPipeline/historyStage'
import { normalizeAddressChunkStage } from './addressPipeline/normalizeStage'
import { writeAddressSourceChunkStage } from './addressPipeline/sourceStage'
import {
  getAddressPipelineStage,
  type AddressPipelineMessage,
} from './addressPipeline/types'

import type { HarbourWorkerBucket } from './division'

type DivisionLookupMaps = {
  areaByEn: Map<string, string>
  countryId: string | null
  districtByEn: Map<string, string>
  snapshotId: string
}

export type ProcessAddressDatasetResult = {
  deletedRows: number
  deferCompletion?: boolean
  insertedVersions: number
  localizedRows: number
  nextMessage?: DatasetProcessingMessage
  processedRows: number
  statsRows: number
  unchangedRows: number
}

type ReportProgress = (stats: {
  localizedRows: number
  processedRows: number
}) => Promise<void>

const ADDRESS_BATCH_SIZE = 128
const ADDRESS_CHUNK_ROW_COUNT = 1024
const ADDRESS_PARQUET_READ_ROW_WINDOW_SIZE = 2048
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
  reportProgress?: ReportProgress,
): Promise<ProcessAddressDatasetResult> {
  switch (getAddressPipelineStage(message) as string) {
    case 'normalize': {
      const nextMessage = await processAddressChunkPipeline(
        metaDb,
        currentDb,
        bucket,
        message,
        historyDb,
        sourceDb,
        reportProgress,
      )

      if (nextMessage.addressStage === 'finalize') {
        return finalizeAddressDatasetStage(
          metaDb,
          currentDb,
          historyDb,
          sourceDb,
          nextMessage,
        )
      }

      if (message.preplannedAddressChunks) {
        return {
          deferCompletion: true,
          deletedRows: 0,
          insertedVersions: 0,
          localizedRows: 0,
          processedRows:
            nextMessage.addressStats?.processedRows ?? nextMessage.rowEnd ?? 0,
          statsRows: 0,
          unchangedRows: 0,
        }
      }

      return {
        deletedRows: 0,
        insertedVersions: 0,
        localizedRows: 0,
        nextMessage,
        processedRows: 0,
        statsRows: 0,
        unchangedRows: 0,
      }
    }
    case 'source':
      return {
        deletedRows: 0,
        insertedVersions: 0,
        localizedRows: 0,
        nextMessage: await writeAddressSourceChunkStage(sourceDb, bucket, message),
        processedRows: 0,
        statsRows: 0,
        unchangedRows: 0,
      }
    case 'history':
      return {
        deletedRows: 0,
        insertedVersions: 0,
        localizedRows: 0,
        nextMessage: await writeAddressHistoryChunkStage(
          metaDb,
          historyDb,
          bucket,
          message,
        ),
        processedRows: 0,
        statsRows: 0,
        unchangedRows: 0,
      }
    case 'current':
      return {
        deletedRows: 0,
        insertedVersions: 0,
        localizedRows: 0,
        nextMessage: await writeAddressCurrentChunkStage(
          metaDb,
          currentDb,
          bucket,
          message,
        ),
        processedRows: 0,
        statsRows: 0,
        unchangedRows: 0,
      }
    case 'finalize':
      return finalizeAddressDatasetStage(
        metaDb,
        currentDb,
        historyDb,
        sourceDb,
        message,
      )
  }

  const debugEnabled = resolveDebugEnabled(process.env.DEBUG)
  const timings = createOperationTimer(debugEnabled)
  const metaRepoDb = metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  const currentRepoDb = currentDb as unknown as HarbourReadableDb & HarbourWritableDb
  const historyRepoDb = historyDb as unknown as HarbourReadableDb & HarbourWritableDb
  const file = await timings.measure('loadParquetBufferMs', () =>
    createAsyncBufferFromR2(bucket, message.rawObjectKey),
  )
  const processingRunStartedAt =
    message.processingRunStartedAt ?? new Date().toISOString()
  const chunkSize = resolveAddressChunkSize(message.chunkSize)
  const rowStart = Math.max(0, Math.floor(message.rowStart ?? 0))
  const requestedRowEnd = Math.max(
    rowStart,
    Math.floor(message.rowEnd ?? rowStart + chunkSize),
  )
  let totalRows = Math.max(0, Math.floor(message.totalRows ?? 0))
  const environment = resolveDataShardEnvironment(process.env.DATA_SHARD_ENV)
  const versionInsertContext = await timings.measure(
    'prepareVersionInsertContextMs',
    () => prepareAddressVersionInsertContext(metaRepoDb, message, environment),
  )

  const divisionLookup = await timings.measure('loadDivisionLookupMapsMs', () =>
    loadDivisionLookupMaps(metaDb, currentDb, message.regionCode),
  )
  const previousSnapshot = await resolveLatestSnapshotForResourceTypeExcludingId(
    metaRepoDb,
    'address',
    versionInsertContext.snapshotId,
  )

  if (rowStart === 0 && previousSnapshot) {
    await timings.measure('cloneAddressCurrentSnapshotMs', () =>
      cloneAddressCurrentSnapshot(
        currentRepoDb,
        previousSnapshot.id,
        versionInsertContext.snapshotId,
        processingRunStartedAt,
      ),
    )
  }
  if (rowStart === 0) {
    await timings.measure('alignAddressCurrentDivisionSnapshotMs', () =>
      alignAddressCurrentDivisionSnapshot(
        currentRepoDb,
        versionInsertContext.snapshotId,
        divisionLookup.snapshotId,
      ),
    )
  }
  const hasCurrentAddresses = await timings.measure(
    'checkCurrentAddressVersionsMs',
    () => hasCurrentAddressVersions(historyRepoDb, message.regionCode),
  )
  const hasCurrentSourceRows = !sourceDb
    ? false
    : message.source === 'overture'
      ? await timings.measure('checkCurrentSourceRowsMs', () =>
          hasCurrentSourceOvertureAddress2dRecords(sourceDb),
        )
      : await timings.measure('checkCurrentSourceRowsMs', () =>
          hasCurrentSourceHkgovAlsAddress2dRecords(sourceDb),
        )

  const useCurrentMarkerCleanup = true
  const useSeenAddressTable =
    message.source === 'overture' && hasCurrentAddresses && !useCurrentMarkerCleanup
  const useSourceMissingCleanup = Boolean(sourceDb && hasCurrentSourceRows)
  const useSeenSourceTable = useSourceMissingCleanup && !useCurrentMarkerCleanup

  if (useSeenAddressTable) {
    await timings.measure('prepareSeenAddressIdTableMs', () =>
      prepareSeenAddressIdTable(historyRepoDb),
    )
  }
  if (sourceDb && useSeenSourceTable) {
    await timings.measure('prepareSeenSourceRecordIdTableMs', () =>
      prepareSeenSourceRecordIdTable(sourceDb),
    )
  }

  let processedRows = 0
  let insertedVersions = 0
  let unchangedRows = 0
  let localizedRows = 0

  let parquetReadWindowIndex = 0

  for await (const batch of readParquetObjectsInBatches(file, ADDRESS_BATCH_SIZE, {
    rowStart,
    rowEnd: requestedRowEnd,
    readRowWindowSize: ADDRESS_PARQUET_READ_ROW_WINDOW_SIZE,
    onMetadata(metadata) {
      totalRows = metadata.rowCount
      console.info(
        JSON.stringify({
          datasetId: message.datasetId,
          memory: readRuntimeMemoryUsage(),
          metadata,
          phase: 'addressParquetReadMetadata',
          rowEnd: Math.min(requestedRowEnd, metadata.rowCount),
          rowStart,
          releaseId: message.releaseId ?? message.datasetId,
          source: message.source,
          sourceVersion: message.sourceVersion,
          type: message.type,
        }),
      )
    },
    onReadWindow(diagnostic) {
      parquetReadWindowIndex += 1
      console.info(
        JSON.stringify({
          datasetId: message.datasetId,
          diagnostic: {
            ...diagnostic,
            readWindowIndex: parquetReadWindowIndex,
          },
          memory: readRuntimeMemoryUsage(),
          phase: 'addressParquetReadWindow',
          processedRows,
          releaseId: message.releaseId ?? message.datasetId,
          source: message.source,
          sourceVersion: message.sourceVersion,
          type: message.type,
        }),
      )
    },
  })) {
    const normalizedBatch = batch.map(row => ({
      normalized:
        message.source === 'overture'
          ? normalizeOvertureAddressRow(row, divisionLookup)
          : normalizePreparedHkgovAddressRow(row),
      row,
    }))
    const currentAddressLookup = hasCurrentAddresses
      ? await timings.measure('loadCurrentAddressBatchLookupMs', () =>
          getCurrentAddressVersionLookup(
            historyRepoDb,
            message.regionCode,
            normalizedBatch.map(({ normalized }) => normalized.sourceId),
            normalizedBatch.map(({ normalized }) => {
              const englishI18n = normalized.i18n.find(row => row.locale === 'en')

              return {
                districtId: normalized.base.districtId,
                streetNumber: englishI18n?.streetNumber ?? null,
                streetName: englishI18n?.streetName ?? null,
              }
            }),
            {
              buildAddressBaseHashInput,
              buildMatchKey,
              normalizeAddressI18nSnapshotRow,
            },
          ),
        )
      : {
          byId: new Map(),
          byMatchKey: new Map(),
        }
    const currentSourceRows =
      !sourceDb || !hasCurrentSourceRows
        ? null
        : message.source === 'overture'
          ? await timings.measure('loadCurrentSourceBatchLookupMs', () =>
              getCurrentSourceOvertureAddress2dRecords(
                sourceDb,
                normalizedBatch.map(({ normalized }) => normalized.sourceId),
              ),
            )
          : await timings.measure('loadCurrentSourceBatchLookupMs', () =>
              getCurrentSourceHkgovAlsAddress2dRecords(
                sourceDb,
                normalizedBatch.map(({ normalized }) => normalized.sourceId),
              ),
            )
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
    const overtureSourceVersionRows: Array<
      typeof sourceSchema.sourceOvertureAddresses2dVersions.$inferInsert
    > = []
    const overtureSourceI18nVersionRows: Array<
      typeof sourceSchema.sourceOvertureAddress2dI18nVersions.$inferInsert
    > = []
    const hkgovSourceVersionRows: Array<
      typeof sourceSchema.sourceHkgovAlsAddresses2dVersions.$inferInsert
    > = []
    const hkgovSourceI18nVersionRows: Array<
      typeof sourceSchema.sourceHkgovAlsAddress2dI18nVersions.$inferInsert
    > = []
    const changedAddressExistingIds = new Set<string>()
    const currentAddressRows: AddressRow[] = []
    const currentAddressI18nRowIds = new Set<string>()
    const currentAddressI18nRows: NewAddressI18nRow[] = []
    const changedAddressVersionRows: Array<
      AddressRow & {
        versionHash: string
      }
    > = []
    const changedAddressI18nVersionRows: Array<
      AddressI18nPayload & {
        sourceReleaseId: string
        snapshotId: string
        validFromSnapshotId: string
        validToSnapshotId: string | null
        isCurrent: boolean
        versionHash: string
        createdAt: string
        updatedAt: string
      }
    > = []
    const changedSourceIds = new Set<string>()
    const unchangedSourceIds = new Set<string>()
    const seenAddressIds: string[] = []
    const seenSourceRecordIds: string[] = []

    for (const { normalized, row } of normalizedBatch) {
      const matchedCurrent =
        currentAddressLookup.byId.get(normalized.sourceId) ??
        (normalized.matchKey
          ? currentAddressLookup.byMatchKey.get(normalized.matchKey)
          : null) ??
        null
      const addressId = matchedCurrent?.id ?? normalized.sourceId
      const base: AddressRow = {
        ...normalized.base,
        id: addressId,
        snapshotId: versionInsertContext.snapshotId,
      }
      const i18n = normalized.i18n.map(row => ({
        ...row,
        addressId,
        snapshotId: versionInsertContext.snapshotId,
      }))
      const versionHash = await createHash({
        base: buildAddressBaseHashInput(base),
        i18n: i18n
          .map(buildAddressI18nHashInput)
          .sort((left, right) => left.locale.localeCompare(right.locale)),
      })

      processedRows += 1
      localizedRows += i18n.length
      seenAddressIds.push(addressId)
      seenSourceRecordIds.push(normalized.sourceId)
      const now = processingRunStartedAt

      if (sourceDb) {
        const releaseId = buildSourceReleaseId(message)
        const datasetId = buildSourceDatasetId(message)
        const sourcePayloadHash = await createHash(row)
        const currentSource = currentSourceRows?.get(normalized.sourceId) ?? null

        if (message.source === 'overture') {
          if (currentSource?.sourcePayloadHash !== sourcePayloadHash) {
            changedSourceIds.add(normalized.sourceId)
            overtureSourceRows.push({
              releaseId,
              datasetId,
              sourceRecordId: normalized.sourceId,
              sourcePayloadHash,
              regionCode: message.regionCode,
              version: asOptionalInteger(row.version),
              geometry: base.geometry,
              bbox: base.bbox,
              streetName:
                i18n.find(localized => localized.locale === 'en')?.streetName ?? null,
              streetNumber:
                i18n.find(localized => localized.locale === 'en')?.streetNumber ?? null,
              sources: base.sources,
              rawProperties: row,
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
            overtureSourceVersionRows.push({
              sourceRecordId: normalized.sourceId,
              versionHash: sourcePayloadHash,
              releaseId,
              validFromRelease: message.sourceVersion,
              validToRelease: null,
              isCurrent: true,
              regionCode: message.regionCode,
              version: asOptionalInteger(row.version),
              geometry: base.geometry,
              bbox: base.bbox,
              streetName:
                i18n.find(localized => localized.locale === 'en')?.streetName ?? null,
              streetNumber:
                i18n.find(localized => localized.locale === 'en')?.streetNumber ?? null,
              sources: base.sources,
              rawProperties: row,
            })
            overtureSourceI18nVersionRows.push(
              ...i18n.map(localized => ({
                sourceRecordId: normalized.sourceId,
                versionHash: sourcePayloadHash,
                releaseId,
                validFromRelease: message.sourceVersion,
                validToRelease: null,
                isCurrent: true,
                locale: localized.locale,
                streetName: localized.streetName,
                locality: null,
                region: null,
                country: null,
              })),
            )
          } else if (currentSource) {
            unchangedSourceIds.add(normalized.sourceId)
          }
        } else {
          if (currentSource?.sourcePayloadHash !== sourcePayloadHash) {
            changedSourceIds.add(normalized.sourceId)
            hkgovSourceRows.push({
              releaseId,
              datasetId,
              sourceRecordId: normalized.sourceId,
              sourcePayloadHash,
              regionCode: message.regionCode,
              geoAddress: asNonEmptyString(row.geoAddress),
              csuId:
                asNonEmptyString(row.hkgovCsuId) ?? asNonEmptyString(row.geoAddress),
              x: asNumber(row.easting),
              y: asNumber(row.northing),
              geometry: parseOptionalJson(row.geometry),
              districtCode: null,
              districtName:
                asNonEmptyString(row.enDistrict) ??
                asNonEmptyString(row.zhHantDistrict),
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
              rawPayload: row,
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
            hkgovSourceVersionRows.push({
              sourceRecordId: normalized.sourceId,
              versionHash: sourcePayloadHash,
              releaseId,
              validFromRelease: message.sourceVersion,
              validToRelease: null,
              isCurrent: true,
              regionCode: message.regionCode,
              geoAddress: asNonEmptyString(row.geoAddress),
              csuId:
                asNonEmptyString(row.hkgovCsuId) ?? asNonEmptyString(row.geoAddress),
              x: asNumber(row.easting),
              y: asNumber(row.northing),
              geometry: parseOptionalJson(row.geometry),
              districtCode: null,
              districtName:
                asNonEmptyString(row.enDistrict) ??
                asNonEmptyString(row.zhHantDistrict),
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
              rawPayload: row,
            })
            hkgovSourceI18nVersionRows.push(
              ...i18n.map(localized => ({
                sourceRecordId: normalized.sourceId,
                versionHash: sourcePayloadHash,
                releaseId,
                validFromRelease: message.sourceVersion,
                validToRelease: null,
                isCurrent: true,
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
          } else if (currentSource) {
            unchangedSourceIds.add(normalized.sourceId)
          }
        }
      }

      if (matchedCurrent?.versionHash === versionHash) {
        unchangedRows += 1
        continue
      }

      currentAddressRows.push({
        ...base,
        createdAt: now,
        updatedAt: now,
      })
      currentAddressI18nRowIds.add(addressId)
      currentAddressI18nRows.push(
        ...i18n.map(row => ({
          ...row,
          snapshotId: versionInsertContext.snapshotId,
          createdAt: now,
          updatedAt: now,
        })),
      )

      if (matchedCurrent) {
        changedAddressExistingIds.add(matchedCurrent.id)
      }

      insertedVersions += 1
      changedAddressVersionRows.push({
        ...base,
        createdAt: now,
        updatedAt: now,
        versionHash,
      })
      changedAddressI18nVersionRows.push(
        ...i18n.map(row => ({
          ...row,
          sourceReleaseId: versionInsertContext.releaseId,
          snapshotId: versionInsertContext.snapshotId,
          validFromSnapshotId: versionInsertContext.snapshotId,
          validToSnapshotId: null,
          isCurrent: true,
          versionHash,
          createdAt: now,
          updatedAt: now,
        })),
      )
    }

    if (useSeenAddressTable) {
      await timings.measure('insertSeenAddressIdsMs', () =>
        insertSeenAddressIds(historyRepoDb, seenAddressIds),
      )
    }
    if (useCurrentMarkerCleanup) {
      await timings.measure('touchAddressCurrentRowsMs', () =>
        touchAddressCurrentRows(
          currentRepoDb,
          versionInsertContext.snapshotId,
          seenAddressIds,
          processingRunStartedAt,
        ),
      )
    }
    if (sourceDb && useSeenSourceTable) {
      await timings.measure('insertSeenSourceRecordIdsMs', () =>
        insertSeenSourceRecordIds(sourceDb, seenSourceRecordIds),
      )
    }

    await timings.measure('closeCurrentAddressVersionsMs', () =>
      closeCurrentAddressVersions(
        historyRepoDb,
        [...changedAddressExistingIds],
        versionInsertContext.snapshotId,
        message.cohortKey,
      ),
    )
    await timings.measure('upsertAddressCurrentStatesMs', () =>
      upsertAddressCurrentStates(currentRepoDb, currentAddressRows),
    )
    await timings.measure('replaceAddressCurrentI18nMs', () =>
      replaceAddressCurrentI18n(
        currentRepoDb,
        versionInsertContext.snapshotId,
        [...currentAddressI18nRowIds],
        currentAddressI18nRows,
      ),
    )
    await timings.measure('insertAddressVersionRowsMs', () =>
      insertAddressVersionRows(
        historyRepoDb,
        versionInsertContext,
        changedAddressVersionRows,
        changedAddressI18nVersionRows,
      ),
    )
    if (sourceDb) {
      const changedIds = [...changedSourceIds]
      const unchangedIds = [...unchangedSourceIds]
      const releaseId = buildSourceReleaseId(message)
      const datasetId = buildSourceDatasetId(message)

      if (message.source === 'overture') {
        if (changedIds.length > 0) {
          await timings.measure('closeSourceOvertureAddress2dVersionsMs', () =>
            closeSourceOvertureAddress2dVersions(
              sourceDb,
              changedIds,
              message.sourceVersion,
            ),
          )
        }

        await timings.measure('upsertSourceOvertureAddresses2dMs', () =>
          upsertSourceOvertureAddresses2d(sourceDb, overtureSourceRows),
        )
        await timings.measure('advanceSourceOvertureAddress2dReleaseMs', () =>
          advanceSourceOvertureAddress2dRelease(
            sourceDb,
            unchangedIds,
            releaseId,
            datasetId,
          ),
        )
        await timings.measure('replaceSourceOvertureAddress2dI18nRowsMs', () =>
          replaceSourceOvertureAddress2dI18nRows(
            sourceDb,
            changedIds,
            overtureSourceI18nRows,
          ),
        )

        await timings.measure('insertSourceOvertureAddresses2dVersionsMs', () =>
          insertSourceOvertureAddresses2dVersions(sourceDb, overtureSourceVersionRows),
        )
        await timings.measure('insertSourceOvertureAddress2dI18nVersionsMs', () =>
          insertSourceOvertureAddress2dI18nVersions(
            sourceDb,
            overtureSourceI18nVersionRows,
          ),
        )
      } else {
        if (changedIds.length > 0) {
          await timings.measure('closeSourceHkgovAlsAddress2dVersionsMs', () =>
            closeSourceHkgovAlsAddress2dVersions(
              sourceDb,
              changedIds,
              message.sourceVersion,
            ),
          )
        }

        await timings.measure('upsertSourceHkgovAlsAddresses2dMs', () =>
          upsertSourceHkgovAlsAddresses2d(sourceDb, hkgovSourceRows),
        )
        await timings.measure('advanceSourceHkgovAlsAddress2dReleaseMs', () =>
          advanceSourceHkgovAlsAddress2dRelease(
            sourceDb,
            unchangedIds,
            releaseId,
            datasetId,
          ),
        )
        await timings.measure('replaceSourceHkgovAlsAddress2dI18nRowsMs', () =>
          replaceSourceHkgovAlsAddress2dI18nRows(
            sourceDb,
            changedIds,
            hkgovSourceI18nRows,
          ),
        )

        await timings.measure('insertSourceHkgovAlsAddresses2dVersionsMs', () =>
          insertSourceHkgovAlsAddresses2dVersions(sourceDb, hkgovSourceVersionRows),
        )
        await timings.measure('insertSourceHkgovAlsAddress2dI18nVersionsMs', () =>
          insertSourceHkgovAlsAddress2dI18nVersions(
            sourceDb,
            hkgovSourceI18nVersionRows,
          ),
        )
      }
    }

    if (reportProgress) {
      await reportProgress({
        localizedRows,
        processedRows: rowStart + processedRows,
      })
    }
  }

  const processedRowEnd = Math.min(requestedRowEnd, totalRows)
  const nextMessage =
    processedRowEnd < totalRows
      ? ({
          ...message,
          chunkSize,
          processingRunStartedAt,
          rowStart: processedRowEnd,
          rowEnd: Math.min(processedRowEnd + chunkSize, totalRows),
          totalRows,
        } satisfies DatasetProcessingMessage)
      : undefined

  let deletedRows = 0

  if (!nextMessage) {
    const cleanupResult = useCurrentMarkerCleanup
      ? await timings.measure('deleteMissingCurrentAddressesMs', () =>
          deleteMissingCurrentAddressesByCurrentMarker(
            historyRepoDb,
            currentRepoDb,
            versionInsertContext.snapshotId,
            message.cohortKey,
            processingRunStartedAt,
          ),
        )
      : useSeenAddressTable
        ? await timings.measure('deleteMissingCurrentAddressesMs', () =>
            deleteMissingCurrentAddressesBySeenTable(
              historyRepoDb,
              versionInsertContext.snapshotId,
              message.cohortKey,
              message.regionCode,
            ),
          )
        : { count: 0, missingIds: [] as string[] }

    deletedRows = cleanupResult.count

    if (!useCurrentMarkerCleanup && message.source === 'overture') {
      await timings.measure('deleteStaleAddressCurrentRowsMs', () =>
        deleteStaleAddressCurrentRows(
          currentRepoDb,
          versionInsertContext.snapshotId,
          cleanupResult.missingIds,
        ),
      )
    }

    if (sourceDb && useSourceMissingCleanup) {
      const releaseId = buildSourceReleaseId(message)

      if (message.source === 'overture') {
        await timings.measure('deleteMissingCurrentSourceOvertureAddresses2dMs', () =>
          useCurrentMarkerCleanup
            ? deleteMissingCurrentSourceOvertureAddresses2dByReleaseId(
                sourceDb,
                message.sourceVersion,
                releaseId,
              )
            : deleteMissingCurrentSourceOvertureAddresses2dBySeenTable(
                sourceDb,
                message.sourceVersion,
              ),
        )
      } else {
        await timings.measure('deleteMissingCurrentSourceHkgovAlsAddresses2dMs', () =>
          useCurrentMarkerCleanup
            ? deleteMissingCurrentSourceHkgovAlsAddresses2dByReleaseId(
                sourceDb,
                message.sourceVersion,
                releaseId,
              )
            : deleteMissingCurrentSourceHkgovAlsAddresses2dBySeenTable(
                sourceDb,
                message.sourceVersion,
              ),
        )
      }
    }

    if (useSeenAddressTable) {
      await timings.measure('dropSeenAddressIdTableMs', () =>
        dropSeenAddressIdTable(historyRepoDb),
      )
    }
    if (sourceDb && useSeenSourceTable) {
      await timings.measure('dropSeenSourceRecordIdTableMs', () =>
        dropSeenSourceRecordIdTable(sourceDb),
      )
    }
  }

  console.info(
    JSON.stringify({
      datasetId: message.datasetId,
      phase: 'processAddressDataset',
      processedRows: rowStart + processedRows,
      rowEnd: processedRowEnd,
      rowStart,
      releaseId: message.releaseId ?? message.datasetId,
      snapshotId: versionInsertContext.snapshotId,
      source: message.source,
      sourceVersion: message.sourceVersion,
      ...(debugEnabled ? { timingsMs: timings.snapshot() } : {}),
      type: message.type,
    }),
  )

  return {
    deletedRows,
    insertedVersions,
    localizedRows,
    nextMessage,
    processedRows: rowStart + processedRows,
    statsRows: 0,
    unchangedRows,
  }
}

async function processAddressChunkPipeline(
  metaDb: MetaDatabase,
  currentDb: CurrentDatabase,
  bucket: HarbourWorkerBucket,
  message: DatasetProcessingMessage,
  historyDb: HistoryDatabase,
  sourceDb: SourceDatabase | undefined,
  reportProgress?: ReportProgress,
): Promise<AddressPipelineMessage> {
  const sourceMessage = await normalizeAddressChunkStage(
    metaDb,
    currentDb,
    bucket,
    message,
    reportProgress,
  )
  const historyMessage = await writeAddressSourceChunkStage(
    sourceDb,
    bucket,
    sourceMessage,
  )
  const currentMessage = await writeAddressHistoryChunkStage(
    metaDb,
    historyDb,
    bucket,
    historyMessage,
  )

  return writeAddressCurrentChunkStage(metaDb, currentDb, bucket, currentMessage)
}

function resolveAddressChunkSize(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : ADDRESS_CHUNK_ROW_COUNT
}

async function loadDivisionLookupMaps(
  metaDb: MetaDatabase,
  db: CurrentDatabase,
  regionCode: DatasetProcessingMessage['regionCode'],
) {
  const metaReadDb = metaDb as unknown as HarbourReadableDb
  const activeDivisionSnapshot =
    await resolveLatestPublishedSnapshotForResourceTypeRegion(
      metaReadDb,
      'division',
      regionCode,
    )
  const fallbackDivisionSnapshot =
    activeDivisionSnapshot ??
    (await resolveLatestPublishedSnapshotForResourceType(metaReadDb, 'division'))

  if (!fallbackDivisionSnapshot) {
    throw new Error('Published division snapshot not found.')
  }

  const resolvedRows = await loadDivisionLookupRows(db, fallbackDivisionSnapshot.id)

  const areaByEn = new Map<string, string>()
  const districtByEn = new Map<string, string>()
  let countryId: string | null = null

  for (const row of resolvedRows) {
    const name = normalizeNameToken(row.name)

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
    snapshotId: fallbackDivisionSnapshot.id,
  } satisfies DivisionLookupMaps
}

async function loadDivisionLookupRows(db: CurrentDatabase, snapshotId: string) {
  return (await db
    .select({
      id: currentSchema.divisions.id,
      level: currentSchema.divisions.level,
      type: currentSchema.divisions.type,
      locale: currentSchema.divisionsI18n.locale,
      name: currentSchema.divisionsI18n.name,
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
    type: string
  }>
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
      createdAt: '',
      updatedAt: '',
    } satisfies Omit<AddressRow, 'id' | 'snapshotId'>,
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
      createdAt: '',
      updatedAt: '',
    } satisfies Omit<AddressRow, 'id' | 'snapshotId'>,
    i18n,
  }
}

function buildAddressBaseHashInput(
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

function normalizeAddressI18nSnapshotRow(row: AddressI18nPayload) {
  return row
}

function buildAddressI18nHashInput(
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
