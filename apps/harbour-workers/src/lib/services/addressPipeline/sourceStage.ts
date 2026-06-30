import type { DatasetProcessingMessage } from '@repo/core'
import type { sourceSchema, SourceDatabase } from '@repo/db'

import {
  advanceSourceHkgovAlsAddress2dRelease,
  advanceSourceOvertureAddress2dRelease,
  buildSourceDatasetId,
  buildSourceReleaseId,
  closeSourceHkgovAlsAddress2dVersions,
  closeSourceOvertureAddress2dVersions,
  getCurrentSourceHkgovAlsAddress2dRecords,
  getCurrentSourceOvertureAddress2dRecords,
  insertSourceHkgovAlsAddress2dI18nVersions,
  insertSourceHkgovAlsAddresses2dVersions,
  insertSourceOvertureAddress2dI18nVersions,
  insertSourceOvertureAddresses2dVersions,
  replaceSourceHkgovAlsAddress2dI18nRows,
  replaceSourceOvertureAddress2dI18nRows,
  upsertSourceHkgovAlsAddresses2d,
  upsertSourceOvertureAddresses2d,
} from '../../db/source'
import type { HarbourWorkerBucket } from '../division'
import { type PipelineArtifactBucket, readJsonArtifact } from '../pipelineArtifacts'
import { asOptionalInteger } from './normalization'
import type {
  AddressPipelineMessage,
  NormalizedAddressChunkArtifact,
  NormalizedAddressRecord,
} from './types'

