import type { DatasetProcessingMessage } from '@repo/core'
import { resolveLatestSnapshotForResourceTypeExcludingId } from '@repo/core/db/metaRepository'
import type { HarbourReadableDb } from '@repo/core/db/types'
import type { CurrentDatabase, HistoryDatabase, MetaDatabase } from '@repo/db'

import type { HarbourWorkerBucket } from '../division'
import {
  buildPipelineArtifactKey,
  buildSqlPipelineArtifactKey,
  type PipelineArtifactBucket,
  readJsonArtifact,
  writeJsonArtifact,
  writeTextArtifact,
} from '../pipelineArtifacts'
import { normalizeAddressChunkStage, resolveAddressChunkSize } from './normalizeStage'
import { buildResolvedAddressChunkArtifact } from './historyStage'
import { loadDivisionLookupMaps } from './normalization'
import type {
  AddressPipelineMessage,
  NormalizedAddressChunkArtifact,
  ResolvedAddressChunkArtifact,
} from './types'
import { addAddressPipelineStats } from './types'
import {
  buildAddressResolvedSqlImportFiles,
  buildAddressSqlImportRunId,
  buildAddressSourceSqlImportFiles,
  type AddressSqlImportFile,
} from './sqlImport'

export async function normalizeAddressSqlChunkStage(
  metaDb: MetaDatabase,
  currentDb: CurrentDatabase,
  bucket: HarbourWorkerBucket & PipelineArtifactBucket,
  message: DatasetProcessingMessage,
  reportProgress?: (stats: {
    localizedRows: number
    processedRows: number
  }) => Promise<void>,
): Promise<AddressPipelineMessage> {
  const nextMessage = await normalizeAddressChunkStage(
    metaDb,
    currentDb,
    bucket,
    message,
    reportProgress,
  )

  return {
    ...nextMessage,
    addressStage: 'sql-source',
    processingMode: 'sql',
  }
}

export async function writeAddressSourceSqlChunkStage(
  bucket: HarbourWorkerBucket & PipelineArtifactBucket,
  message: DatasetProcessingMessage,
): Promise<AddressPipelineMessage> {
  const pipelineMessage = message as AddressPipelineMessage

  if (!pipelineMessage.artifactKey) {
    throw new Error('Missing normalized address artifact key for SQL source stage.')
  }

  const artifact = await readJsonArtifact<NormalizedAddressChunkArtifact>(
    bucket,
    pipelineMessage.artifactKey,
  )
  const files = buildAddressSourceSqlImportFiles(message, artifact)
  const artifactKeys = await writeSqlFiles(bucket, message, files)

  return {
    ...pipelineMessage,
    addressStage: 'sql-history',
    addressSqlArtifactKeys: [
      ...(pipelineMessage.addressSqlArtifactKeys ?? []),
      ...artifactKeys,
    ],
    processingMode: 'sql',
  } satisfies AddressPipelineMessage
}

export async function writeAddressHistorySqlChunkStage(
  metaDb: MetaDatabase,
  historyDb: HistoryDatabase,
  bucket: HarbourWorkerBucket & PipelineArtifactBucket,
  message: DatasetProcessingMessage,
): Promise<AddressPipelineMessage> {
  const pipelineMessage = message as AddressPipelineMessage
  const { artifact } = await buildResolvedAddressChunkArtifact(
    metaDb,
    historyDb,
    bucket,
    message,
  )
  const resolvedArtifactKey = buildPipelineArtifactKey(
    message,
    'resolved',
    artifact.rowStart,
    artifact.rowEnd,
  )

  await writeJsonArtifact<ResolvedAddressChunkArtifact>(
    bucket,
    resolvedArtifactKey,
    artifact,
  )

  const [historyFile] = buildAddressResolvedSqlImportFiles(message, artifact).filter(
    file => file.target === 'history',
  )
  const artifactKeys = historyFile
    ? await writeSqlFiles(bucket, message, [historyFile])
    : []

  return {
    ...pipelineMessage,
    addressStage: 'sql-current',
    addressSqlArtifactKeys: [
      ...(pipelineMessage.addressSqlArtifactKeys ?? []),
      ...artifactKeys,
    ],
    processingMode: 'sql',
    resolvedArtifactKey,
  } satisfies AddressPipelineMessage
}

