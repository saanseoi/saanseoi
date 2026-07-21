import type { DatasetProcessingMessage } from '../../../types'
import type { HarbourReadableDb, HarbourWritableDb } from '../../../lib/db/types'
import { resolveLatestPublishedSnapshotForLineage } from '../../../lib/db/metaRegistry'
import type { HistoryDatabase, MetaDatabase } from '@repo/db'

import {
  closeCurrentAddressVersions,
  getMergedCurrentAddressVersionLookup,
  insertAddressVersionRows,
  prepareAddressVersionInsertContext,
} from '../../db/address'
import { createHash } from '../../utils'
import { resolveDataShardEnvironment } from '../shared'
import type { HarbourWorkerBucket } from '../division'
import {
  buildPipelineArtefactKey,
  type PipelineArtefactBucket,
  readJsonArtefact,
  writeJsonArtefact,
} from '../pipelineArtefacts'
import {
  buildAddressBaseHashInput,
  buildAddressI18nHashInput,
  buildMatchKey,
  dedupeAddressI18nRows,
  dedupeNormalisedAddressRows,
  normaliseAddressI18nSnapshotRow,
} from './normalisation'
import type {
  AddressPipelineMessage,
  NormalisedAddressChunkArtefact,
  ResolvedAddressChunkArtefact,
} from './types'

export async function writeAddressHistoryChunkStage(
  metaDb: MetaDatabase,
  historyDb: HistoryDatabase,
  bucket: HarbourWorkerBucket & PipelineArtefactBucket,
  message: DatasetProcessingMessage,
): Promise<AddressPipelineMessage> {
  const {
    changedExistingIds,
    changedI18nVersionRows,
    changedVersionRows,
    artefact,
    versionInsertContext,
  } = await buildResolvedAddressChunkArtefact(metaDb, historyDb, bucket, message)
  const historyRepoDb = historyDb as unknown as HarbourReadableDb & HarbourWritableDb

  if (changedExistingIds.size > 0) {
    await closeCurrentAddressVersions(
      historyRepoDb,
      [...changedExistingIds],
      versionInsertContext.snapshotId,
      message.cohortKey,
      versionInsertContext.releaseId,
    )
  }
  await insertAddressVersionRows(
    historyRepoDb,
    versionInsertContext,
    changedVersionRows,
    changedI18nVersionRows,
  )

  const resolvedArtefactKey = buildPipelineArtefactKey(
    message,
    'resolved',
    artefact.rowStart,
    artefact.rowEnd,
  )

  await writeJsonArtefact<ResolvedAddressChunkArtefact>(bucket, resolvedArtefactKey, {
    ...artefact,
    rows: artefact.rows,
  })

  return {
    ...(message as AddressPipelineMessage),
    addressStage: 'current',
    resolvedArtefactKey,
  } satisfies AddressPipelineMessage
}

