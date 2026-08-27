import { datasetVariantForSource, type RegionCode } from '@repo/core'
import { Database as SQLiteDatabase } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  ensureDraftSnapshotForRelease,
  listPublishedSnapshotsForResourceTypeRegionAtOrAfterCohortKey,
  recordSnapshotLookupDependency,
  recordSnapshotAssemblyRun,
  resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey,
  resolveShardForTypeRegionYear,
  resolvePublishedSnapshotForResourceTypeRegionCohortKey,
  upsertReleaseShardAssignment,
  upsertSnapshotShardAssignment,
  upsertSnapshotSource,
  waitForDatasetRecord,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import {
  replaceReleaseProcessingActions,
  type ReleaseProcessingAction,
} from '@repo/core/pipeline/db/processingActions'
import { replaceDatasetStats } from '@repo/core/pipeline/db/stats'
import { recordSnapshotVersionChanges } from '@repo/core/pipeline/db/snapshotVersionChanges'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import {
  createAsyncBufferFromR2,
  readParquetObjectsInBatches,
} from '@repo/core/pipeline/parquetR2'
import { chunkArray } from '@repo/core/pipeline/utils'
import {
  hashDivisionGeometryRow,
  hashDivisionGeometrySourceRow,
  normaliseDivisionAreaGeometryRow,
  normaliseDivisionBoundaryGeometryRow,
  type NormalisedDivisionArea,
} from '@repo/core/pipeline/services/divisionGeometry'
import { buildGeometryReleaseStatsRows } from '@repo/core/pipeline/services/stats'
import {
  calculateDistrictGeometryStatistics,
  selectDistrictRelevantGeometryRecords,
} from '@repo/core/pipeline/services/geometryStats'
import {
  calculateGeoJsonBbox,
  type GeoJsonGeometry,
  type GeoJsonPosition,
} from '@repo/core/pipeline/geojson'
import {
  compressJsonBrotli,
  decompressJsonBrotli,
  MAX_BROTLI_QUALITY,
} from '@repo/core/pipeline/services/brotliJson.ts'
import { toIsoTimestamp } from '@repo/db'
import { currentSchema, historySchema, metaSchema, sourceSchema } from '@repo/db'
import { and, desc, eq, sql } from 'drizzle-orm'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import type Geometry from 'jsts/org/locationtech/jts/geom/Geometry.js'
import BufferOp from 'jsts/org/locationtech/jts/operation/buffer/BufferOp.js'
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js'
import TopologyPreservingSimplifier from 'jsts/org/locationtech/jts/simplify/TopologyPreservingSimplifier.js'
import UnionOp from 'jsts/org/locationtech/jts/operation/union/UnionOp.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'

import type { PreparedUploadFile } from '../upload/parquetRepack.ts'
import { resolvePipelineEnvironment, type UploadTarget } from '../cli/options.ts'
import { createHarbourControlClient } from '../api/harbourControl.ts'
import { syncStagedReleaseIntoLocalMetaCache } from '../localPipeline/syncStagedRelease.ts'
import { createLocalControlClient } from '../localPipeline/localControlClient.ts'
import { LocalPipelineBucket } from '../localPipeline/localBucket.ts'
import {
  invalidateRemoteDbCache,
  replayRemoteCacheWithRetry,
  refreshRemoteMetaCache,
  resolveLocalAddressDbContext,
  resolveShardBindingName,
  type LocalDbCacheProgressEvent,
} from '../dbCache/localDbCache.ts'
import {
  executeSqlText,
  type SqlImportExecutionOptions,
} from '../localPipeline/sqlImport.ts'
import { LocalUploadProgress } from '../upload/localUploadProgress.ts'
import {
  overtureHongKongAreaDivisionId,
  overtureHongKongAreas,
} from '@repo/core/pipeline/services/overtureHongKongAreas'
import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  colorYellow,
  formatCompletedPhaseLabel,
  formatDurationMs,
  formatRunningPhaseLabel,
} from '../localPipeline/progressFormatting.ts'
import { runLocalProgressPhase } from '../localPipeline/orchestrator.ts'

type UploadResult = {
  datasetCode?: string
  datasetId?: string
  rawObjectKey?: string
  releaseCode?: string
  releaseId?: string
}

type GeometryUploadPlan = {
  cohortKey: string
  datasetCode?: string
  regionCode: RegionCode
  releaseCode: string
  rowCount: number
  source:
    | 'overture'
    | 'hkgov-had'
    | 'hkgov-censtatd'
    | 'hkgov-pland-pu'
    | 'hkgov-pland-new-town'
  sourceVersion: string
  transform?: 'simplified'
  theme: 'divisions'
  type: 'divisionArea' | 'divisionBoundary'
}

type NormalisedGeometry = ReturnType<
  typeof normaliseDivisionAreaGeometryRow | typeof normaliseDivisionBoundaryGeometryRow
>

type GeometryWriteProgress = (label: string, current?: number, total?: number) => void

const LOCAL_RELEASE_ROOT = `${import.meta.dir}/../../../../../.local/harbour-sql/releases`
const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const HARBOUR_WRANGLER_PATH = resolve(REPO_ROOT, 'apps/harbour-workers/wrangler.jsonc')
const CENSTATD_2021_DISTRICT_VARIANT = 'hkgov-censtatd-landclipped'
const HKGOV_DISPLAY_SIMPLIFICATION_TOLERANCE_METRES = 10
const HONG_KONG_REFERENCE_LONGITUDE = 114
const HONG_KONG_REFERENCE_LATITUDE = 22.35
const METRES_PER_DEGREE_LATITUDE = 110_574
const METRES_PER_DEGREE_LONGITUDE =
  111_320 * Math.cos((HONG_KONG_REFERENCE_LATITUDE * Math.PI) / 180)
// D1 accepts statements no larger than 100 KB. Reserve a small margin for
// platform-side import handling rather than producing statements at the limit.
export const MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES = 96 * 1024

/**
 * Imports Overture division area/boundary parquet into the source, history and
 * current geometry tables. Geometry releases are complete snapshots: rows no
 * longer present are closed and the draft snapshot is rebuilt on retry.
 */
