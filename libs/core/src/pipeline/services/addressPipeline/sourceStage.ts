import type { DatasetProcessingMessage } from '../../../types'
import type { sourceSchema, SourceDatabase } from '@repo/db'

import {
  advanceSourceHkgovAlsAddress2dRelease,
  advanceSourceOvertureAddress2dRelease,
  buildSourceReleaseId,
  closeSourceHkgovAlsAddress2dVersions,
  closeSourceOvertureAddress2dVersions,
  getCurrentSourceHkgovAlsAddress2dRecords,
  getCurrentSourceOvertureAddress2dRecords,
  insertSourceHkgovAlsAddress2dI18nVersions,
  insertSourceHkgovAlsAddresses2dVersions,
  insertSourceOvertureAddresses2dVersions,
} from '../../db/source'
import type { HarbourWorkerBucket } from '../division'
import { type PipelineArtifactBucket, readJsonArtifact } from '../pipelineArtifacts'
import { asOptionalInteger, dedupeNormalizedAddressRows } from './normalization'
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
    throw new Error(
      `Missing source database binding for address source stage: source=${message.source}, region=${message.regionCode}, shardYear=${message.shardYear ?? 'unset'}, cohortKey=${message.cohortKey}.`,
    )
  }

  const uniqueRows = dedupeNormalizedAddressRows(artifact.rows)
  const sourceRecordIds = uniqueRows.map(row => row.sourceId)
  const currentSourceRows =
    message.source === 'overture'
      ? await getCurrentSourceOvertureAddress2dRecords(sourceDb, sourceRecordIds)
      : await getCurrentSourceHkgovAlsAddress2dRecords(sourceDb, sourceRecordIds)
  const changedIds = new Set<string>()
  const unchangedIds = new Set<string>()
  const releaseId = buildSourceReleaseId(message)

  if (message.source === 'overture') {
    const versionRows: Array<
      typeof sourceSchema.sourceOvertureAddresses2d.$inferInsert
    > = []

    for (const row of uniqueRows) {
      const currentSource = currentSourceRows.get(row.sourceId) ?? null
      const en = row.i18n.find(localized => localized.locale === 'en') ?? null
      const overtureSource = row.source.overture

      if (currentSource?.sourcePayloadHash === row.sourcePayloadHash) {
        unchangedIds.add(row.sourceId)
        continue
      }

      changedIds.add(row.sourceId)
      versionRows.push({
        sourceRecordId: row.sourceId,
        versionHash: row.sourcePayloadHash,
        releaseId,
        validFromRelease: message.sourceVersion,
        validToRelease: null,
        isCurrent: true,
        version: asOptionalInteger(row.raw.version),
        geometry: row.base.geometry,
        bbox: row.base.bbox,
        area: overtureSource?.area ?? null,
        district: overtureSource?.district ?? null,
        unit: overtureSource?.unit ?? null,
        streetName: en?.streetName ?? null,
        streetNumber: en?.streetNumber ?? null,
        sources: row.base.sources,
        rawProperties: row.raw,
      })
    }

    if (changedIds.size > 0) {
      await closeSourceOvertureAddress2dVersions(
        sourceDb,
        [...changedIds],
        message.sourceVersion,
      )
    }
    await advanceSourceOvertureAddress2dRelease(sourceDb, [...unchangedIds], releaseId)
    await insertSourceOvertureAddresses2dVersions(sourceDb, versionRows)
  } else {
    await writeHkgovSourceRows(
      sourceDb,
      message,
      uniqueRows,
      currentSourceRows,
      releaseId,
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
  changedIds: Set<string>,
  unchangedIds: Set<string>,
) {
  const versionRows: Array<typeof sourceSchema.sourceHkgovAlsAddresses2d.$inferInsert> =
    []
  const i18nVersionRows: Array<
    typeof sourceSchema.sourceHkgovAlsAddress2dI18n.$inferInsert
  > = []

  for (const row of uniqueRows) {
    const currentSource = currentSourceRows.get(row.sourceId) ?? null

    if (currentSource?.sourcePayloadHash === row.sourcePayloadHash) {
      unchangedIds.add(row.sourceId)
      continue
    }

    changedIds.add(row.sourceId)
    const hkgovSourceRow = {
      sourceRecordId: row.sourceId,
      versionHash: row.sourcePayloadHash,
      releaseId,
      validFromRelease: message.sourceVersion,
      validToRelease: null,
      isCurrent: true,
      identifiers: {
        geoAddress: asString(row.raw.geoAddress),
        csuId: asString(row.raw.hkgovCsuId) ?? asString(row.raw.geoAddress),
      },
      easting: asNumber(row.raw.easting),
      northing: asNumber(row.raw.northing),
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
      sources: row.base.sources ?? { hkgovAls: [{ dataset: 'hkgov-dpo' }] },
      rawProperties: row.raw,
    } satisfies typeof sourceSchema.sourceHkgovAlsAddresses2d.$inferInsert

    versionRows.push(hkgovSourceRow)
    i18nVersionRows.push(
      ...row.i18n.map(localized => ({
        releaseId,
        sourceRecordId: row.sourceId,
        versionHash: row.sourcePayloadHash,
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
            ? asString(row.raw.zhHantDistrict)
            : asString(row.raw.enDistrict),
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
  await advanceSourceHkgovAlsAddress2dRelease(sourceDb, [...unchangedIds], releaseId)
  await insertSourceHkgovAlsAddresses2dVersions(sourceDb, versionRows)
  await insertSourceHkgovAlsAddress2dI18nVersions(sourceDb, i18nVersionRows)
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
