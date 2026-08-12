import type { DatasetProcessingMessage } from '../../../types'
import type { sourceSchema, SourceDatabase } from '@repo/db'

import {
  advanceSourceHkgovAlsAddress2dRelease,
  buildSourceReleaseId,
  closeSourceHkgovAlsAddress2dVersions,
  getCurrentSourceHkgovAlsAddress2dRecords,
  insertSourceHkgovAlsAddresses2dVersions,
} from '../../db/source'
import type { HarbourWorkerBucket } from '../division'
import { type PipelineArtefactBucket, readJsonArtefact } from '../pipelineArtefacts'
import {
  dedupeNormalisedAddressRows,
  isUnchangedHkgovAlsSourcePayload,
} from './normalisation'
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
  currentSourceRows: Map<
    string,
    {
      rawProperties: Record<string, unknown> | null
      sourcePayloadHash: string | null
    }
  >,
  releaseId: string,
  changedIds: Set<string>,
  unchangedIds: Set<string>,
) {
  const versionRows: Array<typeof sourceSchema.sourceHkgovAlsAddresses2d.$inferInsert> =
    []
  const unchangedBySourceId = new Map(
    await Promise.all(
      uniqueRows.map(
        async row =>
          [
            row.sourceId,
            await isUnchangedHkgovAlsSourcePayload(
              currentSourceRows.get(row.sourceId),
              row.sourcePayloadHash,
            ),
          ] as const,
      ),
    ),
  )

  for (const row of uniqueRows) {
    if (unchangedBySourceId.get(row.sourceId)) {
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
      addressEn: getSourceAddress(row, 'en'),
      addressZhHant: getSourceAddress(row, 'zh-hant'),
      sources: normaliseSourceReferences(row.base.sources, row.sourceId),
      rawProperties: row.raw,
    } satisfies typeof sourceSchema.sourceHkgovAlsAddresses2d.$inferInsert

    versionRows.push(hkgovSourceRow)
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
}

function getSourceAddress(row: NormalisedAddressRecord, locale: 'en' | 'zh-hant') {
  const localised = row.i18n.find(value => value.locale === locale)
  if (!localised) return null

  const isZhHant = locale === 'zh-hant'
  return {
    formattedAddress: localised.formattedAddress,
    buildingName: localised.buildingName,
    buildingNumberExpression: localised.buildingNumberExpression,
    buildingNumberFrom: localised.buildingNumberFrom,
    buildingNumberTo: localised.buildingNumberTo,
    buildingNumberConnector: localised.buildingNumberConnector,
    blockExpression: localised.blockExpression,
    blockType: localised.blockType,
    blockRef: localised.blockRef,
    blockTypeBeforeNumber: localised.blockTypeBeforeNumber,
    phaseExpression: localised.phaseExpression,
    phaseName: localised.phaseName,
    phaseRef: localised.phaseRef,
    estateName: localised.estateName,
    streetName: localised.streetName,
    villageName: asString(row.raw[isZhHant ? 'zhHantVillageName' : 'enVillageName']),
    districtName: asString(row.raw[isZhHant ? 'zhHantDistrict' : 'enDistrict']),
  }
}

function normaliseSourceReferences(
  value: unknown,
  sourceRecordId: string,
): SourceReferences {
  const hkgovAlsReferences =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>).hkgovAls
      : null
  const references: unknown[] | null = Array.isArray(value)
    ? value
    : Array.isArray(hkgovAlsReferences)
      ? hkgovAlsReferences
      : null
  if (references?.length && references.every(hasSourceReference)) return references
  return [{ dataset: 'hkgov-dpo', sourceRecordId }]
}

type SourceReferences = NonNullable<
  typeof sourceSchema.sourceHkgovAlsAddresses2d.$inferInsert.sources
>

function hasSourceReference(value: unknown): value is SourceReferences[number] {
  if (!value || typeof value !== 'object') return false
  const dataset = (value as Record<string, unknown>).dataset
  return typeof dataset === 'string' && dataset.trim().length > 0
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