export async function processLocalDivisionGeometrySqlUpload(
  target: UploadTarget,
  previewPlan: GeometryUploadPlan,
  uploadResult: UploadResult,
  preparedUpload: PreparedUploadFile,
  options: {
    deferPublish?: boolean
    inputFilePath?: string
    /**
     * Add a geometry variant to a source release that was initialised by an
     * earlier pass in this upload. The release remains in its running state
     * until this pass publishes it.
     */
    reuseRunningRelease?: boolean
    skipRawSeed?: boolean
    skipSnapshotCleanup?: boolean
    validateGeometry?: boolean
  } = {},
) {
  const releaseId = requireString(uploadResult.releaseId, 'releaseId')
  const releaseCode = requireString(uploadResult.releaseCode, 'releaseCode')
  const datasetCode = requireString(uploadResult.datasetCode, 'datasetCode')
  const rawObjectKey = requireString(uploadResult.rawObjectKey, 'rawObjectKey')
  const shardYear = previewPlan.sourceVersion.slice(0, 4)
  const releaseRoot = `${LOCAL_RELEASE_ROOT}/${target.remote ? 'remote' : 'local'}/${releaseCode}`
  const progress = new LocalUploadProgress()
  const setupStartedAt = Date.now()
  progress.beginPhase(formatGeometryProgressLabel('Prepare', 'workspace'), {
    current: 0,
    max: null,
  })
  const bucket = new LocalPipelineBucket(releaseRoot)
  if (!options.skipRawSeed) {
    await bucket.seedRawObject(rawObjectKey, preparedUpload.filePath)
  }

  let dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>
  const dbCacheStartedAt = Date.now()
  let reusedDbCache = false

  try {
    dbContext = await resolveLocalAddressDbContext(
      target,
      previewPlan.regionCode,
      shardYear,
      {
        onProgress(event) {
          reusedDbCache ||= event.action === 'reuse-cache'
          updateDbCacheProgress(progress, event)
        },
        cacheTableProfile:
          previewPlan.source === 'hkgov-pland-pu' ||
          previewPlan.source === 'hkgov-pland-new-town'
            ? 'planningDivisionGeometry'
            : 'divisionGeometry',
        includePreviousShardYears: true,
        refreshRemoteTables: false,
      },
    )
  } catch (error) {
    progress.fail()
    throw error
  }

  if (progress.hasActivePhase()) {
    progress.complete(
      appendPhaseDetails(
        formatCompletedPhaseLabel(
          colorTeal(target.remote ? 'Open local D1' : 'Prepare'),
          formatMirrorSubject(target, reusedDbCache),
        ),
        [
          formatDurationMs(
            Date.now() - (target.remote ? dbCacheStartedAt : setupStartedAt),
          ),
        ],
      ),
    )
  }
  let controlClient: HarbourClient | null = null
  let remotePublished = false

  try {
    const releaseMetadataStartedAt = Date.now()
    progress.beginPhase(
      formatGeometryProgressLabel(
        'Sync down',
        formatLocalTargetSubject('release metadata'),
      ),
      {
        current: 0,
        max: null,
      },
    )
    if (!options.reuseRunningRelease) {
      await syncStagedReleaseIntoLocalMetaCache(
        dbContext.metaDb,
        { datasetCode, rawObjectKey, releaseCode, releaseId },
        previewPlan,
      )
    }

    progress.complete(
      formatGeometryCompletedLabel(
        'Sync down',
        formatLocalTargetSubject('release metadata'),
        undefined,
        Date.now() - releaseMetadataStartedAt,
      ),
    )
    const processingStateStartedAt = Date.now()
    progress.beginPhase(
      formatGeometryProgressLabel(
        'Mark as',
        formatTargetSubject("'processing'", target),
      ),
      {
        current: 0,
        max: null,
      },
    )
    const remoteClient = createHarbourControlClient(target) as HarbourClient
    const client = target.remote
      ? remoteClient
      : createLocalControlClient(
          dbContext.metaDb as unknown as HarbourReadableDb & HarbourWritableDb,
          { publishClient: remoteClient },
        )
    controlClient = client
    if (!options.reuseRunningRelease) {
      await client.stageRunning(
        releaseId,
        'processDataset',
        {
          resourceType: previewPlan.type,
          rowCount: previewPlan.rowCount,
        },
        releaseCode,
      )
    }

    progress.complete(
      formatGeometryCompletedLabel(
        'Mark as',
        formatTargetSubject("'processing'", target),
        undefined,
        Date.now() - processingStateStartedAt,
      ),
    )
    const snapshotStartedAt = Date.now()
    progress.beginPhase(
      formatGeometryProgressLabel('Assemble draft', `${previewPlan.type} snapshot`),
      {
        current: 0,
        max: null,
      },
    )
    const metaDb = dbContext.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
    const dataset = await waitForDatasetRecord(metaDb, { releaseId })
    if (!dataset) {
      throw new Error(`Release not found: ${releaseId}`)
    }
    const snapshot = await ensureDraftSnapshotForRelease(metaDb, previewPlan.type, {
      cohortKey: previewPlan.cohortKey,
      datasetCode,
      datasetId: dataset.datasetId,
      regionCode: previewPlan.regionCode,
      sourceReleaseId: dataset.releaseId,
      variant: geometryVariant(previewPlan),
      reuseDraftSnapshotForVariant: isCenstatdGeometryCompanionPlan(previewPlan),
    })
    await upsertSnapshotSource(
      metaDb,
      snapshot.id,
      dataset.datasetId,
      dataset.releaseId,
      'primary',
      {
        anchorReleaseId: dataset.releaseId,
        selectedByRule: 'snapshot-assembly-division-geometry-v1',
        selectionMode: 'exact_ref',
        sourceCohortKey: dataset.cohortKey,
      },
    )
    await recordSnapshotAssemblyRun(metaDb, {
      snapshotId: snapshot.id,
      resourceType: previewPlan.type,
      anchorReleaseId: dataset.releaseId,
      anchorCohortKey: dataset.cohortKey,
      selectionSummaryJson: {
        releaseRole: 'primary',
        sourceReleaseId: dataset.releaseId,
        sourceVersion: dataset.sourceVersion,
      },
    })
    const [historyShard, sourceShard] = await Promise.all([
      resolveShardForTypeRegionYear(
        metaDb,
        'history',
        resolvePipelineEnvironment(target),
        previewPlan.regionCode,
        shardYear,
      ),
      resolveShardForTypeRegionYear(
        metaDb,
        'source',
        resolvePipelineEnvironment(target),
        previewPlan.regionCode,
        shardYear,
      ),
    ])
    if (!historyShard || !sourceShard) {
      throw new Error(
        `Shard mapping not found for ${previewPlan.regionCode}/${shardYear}.`,
      )
    }
    await Promise.all([
      upsertReleaseShardAssignment(metaDb, dataset.releaseId, historyShard.id),
      upsertReleaseShardAssignment(metaDb, dataset.releaseId, sourceShard.id),
      upsertSnapshotShardAssignment(metaDb, snapshot.id, historyShard.id),
    ])

    progress.complete(
      formatGeometryCompletedLabel(
        'Assemble draft',
        `${previewPlan.type} snapshot`,
        undefined,
        Date.now() - snapshotStartedAt,
      ),
    )
    const normalisationStartedAt = Date.now()
    progress.beginPhase(
      formatGeometryProgressLabel(
        'Normalise source',
        previewPlan.type,
        0,
        previewPlan.rowCount,
      ),
      { current: 0, max: previewPlan.rowCount },
    )

    const file = options.inputFilePath
      ? await asyncBufferFromFile(options.inputFilePath)
      : await createAsyncBufferFromR2(bucket, rawObjectKey)
    let normalised: Array<NonNullable<NormalisedGeometry>> = []
    const cnGdExcludedRecords: Array<{
      divisionId: string | null
      divisionIds: string[] | null
      id: string | null
    }> = []
    let rejectedRows = 0
    let processedRows = 0
    const providerBridgeConfig = resolveProviderBridgeConfig(previewPlan)
    const providerBridge =
      providerBridgeConfig !== null
        ? new Map(
            (
              await metaDb
                .select({
                  externalId: metaSchema.metaIdentifierBridges.externalId,
                  canonicalId: metaSchema.metaIdentifierBridges.canonicalId,
                })
                .from(metaSchema.metaIdentifierBridges)
                .where(
                  and(
                    eq(metaSchema.metaIdentifierBridges.resourceType, 'division'),
                    eq(
                      metaSchema.metaIdentifierBridges.cohortKey,
                      previewPlan.cohortKey,
                    ),
                    eq(metaSchema.metaIdentifierBridges.domain, 'administrative'),
                    eq(
                      metaSchema.metaIdentifierBridges.authority,
                      providerBridgeConfig.authority,
                    ),
                  ),
                )
                .all()
            ).map(row => [row.externalId, row.canonicalId]),
          )
        : null
    for await (const batch of readParquetObjectsInBatches(file, 8192)) {
      for (const row of batch) {
        try {
          const sourceRow =
            previewPlan.source === 'hkgov-had'
              ? normaliseHkgovHadInputRow(row, providerBridge)
              : previewPlan.source === 'hkgov-censtatd'
                ? normaliseHkgovCenstatdInputRow(row, providerBridge)
                : previewPlan.source === 'hkgov-pland-new-town'
                  ? normaliseHkgovPlandNewTownInputRow(row)
                  : row
          if (previewPlan.source === 'overture' && row.region === 'CN-GD') {
            cnGdExcludedRecords.push({
              divisionId: asOptionalString(row.division_id),
              divisionIds: Array.isArray(row.division_ids)
                ? row.division_ids.map(asOptionalString).filter(isString)
                : null,
              id: asOptionalString(row.id),
            })
            continue
          }
          const value =
            previewPlan.type === 'divisionArea'
              ? normaliseDivisionAreaGeometryRow(sourceRow, previewPlan.source, {
                  validateGeometry: options.validateGeometry,
                  variant: geometryVariant(previewPlan),
                })
              : normaliseDivisionBoundaryGeometryRow(sourceRow, previewPlan.source, {
                  validateGeometry: options.validateGeometry,
                  variant: geometryVariant(previewPlan),
                })
          if (value) normalised.push(value as NonNullable<NormalisedGeometry>)
        } catch (error) {
          rejectedRows += 1
          throw error
        }
      }
      processedRows += batch.length
      progress.update(processedRows, {
        label: formatGeometryProgressLabel(
          'Normalise source',
          previewPlan.type,
          processedRows,
          previewPlan.rowCount,
        ),
      })
    }

    const syntheticAreas = await resolveSyntheticOvertureHongKongAreas(
      dbContext.currentDb,
      metaDb,
      previewPlan,
    )
    const areasWithoutSourceGeometry =
      previewPlan.type === 'divisionArea'
        ? selectOvertureHongKongAreasWithoutSourceGeometry(syntheticAreas, normalised)
        : []
    if (previewPlan.source === 'overture' && areasWithoutSourceGeometry.length > 0) {
      const syntheticRows = buildSyntheticOvertureHongKongAreaRows(
        areasWithoutSourceGeometry,
        normalised,
      )
      normalised.push(...syntheticRows)
    }

    if (previewPlan.transform === 'simplified') {
      if (previewPlan.type !== 'divisionArea') {
        throw new Error('The simplified display transform is available only for areas.')
      }
      normalised = simplifyHkgovDivisionAreas(
        normalised as NormalisedDivisionArea[],
      ) as Array<NonNullable<NormalisedGeometry>>
    }

    progress.complete(
      formatGeometryCompletedLabel(
        'Normalise source',
        previewPlan.type,
        normalised.length,
        Date.now() - normalisationStartedAt,
      ),
    )
    const validationStartedAt = Date.now()
    progress.beginPhase(
      formatGeometryProgressLabel('Validate', `${previewPlan.type} references`),
      {
        current: 0,
        max: null,
      },
    )
    const divisionLookup = !resolveProviderBridgeConfig(previewPlan)
      ? await assertDivisionReferences(
          dbContext.currentDb,
          dbContext.historyDb,
          metaDb,
          previewPlan,
          normalised,
        )
      : null
    if (divisionLookup) {
      await recordSnapshotLookupDependency(metaDb, {
        anchorReleaseId: dataset.releaseId,
        lookupSnapshotId: divisionLookup.id,
        selectedByRule: divisionLookup.selectedByRule,
        selectionMode: divisionLookup.selectionMode,
        snapshotId: snapshot.id,
      })
    }

    progress.complete(
      formatGeometryCompletedLabel(
        'Validate',
        `${previewPlan.type} references`,
        undefined,
        Date.now() - validationStartedAt,
      ),
    )
    const writeStartedAt = Date.now()
    progress.beginPhase(
      formatGeometryProgressLabel('Materialise', `${previewPlan.type} @ local`),
      {
        current: 0,
        max: null,
      },
    )
    const writeResult = await writeGeometryRows(
      dbContext,
      previewPlan.type,
      normalised,
      {
        source: previewPlan.source,
        variant: geometryVariant(previewPlan),
        releaseId,
        releaseCode,
        snapshotId: snapshot.id,
        parentSnapshotId: snapshot.parentSnapshotId,
        cohortKey: previewPlan.cohortKey,
        merge: isCenstatdGeometryCompanionPlan(previewPlan),
        transform: previewPlan.transform,
      },
      (() => {
        let counterLabel: string | undefined
        return (label, current, total) => {
          const progressLabel = formatGeometryProgressLabel(
            'Materialise',
            label,
            current,
            total,
          )
          if (current === undefined || total === undefined) {
            counterLabel = undefined
            progress.message(progressLabel)
            return
          }
          progress.update(current, {
            label: progressLabel,
            max: total,
            reset: counterLabel !== label,
          })
          counterLabel = label
        }
      })(),
    )

    progress.complete(
      formatGeometryCompletedLabel(
        'Materialise',
        `${previewPlan.type} @ local`,
        normalised.length,
        Date.now() - writeStartedAt,
      ),
    )
    const statsStartedAt = Date.now()
    progress.beginPhase(
      formatGeometryProgressLabel('Calculate', 'release statistics'),
      {
        current: 0,
        max: null,
      },
    )
    // A simplified C&SD pass is only a display derivative. Release statistics
    // are permanently tied to the exact canonical source geometry.
    if (shouldWriteExactGeometryReleaseStats(previewPlan.transform)) {
      await replaceDatasetStats(
        metaDb,
        releaseId,
        await buildGeometryStats(
          dbContext.currentDb,
          dbContext.historyDb,
          metaDb,
          previewPlan,
          normalised,
          writeResult.churn,
        ),
      )
    }
    await replaceReleaseProcessingActions(metaDb, releaseId, [
      ...buildOvertureGeometryProcessingActions(previewPlan, cnGdExcludedRecords),
      ...buildSyntheticOvertureHongKongAreaProcessingActions(
        previewPlan,
        areasWithoutSourceGeometry,
      ),
    ])
    progress.complete(
      formatGeometryCompletedLabel(
        'Calculate',
        'release statistics',
        undefined,
        Date.now() - statsStartedAt,
      ),
    )
    if (target.remote) {
      await replayGeometryIntoRemote(
        target,
        dbContext,
        previewPlan,
        releaseId,
        snapshot.id,
        writeResult.currentRows,
        (subject, operation) =>
          runGeometryProgressPhase(progress, 'Sync up', subject, operation),
      )
    }
    if (options.deferPublish) {
      return {
        snapshotId: snapshot.id,
        importedRows: normalised.length,
        publishResult: undefined,
      }
    }
    await runGeometryProgressPhase(
      progress,
      'Mark as',
      formatTargetSubject("'completed'", target),
      () =>
        client.stageCompleted(
          releaseId,
          'processDataset',
          {
            resourceType: previewPlan.type,
            sourceRows: previewPlan.rowCount,
            importedRows: normalised.length,
            rejectedRows,
          },
          releaseCode,
        ),
    )
    const publishResult = await runGeometryProgressPhase(
      progress,
      'Publish',
      'source release',
      () =>
        client.publishDataset(releaseId, releaseCode, {
          skipSnapshotCleanup: options.skipSnapshotCleanup,
        }),
    )
    remotePublished = target.remote
    if (target.remote) {
      try {
        await runGeometryProgressPhase(
          progress,
          'Sync down',
          formatTargetSubject('metadata', target),
          () =>
            refreshRemoteMetaCache(
              target.environment === 'production' ? 'production' : 'preview',
              dbContext.state.dbCacheDir,
            ),
        )
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        await invalidateRemoteDbCache(
          target.environment === 'production' ? 'production' : 'preview',
          dbContext.state.dbCacheDir,
          reason,
        )
        throw new Error(
          `Remote publish succeeded, but refreshing the local meta cache failed. ${reason}`,
        )
      }
    }
    return {
      snapshotId: snapshot.id,
      importedRows: normalised.length,
      publishResult,
    }
  } catch (error) {
    progress.fail()
    const failureClient =
      controlClient ?? (createHarbourControlClient(target) as HarbourClient)
    if (!remotePublished) {
      await failureClient
        .stageFailed(
          releaseId,
          'processDataset',
          error instanceof Error ? error.message : String(error),
          undefined,
          releaseCode,
        )
        .catch(() => undefined)
    }
    throw error
  } finally {
    dbContext.cleanup()
  }
}

