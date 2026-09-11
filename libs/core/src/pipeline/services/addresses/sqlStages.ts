import { readAlsPublisherSource } from '../sources/alsSourcePayload'
import type { DatasetProcessingMessage } from '../../../types'
import { readSnapshotAssemblySql } from '../../db/snapshotAssembly'
import type { HarbourReadableDb, HarbourWritableDb } from '../../../lib/db/types'
import {
  eq,
  metaSchema,
  type CurrentDatabase,
  type HistoryDatabase,
  type MetaDatabase,
  type SourceDatabase,
} from '@repo/db'

import {
  buildAlignAddressCurrentDivisionSnapshotSql,
  materialiseReplayedAddressCurrentSnapshot,
  prepareAddressVersionInsertContext,
} from '../../db/address'
import { getCurrentSourceHkgovAlsAddress2dRecords } from '../../db/source'
import { resolveDataShardEnvironment } from '../runtime'
import type { HarbourWorkerBucket } from '../divisions/division'
import {
  buildPipelineArtefactKey,
  buildSqlPipelineArtefactKey,
  type PipelineArtefactBucket,
  readJsonArtefact,
  writeJsonArtefact,
  writeTextArtefact,
} from '../storage/artefacts'
import { normaliseAddressChunkStage, resolveAddressChunkSize } from './normaliseStage'
import {
  dedupeNormalisedAddressRows,
  isUnchangedHkgovAlsSourcePayload,
} from './normalisation'
import { buildResolvedAddressChunkArtefact } from './historyStage'
import type {
  AddressPipelineMessage,
  NormalisedAddressChunkArtefact,
  ResolvedAddressChunkArtefact,
} from './types'
import { addAddressPipelineStats, collectAddressCoverageCounts } from './types'
import {
  buildAddressHistoryApplySqlImportFile,
  buildAddressHistorySqlImportFile,
  buildAddressCurrentSqlImportFile,
  buildAddressSqlImportRunId,
  buildAddressSourceSqlImportFiles,
  type AddressSqlImportFile,
} from './sqlImport'
import { logStructuredInfo } from '../../logging'