export async function writeAddressCurrentSqlChunkStage(
  metaDb: MetaDatabase,
  currentDb: CurrentDatabase,
  bucket: HarbourWorkerBucket & PipelineArtifactBucket,
  message: DatasetProcessingMessage,
): Promise<AddressPipelineMessage> {
  const pipelineMessage = message as AddressPipelineMessage

  if (!pipelineMessage.resolvedArtifactKey) {
    throw new Error('Missing resolved address artifact key for SQL current stage.')
  }

  const artifact = await readJsonArtifact<ResolvedAddressChunkArtifact>(
    bucket,
    pipelineMessage.resolvedArtifactKey,
  )
  const [currentFile] = buildAddressResolvedSqlImportFiles(message, artifact).filter(
    file => file.target === 'current',
  )
  const initFile =
    artifact.rowStart === 0 && artifact.rows[0]?.base.snapshotId
      ? await buildCurrentSnapshotInitSqlFile(
          metaDb,
          currentDb,
          message,
          artifact.rows[0].base.snapshotId,
        )
      : null
  const initArtifactKeys = initFile
    ? await writeSqlFiles(bucket, message, [initFile])
    : []
  const artifactKeys = currentFile
    ? await writeSqlFiles(bucket, message, [currentFile])
    : []
  const chunkSize = resolveAddressChunkSize(message.chunkSize)
  const stats = addAddressPipelineStats(pipelineMessage.addressStats, {
    insertedVersions: artifact.insertedVersions,
    localizedRows: artifact.localizedRows,
    processedRows: artifact.rowEnd - artifact.rowStart,
    unchangedRows: artifact.unchangedRows,
  })

  if (artifact.rowEnd < artifact.totalRows) {
    return {
      ...pipelineMessage,
      addressStage: 'normalize',
      addressStats: stats,
      addressSqlArtifactKeys: [
        ...(pipelineMessage.addressSqlArtifactKeys ?? []),
        ...initArtifactKeys,
        ...artifactKeys,
      ],
      artifactKey: undefined,
      resolvedArtifactKey: undefined,
      chunkSize,
      processingMode: 'sql',
      processingRunStartedAt: artifact.processingRunStartedAt,
      rowStart: artifact.rowEnd,
      rowEnd: Math.min(artifact.rowEnd + chunkSize, artifact.totalRows),
      totalRows: artifact.totalRows,
    } satisfies AddressPipelineMessage
  }

  return {
    ...pipelineMessage,
    addressStage: 'sql-finalize',
    addressStats: stats,
    addressSqlArtifactKeys: [
      ...(pipelineMessage.addressSqlArtifactKeys ?? []),
      ...initArtifactKeys,
      ...artifactKeys,
    ],
    artifactKey: undefined,
    resolvedArtifactKey: undefined,
    processingMode: 'sql',
    processingRunStartedAt: artifact.processingRunStartedAt,
    rowStart: artifact.rowEnd,
    rowEnd: artifact.rowEnd,
    totalRows: artifact.totalRows,
  } satisfies AddressPipelineMessage
}

export function finalizeAddressSqlDatasetStage(message: DatasetProcessingMessage) {
  const pipelineMessage = message as AddressPipelineMessage

  return {
    deletedRows: 0,
    insertedVersions: pipelineMessage.addressStats?.insertedVersions ?? 0,
    localizedRows: pipelineMessage.addressStats?.localizedRows ?? 0,
    processedRows:
      pipelineMessage.addressStats?.processedRows ??
      Math.max(0, Math.floor(message.totalRows ?? 0)),
    statsRows: pipelineMessage.addressSqlArtifactKeys?.length ?? 0,
    unchangedRows: pipelineMessage.addressStats?.unchangedRows ?? 0,
  }
}