async function replayGeometryIntoRemote(
  target: UploadTarget,
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  plan: GeometryUploadPlan,
  releaseId: string,
  snapshotId: string,
  currentRows: Array<Record<string, unknown>>,
  runProgressPhase: <T>(subject: string, operation: () => Promise<T>) => Promise<T>,
) {
  const targetName = target.environment === 'production' ? 'production' : 'preview'
  const metaBindingName = 'DB_META'
  const currentBindingName = 'DB_CURRENT'
  const regionToken = plan.regionCode.toUpperCase()
  const historyBindingName = resolveShardBindingName(
    'history',
    regionToken,
    plan.sourceVersion.slice(0, 4),
  )
  const sourceBindingName = resolveShardBindingName(
    'source',
    regionToken,
    plan.sourceVersion.slice(0, 4),
  )
  const metaRows = readGeometryReplayMetadata(
    context.state.dbCacheDir,
    metaBindingName,
    releaseId,
    snapshotId,
  )
  const currentTable =
    plan.type === 'divisionArea' ? 'divisionAreas' : 'divisionBoundaries'
  const historyTable = currentTable
  const sourceTable = resolveGeometrySourceTable(plan)
  const historyRows = readGeometryCacheRows(
    context.state.dbCacheDir,
    historyBindingName,
    `SELECT * FROM "${historyTable}" WHERE "snapshotId" = ${geometrySqlLiteral(snapshotId)}`,
  )
  const changeRows = readGeometryCacheRows(
    context.state.dbCacheDir,
    historyBindingName,
    `SELECT * FROM "snapshotVersionChanges" WHERE "snapshotId" = ${geometrySqlLiteral(snapshotId)}`,
  )
  const sourceRows = sourceTable
    ? readGeometryCacheRows(
        context.state.dbCacheDir,
        sourceBindingName,
        `SELECT * FROM "${sourceTable}" WHERE "releaseId" = ${geometrySqlLiteral(releaseId)}`,
      )
    : []
  const options: SqlImportExecutionOptions = {
    accountId: resolveGeometryCloudflareAccountId(target),
    apiToken: process.env.CLOUDFLARE_D1_TOKEN?.trim(),
    isLocal: false,
  }

  const tableImports = [
    {
      bindingName: metaBindingName,
      databaseId: context.state.bindings[metaBindingName]?.databaseId,
      name: 'meta' as const,
      sql: metaRows,
    },
    {
      bindingName: currentBindingName,
      databaseId: context.state.bindings[currentBindingName]?.databaseId,
      name: 'current' as const,
      sql: `${geometrySqlLiteralDelete(currentTable, 'snapshotId', snapshotId)}\n${geometryBuildUpsertSql(currentTable, currentRows)}`,
    },
    {
      bindingName: historyBindingName,
      databaseId: context.state.bindings[historyBindingName]?.databaseId,
      name: 'history' as const,
      sql: [
        geometrySqlLiteralDelete(historyTable, 'snapshotId', snapshotId),
        geometrySqlLiteralDelete('snapshotVersionChanges', 'snapshotId', snapshotId),
        geometryBuildUpsertSql(historyTable, historyRows),
        geometryBuildUpsertSql('snapshotVersionChanges', changeRows),
      ]
        .filter(Boolean)
        .join('\n'),
    },
    {
      bindingName: sourceBindingName,
      databaseId: context.state.bindings[sourceBindingName]?.databaseId,
      name: 'source' as const,
      sql: sourceTable
        ? `${geometrySqlLiteralDelete(sourceTable, 'releaseId', releaseId)}\n${geometryBuildUpsertSql(sourceTable, sourceRows)}`
        : '',
    },
  ]

  try {
    await replayRemoteCacheWithRetry(
      targetName,
      context.state.dbCacheDir,
      releaseId,
      async () => {
        for (const tableImport of tableImports) {
          if (!tableImport.sql.trim()) continue
          await runProgressPhase(
            describeRemoteGeometryImport(tableImport.name, plan, target),
            () =>
              executeSqlText(
                {
                  databaseId: tableImport.databaseId ?? null,
                  name: tableImport.name,
                },
                tableImport.sql,
                options,
              ),
          )
        }
      },
    )
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Remote geometry replay failed. ${reason}`)
  }
}

function readGeometryReplayMetadata(
  cacheDir: string,
  bindingName: string,
  releaseId: string,
  snapshotId: string,
) {
  const snapshot = readGeometryCacheRows(
    cacheDir,
    bindingName,
    `SELECT * FROM "snapshots" WHERE "id" = ${geometrySqlLiteral(snapshotId)}`,
  )
  if (snapshot.length === 0) {
    throw new Error(`Local meta cache is missing snapshot ${snapshotId}.`)
  }
  const lineageId = snapshot[0]?.snapshotLineageId
  const assemblyRuns = readGeometryCacheRows(
    cacheDir,
    bindingName,
    `SELECT * FROM "snapshotAssemblyRuns" WHERE "snapshotId" = ${geometrySqlLiteral(snapshotId)}`,
  )
  const assemblyIds = assemblyRuns
    .map(row => row.snapshotAssemblyId)
    .filter((value): value is string => typeof value === 'string')
  const idList = assemblyIds.map(geometrySqlLiteral).join(', ')
  const tables = [
    ['snapshotLineages', lineageId ? `"id" = ${geometrySqlLiteral(lineageId)}` : '0'],
    ['snapshots', `"id" = ${geometrySqlLiteral(snapshotId)}`],
    ['snapshotSources', `"snapshotId" = ${geometrySqlLiteral(snapshotId)}`],
    ['snapshotAssembly', idList ? `"id" IN (${idList})` : '0'],
    ['snapshotAssemblySources', idList ? `"snapshotAssemblyId" IN (${idList})` : '0'],
    ['snapshotAssemblyRuns', `"snapshotId" = ${geometrySqlLiteral(snapshotId)}`],
    ['releaseShardAssignments', `"releaseId" = ${geometrySqlLiteral(releaseId)}`],
    ['snapshotShardAssignments', `"snapshotId" = ${geometrySqlLiteral(snapshotId)}`],
    ['releaseProcessingActions', `"releaseId" = ${geometrySqlLiteral(releaseId)}`],
    ['stats', `"releaseId" = ${geometrySqlLiteral(releaseId)}`],
  ] as const

  return tables
    .flatMap(([tableName, where]) => {
      const rows = readGeometryCacheRows(
        cacheDir,
        bindingName,
        `SELECT * FROM "${tableName}" WHERE ${where}`,
      )
      return geometryBuildUpsertSql(tableName, rows)
    })
    .join('\n')
}

function readGeometryCacheRows(cacheDir: string, bindingName: string, query: string) {
  const sqlite = new SQLiteDatabase(join(cacheDir, `${bindingName}.sqlite`), {
    readonly: true,
  })
  try {
    return sqlite.query(query).all() as Array<Record<string, unknown>>
  } finally {
    sqlite.close()
  }
}

export function geometryBuildUpsertSql(
  tableName: string,
  rows: Array<Record<string, unknown>>,
) {
  if (rows.length === 0) return ''
  const columns = Object.keys(rows[0] ?? {})
  const quotedColumns = columns.map(column => `"${column}"`).join(', ')
  const updates = columns.map(column => `"${column}" = excluded."${column}"`).join(', ')
  const prefix = `INSERT INTO "${tableName}" (${quotedColumns}) VALUES `
  const suffix = ` ON CONFLICT DO UPDATE SET ${updates};`
  const statements: string[] = []
  let values: string[] = []

  for (const row of rows) {
    const value = `(${columns.map(column => geometrySqlLiteral(row[column])).join(', ')})`
    const rowStatement = `${prefix}${value}${suffix}`
    const rowStatementBytes = new TextEncoder().encode(rowStatement).byteLength

    if (rowStatementBytes > MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES) {
      if (values.length > 0) {
        statements.push(`${prefix}${values.join(', ')}${suffix}`)
        values = []
      }

      statements.push(
        geometryBuildChunkedUpsertSql(tableName, columns, row, prefix, suffix),
      )
      continue
    }

    const candidate = `${prefix}${[...values, value].join(', ')}${suffix}`
    const candidateBytes = new TextEncoder().encode(candidate).byteLength

    if (candidateBytes > MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES) {
      statements.push(`${prefix}${values.join(', ')}${suffix}`)
      values = [value]
    } else {
      values.push(value)
    }
  }

  if (values.length > 0) {
    statements.push(`${prefix}${values.join(', ')}${suffix}`)
  }

  return statements.join('\n')
}

function geometryBuildChunkedUpsertSql(
  tableName: string,
  columns: string[],
  row: Record<string, unknown>,
  prefix: string,
  suffix: string,
) {
  const keyColumns = geometryReplayKeyColumns(row)
  if (!keyColumns) {
    const rowBytes = new TextEncoder().encode(
      `${prefix}(${columns.map(column => geometrySqlLiteral(row[column])).join(', ')})${suffix}`,
    ).byteLength
    throw new Error(
      `Cannot replay ${tableName} geometry row: its ${rowBytes}-byte SQL statement exceeds D1's ${MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES}-byte safe limit.`,
    )
  }

  const chunkedColumns = columns
    .map(column => ({ column, value: geometrySqlLargeValue(row[column]) }))
    .filter(
      (entry): entry is { column: string; value: string | Uint8Array } =>
        entry.value !== null && !keyColumns.includes(entry.column),
    )
    .sort(
      (left, right) =>
        new TextEncoder().encode(geometrySqlLiteral(right.value)).byteLength -
        new TextEncoder().encode(geometrySqlLiteral(left.value)).byteLength,
    )
  const selectedColumns = chunkedColumns.filter(
    entry =>
      new TextEncoder().encode(geometrySqlLiteral(entry.value)).byteLength >
      MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES,
  )

  const buildPlaceholderUpsert = () => {
    const placeholderValue = `(${columns
      .map(column =>
        selectedColumns.some(entry => entry.column === column)
          ? geometrySqlLiteral('')
          : geometrySqlLiteral(row[column]),
      )
      .join(', ')})`
    return `${prefix}${placeholderValue}${suffix}`
  }
  let upsert = buildPlaceholderUpsert()
  let upsertBytes = new TextEncoder().encode(upsert).byteLength

  for (const entry of chunkedColumns) {
    if (upsertBytes <= MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES) break
    if (selectedColumns.some(selected => selected.column === entry.column)) continue

    selectedColumns.push(entry)
    upsert = buildPlaceholderUpsert()
    upsertBytes = new TextEncoder().encode(upsert).byteLength
  }

  if (selectedColumns.length === 0) {
    const rowBytes = new TextEncoder().encode(
      `${prefix}(${columns.map(column => geometrySqlLiteral(row[column])).join(', ')})${suffix}`,
    ).byteLength
    throw new Error(
      `Cannot replay ${tableName} geometry row: its ${rowBytes}-byte SQL statement exceeds D1's ${MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES}-byte safe limit.`,
    )
  }

  if (upsertBytes > MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES) {
    throw new Error(
      `Cannot replay ${tableName} geometry row: its non-chunked SQL is ${upsertBytes} bytes and exceeds D1's ${MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES}-byte safe limit.`,
    )
  }

  const where = keyColumns
    .map(column => `"${column}" = ${geometrySqlLiteral(row[column])}`)
    .join(' AND ')
  return [
    upsert,
    ...selectedColumns.flatMap(({ column, value }) => {
      const isBinary = value instanceof Uint8Array
      const updatePrefix = isBinary
        ? `UPDATE "${tableName}" SET "${column}" = CAST("${column}" || `
        : `UPDATE "${tableName}" SET "${column}" = "${column}" || `
      const updateSuffix = isBinary ? ` AS BLOB) WHERE ${where};` : ` WHERE ${where};`
      const chunkByteLimit =
        MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES -
        new TextEncoder().encode(
          `${updatePrefix}${isBinary ? "X''" : geometrySqlLiteral('')}${updateSuffix}`,
        ).byteLength

      if (chunkByteLimit <= 0) {
        throw new Error(
          `Cannot replay ${tableName} geometry row: its key columns leave no space for ${column} data within D1's ${MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES}-byte safe limit.`,
        )
      }

      const chunks = isBinary
        ? geometrySplitBytes(value, Math.floor(chunkByteLimit / 2))
        : geometrySplitUtf8(value, chunkByteLimit)

      return chunks.map(
        chunk => `${updatePrefix}${geometrySqlLiteral(chunk)}${updateSuffix}`,
      )
    }),
  ].join('\n')
}

function geometryReplayKeyColumns(row: Record<string, unknown>) {
  if (typeof row.snapshotId === 'string' && typeof row.id === 'string') {
    return ['snapshotId', 'id']
  }

  if (typeof row.id === 'string' && typeof row.versionHash === 'string') {
    return ['id', 'versionHash']
  }

  if (typeof row.sourceRecordId === 'string' && typeof row.versionHash === 'string') {
    return ['sourceRecordId', 'versionHash']
  }

  return null
}

function geometrySqlLargeValue(value: unknown) {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return JSON.stringify(value)
  return null
}

function geometrySplitUtf8(value: string, byteLimit: number) {
  const chunks: string[] = []
  let chunk = ''
  let chunkBytes = 0

  for (const character of value) {
    const characterBytes =
      new TextEncoder().encode(geometrySqlLiteral(character)).byteLength - 2

    if (chunk && chunkBytes + characterBytes > byteLimit) {
      chunks.push(chunk)
      chunk = ''
      chunkBytes = 0
    }

    chunk += character
    chunkBytes += characterBytes
  }

  if (chunk) chunks.push(chunk)

  return chunks
}

function geometrySplitBytes(value: Uint8Array, byteLimit: number) {
  if (byteLimit <= 0) return []

  const chunks: Uint8Array[] = []
  for (let start = 0; start < value.byteLength; start += byteLimit) {
    chunks.push(value.slice(start, start + byteLimit))
  }
  return chunks
}

function geometrySqlLiteralDelete(tableName: string, column: string, value: string) {
  return `DELETE FROM "${tableName}" WHERE "${column}" = ${geometrySqlLiteral(value)};`
}

function geometrySqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value)
  }
  if (value instanceof Uint8Array) {
    return `X'${Buffer.from(value).toString('hex')}'`
  }
  if (value instanceof ArrayBuffer) {
    return `X'${Buffer.from(new Uint8Array(value)).toString('hex')}'`
  }
  if (typeof value === 'object') return geometrySqlLiteral(JSON.stringify(value))
  return `'${String(value).replaceAll("'", "''")}'`
}

function resolveGeometrySourceTable(plan: GeometryUploadPlan) {
  if (plan.type === 'divisionBoundary') return 'overtureDivisionBoundaries'
  if (plan.source === 'hkgov-had') return 'hkgovHadDivisionAreas'
  if (plan.source === 'hkgov-censtatd') return 'hkgovCenstatdDivisionAreas'
  if (plan.source === 'overture') return 'overtureDivisionAreas'
  return null
}

function resolveGeometryCloudflareAccountId(target: UploadTarget) {
  const fromEnv = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  if (fromEnv) return fromEnv
  const config = JSON.parse(readFileSync(HARBOUR_WRANGLER_PATH, 'utf8')) as {
    vars?: Record<string, unknown>
    env?: Record<string, { vars?: Record<string, unknown> }>
  }
  const accountId = (
    target.environment === 'production'
      ? config.env?.production?.vars
      : config.env?.preview?.vars
  )?.CLOUDFLARE_ACCOUNT_ID
  return typeof accountId === 'string' ? accountId.trim() : undefined
}