export async function normaliseAddressSqlChunkStage(
  metaDb: MetaDatabase,
  currentDb: CurrentDatabase,
  bucket: HarbourWorkerBucket & PipelineArtefactBucket,
  message: DatasetProcessingMessage,
  reportProgress?: (stats: {
    localisedRows: number
    processedRows: number
  }) => Promise<void>,
): Promise<AddressPipelineMessage> {
  const nextMessage = await normaliseAddressChunkStage(
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
  sourceDb: SourceDatabase,
  bucket: HarbourWorkerBucket & PipelineArtefactBucket,
  message: DatasetProcessingMessage,
): Promise<AddressPipelineMessage> {
  const pipelineMessage = message as AddressPipelineMessage

  if (!pipelineMessage.artefactKey) {
    throw new Error('Missing normalised address artefact key for SQL source stage.')
  }

  const artefact = await readJsonArtefact<NormalisedAddressChunkArtefact>(
    bucket,
    pipelineMessage.artefactKey,
  )
  const sourceRows = dedupeNormalisedAddressRows(artefact.rows).filter(
    row => readAlsPublisherSource(row.raw) !== null,
  )
  const currentSourceRows = await getCurrentSourceHkgovAlsAddress2dRecords(
    sourceDb,
    sourceRows.map(row => row.sourceId),
  )
  const changedSourceRecordIds = new Set<string>()
  const unchangedBySourceId = new Map(
    await Promise.all(
      sourceRows.map(
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

  for (const row of sourceRows) {
    if (!unchangedBySourceId.get(row.sourceId)) changedSourceRecordIds.add(row.sourceId)
  }

  const files = buildAddressSourceSqlImportFiles(message, artefact, {
    changedSourceRecordIds,
  })
  const artefactKeys = await writeSqlFiles(bucket, message, files)

  return {
    ...pipelineMessage,
    addressStage: 'sql-history',
    addressSqlArtefactKeys: [
      ...(pipelineMessage.addressSqlArtefactKeys ?? []),
      ...artefactKeys,
    ],
    processingMode: 'sql',
  } satisfies AddressPipelineMessage
}

export async function writeAddressHistorySqlChunkStage(
  metaDb: MetaDatabase,
  historyDb: HistoryDatabase,
  bucket: HarbourWorkerBucket & PipelineArtefactBucket,
  message: DatasetProcessingMessage,
  options: {
    previousHistoryDbs?: HistoryDatabase[]
  } = {},
): Promise<AddressPipelineMessage> {
  const pipelineMessage = message as AddressPipelineMessage
  const { artefact } = await buildResolvedAddressChunkArtefact(
    metaDb,
    historyDb,
    bucket,
    message,
    options,
  )
  const resolvedArtefactKey = buildPipelineArtefactKey(
    message,
    'resolved',
    artefact.rowStart,
    artefact.rowEnd,
  )

  await writeJsonArtefact<ResolvedAddressChunkArtefact>(
    bucket,
    resolvedArtefactKey,
    artefact,
  )

  const historyFile = buildAddressHistorySqlImportFile(message, artefact)
  const artefactKeys = historyFile
    ? await writeSqlFiles(bucket, message, [historyFile])
    : []

  return {
    ...pipelineMessage,
    addressStage: 'sql-current',
    addressSqlArtefactKeys: [
      ...(pipelineMessage.addressSqlArtefactKeys ?? []),
      ...artefactKeys,
    ],
    processingMode: 'sql',
    resolvedArtefactKey,
  } satisfies AddressPipelineMessage
}

export async function writeAddressCurrentSqlChunkStage(
  metaDb: MetaDatabase,
  currentDb: CurrentDatabase,
  bucket: HarbourWorkerBucket & PipelineArtefactBucket,
  message: DatasetProcessingMessage,
): Promise<AddressPipelineMessage> {
  const pipelineMessage = message as AddressPipelineMessage

  if (!pipelineMessage.resolvedArtefactKey) {
    throw new Error('Missing resolved address artefact key for SQL current stage.')
  }

  const artefact = await readJsonArtefact<ResolvedAddressChunkArtefact>(
    bucket,
    pipelineMessage.resolvedArtefactKey,
  )
  const currentDivisionSnapshotId = artefact.rows[0]?.base.divisionSnapshotId
  const currentSnapshotId = artefact.rows[0]?.base.snapshotId
  const selectedDivisionSnapshotId =
    pipelineMessage.addressDivisionSnapshotId ?? currentDivisionSnapshotId
  const isFinalChunk = artefact.rowEnd >= artefact.totalRows
  const currentFile = buildAddressCurrentSqlImportFile(
    message,
    artefact,
    isFinalChunk && selectedDivisionSnapshotId && currentSnapshotId
      ? {
          currentDivisionSnapshotId: selectedDivisionSnapshotId,
          currentSnapshotId,
        }
      : undefined,
  )
  if (artefact.rowStart === 0 && pipelineMessage.addressHistoricalParentVersions) {
    const metaRepoDb = metaDb as unknown as HarbourReadableDb & HarbourWritableDb
    const versionInsertContext = await prepareAddressVersionInsertContext(
      metaRepoDb,
      message,
      resolveDataShardEnvironment(process.env.DATA_SHARD_ENV),
    )
    if (
      pipelineMessage.addressHistoricalParentSnapshotId !==
      versionInsertContext.parentSnapshotId
    ) {
      throw new Error(
        `Address replay parent does not match snapshot ${versionInsertContext.snapshotId}.`,
      )
    }
    const divisionSnapshotId = artefact.rows[0]?.base.divisionSnapshotId
    if (!divisionSnapshotId) {
      throw new Error(
        `Address snapshot ${versionInsertContext.snapshotId} has no division snapshot for historical replay.`,
      )
    }
    await materialiseReplayedAddressCurrentSnapshot(
      currentDb as unknown as HarbourReadableDb & HarbourWritableDb,
      versionInsertContext.snapshotId,
      divisionSnapshotId,
      pipelineMessage.addressHistoricalParentVersions.values(),
      artefact.processingRunStartedAt,
    )
  }
  const initFile =
    artefact.rowStart === 0 && artefact.rows[0]?.base.snapshotId
      ? await buildCurrentSnapshotInitSqlFile(
          metaDb,
          currentDb,
          message,
          artefact.rows[0].base.snapshotId,
          selectedDivisionSnapshotId,
        )
      : null
  const initArtefactKeys = initFile
    ? await writeSqlFiles(bucket, message, [initFile])
    : []
  const artefactKeys = currentFile
    ? await writeSqlFiles(bucket, message, [currentFile])
    : []
  const chunkSize = resolveAddressChunkSize(message.chunkSize)
  const stats = addAddressPipelineStats(pipelineMessage.addressStats, {
    addedRows: artefact.addedRows,
    changedRows: artefact.changedRows,
    insertedVersions: artefact.insertedVersions,
    localisedRows: artefact.localisedRows,
    processedRows: artefact.rowEnd - artefact.rowStart,
    recordedRows: artefact.rows.length,
    unchangedRows: artefact.unchangedRows,
    ...collectAddressCoverageCounts(artefact.rows),
  })
  const historyApplyFile =
    artefact.rowEnd >= artefact.totalRows && artefact.rows[0]?.base.snapshotId
      ? buildAddressHistoryApplySqlImportFile(message, {
          hasChanges: stats.insertedVersions > 0,
          runId: buildAddressSqlImportRunId(message),
          snapshotId: artefact.rows[0].base.snapshotId,
        })
      : null
  const historyApplyArtefactKeys = historyApplyFile
    ? await writeSqlFiles(bucket, message, [historyApplyFile])
    : []

  if (artefact.rowEnd < artefact.totalRows) {
    return {
      ...pipelineMessage,
      addressStage: 'normalise',
      addressStats: stats,
      addressDivisionSnapshotId: selectedDivisionSnapshotId,
      addressSqlArtefactKeys: [
        ...(pipelineMessage.addressSqlArtefactKeys ?? []),
        ...initArtefactKeys,
        ...artefactKeys,
      ],
      artefactKey: undefined,
      resolvedArtefactKey: undefined,
      chunkSize,
      processingMode: 'sql',
      processingRunStartedAt: artefact.processingRunStartedAt,
      rowStart: artefact.rowEnd,
      rowEnd: Math.min(artefact.rowEnd + chunkSize, artefact.totalRows),
      totalRows: artefact.totalRows,
    } satisfies AddressPipelineMessage
  }

  return {
    ...pipelineMessage,
    addressStage: 'sql-finalise',
    addressStats: stats,
    addressDivisionSnapshotId: selectedDivisionSnapshotId,
    addressSqlArtefactKeys: [
      ...(pipelineMessage.addressSqlArtefactKeys ?? []),
      ...initArtefactKeys,
      ...historyApplyArtefactKeys,
      ...artefactKeys,
    ],
    artefactKey: undefined,
    resolvedArtefactKey: undefined,
    processingMode: 'sql',
    processingRunStartedAt: artefact.processingRunStartedAt,
    rowStart: artefact.rowEnd,
    rowEnd: artefact.rowEnd,
    totalRows: artefact.totalRows,
  } satisfies AddressPipelineMessage
}

/**
 * Serialises release metadata only after every address chunk has completed.
 * This keeps the published release stats and processing-action audit trail in
 * sync with the data shards for both local and remote SQL imports.
 */
export async function writeAddressReleaseMetaSqlFile(
  metaDb: MetaDatabase,
  bucket: HarbourWorkerBucket & PipelineArtefactBucket,
  message: DatasetProcessingMessage,
): Promise<AddressPipelineMessage> {
  const pipelineMessage = message as AddressPipelineMessage
  const snapshotId = await resolveAddressSnapshotId(metaDb, message)
  const file = await buildAddressMetaSqlFile(metaDb, message, snapshotId)
  const keys = await writeSqlFiles(bucket, message, [file])

  return {
    ...pipelineMessage,
    addressSqlArtefactKeys: [
      ...(pipelineMessage.addressSqlArtefactKeys ?? []),
      ...keys,
    ],
  }
}

async function resolveAddressSnapshotId(
  metaDb: MetaDatabase,
  message: DatasetProcessingMessage,
) {
  const releaseId = message.releaseId ?? message.datasetId
  const snapshot = await metaDb
    .select({ id: metaSchema.metaSnapshots.id })
    .from(metaSchema.metaSnapshots)
    .innerJoin(
      metaSchema.metaSnapshotSources,
      eq(metaSchema.metaSnapshotSources.snapshotId, metaSchema.metaSnapshots.id),
    )
    .where(eq(metaSchema.metaSnapshotSources.resourceReleaseId, releaseId))
    .limit(1)
    .get()

  if (!snapshot) {
    throw new Error(`Address snapshot metadata missing for release ${releaseId}.`)
  }

  return snapshot.id
}

export async function buildAddressMetaSqlFile(
  metaDb: MetaDatabase,
  message: DatasetProcessingMessage,
  snapshotIdValue: string,
): Promise<AddressSqlImportFile> {
  const releaseId = message.releaseId ?? message.datasetId
  const {
    metaReleaseShardAssignments,
    metaSnapshotLineages,
    metaSnapshotAssemblyRuns,
    metaSnapshotShardAssignments,
    metaSnapshots,
    metaSnapshotSources,
    stats,
  } = metaSchema
  const snapshotRow = await metaDb
    .select({
      id: metaSnapshots.id,
      snapshotLineageId: metaSnapshots.snapshotLineageId,
      parentSnapshotId: metaSnapshots.parentSnapshotId,
      resourceType: metaSnapshots.resourceType,
      code: metaSnapshots.code,
      cohortKey: metaSnapshots.cohortKey,
      geometryStatus: metaSnapshots.geometryStatus,
      revision: metaSnapshots.revision,
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

  const snapshotLineageRows = snapshotRow.snapshotLineageId
    ? await metaDb
        .select()
        .from(metaSnapshotLineages)
        .where(eq(metaSnapshotLineages.id, snapshotRow.snapshotLineageId))
        .all()
    : []

  if (snapshotLineageRows.length !== 1) {
    throw new Error(
      `Address snapshot lineage metadata missing for snapshot ${snapshotIdValue}.`,
    )
  }

  const snapshotSourceRows = await metaDb
    .select({
      snapshotId: metaSnapshotSources.snapshotId,
      datasetId: metaSnapshotSources.datasetId,
      resourceReleaseId: metaSnapshotSources.resourceReleaseId,
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

  if (!snapshotSourceRows.some(row => row.resourceReleaseId === releaseId)) {
    throw new Error(
      `Address snapshot source metadata missing for release ${releaseId} and snapshot ${snapshotIdValue}.`,
    )
  }

  const assemblySql = await readSnapshotAssemblySql(
    metaDb as unknown as HarbourReadableDb,
    snapshotIdValue,
  )
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
  const snapshotShardAssignmentRows = await metaDb
    .select({
      snapshotId: metaSnapshotShardAssignments.snapshotId,
      dataShardId: metaSnapshotShardAssignments.dataShardId,
    })
    .from(metaSnapshotShardAssignments)
    .where(eq(metaSnapshotShardAssignments.snapshotId, snapshotIdValue))
    .all()

  const releaseStatsRows = await metaDb
    .select()
    .from(stats)
    .where(eq(stats.releaseId, releaseId))
    .all()

  if (releaseShardAssignmentRows.length === 0) {
    throw new Error(
      `Address release shard assignment missing from local meta cache: ${releaseId}.`,
    )
  }

  if (snapshotShardAssignmentRows.length === 0) {
    throw new Error(
      `Address snapshot shard assignment missing from local meta cache: ${snapshotIdValue}.`,
    )
  }

  const statements = [
    buildInsertStatement(
      'snapshotLineages',
      [
        'id',
        'code',
        'regionCode',
        'resourceType',
        'variant',
        'identityMode',
        'primaryDatasetId',
        'versionHash',
        'createdAt',
        'updatedAt',
      ],
      snapshotLineageRows,
      `ON CONFLICT(id) DO UPDATE SET
  code = excluded.code,
  regionCode = excluded.regionCode,
  resourceType = excluded.resourceType,
  variant = excluded.variant,
  identityMode = excluded.identityMode,
  primaryDatasetId = excluded.primaryDatasetId,
  versionHash = excluded.versionHash,
  createdAt = excluded.createdAt,
  updatedAt = excluded.updatedAt`,
    ),
    buildInsertStatement(
      'snapshots',
      [
        'id',
        'snapshotLineageId',
        'parentSnapshotId',
        'resourceType',
        'code',
        'cohortKey',
        'geometryStatus',
        'revision',
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
  snapshotLineageId = excluded.snapshotLineageId,
  parentSnapshotId = excluded.parentSnapshotId,
  resourceType = excluded.resourceType,
  code = excluded.code,
  cohortKey = excluded.cohortKey,
  geometryStatus = excluded.geometryStatus,
  revision = excluded.revision,
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
        'resourceReleaseId',
        'role',
        'selectedByRule',
        'selectionMode',
        'anchorReleaseId',
        'sourceCohortKey',
        'createdAt',
      ],
      snapshotSourceRows,
      `ON CONFLICT(snapshotId, resourceReleaseId) DO UPDATE SET
  datasetId = excluded.datasetId,
  role = excluded.role,
  selectedByRule = excluded.selectedByRule,
  selectionMode = excluded.selectionMode,
  anchorReleaseId = excluded.anchorReleaseId,
  sourceCohortKey = excluded.sourceCohortKey,
  createdAt = excluded.createdAt`,
    ),
    ...assemblySql,
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
    buildInsertStatement(
      'snapshotShardAssignments',
      ['snapshotId', 'dataShardId'],
      snapshotShardAssignmentRows,
      'ON CONFLICT(snapshotId, dataShardId) DO NOTHING',
    ),
    buildInsertStatement(
      'stats',
      [
        'id',
        'type',
        'releaseId',
        'snapshotId',
        'apiReleaseSetId',
        'dimension',
        'metric',
        'metricUnit',
        'value',
        'groupBy',
        'groupValue',
        'createdAt',
        'updatedAt',
      ],
      releaseStatsRows.filter(row => row.kind !== 'processing'),
      `ON CONFLICT(id) DO UPDATE SET
  type = excluded.type,
  releaseId = excluded.releaseId,
  snapshotId = excluded.snapshotId,
  apiReleaseSetId = excluded.apiReleaseSetId,
  dimension = excluded.dimension,
  metric = excluded.metric,
  metricUnit = excluded.metricUnit,
  value = excluded.value,
  groupBy = excluded.groupBy,
  groupValue = excluded.groupValue,
  updatedAt = excluded.updatedAt`,
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

export function finaliseAddressSqlDatasetStage(message: DatasetProcessingMessage) {
  const pipelineMessage = message as AddressPipelineMessage

  return {
    deletedRows: 0,
    insertedVersions: pipelineMessage.addressStats?.insertedVersions ?? 0,
    localisedRows: pipelineMessage.addressStats?.localisedRows ?? 0,
    processedRows:
      pipelineMessage.addressStats?.processedRows ??
      Math.max(0, Math.floor(message.totalRows ?? 0)),
    statsRows: pipelineMessage.addressSqlArtefactKeys?.length ?? 0,
    unchangedRows: pipelineMessage.addressStats?.unchangedRows ?? 0,
  }
}

async function writeSqlFiles(
  bucket: PipelineArtefactBucket,
  message: DatasetProcessingMessage,
  files: AddressSqlImportFile[],
) {
  const keys: string[] = []

  for (const file of files) {
    const key = buildSqlPipelineArtefactKey(message, file.target, file.filename)

    await writeTextArtefact(bucket, key, file.sql, 'application/sql; charset=utf-8')
    keys.push(key)

    logStructuredInfo({
      bytes: file.bytes,
      datasetId: message.datasetId,
      key,
      phase: 'addressSqlArtefact',
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
  divisionSnapshotIdValue: string | undefined,
): Promise<AddressSqlImportFile> {
  const metaRepoDb = metaDb as unknown as HarbourReadableDb
  const previousSnapshot = await metaRepoDb
    .select({ id: metaSchema.metaSnapshots.parentSnapshotId })
    .from(metaSchema.metaSnapshots)
    .where(eq(metaSchema.metaSnapshots.id, snapshotIdValue))
    .limit(1)
    .get()
  if (!divisionSnapshotIdValue) {
    throw new Error(
      `Address snapshot ${snapshotIdValue} has no resolved division snapshot dependency.`,
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
  microhoodId, streetSnapshotId, streetId, identifiers, sources, parentAddressId, granularity, createdAt, updatedAt
)
SELECT
  ${snapshotId}, id, geometry, bbox, divisionSnapshotId, countryId, areaId,
  districtId, townId, macrohoodId, villageId, neighbourhoodId, hamletId,
  microhoodId, streetSnapshotId, streetId, identifiers, sources, parentAddressId, granularity, ${clonedAt}, ${clonedAt}
FROM address2d
WHERE snapshotId = ${previousSnapshotId}
ON CONFLICT(snapshotId, id) DO NOTHING;`.trim(),
    )

    statements.push(
      `
INSERT INTO address2dI18n (
  snapshotId, addressId, locale, formattedAddress, buildingName,
  buildingNumberExpression, buildingNumberFrom, buildingNumberTo, buildingNumberConnector,
  blockExpression, blockType, blockRef, blockTypeBeforeNumber,
  phaseExpression, phaseName, phaseRef, estateName,
  streetName, createdAt, updatedAt
)
SELECT
  ${snapshotId}, addressId, locale, formattedAddress, buildingName,
  buildingNumberExpression, buildingNumberFrom, buildingNumberTo, buildingNumberConnector,
  blockExpression, blockType, blockRef, blockTypeBeforeNumber,
  phaseExpression, phaseName, phaseRef, estateName,
  streetName, ${clonedAt}, ${clonedAt}
FROM address2dI18n
WHERE snapshotId = ${previousSnapshotId}
ON CONFLICT(snapshotId, addressId, locale) DO NOTHING;`.trim(),
    )

    statements.push(
      `
INSERT INTO address2dBuildingNumberLookup (
  snapshotId, addressId, buildingNumber, numericStem, evidence, derivation, createdAt, updatedAt
)
SELECT
  ${snapshotId}, addressId, buildingNumber, numericStem, evidence, derivation, ${clonedAt}, ${clonedAt}
FROM address2dBuildingNumberLookup
WHERE snapshotId = ${previousSnapshotId}
ON CONFLICT(snapshotId, addressId, buildingNumber) DO NOTHING;`.trim(),
    )
  }

  statements.push(
    buildAlignAddressCurrentDivisionSnapshotSql(
      snapshotIdValue,
      divisionSnapshotIdValue,
    ),
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

/**
 * HKGov ALS uses a date and correction identifier such as `2025-01-23.0` as
 * its address cohort. It is not an Overture division cohort. Address releases
 * therefore use the latest published Overture division snapshot at or before
 * the address cohort, falling back to the earliest later snapshot.
 */
export function resolveAddressDivisionCohortKey(
  message: Pick<DatasetProcessingMessage, 'cohortKey' | 'source' | 'sourceVersion'>,
  publishedCohorts: string[],
) {
  if (message.source !== 'hkgov-dpo') {
    return message.cohortKey
  }

  const cohorts = [...publishedCohorts].sort()

  return (
    cohorts.filter(cohort => cohort <= message.cohortKey).at(-1) ??
    cohorts[0] ??
    message.cohortKey
  )
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
