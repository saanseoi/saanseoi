import type { DatasetProcessingMessage } from '../../../types'
import type { sourceSchema, SourceDatabase } from '@repo/db'

import {
  advanceSourceHkgovAlsAddress2dRelease,
  buildSourceReleaseId,
  closeSourceHkgovAlsAddress2dVersions,
  getCurrentSourceHkgovAlsAddress2dRecords,
  insertSourceHkgovAlsAddress2dI18nVersions,
  insertSourceHkgovAlsAddresses2dVersions,
} from '../../db/source'
import type { HarbourWorkerBucket } from '../division'
import { type PipelineArtefactBucket, readJsonArtefact } from '../pipelineArtefacts'
import { dedupeNormalisedAddressRows } from './normalisation'
import type {
  AddressPipelineMessage,
  NormalisedAddressChunkArtefact,
  NormalisedAddressRecord,
} from './types'

export async function writeAddressSourceChunkStage(
  sourceDb: SourceDatabase | undefined,
  bucket: HarbourWorkerBucket & PipelineArtefactBucket,
  message: DatasetProcessingMessage,
): Promise<AddressPipelineMessage> {
  const pipelineMessage = message as AddressPipelineMessage

  if (!pipelineMessage.artefactKey) {
    throw new Error('Missing normalised address artefact key for source stage.')
  }

  const artefact = await readJsonArtefact<NormalisedAddressChunkArtefact>(
    bucket,
    pipelineMessage.artefactKey,
  )

  if (!sourceDb) {
    throw new Error(
      `Missing source database binding for address source stage: source=${message.source}, region=${message.regionCode}, shardYear=${message.shardYear ?? 'unset'}, cohortKey=${message.cohortKey}.`,
    )
  }

  const uniqueRows = dedupeNormalisedAddressRows(artefact.rows)
  const sourceRecordIds = uniqueRows.map(row => row.sourceId)
  const currentSourceRows = await getCurrentSourceHkgovAlsAddress2dRecords(
    sourceDb,
    sourceRecordIds,
  )
  const changedIds = new Set<string>()
  const unchangedIds = new Set<string>()
  const releaseId = buildSourceReleaseId(message)

  await writeHkgovSourceRows(
    sourceDb,
    message,
    uniqueRows,
    currentSourceRows,
    releaseId,
    changedIds,
    unchangedIds,
  )

  return {
    ...pipelineMessage,
    addressStage: 'history',
  } satisfies AddressPipelineMessage
}

async function writeHkgovSourceRows(
  sourceDb: SourceDatabase,
  message: DatasetProcessingMessage,
  uniqueRows: NormalisedAddressRecord[],
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
      blockNumber:
        asString(row.raw.enBlockNumber) ?? asString(row.raw.zhHantBlockNumber),
      blockDescriptor:
        asString(row.raw.enBlockDescriptor) ?? asString(row.raw.zhHantBlockDescriptor),
      phaseName: null,
      phaseNumber: null,
      floor: null,
      unit: null,
      streetNumber:
        asString(row.raw.enStreetNumberFrom) ??
        asString(row.raw.zhHantStreetNumberFrom),
      streetName: asString(row.raw.enStreetName) ?? asString(row.raw.zhHantStreetName),
      villageName:
        asString(row.raw.enVillageName) ?? asString(row.raw.zhHantVillageName),
      sources: row.base.sources ?? { hkgovAls: [{ dataset: 'hkgov-dpo' }] },
      rawProperties: row.raw,
    } satisfies typeof sourceSchema.sourceHkgovAlsAddresses2d.$inferInsert

    versionRows.push(hkgovSourceRow)
    i18nVersionRows.push(
      ...row.i18n.map(localised => ({
        releaseId,
        sourceRecordId: row.sourceId,
        versionHash: row.sourcePayloadHash,
        validFromRelease: message.sourceVersion,
        validToRelease: null,
        isCurrent: true,
        locale: localised.locale,
        formattedAddress: localised.formattedAddress,
        buildingName: localised.buildingName,
        buildingNumberFrom: localised.buildingNumberFrom,
        buildingNumberTo: localised.buildingNumberTo,
        blockType: localised.blockType,
        blockNumber: localised.blockNumber,
        blockTypeBeforeNumber: localised.blockTypeBeforeNumber,
        phaseName: localised.phaseName,
        phaseNumber: localised.phaseNumber,
        estateName: localised.estateName,
        streetNumber: localised.streetNumber,
        streetName: localised.streetName,
        villageName:
          localised.locale === 'zh-hant'
            ? asString(row.raw.zhHantVillageName)
            : asString(row.raw.enVillageName),
        districtName:
          localised.locale === 'zh-hant'
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