function normaliseHkgovHadInputRow(
  row: Record<string, unknown>,
  bridge: Map<string, string> | null,
) {
  const areaId = typeof row.area_id === 'string' ? row.area_id.trim() : ''
  const divisionId = areaId ? bridge?.get(areaId) : undefined
  if (!areaId || !divisionId) {
    throw new Error(
      `HAD district area ${areaId || '<unknown>'} has no reviewed administrative identifier bridge.`,
    )
  }
  const sources = normaliseJsonArray(row.sources)
  return {
    ...row,
    id: typeof row.id === 'string' && row.id.trim() ? row.id : `HAD:${areaId}`,
    division_id: divisionId,
    sources: sources?.length ? sources : [{ dataset: 'hkgov-had', areaId }],
  }
}

function normaliseHkgovCenstatdInputRow(
  row: Record<string, unknown>,
  bridge: Map<string, string> | null,
) {
  const suppliedDivisionId =
    typeof row.division_id === 'string' ? row.division_id.trim() : ''
  if (suppliedDivisionId) {
    return {
      ...row,
      geometry: parseJsonGeometryValue(row.geometry, 'geometry'),
      id:
        typeof row.id === 'string' && row.id.trim()
          ? row.id
          : `CENSTATD:${suppliedDivisionId}`,
      source_geometry: parseJsonGeometryValue(row.source_geometry, 'source_geometry'),
      source_properties: parseJsonValue(row.source_properties, 'source_properties'),
      sources: normaliseJsonArray(row.sources) ?? [
        { dataset: 'hkgov-censtatd', sourceRecordId: suppliedDivisionId },
      ],
      division_id: suppliedDivisionId,
    }
  }
  const districtClass =
    typeof row.district_class === 'string' ? row.district_class.trim() : ''
  const divisionId = districtClass ? bridge?.get(districtClass) : undefined
  if (!districtClass || !divisionId) {
    throw new Error(
      `C&SD district area ${districtClass || '<unknown>'} has no reviewed administrative identifier bridge.`,
    )
  }
  const sources = normaliseJsonArray(row.sources)
  return {
    ...row,
    id:
      typeof row.id === 'string' && row.id.trim()
        ? row.id
        : `CENSTATD:${districtClass}`,
    division_id: divisionId,
    sources: sources?.length ? sources : [{ dataset: 'hkgov-censtatd', districtClass }],
  }
}

function geometryVariant(plan: GeometryUploadPlan) {
  const withTransform = (variant: string) =>
    plan.transform ? `${variant}:${plan.transform}` : variant
  if (plan.datasetCode === 'ds-hk-hkgov-censtatd-division-area-district') {
    return withTransform('hkgov-censtatd-landclipped')
  }
  if (plan.datasetCode === 'ds-hk-hkgov-censtatd-division-area-district-annual') {
    return withTransform('hkgov-censtatd')
  }
  if (
    plan.datasetCode ===
    'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters'
  ) {
    return withTransform('hkgov-censtatd')
  }
  if (
    plan.datasetCode ===
    'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups'
  ) {
    return withTransform('hkgov-censtatd-hma')
  }
  return datasetVariantForSource('divisionArea', plan.source, {
    cohortKey: plan.cohortKey,
    sourceVersion: plan.sourceVersion,
    transform: plan.transform,
  })
}

function isCenstatdGeometryCompanionPlan(plan: GeometryUploadPlan) {
  return (
    plan.source === 'hkgov-censtatd' &&
    plan.type === 'divisionArea' &&
    ['hkgov-censtatd', 'hkgov-censtatd:simplified'].includes(geometryVariant(plan))
  )
}

function isCenstatdPermanentLivingQuartersPlan(plan: GeometryUploadPlan) {
  return (
    plan.source === 'hkgov-censtatd' &&
    plan.datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters'
  )
}

function resolveProviderBridgeConfig(plan: GeometryUploadPlan) {
  if (plan.source === 'hkgov-had') {
    return { authority: 'hkgov-had' }
  }
  if (
    plan.source === 'hkgov-censtatd' &&
    (plan.datasetCode === 'ds-hk-hkgov-censtatd-division-area-district' ||
      plan.datasetCode === 'ds-hk-hkgov-censtatd-division-area-district-annual')
  ) {
    return { authority: 'hkgov-censtatd' }
  }
  return null
}

function normaliseHkgovPlandNewTownInputRow(row: Record<string, unknown>) {
  const newTownId = typeof row.newtown_id === 'string' ? row.newtown_id.trim() : ''
  const divisionId = typeof row.division_id === 'string' ? row.division_id.trim() : ''
  if (!newTownId || !divisionId) {
    throw new Error(
      `Planning Department New Town ${newTownId || '<unknown>'} has no cohort-scoped planning division ID.`,
    )
  }
  const sources = normaliseJsonArray(row.sources)
  return {
    ...row,
    id:
      typeof row.id === 'string' && row.id.trim()
        ? row.id
        : `PLAND:NEWTOWN:${divisionId}`,
    division_id: divisionId,
    sources: sources?.length
      ? sources
      : [{ dataset: 'hkgov-pland-new-town', newTownId }],
  }
}

function normaliseJsonArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return null

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function parseJsonValue(value: unknown, field: string): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`C&SD ${field} must be valid JSON.`)
  }
}

function parseJsonGeometryValue(value: unknown, field: string) {
  const parsed = parseJsonValue(value, field)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`C&SD ${field} must be a GeoJSON geometry.`)
  }
  return parsed
}

async function assertDivisionReferences(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  historyDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['historyDb'],
  metaDb: HarbourReadableDb,
  plan: GeometryUploadPlan,
  rows: Array<NonNullable<NormalisedGeometry>>,
) {
  const lookup = await resolveDivisionReferenceLookup(metaDb, plan)
  if (lookup.snapshots.length === 0) {
    throw new Error(
      isCenstatdPermanentLivingQuartersPlan(plan)
        ? `No published canonical Overture division snapshot exists for ${plan.regionCode}/${plan.cohortKey}; C&SD permanent living quarters references cannot be validated.`
        : `No published division snapshot exists for ${plan.regionCode}/${plan.cohortKey}; geometry references cannot be validated.`,
    )
  }
  const initialDivisionSnapshot = lookup.snapshots.at(0)
  if (!initialDivisionSnapshot) {
    throw new Error('Division reference lookup returned no snapshots.')
  }
  const referenceIds = new Set(
    rows.flatMap(row => divisionReferenceIds(plan.type, row)),
  )
  let divisionSnapshot = initialDivisionSnapshot
  let knownIds = new Set<string>()
  let selectionIndex = 0
  for (const [index, candidate] of lookup.snapshots.entries()) {
    let divisionRows = await listCurrentDivisionIds(currentDb, candidate.id)
    if (divisionRows.length === 0) {
      await restoreDivisionSnapshotFromHistory(
        currentDb as unknown as HarbourWritableDb,
        historyDb,
        candidate.id,
      )
      divisionRows = await listCurrentDivisionIds(currentDb, candidate.id)
    }
    const candidateIds = new Set(divisionRows.map(row => row.id))
    if (hasDivisionReferences(candidateIds, referenceIds)) {
      divisionSnapshot = candidate
      knownIds = candidateIds
      selectionIndex = index
      break
    }
    if (index === 0) knownIds = candidateIds
  }
  const missingReferences = rows.flatMap(row => {
    const missingIds = divisionReferenceIds(plan.type, row).filter(
      id => !knownIds.has(id),
    )
    return missingIds.length > 0
      ? [
          {
            missingIds: [...new Set(missingIds)],
            record: row.source.rawProperties,
          },
        ]
      : []
  })
  const missingIds = [
    ...new Set(missingReferences.flatMap(reference => reference.missingIds)),
  ]
  if (missingIds.length > 0) {
    throw new Error(
      [
        `Division geometry references ${missingIds.length} division IDs absent from ${divisionSnapshot.code}.`,
        ...formatMissingDivisionReferenceRecords(missingReferences),
      ].join('\n'),
    )
  }

  return {
    id: divisionSnapshot.id,
    selectedByRule: lookup.selectedByRule,
    selectionMode:
      selectionIndex === 0
        ? lookup.selectionMode
        : 'nearest_snapshot_containing_references',
  }
}

export function hasDivisionReferences(
  knownIds: ReadonlySet<string>,
  referenceIds: ReadonlySet<string>,
) {
  return [...referenceIds].every(id => knownIds.has(id))
}

async function resolveDivisionReferenceLookup(
  metaDb: HarbourReadableDb,
  plan: GeometryUploadPlan,
) {
  if (isCenstatdPermanentLivingQuartersPlan(plan)) {
    const prior =
      await resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey(
        metaDb,
        'division',
        plan.regionCode,
        plan.cohortKey,
        { publisherCode: 'overture' },
      )
    const laterSnapshots =
      await listPublishedSnapshotsForResourceTypeRegionAtOrAfterCohortKey(
        metaDb,
        'division',
        plan.regionCode,
        plan.cohortKey,
        { publisherCode: 'overture' },
      )
    const snapshots = [prior, ...laterSnapshots].filter(
      (snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot),
    )
    const uniqueSnapshots = [
      ...new Map(snapshots.map(snapshot => [snapshot.id, snapshot])).values(),
    ]
    return {
      snapshots: uniqueSnapshots,
      selectedByRule: 'api-composition:divisions:censtatd-area-type->overture-division',
      selectionMode: prior ? 'latest_at_or_before' : 'earliest_at_or_after',
    }
  }

  return {
    snapshots: [
      await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
        metaDb,
        'division',
        plan.regionCode,
        plan.cohortKey,
        { variant: geometryVariant(plan) },
      ),
    ].filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot)),
    selectedByRule: 'api-composition:divisions:division-geometry->division',
    selectionMode: 'exact_ref',
  }
}

async function listCurrentDivisionIds(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  snapshotId: string,
) {
  return currentDb
    .select({ id: currentSchema.divisions.id })
    .from(currentSchema.divisions)
    .where(eq(currentSchema.divisions.snapshotId, snapshotId))
    .all()
}

