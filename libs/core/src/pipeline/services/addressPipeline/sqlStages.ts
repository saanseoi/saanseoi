import type { DatasetProcessingMessage } from '../../../types'
import type { HarbourReadableDb } from '../../../lib/db/types'
import {
  and,
  eq,
  metaSchema,
  type CurrentDatabase,
  type HistoryDatabase,
  type MetaDatabase,
} from '@repo/db'

import { buildAlignAddressCurrentDivisionSnapshotSql } from '../../db/address'
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
import type {
  AddressPipelineMessage,
  NormalizedAddressChunkArtifact,
  ResolvedAddressChunkArtifact,
} from './types'
import { addAddressPipelineStats } from './types'
import {
  buildAddressHistoryApplySqlImportFile,
  buildAddressResolvedSqlImportFiles,
  buildAddressSqlImportRunId,
  buildAddressSourceSqlImportFiles,
  type AddressSqlImportFile,
} from './sqlImport'
import { logStructuredInfo } from '../../logging'

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
  const historyApplyFile =
    artifact.rowEnd >= artifact.totalRows && artifact.rows[0]?.base.snapshotId
      ? buildAddressHistoryApplySqlImportFile(message, {
          hasChanges: stats.insertedVersions > 0,
          runId: buildAddressSqlImportRunId(message),
          snapshotId: artifact.rows[0].base.snapshotId,
        })
      : null
  const metaFile =
    artifact.rowEnd >= artifact.totalRows && artifact.rows[0]?.base.snapshotId
      ? await buildAddressMetaSqlFile(metaDb, message, artifact.rows[0].base.snapshotId)
      : null
  const historyApplyArtifactKeys = historyApplyFile
    ? await writeSqlFiles(bucket, message, [historyApplyFile])
    : []
  const metaArtifactKeys = metaFile
    ? await writeSqlFiles(bucket, message, [metaFile])
    : []

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
      ...historyApplyArtifactKeys,
      ...artifactKeys,
      ...metaArtifactKeys,
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

async function buildAddressMetaSqlFile(
  metaDb: MetaDatabase,
  message: DatasetProcessingMessage,
  snapshotIdValue: string,
): Promise<AddressSqlImportFile> {
  const releaseId = message.releaseId ?? message.datasetId
  const {
    metaReleaseShardAssignments,
    metaSnapshotAssemblyRuns,
    metaSnapshots,
    metaSnapshotSources,
  } = metaSchema
  const snapshotRow = await metaDb
    .select({
      id: metaSnapshots.id,
      resourceType: metaSnapshots.resourceType,
      code: metaSnapshots.code,
      cohortKey: metaSnapshots.cohortKey,
      status: metaSnapshots.status,
      publishedAt: metaSnapshots.publishedAt,
      validFrom: metaSnapshots.validFrom,
      validTo: metaSnapshots.validTo,
      notes: metaSnapshots.notes,
      createdAt: metaSnapshots.createdAt,
      updatedAt: metaSnapshots.updatedAt,
    })
    .from(metaSnapshots)
    .where(eq(metaSnapshots.id, snapshotIdValue))
    .limit(1)
    .get()

  if (!snapshotRow) {
    throw new Error(
      `Address snapshot metadata missing from local meta cache: ${snapshotIdValue}.`,
    )
  }

  const snapshotSourceRows = await metaDb
    .select({
      snapshotId: metaSnapshotSources.snapshotId,
      datasetId: metaSnapshotSources.datasetId,
      sourceReleaseId: metaSnapshotSources.sourceReleaseId,
      role: metaSnapshotSources.role,
      selectedByRule: metaSnapshotSources.selectedByRule,
      selectionMode: metaSnapshotSources.selectionMode,
      anchorReleaseId: metaSnapshotSources.anchorReleaseId,
      sourceCohortKey: metaSnapshotSources.sourceCohortKey,
      createdAt: metaSnapshotSources.createdAt,
    })
    .from(metaSnapshotSources)
    .where(eq(metaSnapshotSources.snapshotId, snapshotIdValue))
    .all()

  if (!snapshotSourceRows.some(row => row.sourceReleaseId === releaseId)) {
    throw new Error(
      `Address snapshot source metadata missing for release ${releaseId} and snapshot ${snapshotIdValue}.`,
    )
  }

  const snapshotAssemblyRunRows = await metaDb
    .select({
      id: metaSnapshotAssemblyRuns.id,
      snapshotId: metaSnapshotAssemblyRuns.snapshotId,
      snapshotAssemblyId: metaSnapshotAssemblyRuns.snapshotAssemblyId,
      anchorReleaseId: metaSnapshotAssemblyRuns.anchorReleaseId,
      anchorCohortKey: metaSnapshotAssemblyRuns.anchorCohortKey,
      status: metaSnapshotAssemblyRuns.status,
      selectionSummaryJson: metaSnapshotAssemblyRuns.selectionSummaryJson,
      createdAt: metaSnapshotAssemblyRuns.createdAt,
      updatedAt: metaSnapshotAssemblyRuns.updatedAt,
    })
    .from(metaSnapshotAssemblyRuns)
    .where(eq(metaSnapshotAssemblyRuns.snapshotId, snapshotIdValue))
    .all()
  const releaseShardAssignmentRows = await metaDb
    .select({
      releaseId: metaReleaseShardAssignments.releaseId,
      dataShardId: metaReleaseShardAssignments.dataShardId,
    })
    .from(metaReleaseShardAssignments)
    .where(eq(metaReleaseShardAssignments.releaseId, releaseId))
    .all()

  if (releaseShardAssignmentRows.length === 0) {
    throw new Error(
      `Address release shard assignment missing from local meta cache: ${releaseId}.`,
    )
  }

  const statements = [
    buildInsertStatement(
      'snapshots',
      [
        'id',
        'resourceType',
        'code',
        'cohortKey',
        'status',
        'publishedAt',
        'validFrom',
        'validTo',
        'notes',
        'createdAt',
        'updatedAt',
      ],
      [snapshotRow],
      `ON CONFLICT(id) DO UPDATE SET
  resourceType = excluded.resourceType,
  code = excluded.code,
  cohortKey = excluded.cohortKey,
  status = excluded.status,
  publishedAt = excluded.publishedAt,
  validFrom = excluded.validFrom,
  validTo = excluded.validTo,
  notes = excluded.notes,
  createdAt = excluded.createdAt,
  updatedAt = excluded.updatedAt`,
    ),
    buildInsertStatement(
      'snapshotSources',
      [
        'snapshotId',
        'datasetId',
        'sourceReleaseId',
        'role',
        'selectedByRule',
        'selectionMode',
        'anchorReleaseId',
        'sourceCohortKey',
        'createdAt',
      ],
      snapshotSourceRows,
      `ON CONFLICT(snapshotId, sourceReleaseId) DO UPDATE SET
  datasetId = excluded.datasetId,
  role = excluded.role,
  selectedByRule = excluded.selectedByRule,
  selectionMode = excluded.selectionMode,
  anchorReleaseId = excluded.anchorReleaseId,
  sourceCohortKey = excluded.sourceCohortKey,
  createdAt = excluded.createdAt`,
    ),
    buildInsertStatement(
      'snapshotAssemblyRuns',
      [
        'id',
        'snapshotId',
        'snapshotAssemblyId',
        'anchorReleaseId',
        'anchorCohortKey',
        'status',
        'selectionSummaryJson',
        'createdAt',
        'updatedAt',
      ],
      snapshotAssemblyRunRows.map(row => ({
        ...row,
        selectionSummaryJson: jsonText(row.selectionSummaryJson),
      })),
      `ON CONFLICT(id) DO UPDATE SET
  snapshotId = excluded.snapshotId,
  snapshotAssemblyId = excluded.snapshotAssemblyId,
  anchorReleaseId = excluded.anchorReleaseId,
  anchorCohortKey = excluded.anchorCohortKey,
  status = excluded.status,
  selectionSummaryJson = excluded.selectionSummaryJson,
  createdAt = excluded.createdAt,
  updatedAt = excluded.updatedAt`,
    ),
    buildInsertStatement(
      'releaseShardAssignments',
      ['releaseId', 'dataShardId'],
      releaseShardAssignmentRows,
      'ON CONFLICT(releaseId, dataShardId) DO NOTHING',
    ),
  ].filter(Boolean)
  const sql = `${statements.join('\n\n')}\n`

  return {
    bytes: new TextEncoder().encode(sql).byteLength,
    filename: `${buildAddressSqlImportRunId(message)}-meta.sql`,
    sql,
    statementCount: statements.length,
    target: 'meta',
  }
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

    logStructuredInfo({
      bytes: file.bytes,
      datasetId: message.datasetId,
      key,
      phase: 'addressSqlArtifact',
      releaseId: message.releaseId ?? message.datasetId,
      statementCount: file.statementCount,
      status: 'written',
      target: file.target,
    })
  }

  return keys
}