async function writeSqlFiles(
  bucket: PipelineArtifactBucket,
  message: DatasetProcessingMessage,
  files: AddressSqlImportFile[],
) {
  const keys: string[] = []

  for (const file of files) {
    const key = buildSqlPipelineArtifactKey(message, file.target, file.filename)

    await writeTextArtifact(bucket, key, file.sql, 'application/sql; charset=utf-8')
    keys.push(key)

    console.info(
      JSON.stringify({
        bytes: file.bytes,
        datasetId: message.datasetId,
        key,
        phase: 'addressSqlArtifact',
        releaseId: message.releaseId ?? message.datasetId,
        statementCount: file.statementCount,
        status: 'written',
        target: file.target,
      }),
    )
  }

  return keys
}

async function buildCurrentSnapshotInitSqlFile(
  metaDb: MetaDatabase,
  currentDb: CurrentDatabase,
  message: DatasetProcessingMessage,
  snapshotIdValue: string,
): Promise<AddressSqlImportFile> {
  const metaRepoDb = metaDb as unknown as HarbourReadableDb
  const previousSnapshot = await resolveLatestSnapshotForResourceTypeExcludingId(
    metaRepoDb,
    'address',
    snapshotIdValue,
  )
  const divisionLookup = await loadDivisionLookupMaps(
    metaDb,
    currentDb,
    message.regionCode,
  )
  const snapshotId = sqlLiteral(snapshotIdValue)
  const clonedAt = sqlLiteral(
    message.processingRunStartedAt ?? new Date().toISOString(),
  )
  const statements: string[] = []

  if (previousSnapshot && previousSnapshot.id !== snapshotIdValue) {
    const previousSnapshotId = sqlLiteral(previousSnapshot.id)

    statements.push(
      `
INSERT INTO address2d (
  snapshotId, id, geometry, bbox, divisionSnapshotId, countryId, areaId,
  districtId, townId, macrohoodId, villageId, neighbourhoodId, hamletId,
  microhoodId, streetSnapshotId, streetId, identifiers, sources, createdAt, updatedAt
)
SELECT
  ${snapshotId}, id, geometry, bbox, divisionSnapshotId, countryId, areaId,
  districtId, townId, macrohoodId, villageId, neighbourhoodId, hamletId,
  microhoodId, streetSnapshotId, streetId, identifiers, sources, ${clonedAt}, ${clonedAt}
FROM address2d
WHERE snapshotId = ${previousSnapshotId}
ON CONFLICT(snapshotId, id) DO NOTHING;`.trim(),
    )

    statements.push(
      `
INSERT INTO address2dI18n (
  snapshotId, addressId, locale, formattedAddress, buildingName,
  buildingNumberFrom, buildingNumberTo, blockType, blockNumber,
  blockTypeBeforeNumber, phaseName, phaseNumber, estateName, streetNumber,
  streetName, createdAt, updatedAt
)
SELECT
  ${snapshotId}, addressId, locale, formattedAddress, buildingName,
  buildingNumberFrom, buildingNumberTo, blockType, blockNumber,
  blockTypeBeforeNumber, phaseName, phaseNumber, estateName, streetNumber,
  streetName, ${clonedAt}, ${clonedAt}
FROM address2dI18n
WHERE snapshotId = ${previousSnapshotId}
ON CONFLICT(snapshotId, addressId, locale) DO NOTHING;`.trim(),
    )
  }

  statements.push(
    `
UPDATE address2d
SET divisionSnapshotId = ${sqlLiteral(divisionLookup.snapshotId)}, updatedAt = datetime('now')
WHERE snapshotId = ${snapshotId};`.trim(),
  )

  const sql = `${statements.join('\n\n')}\n`

  return {
    bytes: new TextEncoder().encode(sql).byteLength,
    filename: `${buildAddressSqlImportRunId(message)}-current-init.sql`,
    sql,
    statementCount: statements.length,
    target: 'current',
  }
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL'
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL'
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0'
  }

  return `'${String(value).replaceAll("'", "''")}'`
}