// A division release may publish before its required geometry companion. If the
// asynchronous cleanup removes that incomplete snapshot in the meantime, rebuild
// its current projection from the immutable history snapshot before validation.
async function restoreDivisionSnapshotFromHistory(
  currentDb: HarbourWritableDb,
  historyDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['historyDb'],
  snapshotId: string,
) {
  const [divisionRows, i18nRows] = await Promise.all([
    historyDb
      .select({
        bbox: historySchema.divisions.bbox,
        cartography: historySchema.divisions.cartography,
        geometry: historySchema.divisions.geometry,
        hierarchy: historySchema.divisions.hierarchy,
        id: historySchema.divisions.id,
        identifiers: historySchema.divisions.identifiers,
        level: historySchema.divisions.level,
        sourceKeys: historySchema.divisions.sourceKeys,
        sources: historySchema.divisions.sources,
        type: historySchema.divisions.type,
        wikidata: historySchema.divisions.wikidata,
      })
      .from(historySchema.divisions)
      .where(eq(historySchema.divisions.snapshotId, snapshotId))
      .all(),
    historyDb
      .select({
        divisionId: historySchema.divisionsI18n.divisionId,
        isLocaleInferred: historySchema.divisionsI18n.isLocaleInferred,
        locale: historySchema.divisionsI18n.locale,
        name: historySchema.divisionsI18n.name,
        nameAlts: historySchema.divisionsI18n.nameAlts,
        nameRules: historySchema.divisionsI18n.nameRules,
        nameVariant: historySchema.divisionsI18n.nameVariant,
      })
      .from(historySchema.divisionsI18n)
      .where(eq(historySchema.divisionsI18n.snapshotId, snapshotId))
      .all(),
  ])

  if (divisionRows.length === 0) return

  const now = toIsoTimestamp()
  for (const chunk of chunkArray(divisionRows, 8)) {
    await currentDb
      .insert(currentSchema.divisions)
      .values(
        chunk.map(row => ({
          ...row,
          createdAt: now,
          snapshotId,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing()
      .run()
  }
  for (const chunk of chunkArray(i18nRows, 8)) {
    await currentDb
      .insert(currentSchema.divisionsI18n)
      .values(
        chunk.map(row => ({
          ...row,
          createdAt: now,
          snapshotId,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing()
      .run()
  }
}

function divisionReferenceIds(
  type: GeometryUploadPlan['type'],
  row: NonNullable<NormalisedGeometry>,
) {
  const canonical = row.canonical as {
    divisionId?: string
    leftDivisionId?: string
    rightDivisionId?: string
  }
  return type === 'divisionArea'
    ? canonical.divisionId
      ? [canonical.divisionId]
      : []
    : [canonical.leftDivisionId, canonical.rightDivisionId].filter((id): id is string =>
        Boolean(id),
      )
}

export function formatMissingDivisionReferenceRecords(
  references: Array<{ missingIds: string[]; record: unknown }>,
) {
  const examples = references.slice(0, 3)
  const label = examples.length === 1 ? 'Affected record:' : 'Affected records:'
  const records = examples.map((reference, index) =>
    [
      examples.length > 1
        ? `Record ${index + 1} (missing division IDs: ${reference.missingIds.join(', ')}):`
        : `Missing division IDs: ${reference.missingIds.join(', ')}`,
      formatDiagnosticRecord(reference.record),
    ].join('\n'),
  )
  const remaining = references.length - examples.length

  return [
    '',
    label,
    ...records,
    ...(remaining > 0
      ? [`... and ${remaining} more affected record${remaining === 1 ? '' : 's'}.`]
      : []),
  ]
}

function bigintJsonReplacer(_key: string, value: unknown) {
  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (Array.isArray(value) && value.length > 3) {
    return [...value.slice(0, 3), `... ${value.length - 3} more`]
  }

  return value
}

function formatDiagnosticRecord(record: unknown) {
  return JSON.stringify(record, bigintJsonReplacer, 2)
}

/**
 * Produces the shared map-display representation for every Hong Kong Government
 * area publisher. Exact publisher geometry remains in the source assertion and
 * in the exact snapshot; this pass only writes the named display snapshot.
 */
function simplifyHkgovDivisionAreas(rows: NormalisedDivisionArea[]) {
  const exactGeometries = rows.map(row =>
    requireAreaGeometry(row.canonical.geometry, row.canonical.id),
  )
  const reader = new GeoJSONReader(new GeometryFactory())
  const parsed = reader.read({
    type: 'GeometryCollection',
    geometries: exactGeometries.map(toLocalMetreGeometry),
  })
  const simplified = TopologyPreservingSimplifier.simplify(
    parsed,
    HKGOV_DISPLAY_SIMPLIFICATION_TOLERANCE_METRES,
  )
  if (!new IsValidOp(simplified).isValid()) {
    throw new Error(
      'Hong Kong Government display simplification produced invalid geometry.',
    )
  }
  const written = new GeoJSONWriter().write(simplified) as unknown
  if (
    !isGeoJsonGeometryCollection(written) ||
    written.geometries.length !== exactGeometries.length
  ) {
    throw new Error('Hong Kong Government display simplification changed the area set.')
  }
  return rows.map((row, index) => {
    const simplifiedGeometry = written.geometries[index]
    if (!simplifiedGeometry) {
      throw new Error(
        `Display simplification did not produce an area for ${row.canonical.id}.`,
      )
    }
    const geometry = requireAreaGeometry(
      fromLocalMetreGeometry(simplifiedGeometry),
      row.canonical.id,
    )
    return {
      ...row,
      canonical: {
        ...row.canonical,
        bbox: calculateGeoJsonBbox(geometry),
        geometry,
      },
      source: {
        ...row.source,
        derivation: {
          inputGeometryProjection: 'EPSG:4326',
          method: 'topology-preserving-simplification',
          toleranceMetres: HKGOV_DISPLAY_SIMPLIFICATION_TOLERANCE_METRES,
          workingProjection: 'local-equirectangular',
        },
      },
    }
  })
}

function requireAreaGeometry(value: unknown, id: string): GeoJsonGeometry {
  if (
    !value ||
    typeof value !== 'object' ||
    !('type' in value) ||
    ((value as { type?: unknown }).type !== 'Polygon' &&
      (value as { type?: unknown }).type !== 'MultiPolygon')
  ) {
    throw new Error(`Display simplification did not produce an area for ${id}.`)
  }
  return value as GeoJsonGeometry
}

function isGeoJsonGeometryCollection(
  value: unknown,
): value is { type: 'GeometryCollection'; geometries: GeoJsonGeometry[] } {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'GeometryCollection' &&
    Array.isArray((value as { geometries?: unknown }).geometries)
  )
}

function toLocalMetreGeometry(geometry: GeoJsonGeometry): GeoJsonGeometry {
  return mapGeometryPositions(geometry, ([longitude, latitude, elevation]) =>
    positionWithOptionalElevation(
      (longitude - HONG_KONG_REFERENCE_LONGITUDE) * METRES_PER_DEGREE_LONGITUDE,
      (latitude - HONG_KONG_REFERENCE_LATITUDE) * METRES_PER_DEGREE_LATITUDE,
      elevation,
    ),
  )
}

function fromLocalMetreGeometry(geometry: GeoJsonGeometry): GeoJsonGeometry {
  return mapGeometryPositions(geometry, ([x, y, elevation]) =>
    positionWithOptionalElevation(
      x / METRES_PER_DEGREE_LONGITUDE + HONG_KONG_REFERENCE_LONGITUDE,
      y / METRES_PER_DEGREE_LATITUDE + HONG_KONG_REFERENCE_LATITUDE,
      elevation,
    ),
  )
}

function positionWithOptionalElevation(
  first: number,
  second: number,
  elevation: number | undefined,
): GeoJsonPosition {
  return elevation === undefined ? [first, second] : [first, second, elevation]
}

function mapGeometryPositions(
  geometry: GeoJsonGeometry,
  transform: (position: GeoJsonPosition) => GeoJsonPosition,
): GeoJsonGeometry {
  if (geometry.type === 'GeometryCollection') {
    return {
      type: 'GeometryCollection',
      geometries: geometry.geometries.map(child =>
        mapGeometryPositions(child, transform),
      ),
    }
  }
  const mapValue = (value: unknown): unknown => {
    if (!Array.isArray(value)) return value
    if (typeof value[0] === 'number') return transform(value as GeoJsonPosition)
    return value.map(mapValue)
  }
  return { ...geometry, coordinates: mapValue(geometry.coordinates) } as GeoJsonGeometry
}

async function writeGeometryRows(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  type: GeometryUploadPlan['type'],
  rows: Array<NonNullable<NormalisedGeometry>>,
  version: {
    source: GeometryUploadPlan['source']
    variant: string
    releaseId: string
    releaseCode: string
    snapshotId: string
    parentSnapshotId: string | null
    cohortKey: string
    merge?: boolean
    transform?: GeometryUploadPlan['transform']
  },
  onProgress?: GeometryWriteProgress,
) {
  const now = toIsoTimestamp()
  const currentTable =
    type === 'divisionArea'
      ? currentSchema.divisionAreas
      : currentSchema.divisionBoundaries
  const historyTable =
    type === 'divisionArea'
      ? historySchema.divisionAreas
      : historySchema.divisionBoundaries
  const sourceTable =
    type === 'divisionArea'
      ? version.source === 'hkgov-had'
        ? sourceSchema.sourceHkgovHadDivisionAreas
        : version.source === 'hkgov-censtatd'
          ? sourceSchema.sourceHkgovCenstatdDivisionAreas
          : sourceSchema.sourceOvertureDivisionAreas
      : sourceSchema.sourceOvertureDivisionBoundaries
  const isDisplayDerivative = version.transform === 'simplified'
  const isCenstatdDerivative =
    version.source === 'hkgov-censtatd' && isDisplayDerivative
  // Statistics archive geometries are already retained in
  // hkgovCenstatdStatistics. The district-only source table has mandatory
  // district columns and must not be misused for Area/HMA assertions.
  const isCenstatdStatisticGeometry =
    version.source === 'hkgov-censtatd' &&
    rows.some(
      row =>
        !(
          row.source.rawProperties &&
          typeof row.source.rawProperties === 'object' &&
          !Array.isArray(row.source.rawProperties) &&
          'dc_class' in row.source.rawProperties
        ),
    )
  onProgress?.(version.merge ? 'retain companion rows' : 'clear current rows')
  if (!version.merge) {
    await context.currentDb
      .delete(currentTable)
      // The current-table key is `(snapshotId, id)`, not `(snapshotId, variant, id)`.
      // A snapshot therefore represents exactly one geometry variant. Clear the full
      // snapshot so a retry also replaces rows written before a variant was renamed
      // (for example the legacy `hkgov-censtatd` C&SD variant).
      .where(eq(currentTable.snapshotId, version.snapshotId))
      .run()
  }
  const historyHashes = new Map<string, string>()
  const sourceHashes = new Map<string, string>()
  onProgress?.('hash geometry rows', 0, rows.length)
  for (const [index, row] of rows.entries()) {
    historyHashes.set(row.canonical.id, await hashDivisionGeometryRow(row.canonical))
    if (
      !isDisplayDerivative &&
      !isCenstatdStatisticGeometry &&
      version.source !== 'hkgov-pland-pu' &&
      version.source !== 'hkgov-pland-new-town'
    ) {
      sourceHashes.set(
        row.source.sourceRecordId,
        await hashGeometrySourceAssertion(row.source, version.source),
      )
    }
    if ((index + 1) % 32 === 0 || index + 1 === rows.length) {
      onProgress?.('hash geometry rows', index + 1, rows.length)
    }
  }
  // Churn is a property of the snapshot lineage, not of the mutable history
  // cache. In particular, independent C&SD census cohorts have no parent and
  // must therefore start with an empty baseline rather than compare against
  // whichever geometry snapshot was most recently written.
  const previousById = await getGeometryChurnBaseline(
    context.currentDb,
    type,
    version.parentSnapshotId,
  )
  const churn = createGeometryChurnCounts(rows, historyHashes, previousById)
  onProgress?.('close history rows')
  const closedHistoryRows = version.merge
    ? []
    : await closeChangedRows(
        context.historyDb,
        historyTable,
        historyTable.id,
        historyHashes,
        {
          isCurrent: false,
        },
      )
  await recordSnapshotVersionChanges(
    context.historyDb as unknown as HarbourWritableDb,
    {
      snapshotId: version.snapshotId,
      sourceReleaseId: version.releaseId,
      recordType: type,
      operation: 'delete',
      changes: closedHistoryRows.map(row => ({ recordId: row.id })),
    },
  )
  onProgress?.('close source rows')
  if (
    !isDisplayDerivative &&
    !isCenstatdStatisticGeometry &&
    version.source !== 'hkgov-pland-pu' &&
    version.source !== 'hkgov-pland-new-town'
  ) {
    await closeChangedRows(
      context.sourceDb,
      sourceTable,
      sourceTable.sourceRecordId,
      sourceHashes,
      { isCurrent: false, validToRelease: version.releaseCode },
    )
  }
  onProgress?.('build write batches')
  const currentRows = rows.map(row => ({
    ...row.canonical,
    geometry: shouldCompressCanonicalGeometry(version.source, version.transform)
      ? compressJsonBrotli(
          row.canonical.geometry,
          version.source === 'hkgov-pland-pu' ? MAX_BROTLI_QUALITY : undefined,
        )
      : row.canonical.geometry,
    snapshotId: version.snapshotId,
    createdAt: now,
    updatedAt: now,
  }))
  const historyRows = await Promise.all(
    rows.map(async row => ({
      ...row.canonical,
      geometry: shouldCompressCanonicalGeometry(version.source, version.transform)
        ? compressJsonBrotli(
            row.canonical.geometry,
            version.source === 'hkgov-pland-pu' ? MAX_BROTLI_QUALITY : undefined,
          )
        : row.canonical.geometry,
      versionHash: requireGeometryHash(historyHashes, row.canonical.id),
      sourceReleaseId: version.releaseId,
      snapshotId: version.snapshotId,
      isCurrent: true,
      createdAt: now,
      updatedAt: now,
    })),
  )
  const sourceRows =
    isDisplayDerivative ||
    isCenstatdStatisticGeometry ||
    version.source === 'hkgov-pland-pu' ||
    version.source === 'hkgov-pland-new-town'
      ? []
      : await Promise.all(
          rows.map(async row => {
            const { sourceGeometry, ...sourceWithProvenance } = row.source
            const sourceAssertion = sourceWithProvenance
            const sourceProperties = row.source.rawProperties as Record<string, unknown>
            return {
              ...sourceAssertion,
              ...(version.source === 'hkgov-had'
                ? {
                    objectId: asOptionalInteger(sourceProperties.OBJECTID),
                    cdsiAdminAreaId: asOptionalInteger(
                      sourceProperties.CSDI_ADMIN_AREA_ID,
                    ),
                    areaType: asOptionalString(sourceProperties.AREA_TYPE),
                    areaId: asOptionalString(sourceProperties.AREA_ID),
                    areaCode: asOptionalString(sourceProperties.AREA_CODE),
                    sourceGeometry,
                  }
                : version.source === 'hkgov-censtatd'
                  ? {
                      censusYear: version.cohortKey,
                      districtClass: requireString(
                        sourceProperties.dc_class,
                        'C&SD dc_class',
                      ),
                      districtCode: requireInteger(sourceProperties.dc, 'C&SD dc'),
                      districtEn: requireString(sourceProperties.dc_eng, 'C&SD dc_eng'),
                      districtZhHant: requireString(
                        sourceProperties.dc_chi,
                        'C&SD dc_chi',
                      ),
                      sourceGeometry: compressJsonBrotli(sourceGeometry),
                    }
                  : {}),
              versionHash: requireGeometryHash(sourceHashes, row.source.sourceRecordId),
              releaseId: version.releaseId,
              validFromRelease: version.releaseCode,
              validToRelease: null,
              isCurrent: true,
              createdAt: now,
              updatedAt: now,
            }
          }),
        )

  let writtenCurrentRows = 0
  onProgress?.('write current rows', writtenCurrentRows, currentRows.length)
  for (const chunk of chunkRows(currentRows)) {
    await context.currentDb
      .insert(currentTable)
      .values(chunk as never)
      .onConflictDoUpdate({
        target: [currentTable.snapshotId, currentTable.id],
        set: {
          bbox: sql`excluded.bbox`,
          geometry: sql`excluded.geometry`,
          isLand: sql`excluded.isLand`,
          isTerritorial: sql`excluded.isTerritorial`,
          sourceKeys: sql`excluded.sourceKeys`,
          sources: sql`excluded.sources`,
          type: sql`excluded.type`,
          variant: sql`excluded.variant`,
          updatedAt: now,
        },
      })
      .run()
    writtenCurrentRows += chunk.length
    onProgress?.('write current rows', writtenCurrentRows, currentRows.length)
  }
  if (historyRows.length) {
    let writtenHistoryRows = 0
    onProgress?.('write history rows', writtenHistoryRows, historyRows.length)
    for (const chunk of chunkRows(historyRows)) {
      await context.historyDb
        .insert(historyTable)
        .values(chunk as never)
        .onConflictDoUpdate({
          target: [historyTable.id, historyTable.versionHash],
          set: {
            sourceReleaseId: version.releaseId,
            snapshotId: version.snapshotId,
            isCurrent: true,
            updatedAt: now,
          },
        })
        .run()
      writtenHistoryRows += chunk.length
      onProgress?.('write history rows', writtenHistoryRows, historyRows.length)
    }
    await recordSnapshotVersionChanges(
      context.historyDb as unknown as HarbourWritableDb,
      {
        snapshotId: version.snapshotId,
        sourceReleaseId: version.releaseId,
        recordType: type,
        operation: 'upsert',
        changes: historyRows.map(row => ({
          recordId: row.id,
          versionHash: row.versionHash,
        })),
      },
    )
  }
  if (sourceRows.length) {
    let writtenSourceRows = 0
    onProgress?.('write source rows', writtenSourceRows, sourceRows.length)
    for (const chunk of chunkRows(sourceRows)) {
      await context.sourceDb
        .insert(sourceTable)
        .values(chunk as never)
        .onConflictDoUpdate({
          target: [sourceTable.sourceRecordId, sourceTable.versionHash],
          set: {
            releaseId: version.releaseId,
            validFromRelease: version.releaseCode,
            validToRelease: null,
            isCurrent: true,
            updatedAt: now,
          },
        })
        .run()
      writtenSourceRows += chunk.length
      onProgress?.('write source rows', writtenSourceRows, sourceRows.length)
    }
  }
  if (isCenstatdDerivative && !isCenstatdStatisticGeometry) {
    await writeCenstatdSourceDerivatives(
      context.sourceDb as unknown as HarbourReadableDb & HarbourWritableDb,
      rows,
      version,
      now,
      historyHashes,
    )
  }

  return { churn, currentRows }
}

function requireGeometryHash(hashes: Map<string, string>, id: string) {
  const hash = hashes.get(id)
  if (!hash) throw new Error(`Missing computed geometry hash for ${id}.`)
  return hash
}

function hashGeometrySourceAssertion(
  row: NonNullable<NormalisedGeometry>['source'],
  source: GeometryUploadPlan['source'],
) {
  if (source !== 'hkgov-censtatd') return hashDivisionGeometrySourceRow(row)

  // The bridge-derived canonical division relationship is needed to write the
  // canonical geometry, but it is neither C&SD evidence nor part of the
  // source assertion's identity.
  const sourceAssertion: Record<string, unknown> = { ...row }
  delete sourceAssertion.derivation
  delete sourceAssertion.divisionId
  return hashDivisionGeometrySourceRow(sourceAssertion)
}

async function writeCenstatdSourceDerivatives(
  db: HarbourReadableDb & HarbourWritableDb,
  rows: Array<NonNullable<NormalisedGeometry>>,
  version: {
    cohortKey: string
    releaseId: string
    releaseCode: string
    transform?: 'simplified'
  },
  now: string,
  historyHashes: Map<string, string>,
) {
  const transform = version.transform
  if (!transform) {
    throw new Error('C&SD derivative write requires a named transform.')
  }

  const sources = sourceSchema.sourceHkgovCenstatdDivisionAreas
  const derivatives = sourceSchema.sourceHkgovCenstatdDivisionAreaDerivatives
  const exactRows = await db
    .select({
      censusYear: sources.censusYear,
      sourceRecordId: sources.sourceRecordId,
      versionHash: sources.versionHash,
    })
    .from(sources)
    .where(eq(sources.isCurrent, true))
    .all()
  const exactHashByRecordAndCohort = new Map(
    exactRows.map(row => [`${row.sourceRecordId}:${row.censusYear}`, row.versionHash]),
  )
  const nextHashes = new Map<string, string>()
  const derivativeRows = await Promise.all(
    rows.map(async row => {
      const censusYear = version.cohortKey
      const inputVersionHash = exactHashByRecordAndCohort.get(
        `${row.source.sourceRecordId}:${censusYear}`,
      )
      if (!inputVersionHash) {
        throw new Error(
          `C&SD derivative ${row.source.sourceRecordId} (${censusYear}) requires its exact source assertion to be ingested first.`,
        )
      }
      const derivation = row.source.derivation
      if (!derivation) {
        throw new Error(
          `C&SD derivative ${row.source.sourceRecordId} has no derivation metadata.`,
        )
      }
      const versionHash = requireGeometryHash(historyHashes, row.canonical.id)
      nextHashes.set(`${row.source.sourceRecordId}:${inputVersionHash}`, versionHash)
      return {
        sourceRecordId: row.source.sourceRecordId,
        inputVersionHash,
        transform,
        derivation,
        geometry: row.canonical.geometry,
        bbox: row.canonical.bbox,
        versionHash,
        releaseId: version.releaseId,
        validFromRelease: version.releaseCode,
        validToRelease: null,
        isCurrent: true,
        createdAt: now,
        updatedAt: now,
      }
    }),
  )

  const currentDerivatives = await db
    .select({
      inputVersionHash: derivatives.inputVersionHash,
      sourceRecordId: derivatives.sourceRecordId,
      versionHash: derivatives.versionHash,
    })
    .from(derivatives)
    .where(and(eq(derivatives.isCurrent, true), eq(derivatives.transform, transform)))
    .all()
  for (const derivative of currentDerivatives) {
    const key = `${derivative.sourceRecordId}:${derivative.inputVersionHash}`
    // This upload covers one census cohort. Other cohorts may use the same
    // C&SD district record IDs, so only supersede a derivative of an exact
    // assertion represented in this upload.
    if (!nextHashes.has(key)) continue
    if (nextHashes.get(key) === derivative.versionHash) continue
    await db
      .update(derivatives)
      .set({ isCurrent: false, validToRelease: version.releaseCode })
      .where(
        and(
          eq(derivatives.sourceRecordId, derivative.sourceRecordId),
          eq(derivatives.inputVersionHash, derivative.inputVersionHash),
          eq(derivatives.transform, transform),
          eq(derivatives.versionHash, derivative.versionHash),
          eq(derivatives.isCurrent, true),
        ),
      )
      .run()
  }
  for (const chunk of chunkRows(derivativeRows)) {
    await db
      .insert(derivatives)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          derivatives.sourceRecordId,
          derivatives.inputVersionHash,
          derivatives.transform,
          derivatives.versionHash,
        ],
        set: {
          releaseId: version.releaseId,
          validFromRelease: version.releaseCode,
          validToRelease: null,
          isCurrent: true,
          updatedAt: now,
        },
      })
      .run()
  }
}

function updateDbCacheProgress(
  progress: LocalUploadProgress,
  event: LocalDbCacheProgressEvent,
) {
  if (event.target !== 'preview' && event.target !== 'production') {
    return
  }

  const current = Math.min(event.current, event.total)
  const label = formatGeometryProgressLabel(
    'Open local D1',
    describeDbCacheSubject(event),
    current,
    event.total,
  )

  if (!progress.hasActivePhase()) {
    progress.beginPhase(label, { current, max: event.total })
  } else {
    progress.update(current, { label, max: event.total })
  }
}

function formatGeometryProgressLabel(
  action: string,
  subject: string,
  current?: number,
  total?: number,
) {
  return formatRunningPhaseLabel(colorTeal(action), colorRed(subject), current, total)
}

function formatGeometryCompletedLabel(
  action: string,
  subject: string,
  count?: number,
  durationMs?: number,
) {
  return appendPhaseDetails(
    formatCompletedPhaseLabel(colorTeal(action), colorRed(subject), count),
    [formatDurationMs(durationMs ?? Number.NaN)],
  )
}

async function runGeometryProgressPhase<T>(
  progress: LocalUploadProgress,
  action: string,
  subject: string,
  operation: () => Promise<T>,
) {
  return runLocalProgressPhase(progress, { action, subject }, operation)
}

function describeRemoteGeometryImport(
  name: 'current' | 'history' | 'meta' | 'source',
  plan: GeometryUploadPlan,
  target: UploadTarget,
) {
  switch (name) {
    case 'current':
      return formatTargetSubject(`current ${plan.type}`, target)
    case 'history':
      return formatTargetSubject(`history ${plan.type}`, target)
    case 'meta':
      return formatTargetSubject('snapshot metadata', target)
    case 'source':
      return formatTargetSubject(`source ${plan.type}`, target)
  }
}

function formatTargetEnvironment(target: UploadTarget) {
  return target.remote && target.environment === 'production'
    ? 'prod'
    : target.environment
}

function formatTargetSubject(subject: string, target: UploadTarget) {
  return `${colorRed(subject)} ${colorYellow(`@ ${formatTargetEnvironment(target)}`)}`
}

function formatLocalTargetSubject(subject: string) {
  return `${colorRed(subject)} ${colorYellow('@ local')}`
}

function formatMirrorSubject(target: UploadTarget, reused: boolean) {
  if (!target.remote) return colorRed('local database')

  return `${colorYellow(formatTargetEnvironment(target))} ${colorRed(`mirror${reused ? ' (hit)' : ''}`)}`
}

function describeDbCacheSubject(event: LocalDbCacheProgressEvent) {
  const tableName = event.tableName
    ? event.filter
      ? `${event.tableName}:${event.filter}`
      : event.tableName
    : null

  switch (event.action) {
    case 'check-cache':
      return `${event.target}.manifest`
    case 'export-binding':
      return tableName
        ? `${event.bindingName}.${tableName}`
        : `${event.bindingName}.export`
    case 'reuse-cache':
      return `${event.target}.reuse`
    case 'mirror-table':
      return tableName ? `${event.bindingName}.${tableName}` : event.bindingName
    case 'copy-binding':
      return `${event.bindingName}.sqlite`
    case 'validate-binding':
      return `${event.bindingName}.validate`
  }
}

function chunkRows<T>(rows: T[], size = 32) {
  const chunks: T[][] = []
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size))
  }
  return chunks
}

async function closeChangedRows(
  db: any,
  table: any,
  idColumn: any,
  currentHashes: Map<string, string>,
  values: Record<string, unknown>,
) {
  const existing = await db
    .select({ id: idColumn, versionHash: table.versionHash })
    .from(table)
    .where(eq(table.isCurrent, true))
    .all()
  const closedRows = []
  for (const row of existing) {
    if (currentHashes.get(row.id) === row.versionHash) continue
    await db.update(table).set(values).where(eq(idColumn, row.id)).run()
    closedRows.push(row)
  }
  return closedRows
}

function geometryStatRow(
  dimension: string,
  metric: string,
  value: number,
  groupBy: string | null = null,
  groupValue: string | null = null,
) {
  return {
    type: 'release',
    dimension,
    metric,
    metricUnit: 'count',
    value,
    groupBy,
    groupValue,
  }
}

export function shouldCompressCanonicalGeometry(
  source: GeometryUploadPlan['source'],
  transform: GeometryUploadPlan['transform'],
) {
  return (
    (source === 'hkgov-censtatd' || source === 'hkgov-pland-pu') &&
    transform === undefined
  )
}

/** Only the exact source pass owns release-level geometry measurements. */
export function shouldWriteExactGeometryReleaseStats(
  transform: GeometryUploadPlan['transform'],
) {
  return transform !== 'simplified'
}

type GeometryChurnCounts = {
  added: number
  byType: Map<string, GeometryChurnCounts>
  changed: number
  count: number
  removed: number
  unchanged: number
}

function createEmptyGeometryChurnCounts(): GeometryChurnCounts {
  return { added: 0, byType: new Map(), changed: 0, count: 0, removed: 0, unchanged: 0 }
}

function churnCountsForType(churn: GeometryChurnCounts, type: string) {
  const existing = churn.byType.get(type)
  if (existing) return existing
  const counts = createEmptyGeometryChurnCounts()
  churn.byType.set(type, counts)
  return counts
}

export function createGeometryChurnCounts(
  rows: Array<NonNullable<NormalisedGeometry>>,
  hashes: Map<string, string>,
  previousById: Map<string, { id: string; type: string; versionHash: string }>,
) {
  const churn = createEmptyGeometryChurnCounts()

  for (const row of rows) {
    const previous = previousById.get(row.canonical.id)
    const typeCounts = churnCountsForType(churn, row.canonical.type)
    churn.count += 1
    typeCounts.count += 1

    if (!previous) {
      churn.added += 1
      typeCounts.added += 1
    } else if (previous.versionHash === hashes.get(row.canonical.id)) {
      churn.unchanged += 1
      typeCounts.unchanged += 1
    } else {
      churn.changed += 1
      typeCounts.changed += 1
    }
  }

  for (const previous of previousById.values()) {
    if (hashes.has(previous.id)) continue
    churn.removed += 1
    churnCountsForType(churn, previous.type).removed += 1
  }

  return churn
}

async function getGeometryChurnBaseline(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  type: GeometryUploadPlan['type'],
  parentSnapshotId: string | null,
) {
  if (!parentSnapshotId) {
    return new Map<string, { id: string; type: string; versionHash: string }>()
  }

  const parentRows =
    type === 'divisionArea'
      ? await currentDb
          .select()
          .from(currentSchema.divisionAreas)
          .where(eq(currentSchema.divisionAreas.snapshotId, parentSnapshotId))
          .all()
      : await currentDb
          .select()
          .from(currentSchema.divisionBoundaries)
          .where(eq(currentSchema.divisionBoundaries.snapshotId, parentSnapshotId))
          .all()

  return new Map(
    await Promise.all(
      parentRows.map(
        async row =>
          [
            row.id,
            {
              id: row.id,
              type: row.type,
              versionHash: await hashDivisionGeometryRow(row),
            },
          ] as const,
      ),
    ),
  )
}

async function buildGeometryStats(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  historyDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['historyDb'],
  metaDb: HarbourReadableDb,
  plan: GeometryUploadPlan,
  rows: Array<NonNullable<NormalisedGeometry>>,
  churn: GeometryChurnCounts,
) {
  const churnStats = buildGeometryChurnStatRows(plan.type, churn)
  if (isHousingMarketAreaPlan(plan)) {
    // Housing Market Areas are their own geographic domain. Their records are
    // shown on the district map only after a positive-area spatial
    // intersection with the official C&SD district geometry; they must not
    // contribute their full geometry measurements to every district they cross.
    return [
      ...churnStats,
      ...buildHousingMarketAreaDistrictDistributionRows(
        rows,
        await resolveHousingMarketAreaDistrictGeometries(currentDb, historyDb, metaDb),
      ),
    ]
  }
  if (!supportsDistrictGeometryStatistics(plan)) {
    // Statistics geography, Planning Units/Subunits, and New Towns are
    // separate division domains. Their geometry needs a domain-specific
    // grouping contract rather than a misleading district assignment, while
    // lifecycle churn remains useful.
    return churnStats
  }
  const districts = await resolveGeometryDistricts(currentDb, metaDb, plan)
  if (resolveProviderBridgeConfig(plan)) {
    for (const row of rows) {
      for (const divisionId of divisionReferenceIds(plan.type, row)) {
        // HAD and C&SD bridges resolve these canonical identifiers directly to
        // districts, including historical cohorts whose generic hierarchy has
        // no matching snapshot entry.
        if (!districts.has(divisionId)) districts.set(divisionId, divisionId)
      }
    }
  }
  const geometryRows =
    plan.source === 'overture'
      ? selectDistrictRelevantGeometryRecords(
          plan.type,
          rows.map(row => ({
            ...row.canonical,
            geometry: row.canonical.geometry as GeoJsonGeometry,
          })),
          districts,
        ).records
      : rows.map(row => ({
          ...row.canonical,
          geometry: row.canonical.geometry as GeoJsonGeometry,
        }))
  return [
    ...churnStats,
    ...buildGeometryReleaseStatsRows(
      plan.type,
      calculateDistrictGeometryStatistics(plan.type, geometryRows, districts),
    ),
    ...buildGeometryDistrictDistributionRows(plan.type, rows, districts),
  ]
}

function isHousingMarketAreaPlan(plan: GeometryUploadPlan) {
  return (
    plan.type === 'divisionArea' &&
    plan.source === 'hkgov-censtatd' &&
    plan.datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups'
  )
}

export function supportsDistrictGeometryStatistics(plan: GeometryUploadPlan) {
  return (
    plan.source === 'hkgov-had' ||
    plan.source === 'overture' ||
    (plan.source === 'hkgov-censtatd' &&
      (plan.datasetCode === 'ds-hk-hkgov-censtatd-division-area-district' ||
        plan.datasetCode === 'ds-hk-hkgov-censtatd-division-area-district-annual'))
  )
}

function buildGeometryChurnStatRows(
  _type: GeometryUploadPlan['type'],
  churn: GeometryChurnCounts,
) {
  const rows = [
    geometryStatRow('count', 'churn', churn.count),
    geometryStatRow('added_count', 'churn', churn.added),
    geometryStatRow('changed_count', 'churn', churn.changed),
    geometryStatRow('removed_count', 'churn', churn.removed),
    geometryStatRow('unchanged_count', 'churn', churn.unchanged),
  ]

  for (const [groupValue, counts] of [...churn.byType].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    rows.push(
      geometryStatRow('count', 'churn', counts.count, 'type', groupValue),
      geometryStatRow('added_count', 'churn', counts.added, 'type', groupValue),
      geometryStatRow('changed_count', 'churn', counts.changed, 'type', groupValue),
      geometryStatRow('removed_count', 'churn', counts.removed, 'type', groupValue),
      geometryStatRow('unchanged_count', 'churn', counts.unchanged, 'type', groupValue),
    )
  }

  return rows
}

async function resolveGeometryDistricts(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  metaDb: HarbourReadableDb,
  plan: GeometryUploadPlan,
) {
  if (resolveProviderBridgeConfig(plan)) {
    // HAD and C&SD geometries are normalised through cohort-scoped identifier
    // bridges to canonical district IDs. No unrelated division snapshot may
    // replace that reviewed source mapping.
    return new Map<string, string>()
  }
  const snapshot =
    (await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
      metaDb,
      'division',
      plan.regionCode,
      plan.cohortKey,
      { variant: plan.source },
    )) ??
    (await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
      metaDb,
      'division',
      plan.regionCode,
      plan.cohortKey,
    ))
  if (!snapshot) {
    throw new Error(
      `No published division snapshot exists for ${plan.regionCode}/${plan.cohortKey}; geometry statistics require versioned district assignments.`,
    )
  }

  const divisions = await currentDb
    .select({
      hierarchy: currentSchema.divisions.hierarchy,
      id: currentSchema.divisions.id,
      type: currentSchema.divisions.type,
    })
    .from(currentSchema.divisions)
    .where(eq(currentSchema.divisions.snapshotId, snapshot.id))
    .all()

  return new Map(
    divisions.flatMap(division => {
      if (division.type === 'district') return [[division.id, division.id]]
      if (!Array.isArray(division.hierarchy)) return []

      const district = division.hierarchy.find(
        entry =>
          entry &&
          typeof entry === 'object' &&
          (entry as Record<string, unknown>).type === 'district' &&
          typeof (entry as Record<string, unknown>).division_id === 'string',
      ) as Record<string, unknown> | undefined
      return typeof district?.division_id === 'string'
        ? [[division.id, district.division_id]]
        : []
    }),
  )
}