export async function writeAddressSourceChunkStage(
  sourceDb: SourceDatabase | undefined,
  bucket: HarbourWorkerBucket & PipelineArtifactBucket,
  message: DatasetProcessingMessage,
): Promise<AddressPipelineMessage> {
  const pipelineMessage = message as AddressPipelineMessage

  if (!pipelineMessage.artifactKey) {
    throw new Error('Missing normalized address artifact key for source stage.')
  }

  const artifact = await readJsonArtifact<NormalizedAddressChunkArtifact>(
    bucket,
    pipelineMessage.artifactKey,
  )

  if (!sourceDb) {
    return {
      ...pipelineMessage,
      addressStage: 'history',
    } satisfies AddressPipelineMessage
  }

  const uniqueRows = dedupeNormalizedRows(artifact.rows)
  const sourceRecordIds = uniqueRows.map(row => row.sourceId)
  const currentSourceRows =
    message.source === 'overture'
      ? await getCurrentSourceOvertureAddress2dRecords(sourceDb, sourceRecordIds)
      : await getCurrentSourceHkgovAlsAddress2dRecords(sourceDb, sourceRecordIds)
  const changedIds = new Set<string>()
  const unchangedIds = new Set<string>()
  const releaseId = buildSourceReleaseId(message)
  const datasetId = buildSourceDatasetId(message)

  if (message.source === 'overture') {
    const sourceRows: Array<
      typeof sourceSchema.sourceOvertureAddresses2d.$inferInsert
    > = []
    const i18nRows: Array<
      typeof sourceSchema.sourceOvertureAddress2dI18n.$inferInsert
    > = []
    const versionRows: Array<
      typeof sourceSchema.sourceOvertureAddresses2dVersions.$inferInsert
    > = []
    const i18nVersionRows: Array<
      typeof sourceSchema.sourceOvertureAddress2dI18nVersions.$inferInsert
    > = []

    for (const row of uniqueRows) {
      const currentSource = currentSourceRows.get(row.sourceId) ?? null

      if (currentSource?.sourcePayloadHash === row.sourcePayloadHash) {
        unchangedIds.add(row.sourceId)
        continue
      }

      changedIds.add(row.sourceId)
      sourceRows.push({
        releaseId,
        datasetId,
        sourceRecordId: row.sourceId,
        sourcePayloadHash: row.sourcePayloadHash,
        regionCode: message.regionCode,
        version: asOptionalInteger(row.raw.version),
        geometry: row.base.geometry,
        bbox: row.base.bbox,
        streetName:
          row.i18n.find(localized => localized.locale === 'en')?.streetName ?? null,
        streetNumber:
          row.i18n.find(localized => localized.locale === 'en')?.streetNumber ?? null,
        sources: row.base.sources,
        rawProperties: row.raw,
      })
      i18nRows.push(
        ...row.i18n.map(localized => ({
          releaseId,
          sourceRecordId: row.sourceId,
          locale: localized.locale,
          streetName: localized.streetName,
          locality: null,
          region: null,
          country: null,
        })),
      )
      versionRows.push({
        sourceRecordId: row.sourceId,
        versionHash: row.sourcePayloadHash,
        releaseId,
        validFromRelease: message.sourceVersion,
        validToRelease: null,
        isCurrent: true,
        regionCode: message.regionCode,
        version: asOptionalInteger(row.raw.version),
        geometry: row.base.geometry,
        bbox: row.base.bbox,
        streetName:
          row.i18n.find(localized => localized.locale === 'en')?.streetName ?? null,
        streetNumber:
          row.i18n.find(localized => localized.locale === 'en')?.streetNumber ?? null,
        sources: row.base.sources,
        rawProperties: row.raw,
      })
      i18nVersionRows.push(
        ...row.i18n.map(localized => ({
          sourceRecordId: row.sourceId,
          versionHash: row.sourcePayloadHash,
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
    }

    if (changedIds.size > 0) {
      await closeSourceOvertureAddress2dVersions(
        sourceDb,
        [...changedIds],
        message.sourceVersion,
      )
    }
    await upsertSourceOvertureAddresses2d(sourceDb, sourceRows)
    await advanceSourceOvertureAddress2dRelease(
      sourceDb,
      [...unchangedIds],
      releaseId,
      datasetId,
    )
    await replaceSourceOvertureAddress2dI18nRows(sourceDb, [...changedIds], i18nRows)
    await insertSourceOvertureAddresses2dVersions(sourceDb, versionRows)
    await insertSourceOvertureAddress2dI18nVersions(sourceDb, i18nVersionRows)
  } else {
    await writeHkgovSourceRows(
      sourceDb,
      message,
      uniqueRows,
      currentSourceRows,
      releaseId,
      datasetId,
      changedIds,
      unchangedIds,
    )
  }

  return {
    ...pipelineMessage,
    addressStage: 'history',
  } satisfies AddressPipelineMessage
}

async function writeHkgovSourceRows(
  sourceDb: SourceDatabase,
  message: DatasetProcessingMessage,
  uniqueRows: NormalizedAddressRecord[],
  currentSourceRows: Map<string, { sourcePayloadHash: string | null }>,
  releaseId: string,
  datasetId: string,
  changedIds: Set<string>,
  unchangedIds: Set<string>,
) {
  const sourceRows: Array<typeof sourceSchema.sourceHkgovAlsAddresses2d.$inferInsert> =
    []
  const i18nRows: Array<typeof sourceSchema.sourceHkgovAlsAddress2dI18n.$inferInsert> =
    []
  const versionRows: Array<
    typeof sourceSchema.sourceHkgovAlsAddresses2dVersions.$inferInsert
  > = []
  const i18nVersionRows: Array<
    typeof sourceSchema.sourceHkgovAlsAddress2dI18nVersions.$inferInsert
  > = []

  for (const row of uniqueRows) {
    const currentSource = currentSourceRows.get(row.sourceId) ?? null

    if (currentSource?.sourcePayloadHash === row.sourcePayloadHash) {
      unchangedIds.add(row.sourceId)
      continue
    }

    changedIds.add(row.sourceId)
    sourceRows.push({
      releaseId,
      datasetId,
      sourceRecordId: row.sourceId,
      sourcePayloadHash: row.sourcePayloadHash,
      regionCode: message.regionCode,
      geoAddress: asString(row.raw.geoAddress),
      csuId: asString(row.raw.hkgovCsuId) ?? asString(row.raw.geoAddress),
      x: asNumber(row.raw.easting),
      y: asNumber(row.raw.northing),
      geometry: row.base.geometry,
      districtCode: null,
      districtName: asString(row.raw.enDistrict) ?? asString(row.raw.zhHantDistrict),
      estateName: asString(row.raw.enEstateName) ?? asString(row.raw.zhHantEstateName),
      buildingName:
        asString(row.raw.enBuildingName) ?? asString(row.raw.zhHantBuildingName),
      blockNumber: null,
      blockDescriptor: null,
      phaseName: null,
      phaseNumber: null,
      floor: null,
      unit: null,
      streetNumber:
        asString(row.raw.enStreetNumberFrom) ??
        asString(row.raw.zhHantStreetNumberFrom),
      streetName: asString(row.raw.enStreetName) ?? asString(row.raw.zhHantStreetName),
      villageName: null,
      dataOwner: 'hkgov-als',
      rawPayload: row.raw,
    })
    i18nRows.push(
      ...row.i18n.map(localized => ({
        releaseId,
        sourceRecordId: row.sourceId,
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
            ? asString(row.raw.zhHantDistrict)
            : asString(row.raw.enDistrict),
      })),
    )
    versionRows.push({
      ...sourceRows.at(-1),
      validFromRelease: message.sourceVersion,
      validToRelease: null,
      isCurrent: true,
      versionHash: row.sourcePayloadHash,
    } as typeof sourceSchema.sourceHkgovAlsAddresses2dVersions.$inferInsert)
    i18nVersionRows.push(
      ...i18nRows
        .filter(localized => localized.sourceRecordId === row.sourceId)
        .map(localized => ({
          ...localized,
          versionHash: row.sourcePayloadHash,
          validFromRelease: message.sourceVersion,
          validToRelease: null,
          isCurrent: true,
        })),
    )
  }

  if (changedIds.size > 0) {
    await closeSourceHkgovAlsAddress2dVersions(
      sourceDb,
      [...changedIds],
      message.sourceVersion,
    )
  }
  await upsertSourceHkgovAlsAddresses2d(sourceDb, sourceRows)
  await advanceSourceHkgovAlsAddress2dRelease(
    sourceDb,
    [...unchangedIds],
    releaseId,
    datasetId,
  )
  await replaceSourceHkgovAlsAddress2dI18nRows(sourceDb, [...changedIds], i18nRows)
  await insertSourceHkgovAlsAddresses2dVersions(sourceDb, versionRows)
  await insertSourceHkgovAlsAddress2dI18nVersions(sourceDb, i18nVersionRows)
}

function dedupeNormalizedRows(rows: NormalizedAddressRecord[]) {
  return [...new Map(rows.map(row => [row.sourceId, row])).values()]
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
