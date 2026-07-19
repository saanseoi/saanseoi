import type { DatasetProcessingMessage } from '../../../types'
import type { HarbourReadableDb, HarbourWritableDb } from '../../../lib/db/types'
import { resolveLatestPublishedSnapshotForLineage } from '../../../lib/db/metaRegistry'
import type { HistoryDatabase, MetaDatabase } from '@repo/db'

import {
  closeCurrentAddressVersions,
  getCurrentAddressVersionLookup,
  insertAddressVersionRows,
  prepareAddressVersionInsertContext,
} from '../../db/address'
import { createHash } from '../../utils'
import { resolveDataShardEnvironment } from '../shared'
import type { HarbourWorkerBucket } from '../division'
import {
  buildPipelineArtifactKey,
  type PipelineArtifactBucket,
  readJsonArtifact,
  writeJsonArtifact,
} from '../pipelineArtifacts'
import {
  buildAddressBaseHashInput,
  buildAddressI18nHashInput,
  buildMatchKey,
  dedupeAddressI18nRows,
  dedupeNormalizedAddressRows,
  normalizeAddressI18nSnapshotRow,
} from './normalization'
import type {
  AddressPipelineMessage,
  NormalizedAddressChunkArtifact,
  ResolvedAddressChunkArtifact,
} from './types'

export async function writeAddressHistoryChunkStage(
  metaDb: MetaDatabase,
  historyDb: HistoryDatabase,
  bucket: HarbourWorkerBucket & PipelineArtifactBucket,
  message: DatasetProcessingMessage,
): Promise<AddressPipelineMessage> {
  const {
    changedExistingIds,
    changedI18nVersionRows,
    changedVersionRows,
    artifact,
    versionInsertContext,
  } = await buildResolvedAddressChunkArtifact(metaDb, historyDb, bucket, message)
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

  const resolvedArtifactKey = buildPipelineArtifactKey(
    message,
    'resolved',
    artifact.rowStart,
    artifact.rowEnd,
  )

  await writeJsonArtifact<ResolvedAddressChunkArtifact>(bucket, resolvedArtifactKey, {
    ...artifact,
    rows: artifact.rows,
  })

  return {
    ...(message as AddressPipelineMessage),
    addressStage: 'current',
    resolvedArtifactKey,
  } satisfies AddressPipelineMessage
}

export async function buildResolvedAddressChunkArtifact(
  metaDb: MetaDatabase,
  historyDb: HistoryDatabase,
  bucket: HarbourWorkerBucket & PipelineArtifactBucket,
  message: DatasetProcessingMessage,
) {
  const pipelineMessage = message as AddressPipelineMessage

  if (!pipelineMessage.artifactKey) {
    throw new Error('Missing normalized address artifact key for history stage.')
  }

  const artifact = await readJsonArtifact<NormalizedAddressChunkArtifact>(
    bucket,
    pipelineMessage.artifactKey,
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
  const normalizedRows = dedupeNormalizedAddressRows(artifact.rows)
  const currentAddressLookup = pipelineMessage.addressCurrentLookupCache
    ? buildCurrentAddressLookupFromCache(pipelineMessage.addressCurrentLookupCache)
    : await getCurrentAddressVersionLookup(
        historyRepoDb,
        normalizedRows.map(row => row.canonicalId),
        normalizedRows.map(row => {
          const englishI18n = row.i18n.find(localized => localized.locale === 'en')

          return {
            districtId: row.base.districtId,
            streetNumber: englishI18n?.streetNumber ?? null,
            streetName: englishI18n?.streetName ?? null,
          }
        }),
        {
          buildAddressBaseHashInput,
          buildMatchKey,
          normalizeAddressI18nSnapshotRow,
        },
      )
  const changedExistingIds = new Set<string>()
  const changedVersionRows: Parameters<typeof insertAddressVersionRows>[2] = []
  const changedI18nVersionRows: Parameters<typeof insertAddressVersionRows>[3] = []
  const resolvedRowsByAddressId = new Map<
    string,
    ResolvedAddressChunkArtifact['rows'][number]
  >()

  for (const row of normalizedRows) {
    const matchedCurrent =
      currentAddressLookup.byId.get(row.canonicalId) ??
      (row.matchKey ? currentAddressLookup.byMatchKey.get(row.matchKey) : null) ??
      null
    const addressId = matchedCurrent?.id ?? row.canonicalId
    const now = artifact.processingRunStartedAt
    const base = {
      ...row.base,
      id: addressId,
      snapshotId: versionInsertContext.snapshotId,
      createdAt: now,
      updatedAt: now,
    }
    const i18n = dedupeAddressI18nRows(
      row.i18n.map(localized => ({
        ...localized,
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
    const changed = matchedCurrent?.versionHash !== versionHash

    resolvedRowsByAddressId.set(addressId, {
      addressId,
      base,
      changed,
      changedExistingId: changed ? (matchedCurrent?.id ?? null) : null,
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
  let localizedRows = 0

  for (const row of resolvedRows) {
    localizedRows += row.i18n.length

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
      ...row.i18n.map(localized => ({
        addressId: localized.addressId,
        locale: localized.locale,
        formattedAddress: localized.formattedAddress,
        buildingName: localized.buildingName ?? null,
        buildingNumberFrom: localized.buildingNumberFrom ?? null,
        buildingNumberTo: localized.buildingNumberTo ?? null,
        blockType: localized.blockType ?? null,
        blockNumber: localized.blockNumber ?? null,
        blockTypeBeforeNumber: localized.blockTypeBeforeNumber ?? null,
        phaseName: localized.phaseName ?? null,
        phaseNumber: localized.phaseNumber ?? null,
        estateName: localized.estateName ?? null,
        streetNumber: localized.streetNumber ?? null,
        streetName: localized.streetName ?? null,
        sourceReleaseId: versionInsertContext.releaseId,
        snapshotId: localized.snapshotId ?? row.base.snapshotId,
        isCurrent: true,
        versionHash: row.versionHash,
        createdAt: localized.createdAt ?? row.base.createdAt,
        updatedAt: localized.updatedAt ?? row.base.updatedAt,
      })),
    )
  }

  return {
    changedExistingIds,
    changedI18nVersionRows,
    changedVersionRows,
    versionInsertContext,
    artifact: {
      addedRows,
      changedRows,
      kind: 'address.resolved.v1',
      insertedVersions,
      localizedRows,
      processingRunStartedAt: artifact.processingRunStartedAt,
      releaseId: artifact.releaseId,
      rowStart: artifact.rowStart,
      rowEnd: artifact.rowEnd,
      rows: resolvedRows,
      totalRows: artifact.totalRows,
      unchangedRows,
    } satisfies ResolvedAddressChunkArtifact,
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