async function resolveHousingMarketAreaDistrictGeometries(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  historyDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['historyDb'],
  metaDb: HarbourReadableDb,
) {
  const currentRows = await currentDb
    .select({
      divisionId: currentSchema.divisionAreas.divisionId,
      geometry: currentSchema.divisionAreas.geometry,
      updatedAt: currentSchema.divisionAreas.updatedAt,
    })
    .from(currentSchema.divisionAreas)
    .where(eq(currentSchema.divisionAreas.variant, CENSTATD_2021_DISTRICT_VARIANT))
    .orderBy(desc(currentSchema.divisionAreas.updatedAt))
    .all()

  const snapshot =
    currentRows.length > 0
      ? null
      : await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
          metaDb,
          'divisionArea',
          'hk',
          '2021',
          { variant: CENSTATD_2021_DISTRICT_VARIANT },
        )
  const rows =
    currentRows.length > 0
      ? currentRows
      : snapshot
        ? await historyDb
            .select({
              divisionId: historySchema.divisionAreas.divisionId,
              geometry: historySchema.divisionAreas.geometry,
              updatedAt: historySchema.divisionAreas.updatedAt,
            })
            .from(historySchema.divisionAreas)
            .where(eq(historySchema.divisionAreas.snapshotId, snapshot.id))
            .orderBy(desc(historySchema.divisionAreas.updatedAt))
            .all()
        : []

  const districts = new Map<string, GeoJsonGeometry>()
  for (const row of rows) {
    if (districts.has(row.divisionId)) continue
    const geometry = decodeStoredGeoJsonGeometry(row.geometry)
    if (!isGeoJsonPolygon(geometry)) {
      throw new Error(
        `C&SD district ${row.divisionId} is not polygonal; Housing Market Area coverage cannot be calculated.`,
      )
    }
    districts.set(row.divisionId, geometry)
  }
  if (districts.size === 0) {
    throw new Error(
      `No C&SD 2021 district geometry is available; Housing Market Area coverage requires ${CENSTATD_2021_DISTRICT_VARIANT}.`,
    )
  }
  return districts
}