async function buildCurrentSnapshotInitSqlFile(
  metaDb: MetaDatabase,
  _currentDb: CurrentDatabase,
  message: DatasetProcessingMessage,
  snapshotIdValue: string,
): Promise<AddressSqlImportFile> {
  const metaRepoDb = metaDb as unknown as HarbourReadableDb
  const previousSnapshot = await metaRepoDb
    .select({ id: metaSchema.metaSnapshots.parentSnapshotId })
    .from(metaSchema.metaSnapshots)
    .where(eq(metaSchema.metaSnapshots.id, snapshotIdValue))
    .limit(1)
    .get()
  const divisionSnapshot = await metaDb
    .select({ id: metaSchema.metaSnapshots.id })
    .from(metaSchema.metaSnapshots)
    .innerJoin(
      metaSchema.metaSnapshotLineages,
      eq(
        metaSchema.metaSnapshots.snapshotLineageId,
        metaSchema.metaSnapshotLineages.id,
      ),
    )
    .where(
      and(
        eq(metaSchema.metaSnapshots.resourceType, 'division'),
        eq(metaSchema.metaSnapshots.cohortKey, message.cohortKey),
        eq(metaSchema.metaSnapshots.status, 'published'),
        eq(metaSchema.metaSnapshotLineages.regionCode, message.regionCode),
        eq(metaSchema.metaSnapshotLineages.variant, 'overture'),
      ),
    )
    .limit(1)
    .get()
  if (!divisionSnapshot) {
    throw new Error(
      `Published division snapshot not found for ${message.regionCode}/${message.cohortKey}.`,
    )
  }
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
    buildAlignAddressCurrentDivisionSnapshotSql(snapshotIdValue, divisionSnapshot.id),
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

function buildInsertStatement(
  tableName: string,
  columns: readonly string[],
  rows: Record<string, unknown>[],
  suffix: string,
) {
  if (rows.length === 0) {
    return ''
  }

  const values = rows
    .map(row => `(${columns.map(column => sqlLiteral(row[column])).join(', ')})`)
    .join(', ')

  return `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${values}
${suffix};`
}

function jsonText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  return JSON.stringify(value)
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