export async function buildResolvedAddressChunkArtefact(
  metaDb: MetaDatabase,
  historyDb: HistoryDatabase,
  bucket: HarbourWorkerBucket & PipelineArtefactBucket,
  message: DatasetProcessingMessage,
  options: {
    previousHistoryDbs?: HistoryDatabase[]
  } = {},
) {
  const pipelineMessage = message as AddressPipelineMessage

  if (!pipelineMessage.artefactKey) {
    throw new Error('Missing normalised address artefact key for history stage.')
  }

  const artefact = await readJsonArtefact<NormalisedAddressChunkArtefact>(
    bucket,
    pipelineMessage.artefactKey,
  )
  const metaRepoDb = metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  const historyRepoDb = historyDb as unknown as HarbourReadableDb & HarbourWritableDb
  const versionInsertContext = await prepareAddressVersionInsertContext(
    metaRepoDb,
    message,
    resolveDataShardEnvironment(process.env.DATA_SHARD_ENV),
  )
  const activeSnapshot = await resolveLatestPublishedSnapshotForLineage(
    metaRepoDb,
    versionInsertContext.snapshotLineageId,
  )
  if (
    versionInsertContext.parentSnapshotId &&
    activeSnapshot?.id !== versionInsertContext.parentSnapshotId
  ) {
    throw new Error(
      `Address snapshot ${versionInsertContext.snapshotId} branches from ${versionInsertContext.parentSnapshotId}, but the v0 address diff reader can only materialise active parent ${activeSnapshot?.id ?? 'none'}.`,
    )
  }
  const normalisedRows = dedupeNormalisedAddressRows(artefact.rows)
  const currentAddressLookup = pipelineMessage.addressCurrentLookupCache
    ? buildCurrentAddressLookupFromCache(pipelineMessage.addressCurrentLookupCache)
    : await getMergedCurrentAddressVersionLookup(
        [
          ...(options.previousHistoryDbs ?? []).map((db, index) => ({
            db,
            sortOrder: index,
          })),
          {
            db: historyRepoDb,
            sortOrder: options.previousHistoryDbs?.length ?? 0,
          },
        ],
        normalisedRows.map(row => row.canonicalId),
        normalisedRows.map(row => {
          const englishI18n = row.i18n.find(localised => localised.locale === 'en')

          return {
            districtId: row.base.districtId,
            streetNumber: englishI18n?.streetNumber ?? null,
            streetName: englishI18n?.streetName ?? null,
          }
        }),
        {
          buildAddressBaseHashInput,
          buildMatchKey,
          normaliseAddressI18nSnapshotRow,
        },
      )
  const changedExistingIds = new Set<string>()
  const changedVersionRows: Parameters<typeof insertAddressVersionRows>[2] = []
  const changedI18nVersionRows: Parameters<typeof insertAddressVersionRows>[3] = []
  const resolvedRowsByAddressId = new Map<
    string,
    ResolvedAddressChunkArtefact['rows'][number]
  >()

  for (const row of normalisedRows) {
    const matchedCurrent =
      currentAddressLookup.byId.get(row.canonicalId) ??
      (row.matchKey ? currentAddressLookup.byMatchKey.get(row.matchKey) : null) ??
      null
    const addressId = matchedCurrent?.id ?? row.canonicalId
    const now = artefact.processingRunStartedAt
    const base = {
      ...row.base,
      id: addressId,
      snapshotId: versionInsertContext.snapshotId,
      createdAt: now,
      updatedAt: now,
    }
    const i18n = dedupeAddressI18nRows(
      row.i18n.map(localised => ({
        ...localised,
        addressId,
        snapshotId: versionInsertContext.snapshotId,
        createdAt: now,
        updatedAt: now,
      })),
      addressId,
    )
    const versionHash = await createHash({
      base: buildAddressBaseHashInput(base),
      i18n: i18n
        .map(buildAddressI18nHashInput)
        .sort((left, right) => left.locale.localeCompare(right.locale)),
    })
    const changed = matchedCurrent?.churnHash !== versionHash

    resolvedRowsByAddressId.set(addressId, {
      addressId,
      base,
      changed,
      changedExistingId: changed ? (matchedCurrent?.id ?? null) : null,
      coverageComponents: row.coverageComponents,
      i18n,
      sourceId: row.sourceId,
      versionHash,
    })
  }

  const resolvedRows = [...resolvedRowsByAddressId.values()]
  let insertedVersions = 0
  let addedRows = 0
  let changedRows = 0
  let unchangedRows = 0
  let localisedRows = 0

  for (const row of resolvedRows) {
    localisedRows += row.i18n.length

    if (!row.changed) {
      unchangedRows += 1
      continue
    }

    if (row.changedExistingId) {
      changedExistingIds.add(row.changedExistingId)
      changedRows += 1
    } else {
      addedRows += 1
    }

    insertedVersions += 1
    changedVersionRows.push({
      ...row.base,
      versionHash: row.versionHash,
    })
    changedI18nVersionRows.push(
      ...row.i18n.map(localised => ({
        addressId: localised.addressId,
        locale: localised.locale,
        formattedAddress: localised.formattedAddress,
        buildingName: localised.buildingName ?? null,
        buildingNumberFrom: localised.buildingNumberFrom ?? null,
        buildingNumberTo: localised.buildingNumberTo ?? null,
        blockType: localised.blockType ?? null,
        blockNumber: localised.blockNumber ?? null,
        blockTypeBeforeNumber: localised.blockTypeBeforeNumber ?? null,
        phaseName: localised.phaseName ?? null,
        phaseNumber: localised.phaseNumber ?? null,
        estateName: localised.estateName ?? null,
        streetNumber: localised.streetNumber ?? null,
        streetName: localised.streetName ?? null,
        sourceReleaseId: versionInsertContext.releaseId,
        snapshotId: localised.snapshotId ?? row.base.snapshotId,
        isCurrent: true,
        versionHash: row.versionHash,
        createdAt: localised.createdAt ?? row.base.createdAt,
        updatedAt: localised.updatedAt ?? row.base.updatedAt,
      })),
    )
  }

  return {
    changedExistingIds,
    changedI18nVersionRows,
    changedVersionRows,
    versionInsertContext,
    artefact: {
      addedRows,
      changedRows,
      kind: 'address.resolved.v1',
      insertedVersions,
      localisedRows,
      processingRunStartedAt: artefact.processingRunStartedAt,
      releaseId: artefact.releaseId,
      rowStart: artefact.rowStart,
      rowEnd: artefact.rowEnd,
      rows: resolvedRows,
      totalRows: artefact.totalRows,
      unchangedRows,
    } satisfies ResolvedAddressChunkArtefact,
  }
}

function buildCurrentAddressLookupFromCache(
  cache: NonNullable<AddressPipelineMessage['addressCurrentLookupCache']>,
) {
  return {
    byId: cache.byId,
    byMatchKey: cache.byMatchKey,
  }
}