/** Decodes the Brotli BLOB used for exact C&SD canonical geometry in DB_CURRENT. */
export function decodeStoredGeoJsonGeometry(value: unknown): GeoJsonGeometry {
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    return decompressJsonBrotli(value) as GeoJsonGeometry
  }
  if (typeof value === 'string') return JSON.parse(value) as GeoJsonGeometry
  if (value && typeof value === 'object') return value as GeoJsonGeometry
  throw new Error('Stored geometry could not be decoded.')
}

function buildGeometryDistrictDistributionRows(
  type: GeometryUploadPlan['type'],
  rows: Array<NonNullable<NormalisedGeometry>>,
  districtsByDivisionId: Map<string, string>,
) {
  const counts = new Map<string, number>()

  for (const row of rows) {
    const districts = new Set(
      divisionReferenceIds(type, row)
        .map(id => districtsByDivisionId.get(id))
        .filter((id): id is string => Boolean(id)),
    )
    for (const districtId of districts) {
      counts.set(districtId, (counts.get(districtId) ?? 0) + 1)
    }
  }

  return buildDistrictDistributionRows(counts)
}

function buildHousingMarketAreaDistrictDistributionRows(
  rows: Array<NonNullable<NormalisedGeometry>>,
  districtGeometries: ReadonlyMap<string, GeoJsonGeometry>,
) {
  return buildDistrictDistributionRows(
    calculateHousingMarketAreaDistrictCoverage(
      rows.map(row => ({
        geometry: row.canonical.geometry as GeoJsonGeometry,
        id: row.canonical.id,
      })),
      districtGeometries,
    ),
  )
}

/**
 * Counts an HMA in every official C&SD district with which its polygon has a
 * positive-area intersection. Boundary-only contact is deliberately excluded.
 * The coordinate reference system is sufficient here because area is used as a
 * non-zero predicate only, not reported as a measurement.
 */
export function calculateHousingMarketAreaDistrictCoverage(
  housingMarketAreas: ReadonlyArray<{ geometry: GeoJsonGeometry; id: string }>,
  districtGeometries: ReadonlyMap<string, GeoJsonGeometry>,
) {
  const reader = new GeoJSONReader(new GeometryFactory())
  const districts = [...districtGeometries.entries()].map(([districtId, geometry]) => {
    if (!isGeoJsonPolygon(geometry)) {
      throw new Error(
        `C&SD district ${districtId} is not polygonal; Housing Market Area coverage cannot be calculated.`,
      )
    }
    const parsed = reader.read(JSON.stringify(geometry))
    // C&SD's authoritative 2021 CENSTATD:T ring self-intersects. Keep the
    // publisher geometry in storage, but make a valid temporary polygon for
    // the positive-area overlay predicate.
    const overlayGeometry = IsValidOp.isValid(parsed)
      ? parsed
      : BufferOp.bufferOp(parsed, 0)
    if (!IsValidOp.isValid(overlayGeometry)) {
      throw new Error(
        `C&SD district ${districtId} could not be repaired for Housing Market Area coverage.`,
      )
    }
    return { districtId, geometry: overlayGeometry }
  })
  const counts = new Map<string, number>()

  for (const housingMarketArea of housingMarketAreas) {
    if (!isGeoJsonPolygon(housingMarketArea.geometry)) {
      throw new Error(`Housing Market Area ${housingMarketArea.id} is not polygonal.`)
    }
    const geometry = reader.read(JSON.stringify(housingMarketArea.geometry))
    for (const district of districts) {
      if (OverlayOp.intersection(geometry, district.geometry).getArea() <= 0) {
        continue
      }
      counts.set(district.districtId, (counts.get(district.districtId) ?? 0) + 1)
    }
  }

  return counts
}

