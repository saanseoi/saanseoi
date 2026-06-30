import type { DatasetProcessingMessage } from '@repo/core'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
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
  const normalizedRows = dedupeNormalizedAddressRows(artifact.rows)
  const currentAddressLookup = await getCurrentAddressVersionLookup(
    historyRepoDb,
    message.regionCode,
    normalizedRows.map(row => row.sourceId),
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
  const resolvedRows: ResolvedAddressChunkArtifact['rows'] = []
  let insertedVersions = 0
  let unchangedRows = 0
  let localizedRows = 0

  for (const row of normalizedRows) {
    const matchedCurrent =
      currentAddressLookup.byId.get(row.sourceId) ??
      (row.matchKey ? currentAddressLookup.byMatchKey.get(row.matchKey) : null) ??
      null
    const addressId = matchedCurrent?.id ?? row.sourceId
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

    localizedRows += i18n.length

    if (!changed) {
      unchangedRows += 1
      resolvedRows.push({
        addressId,
        base,
        changed: false,
        changedExistingId: null,
        i18n,
        sourceId: row.sourceId,
        versionHash,
      })
      continue
    }

    if (matchedCurrent) {
      changedExistingIds.add(matchedCurrent.id)
    }

    insertedVersions += 1
    changedVersionRows.push({
      ...base,
      versionHash,
    })
    changedI18nVersionRows.push(
      ...i18n.map(localized => ({
        ...localized,
        sourceReleaseId: versionInsertContext.releaseId,
        validFromSnapshotId: versionInsertContext.snapshotId,
        validToSnapshotId: null,
        isCurrent: true,
        versionHash,
      })),
    )
    resolvedRows.push({
      addressId,
      base,
      changed: true,
      changedExistingId: matchedCurrent?.id ?? null,
      i18n,
      sourceId: row.sourceId,
      versionHash,
    })
  }

  const uniqueResolvedRows = [
    ...new Map(resolvedRows.map(row => [row.addressId, row])).values(),
  ]

  if (changedExistingIds.size > 0) {
    await closeCurrentAddressVersions(
      historyRepoDb,
      [...changedExistingIds],
      versionInsertContext.snapshotId,
      message.cohortKey,
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
    kind: 'address.resolved.v1',
    insertedVersions,
    localizedRows,
    processingRunStartedAt: artifact.processingRunStartedAt,
    releaseId: artifact.releaseId,
    rowStart: artifact.rowStart,
    rowEnd: artifact.rowEnd,
    rows: uniqueResolvedRows,
    totalRows: artifact.totalRows,
    unchangedRows,
  })

  return {
    ...pipelineMessage,
    addressStage: 'current',
    resolvedArtifactKey,
  } satisfies AddressPipelineMessage
}
