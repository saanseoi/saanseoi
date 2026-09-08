import { retainProcessingFailure } from '../api/processingFailureAudit'
import { resolveIdentityCuration } from '../identityCurations'
import {
  ensureDraftSnapshotForRelease,
  recordSnapshotLookupDependency,
  recordSnapshotAssemblyRun,
  resolveShardForTypeRegionYear,
  upsertReleaseShardAssignment,
  upsertSnapshotShardAssignment,
  upsertSnapshotSource,
  waitForDatasetRecord,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { retainDivisionProvenance } from './divisionProvenance'
import { deliverProcessingResult } from '../api/provenance'
import { replaceDatasetStats } from '@repo/core/pipeline/db/stats'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import {
  createAsyncBufferFromR2,
  readParquetObjectsInBatches,
} from '@repo/core/pipeline/parquetR2'
import {
  normaliseDivisionAreaGeometryRow,
  normaliseDivisionBoundaryGeometryRow,
  type NormalisedDivisionArea,
} from '@repo/core/pipeline/services/divisionGeometry'
import { metaSchema } from '@repo/db'
import { eq } from 'drizzle-orm'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'
import type { PreparedUploadFile } from '../upload/parquetRepack.ts'
import { resolvePipelineEnvironment, type UploadTarget } from '../cli/options.ts'
import { createHarbourControlClient } from '../api/harbourControl.ts'
import { syncStagedReleaseIntoLocalMetaCache } from '../localPipeline/syncStagedRelease.ts'
import { createLocalControlClient } from '../localPipeline/localControlClient.ts'
import { LocalPipelineBucket } from '../localPipeline/localBucket.ts'
import {
  invalidateRemoteDbCache,
  refreshRemoteMetaCache,
  applyPublishMetadataDeltaToRemoteCache,
  resolveLocalAddressDbContext,
} from '../dbCache/localDbCache.ts'
import { OperationProgress } from '../cli/operationProgress.ts'
import {
  appendPhaseDetails,
  colorTeal,
  formatCompletedPhaseLabel,
  formatDurationMs,
} from '../localPipeline/progressFormatting.ts'
import { openNormalisedArtefactCache } from '../localPipeline/normalisedArtefactCache.ts'
import type {
  GeometryUploadPlan,
  NormalisedGeometry,
  UploadResult,
} from './processLocalDivisionGeometrySqlUploadTypes.ts'
import {
  asOptionalString,
  findIdenticalCenstatdGeometrySnapshot,
  geometryVariant,
  isCenstatdGeometryCompanionPlan,
  isString,
  normaliseHkgovCenstatdInputRow,
  normaliseHkgovHadInputRow,
  normaliseHkgovPlandNewTownInputRow,
  requireString,
  resolveProviderBridgeConfig,
  selectCenstatdInheritedSnapshotSources,
  simplifyHkgovDivisionAreas,
} from './processLocalDivisionGeometrySqlUploadPreparation.ts'
import { LOCAL_RELEASE_ROOT } from './processLocalDivisionGeometrySqlUploadConfig.ts'
import {
  formatGeometryCompletedLabel,
  formatGeometryProgressLabel,
  formatLocalTargetSubject,
  formatMirrorSubject,
  formatTargetSubject,
  runGeometryProgressPhase,
  updateDbCacheProgress,
} from './processLocalDivisionGeometrySqlUploadProgress.ts'
import {
  buildSyntheticOvertureHongKongAreaProcessingActions,
  buildSyntheticOvertureHongKongAreaRows,
  resolveSyntheticOvertureHongKongAreas,
  selectOvertureHongKongAreasWithoutSourceGeometry,
} from './processLocalDivisionGeometrySqlUploadSyntheticGeometry.ts'
import { assertDivisionReferences } from './processLocalDivisionGeometrySqlUploadReferences.ts'
import {
  readNativeGeometryVersion,
  writeGeometryRowsDurably,
} from './nativeGeometryDelivery.ts'
import {
  buildGeometryStats,
  buildOvertureGeometryProcessingActions,
  shouldWriteExactGeometryReleaseStats,
} from './processLocalDivisionGeometrySqlUploadStatistics.ts'
import { replayGeometryIntoRemote } from './processLocalDivisionGeometrySqlUploadReplay.ts'
import { deliveryFileSha256 } from '../localPipeline/sqlDeliveryFiles.ts'
import {
  completeSqlDeliveryRelease,
  readPendingSqlDelivery,
} from '../localPipeline/sqlDeliveryPending.ts'

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
    /** Publish source data and snapshots, but leave the API release set draft. */
    deferApiReleaseSet?: boolean
    deferSourcePublish?: boolean
    deferPublish?: boolean
    inputFilePath?: string
    /**
     * Add a geometry variant to a source release that was initialised by an
     * earlier pass in this upload. The release remains in its running state
     * until this pass publishes it.
     */
    reuseRunningRelease?: boolean
    /** Add a resource prepared by an earlier command to the same source release. */
    reuseExistingRelease?: boolean
    /** Reuse ID-independent exact rows when materialising a derived variant. */
    normalisedInput?: readonly NonNullable<NormalisedGeometry>[]
    cacheArtefacts?: boolean
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
  const progress = new OperationProgress()
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
        resumeSqlDeliveryReleaseId: releaseId,
      },
    )
  } catch (error) {
    progress.fail(error)
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
        { reuseExistingRelease: options.reuseExistingRelease },
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
    const metaDb = dbContext.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
    const dataset = await waitForDatasetRecord(metaDb, { releaseId })
    if (!dataset) {
      throw new Error(`Release not found: ${releaseId}`)
    }
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
    ])
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

    let normalised: Array<NonNullable<NormalisedGeometry>> = options.normalisedInput
      ? [...options.normalisedInput]
      : []
    const cnGdExcludedRecords: Array<{
      divisionId: string | null
      divisionIds: string[] | null
      id: string | null
    }> = []
    let rejectedRows = 0
    let processedRows = 0
    const providerBridgeConfig = resolveProviderBridgeConfig(previewPlan)
    const normalisedCache =
      options.cacheArtefacts &&
      !options.normalisedInput &&
      previewPlan.source !== 'overture' &&
      previewPlan.transform === undefined
        ? await openNormalisedArtefactCache({
            filePath: preparedUpload.filePath,
            processingContract: [
              'division-geometry-normalisation-v1',
              previewPlan.source,
              previewPlan.type,
              previewPlan.cohortKey,
              options.validateGeometry ? 'validate' : 'standard',
            ].join(':'),
          })
        : null
    const cachedNormalised = normalisedCache
      ? await normalisedCache.read<Array<NonNullable<NormalisedGeometry>>>()
      : null
    if (cachedNormalised) normalised = cachedNormalised
    const providerBridge = options.normalisedInput
      ? null
      : providerBridgeConfig !== null
        ? new Map(
            resolveIdentityCuration(
              providerBridgeConfig.authority,
              providerBridgeConfig.cohortKey ?? previewPlan.cohortKey,
              'administrative',
            ).flatMap(row => [
              [row.externalId, row.canonicalId] as const,
              ...(row.externalCode
                ? [[row.externalCode, row.canonicalId] as const]
                : []),
            ]),
          )
        : null
    if (!options.normalisedInput && !cachedNormalised) {
      const file = options.inputFilePath
        ? await asyncBufferFromFile(options.inputFilePath)
        : await createAsyncBufferFromR2(bucket, rawObjectKey)
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
    } else {
      processedRows = previewPlan.rowCount
      progress.update(processedRows)
    }
    if (normalisedCache && !cachedNormalised) {
      await normalisedCache.write(normalised)
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
      normalised = (await simplifyHkgovDivisionAreas(
        normalised as NormalisedDivisionArea[],
      )) as Array<NonNullable<NormalisedGeometry>>
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
    progress.complete(
      formatGeometryCompletedLabel(
        'Validate',
        `${previewPlan.type} references`,
        undefined,
        Date.now() - validationStartedAt,
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
    const retainedVersion = await readNativeGeometryVersion(
      dbContext,
      releaseId,
      previewPlan.type,
      previewPlan.transform,
    )
    const retainedSnapshot = retainedVersion
      ? await metaDb
          .select({
            id: metaSchema.metaSnapshots.id,
            cohortKey: metaSchema.metaSnapshots.cohortKey,
            parentSnapshotId: metaSchema.metaSnapshots.parentSnapshotId,
            resourceType: metaSchema.metaSnapshots.resourceType,
            snapshotLineageId: metaSchema.metaSnapshots.snapshotLineageId,
            status: metaSchema.metaSnapshots.status,
          })
          .from(metaSchema.metaSnapshots)
          .where(eq(metaSchema.metaSnapshots.id, retainedVersion.snapshotId))
          .get()
      : null
    if (retainedVersion && !retainedSnapshot)
      throw new Error(
        'Retained native geometry snapshot is missing; refusing to replan.',
      )
    // A partial replay can already look identical in currentDb. Keep the sealed
    // snapshot and materialisation decision instead of reclassifying that retry.
    const identicalSnapshot =
      !retainedVersion && isCenstatdGeometryCompanionPlan(previewPlan)
        ? await findIdenticalCenstatdGeometrySnapshot(
            dbContext.currentDb,
            metaDb,
            previewPlan,
            normalised,
          )
        : null
    const reusesExistingGeometrySnapshot = retainedVersion
      ? Boolean(retainedVersion.skipCanonicalMaterialisation)
      : identicalSnapshot !== null
    const snapshot =
      retainedSnapshot ??
      identicalSnapshot ??
      (await ensureDraftSnapshotForRelease(metaDb, previewPlan.type, {
        cohortKey: previewPlan.cohortKey,
        datasetCode,
        datasetId: dataset.datasetId,
        regionCode: previewPlan.regionCode,
        sourceReleaseId: dataset.releaseId,
        geometryStatus: previewPlan.geometryStatus,
        variant: geometryVariant(previewPlan),
        reuseDraftSnapshotForVariant: isCenstatdGeometryCompanionPlan(previewPlan),
        reuseSnapshotLineageForVariant: isCenstatdGeometryCompanionPlan(previewPlan),
      }))

    if (reusesExistingGeometrySnapshot) {
      await upsertSnapshotSource(
        metaDb,
        snapshot.id,
        dataset.datasetId,
        dataset.releaseId,
        'enrichment',
        {
          anchorReleaseId: dataset.releaseId,
          selectedByRule: 'verified-censtatd-geometry-materialisation-v1',
          selectionMode: 'verified_identical_geometry',
          sourceCohortKey: dataset.cohortKey,
        },
      )
    } else {
      if (isCenstatdGeometryCompanionPlan(previewPlan) && snapshot.parentSnapshotId) {
        const inheritedSources = await metaDb
          .select({
            datasetId: metaSchema.metaSnapshotSources.datasetId,
            role: metaSchema.metaSnapshotSources.role,
            sourceReleaseId: metaSchema.metaSnapshotSources.sourceReleaseId,
          })
          .from(metaSchema.metaSnapshotSources)
          .where(
            eq(metaSchema.metaSnapshotSources.snapshotId, snapshot.parentSnapshotId),
          )
          .all()
        for (const source of selectCenstatdInheritedSnapshotSources(inheritedSources)) {
          await upsertSnapshotSource(
            metaDb,
            snapshot.id,
            source.datasetId,
            source.sourceReleaseId,
            'enrichment',
            {
              selectedByRule: 'inherited-censtatd-companion-provenance',
              selectionMode: 'carried_forward_companion',
            },
          )
        }
      }
      await upsertSnapshotSource(
        metaDb,
        snapshot.id,
        dataset.datasetId,
        dataset.releaseId,
        'primary',
        {
          anchorReleaseId: dataset.releaseId,
          selectedByRule: 'snapshot-assembly-division-geometry-v1',
          selectionMode: isCenstatdGeometryCompanionPlan(previewPlan)
            ? 'contributed_geometry'
            : 'exact_ref',
          sourceCohortKey: dataset.cohortKey,
        },
      )
      await upsertSnapshotShardAssignment(metaDb, snapshot.id, historyShard.id)
    }
    await recordSnapshotAssemblyRun(metaDb, {
      snapshotId: snapshot.id,
      resourceType: previewPlan.type,
      anchorReleaseId: dataset.releaseId,
      anchorCohortKey: dataset.cohortKey,
      selectionSummaryJson: {
        releaseRole: reusesExistingGeometrySnapshot ? 'verified-identical' : 'primary',
        sourceReleaseId: dataset.releaseId,
        sourceVersion: dataset.sourceVersion,
      },
    })
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
        'Assemble draft',
        `${previewPlan.type} snapshot`,
        undefined,
        Date.now() - snapshotStartedAt,
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
    const writeResult = await writeGeometryRowsDurably(
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
        skipCanonicalMaterialisation: reusesExistingGeometrySnapshot,
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
    const audit = await retainDivisionProvenance(bucket, {
      releaseId,
      datasetCode,
      inputCount: previewPlan.rowCount,
      outputCount: normalised.length,
      actions: [
        ...buildOvertureGeometryProcessingActions(previewPlan, cnGdExcludedRecords),
        ...buildSyntheticOvertureHongKongAreaProcessingActions(
          previewPlan,
          areasWithoutSourceGeometry,
        ),
      ],
    })
    await deliverProcessingResult(target, bucket, audit.ref)
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
        reusesExistingGeometrySnapshot,
        (subject, operation) =>
          runGeometryProgressPhase(progress, 'Sync up', subject, operation),
        await deliveryFileSha256(preparedUpload.filePath),
        releaseCode,
      )
    }
    if (options.deferPublish) {
      return {
        snapshotId: snapshot.id,
        importedRows: normalised.length,
        normalisedRows: normalised,
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
          deferApiReleaseSet: options.deferApiReleaseSet,
          deferSourcePublish: options.deferSourcePublish,
          skipSnapshotCleanup: options.skipSnapshotCleanup,
        }),
    )
    remotePublished = target.remote && !options.deferSourcePublish
    if (target.remote) {
      try {
        if (
          (options.deferApiReleaseSet || options.deferSourcePublish) &&
          publishResult
        ) {
          await applyPublishMetadataDeltaToRemoteCache(
            target.environment === 'production' ? 'production' : 'preview',
            dbContext.state.dbCacheDir,
            publishResult,
          )
        } else {
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
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        if (!(await readPendingSqlDelivery(dbContext.state.dbCacheDir)))
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
    await completeSqlDeliveryRelease(dbContext.state.dbCacheDir, releaseId)
    return {
      snapshotId: snapshot.id,
      importedRows: normalised.length,
      normalisedRows: normalised,
      publishResult,
    }
  } catch (error) {
    await retainProcessingFailure({
      error,
      store: bucket,
      target,
      releaseId,
      datasetCode,
    })
    progress.fail(error)
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

export { MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES } from './processLocalDivisionGeometrySqlUploadConfig.ts'

export { geometryBuildUpsertSql } from './processLocalDivisionGeometrySqlUploadReplay.ts'

export {
  divisionReferenceVariant,
  selectCenstatdInheritedSnapshotSources,
  hasIdenticalGeometryMaterialisation,
  simplifyHkgovDivisionAreas,
  asOptionalInteger,
} from './processLocalDivisionGeometrySqlUploadPreparation.ts'

export {
  hasDivisionReferences,
  formatMissingDivisionReferenceRecords,
} from './processLocalDivisionGeometrySqlUploadReferences.ts'

export {
  shouldCompressCanonicalGeometry,
  shouldWriteExactGeometryReleaseStats,
  createGeometryChurnCounts,
  supportsDistrictGeometryStatistics,
  decodeStoredGeoJsonGeometry,
  calculateHousingMarketAreaDistrictCoverage,
} from './processLocalDivisionGeometrySqlUploadStatistics.ts'

export { selectOvertureHongKongAreasWithoutSourceGeometry } from './processLocalDivisionGeometrySqlUploadSyntheticGeometry.ts'