function buildDistrictDistributionRows(counts: ReadonlyMap<string, number>) {
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([groupValue, value]) =>
      geometryStatRow('records', 'distribution', value, 'district', groupValue),
    )
}

function buildOvertureGeometryProcessingActions(
  plan: GeometryUploadPlan,
  excludedRecords: Array<{
    divisionId: string | null
    divisionIds: string[] | null
    id: string | null
  }>,
): ReleaseProcessingAction[] {
  if (plan.source !== 'overture' || excludedRecords.length === 0) {
    return []
  }

  const examples = excludedRecords.slice(0, 10)
  return [
    {
      action: 'overture_division_geometry_cn_gd_excluded',
      affectedRecordCount: excludedRecords.length,
      evidence: {
        filter: {
          field: 'region',
          equals: 'CN-GD',
        },
        resourceType: plan.type,
        sourceVersion: plan.sourceVersion,
        examples,
        omittedExampleCount: excludedRecords.length - examples.length,
      },
      mode: 'automatic',
      summary:
        'Excluded Guangdong spillover geometry from the Hong Kong Overture release.',
    },
  ]
}

type SyntheticOvertureHongKongArea = {
  code: string
  districtDivisionIds: string[]
  divisionId: string
}

const SHENZHEN_BAY_PORT_EXCLUSION = {
  coordinates: [
    [
      [113.935, 22.485],
      [113.96, 22.485],
      [113.96, 22.51],
      [113.935, 22.51],
      [113.935, 22.485],
    ],
  ],
  type: 'Polygon',
} as const satisfies GeoJsonGeometry

async function resolveSyntheticOvertureHongKongAreas(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  metaDb: HarbourReadableDb,
  plan: GeometryUploadPlan,
): Promise<SyntheticOvertureHongKongArea[]> {
  if (plan.source !== 'overture' || plan.regionCode !== 'hk') return []
  const snapshot = await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
    metaDb,
    'division',
    plan.regionCode,
    plan.cohortKey,
    { variant: 'overture' },
  )
  if (!snapshot) return []
  const rows = await currentDb
    .select({
      id: currentSchema.divisions.id,
      identifiers: currentSchema.divisions.identifiers,
      level: currentSchema.divisions.level,
    })
    .from(currentSchema.divisions)
    .where(eq(currentSchema.divisions.snapshotId, snapshot.id))
    .all()
  const i18nRows = await currentDb
    .select({
      divisionId: currentSchema.divisionsI18n.divisionId,
      name: currentSchema.divisionsI18n.name,
    })
    .from(currentSchema.divisionsI18n)
    .where(
      and(
        eq(currentSchema.divisionsI18n.snapshotId, snapshot.id),
        eq(currentSchema.divisionsI18n.locale, 'en'),
      ),
    )
    .all()
  const byId = new Map(rows.map(row => [row.id, row]))
  const districtIds = new Set(rows.filter(row => row.level === 2).map(row => row.id))
  const districtIdsByName = new Map<string, string[]>()
  for (const row of i18nRows) {
    if (!row.name || !districtIds.has(row.divisionId)) continue
    const ids = districtIdsByName.get(row.name) ?? []
    ids.push(row.divisionId)
    districtIdsByName.set(row.name, ids)
  }
  return overtureHongKongAreas.flatMap(area => {
    const divisionId = overtureHongKongAreaDivisionId(area.code)
    if (!divisionId) return []
    const division = byId.get(divisionId)
    if (!division) return []
    const identifiers = division.identifiers
    const correction =
      identifiers && typeof identifiers === 'object' && !Array.isArray(identifiers)
        ? (identifiers as Record<string, unknown>).saanseoiCorrection
        : null
    const correctionDistrictIds =
      correction && typeof correction === 'object' && !Array.isArray(correction)
        ? (correction as Record<string, unknown>).districtDivisionIds
        : null
    const districtDivisionIds =
      Array.isArray(correctionDistrictIds) && correctionDistrictIds.every(isString)
        ? correctionDistrictIds
        : area.districtNames.map(name => {
            const ids = districtIdsByName.get(name) ?? []
            if (ids.length !== 1) {
              throw new Error(
                `Cannot derive Overture ${area.code} geometry: expected one English district named ${name}, found ${ids.length}.`,
              )
            }
            return ids[0]!
          })
    return [
      {
        code: area.code,
        districtDivisionIds,
        divisionId,
      },
    ]
  })
}

export function selectOvertureHongKongAreasWithoutSourceGeometry(
  areas: readonly SyntheticOvertureHongKongArea[],
  normalised: readonly NonNullable<NormalisedGeometry>[],
) {
  const sourceAreaDivisionIds = new Set(
    normalised.flatMap(row =>
      'divisionId' in row.canonical ? [row.canonical.divisionId] : [],
    ),
  )
  return areas.filter(area => !sourceAreaDivisionIds.has(area.divisionId))
}

function buildSyntheticOvertureHongKongAreaRows(
  areas: readonly SyntheticOvertureHongKongArea[],
  normalised: readonly NonNullable<NormalisedGeometry>[],
) {
  return areas.map(area => {
    const geometries = normalised.flatMap(row => {
      if (!('divisionId' in row.canonical)) return []
      if (!isGeoJsonPolygon(row.canonical.geometry)) {
        throw new Error(
          `Overture district ${row.canonical.divisionId} is not polygonal.`,
        )
      }
      return area.districtDivisionIds.includes(row.canonical.divisionId) &&
        row.canonical.isLand === true
        ? [row.canonical.geometry]
        : []
    })
    if (geometries.length !== area.districtDivisionIds.length) {
      throw new Error(
        `Cannot synthesise ${area.code}: expected ${area.districtDivisionIds.length} district land geometries, found ${geometries.length}.`,
      )
    }
    const normalisedArea = normaliseDivisionAreaGeometryRow(
      syntheticOvertureHongKongAreaSourceRow(
        area,
        unionHongKongAreaGeometries(geometries),
      ),
      'overture',
      { variant: 'overture' },
    )
    if (!normalisedArea)
      throw new Error(`Failed to normalise synthetic ${area.code} area.`)
    return normalisedArea
  })
}

async function buildSyntheticOvertureHongKongBoundaryRows(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  metaDb: HarbourReadableDb,
  plan: GeometryUploadPlan,
  areas: readonly SyntheticOvertureHongKongArea[],
) {
  const snapshot = await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
    metaDb,
    'divisionArea',
    plan.regionCode,
    plan.cohortKey,
    { variant: 'overture' },
  )
  if (!snapshot) {
    throw new Error(
      `Cannot synthesise Overture boundaries: no published Overture divisionArea snapshot exists for ${plan.cohortKey}.`,
    )
  }
  const rows = await currentDb
    .select({
      divisionId: currentSchema.divisionAreas.divisionId,
      geometry: currentSchema.divisionAreas.geometry,
    })
    .from(currentSchema.divisionAreas)
    .where(eq(currentSchema.divisionAreas.snapshotId, snapshot.id))
    .all()
  const geometryByDivisionId = new Map(rows.map(row => [row.divisionId, row.geometry]))
  return areas.map(area => {
    const areaGeometry = geometryByDivisionId.get(area.divisionId)
    if (!isGeoJsonPolygon(areaGeometry)) {
      throw new Error(
        `Cannot synthesise ${area.code} boundary: its synthetic divisionArea is absent.`,
      )
    }
    const boundary = geoJsonBoundary(areaGeometry)
    const normalisedBoundary = normaliseDivisionBoundaryGeometryRow(
      {
        class: 'land',
        division_ids: [area.divisionId, 'b4f09a9f-4cba-4a7c-bf58-2e63bc2e913d'],
        geometry: boundary,
        id: `SAANSEOI:OVERTURE:HK:AREA:${area.code}:boundary`,
        is_land: true,
        is_territorial: false,
        perspectives: null,
        sources: [
          {
            dataset: 'SaanSeoi corrective processing',
            property: 'synthetic:boundary-from-unioned-overture-district-areas',
            record_id: `overture:hk:area:${area.code}`,
          },
        ],
      },
      'overture',
      { variant: 'overture' },
    )
    if (!normalisedBoundary) {
      throw new Error(`Failed to normalise synthetic ${area.code} boundary.`)
    }
    return normalisedBoundary
  })
}

function syntheticOvertureHongKongAreaSourceRow(
  area: SyntheticOvertureHongKongArea,
  geometry: GeoJsonGeometry,
) {
  return {
    class: 'land',
    division_id: area.divisionId,
    geometry,
    id: `SAANSEOI:OVERTURE:HK:AREA:${area.code}`,
    is_land: true,
    is_territorial: false,
    sources: [
      {
        dataset: 'SaanSeoi corrective processing',
        property: 'synthetic:union-overture-district-areas',
        record_id: `overture:hk:area:${area.code}`,
      },
    ],
  }
}

function unionHongKongAreaGeometries(geometries: readonly GeoJsonGeometry[]) {
  const reader = new GeoJSONReader(new GeometryFactory())
  const writer = new GeoJSONWriter()
  const unioned = unionBalanced(
    geometries
      .map(geometry => reader.read(JSON.stringify(geometry)))
      .sort((left, right) =>
        left.getEnvelopeInternal().compareTo(right.getEnvelopeInternal()),
      ),
  )
  const corrected = OverlayOp.difference(
    unioned,
    reader.read(JSON.stringify(SHENZHEN_BAY_PORT_EXCLUSION)),
  )
  const geometry = writer.write(corrected) as GeoJsonGeometry
  if (!isGeoJsonPolygon(geometry)) {
    throw new Error('Synthetic Overture Hong Kong area union is not polygonal.')
  }
  return geometry
}

function geoJsonBoundary(geometry: GeoJsonGeometry) {
  const reader = new GeoJSONReader(new GeometryFactory())
  const writer = new GeoJSONWriter()
  const boundary = writer.write(
    reader.read(JSON.stringify(geometry)).getBoundary(),
  ) as GeoJsonGeometry
  if (boundary.type !== 'LineString' && boundary.type !== 'MultiLineString') {
    throw new Error('Synthetic Overture Hong Kong area boundary is not linear.')
  }
  return boundary
}

function unionBalanced(geometries: Geometry[]) {
  if (geometries.length === 0) throw new Error('Cannot union empty Overture geometry.')
  let current = geometries
  while (current.length > 1) {
    const next: Geometry[] = []
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index]
      if (!left) throw new Error('Overture geometry union lost its left operand.')
      const right = current[index + 1]
      next.push(right ? UnionOp.union(left, right) : left)
    }
    current = next
  }
  const result = current[0]
  if (!result) throw new Error('Overture geometry union has no result.')
  return result
}

function isGeoJsonPolygon(value: unknown): value is GeoJsonGeometry {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    ((value as GeoJsonGeometry).type === 'Polygon' ||
      (value as GeoJsonGeometry).type === 'MultiPolygon')
  )
}

/**
 * Records `overture_hong_kong_area_synthesised`; keep the policy and this
 * implementation in sync.
 */
function buildSyntheticOvertureHongKongAreaProcessingActions(
  plan: GeometryUploadPlan,
  areas: readonly SyntheticOvertureHongKongArea[],
): ReleaseProcessingAction[] {
  if (plan.source !== 'overture' || areas.length === 0) return []
  return areas.map(area => ({
    action: 'overture_hong_kong_area_synthesised',
    affectedRecordCount: 1,
    evidence: {
      area: area.code,
      districtDivisionIds: area.districtDivisionIds,
      geometryRule: {
        include: 'Lok Ma Chau Loop',
        exclude: 'Shenzhen Bay Port border-crossing enclave',
        exclusionBbox: [113.935, 22.485, 113.96, 22.51],
        method: 'union-district-land-geometries-then-difference-exclusion-bbox',
      },
      resourceType: plan.type,
      sourceVersion: plan.sourceVersion,
      syntheticDivisionId: area.divisionId,
    },
    mode: 'automatic',
    summary: `Derived Overture Hong Kong ${area.code} area geometry from its district geometries.`,
  }))
}

function asOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function asOptionalInteger(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value !== 'string' || !/^-?\d+(?:\.0+)?$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function requireInteger(value: unknown, name: string) {
  const integer = asOptionalInteger(value)
  if (integer === null) throw new Error(`Missing ${name}.`)
  return integer
}

function isString(value: string | null): value is string {
  return value !== null
}

function requireString(value: unknown, name: string) {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`Missing ${name}.`)
  return value
}
