import { geometrySourceChurn } from './geometrySourceChurn'
import { buildChurnStatsRows } from '@repo/core/pipeline/services/metrics/releaseStats'
import {
  retainCuratedSourceReleases,
  curatedInventorySnapshots,
} from '../curatedDivisions/sourceReleases'
import type { DatasetProcessingStats } from '@repo/core/pipeline/processingRunStats'
import { resolveCurrentWriteContext } from '../../dbCache/currentWriteContext.ts'
import { resolveGeometryPreparationContext } from '../../dbCache/geometryPreparationContext.ts'
import { retainProcessingFailure } from '../../api/processingFailureAudit'
import { resolveIdentityCuration } from '../../identityCurations'
import { curationDocumentsFor } from '../../curationDocuments'
import { hashValue } from '@repo/core/provenance'
import {
  ensureDraftSnapshotForRelease,
  recordSnapshotLookupDependency,
  recordSnapshotAssembly,
  resolveShardForTypeRegionYear,
  upsertReleaseShardAssignment,
  upsertSnapshotShardAssignment,
  upsertSnapshotSource,
  waitForDatasetRecord,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import {
  retainDivisionProvenance,
  retainDivisionSourceAudit,
} from './divisionProvenance'
import { deliverProcessingResult } from '../../api/provenance'
import { replaceDatasetStats } from '@repo/core/pipeline/db/stats'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import {
  createAsyncBufferFromR2,
  readParquetObjectsInBatches,
} from '@repo/core/pipeline/parquetR2'
import {
  normaliseDivisionAreaGeometryRow,
  normaliseDivisionBoundaryGeometryRow,
  divisionAreaGeometryRule,
  divisionBoundaryGeometryRule,
  type NormalisedDivisionArea,
} from '@repo/core/pipeline/services/divisions/divisionGeometry'
import { metaSchema } from '@repo/db'
import { eq } from 'drizzle-orm'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'
import type { PreparedUploadFile } from '../../upload/parquetRepack.ts'
import { resolvePipelineEnvironment, type UploadTarget } from '../../cli/options.ts'
import { createHarbourControlClient } from '../../api/harbourControl.ts'
import { syncStagedReleaseIntoLocalMetaCache } from '../local/syncStagedRelease.ts'
import { createLocalControlClient } from '../local/localControlClient.ts'
import { LocalPipelineBucket } from '../local/localBucket.ts'
import {
  invalidateRemoteDbCache,
  refreshRemoteMetaCache,
  applyPublishMetadataDeltaToRemoteCache,
} from '../../dbCache/localDbCache.ts'
import { resolveRemoteCacheDir } from '../../dbCache/localDbCacheTargets.ts'
import { OperationProgress } from '../../cli/operationProgress.ts'
import {
  appendPhaseDetails,
  colorTeal,
  formatCompletedPhaseLabel,
  formatDurationMs,
} from '../local/progressFormatting.ts'
import { openNormalisedArtefactCache } from '../local/normalisedArtefactCache.ts'
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
  selectCenstatdInheritedSnapshotResourceReleases,
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
import { assertDivisionReferences } from './processLocalDivisionGeometrySqlUploadReferences.ts'
import {
  readNativeGeometryVersion,
  writeGeometryRowsDurably,
} from './nativeGeometryDelivery.ts'
import {
  buildGeometryStats,
  shouldWriteExactGeometryReleaseStats,
} from './processLocalDivisionGeometrySqlUploadStatistics.ts'
import { replayGeometryIntoRemote } from './processLocalDivisionGeometrySqlUploadReplay.ts'
import { deliveryFileSha256 } from '../local/sqlDeliveryFiles.ts'
import {
  completeSqlDeliveryRelease,
  readPendingSqlDelivery,
} from '../local/sqlDeliveryPending.ts'

/**
 * Imports Overture division area/boundary parquet into the source, history and
 * current geometry tables. Complete inputs produce only changed current rows;
 * each target replays sealed mutations when a release is retried.
 */
export async function processLocalDivisionGeometrySqlUpload(
  target: UploadTarget,
  previewPlan: GeometryUploadPlan,
  uploadResult: UploadResult,
  preparedUpload: PreparedUploadFile,
  options: {
    sourceAuditGuards?: import('@repo/core/provenance').AuditGuard[]
    /** Publish source data and snapshots, but leave the API release set draft. */
    curatedSourceReleases?: import('../curatedDivisions/archiveInput').CuratedSourceRelease[]
    deferApiReleaseSet?: boolean
    deferSourcePublish?: boolean
    deferPublish?: boolean
    rebuildPublishedSnapshot?: boolean
    inputFilePath?: string
    /**
     * Add a geometry variant to a source release that was initialised by an
     * earlier pass in this upload. The release remains in its running state
     * until this pass publishes it.
     */
    reuseRunningRelease?: boolean
    /** Add a resource prepared by an earlier command to the same source release. */
    reuseExistingRelease?: boolean
    /** Publisher/resource cohort retained on the registered source release. */
    releaseCohortKey?: string
    /** Reuse ID-independent exact rows when materialising a derived variant. */
    normalisedInput?: readonly NonNullable<NormalisedGeometry>[]
    cacheArtefacts?: boolean
    skipRawSeed?: boolean
    skipSnapshotCleanup?: boolean
    validateGeometry?: boolean
  } = {},
) {
  const resourceReleaseId = requireString(
    uploadResult.resourceReleaseId,
    'resourceReleaseId',
  )
  const releaseCode = requireString(uploadResult.releaseCode, 'releaseCode')
  const datasetCode = requireString(uploadResult.datasetCode, 'datasetCode')
  const rawObjectKey = requireString(uploadResult.rawObjectKey, 'rawObjectKey')
  const historyShardYear = previewPlan.cohortKey.slice(0, 4)
  const sourceShardYear = previewPlan.sourceVersion.slice(0, 4)
  if (!/^\d{4}$/.test(historyShardYear) || !/^\d{4}$/.test(sourceShardYear)) {
    throw new Error(
      `Could not resolve geometry shard years from cohortKey=${previewPlan.cohortKey} and sourceVersion=${previewPlan.sourceVersion}.`,
    )
  }
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

  let dbContext: Awaited<ReturnType<typeof resolveCurrentWriteContext>>
  const dbCacheStartedAt = Date.now()
  let reusedDbCache = false
  try {
    dbContext = await resolveGeometryPreparationContext(
      target,
      previewPlan.regionCode,
      historyShardYear,
      {
        resourceReleaseId,
        resourceType: previewPlan.resourceType,
        preparedSha256: await deliveryFileSha256(preparedUpload.filePath),
        sourceShardYear,
        onProgress(event) {
          reusedDbCache ||= event.action === 'reuse-cache'
          updateDbCacheProgress(progress, event)
        },
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

  let failureAuditScope: import('@repo/core/provenance').AuditScope = {
    stage: 'preparation',
    ownerId: resourceReleaseId,
  }

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
        { datasetCode, rawObjectKey, releaseCode, resourceReleaseId },
        {
          ...previewPlan,
          cohortKey: options.releaseCohortKey ?? previewPlan.cohortKey,
        },
        {
          reuseExistingRelease: options.reuseExistingRelease,
          retainedDeliveryCacheDir: target.remote
            ? resolveRemoteCacheDir(
                target.environment === 'production' ? 'production' : 'preview',
              )
            : dbContext.state.dbCacheDir,
        },
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
        resourceReleaseId,
        'processDataset',
        {
          resourceType: previewPlan.resourceType,
          sourceRows: previewPlan.rowCount,
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
    const dataset = await waitForDatasetRecord(metaDb, { resourceReleaseId })
    if (!dataset) {
      throw new Error(`Release not found: ${resourceReleaseId}`)
    }
    const [historyShard, sourceShard] = await Promise.all([
      resolveShardForTypeRegionYear(
        metaDb,
        'history',
        resolvePipelineEnvironment(target),
        previewPlan.regionCode,
        historyShardYear,
      ),
      resolveShardForTypeRegionYear(
        metaDb,
        'source',
        resolvePipelineEnvironment(target),
        previewPlan.regionCode,
        sourceShardYear,
      ),
    ])
    if (!historyShard || !sourceShard) {
      throw new Error(
        `Shard mapping not found for ${previewPlan.regionCode} history=${historyShardYear} source=${sourceShardYear}.`,
      )
    }
    await Promise.all([
      upsertReleaseShardAssignment(metaDb, dataset.resourceReleaseId, historyShard.id),
      upsertReleaseShardAssignment(metaDb, dataset.resourceReleaseId, sourceShard.id),
    ])
    const normalisationStartedAt = Date.now()
    progress.beginPhase(
      formatGeometryProgressLabel(
        'Normalise source',
        previewPlan.resourceType,
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
    const providerBridgeRows =
      !options.normalisedInput && providerBridgeConfig
        ? resolveIdentityCuration(
            providerBridgeConfig.authority,
            providerBridgeConfig.cohortKey ?? previewPlan.cohortKey,
            'administrative',
          )
        : null
    const normalisedCache =
      options.cacheArtefacts &&
      !options.normalisedInput &&
      previewPlan.source !== 'overture' &&
      previewPlan.transform === undefined
        ? await openNormalisedArtefactCache({
            filePath: preparedUpload.filePath,
            processingContract: [
              'division-geometry-normalisation-v4',
              await hashValue(providerBridgeRows),
              previewPlan.source,
              previewPlan.resourceType,
              datasetCode,
              geometryVariant(previewPlan),
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
            (providerBridgeRows ?? []).flatMap(row => [
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
              previewPlan.source === 'saanseoi'
                ? JSON.parse(String(row.record))
                : previewPlan.source === 'hkgov-had'
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
              previewPlan.resourceType === 'divisionArea'
                ? normaliseDivisionAreaGeometryRow(sourceRow, previewPlan.source, {
                    validateGeometry: options.validateGeometry,
                    variant: geometryVariant(previewPlan),
                    datasetCode,
                  })
                : normaliseDivisionBoundaryGeometryRow(sourceRow, previewPlan.source, {
                    validateGeometry: options.validateGeometry,
                    variant: geometryVariant(previewPlan),
                    datasetCode,
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
            previewPlan.resourceType,
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

    const publisherRows = [...normalised]
    if (previewPlan.transform === 'simplified') {
      if (previewPlan.resourceType !== 'divisionArea') {
        throw new Error('The simplified display transform is available only for areas.')
      }
      normalised = await simplifyHkgovDivisionAreas(
        normalised as NormalisedDivisionArea[],
      )
    }
    progress.complete(
      formatGeometryCompletedLabel(
        'Normalise source',
        previewPlan.resourceType,
        normalised.length,
        Date.now() - normalisationStartedAt,
      ),
    )

    const validationStartedAt = Date.now()
    progress.beginPhase(
      formatGeometryProgressLabel('Validate', `${previewPlan.resourceType} references`),
      {
        current: 0,
        max: null,
      },
    )
    const divisionLookup = !resolveProviderBridgeConfig(previewPlan)
      ? await assertDivisionReferences(
          dbContext.currentDb,
          dbContext.sourceDb,
          dbContext.historyTargets as never,
          metaDb,
          previewPlan,
          normalised,
        )
      : null
    progress.complete(
      formatGeometryCompletedLabel(
        'Validate',
        `${previewPlan.resourceType} references`,
        undefined,
        Date.now() - validationStartedAt,
      ),
    )
    const snapshotStartedAt = Date.now()
    progress.beginPhase(
      formatGeometryProgressLabel(
        'Assemble draft',
        `${previewPlan.resourceType} snapshot`,
      ),
      {
        current: 0,
        max: null,
      },
    )
    const retainedVersion = await readNativeGeometryVersion(
      dbContext,
      resourceReleaseId,
      previewPlan.resourceType,
      previewPlan.transform,
      previewPlan.cohortKey,
      previewPlan.sourceVersion,
    )
    const retainedSnapshot = retainedVersion
      ? await metaDb
          .select({
            id: metaSchema.metaSnapshots.id,
            cohortKey: metaSchema.metaSnapshots.cohortKey,
            parentSnapshotId: metaSchema.metaSnapshots.parentSnapshotId,
            resourceType: metaSchema.metaSnapshotLineages.resourceType,
            snapshotLineageId: metaSchema.metaSnapshots.snapshotLineageId,
            status: metaSchema.metaSnapshots.status,
          })
          .from(metaSchema.metaSnapshots)
          .innerJoin(
            metaSchema.metaSnapshotLineages,
            eq(
              metaSchema.metaSnapshots.snapshotLineageId,
              metaSchema.metaSnapshotLineages.id,
            ),
          )
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
      (await ensureDraftSnapshotForRelease(metaDb, previewPlan.resourceType, {
        cohortKey: previewPlan.cohortKey,
        datasetCode,
        datasetId: dataset.datasetId,
        regionCode: previewPlan.regionCode,
        sourceReleaseId: dataset.resourceReleaseId,
        geometryStatus: previewPlan.geometryStatus,
        variant: geometryVariant(previewPlan),
        reuseDraftSnapshotForVariant: isCenstatdGeometryCompanionPlan(previewPlan),
        reuseSnapshotLineageForVariant: isCenstatdGeometryCompanionPlan(previewPlan),
        rebuildPublishedSnapshot: options.rebuildPublishedSnapshot,
      }))

    failureAuditScope = reusesExistingGeometrySnapshot
      ? { stage: 'ingestion', ownerId: resourceReleaseId }
      : { stage: 'assembly', ownerId: snapshot.id }
    if (reusesExistingGeometrySnapshot) {
      await upsertSnapshotSource(
        metaDb,
        snapshot.id,
        dataset.resourceReleaseId,
        'enrichment',
        {
          anchorReleaseId: dataset.resourceReleaseId,
          selectedByRule: 'provenance:censtatd-geometry:verified-identical-geometry:v1',
          selectionMode: 'verified_identical_geometry',
        },
      )
    } else {
      if (isCenstatdGeometryCompanionPlan(previewPlan) && snapshot.parentSnapshotId) {
        const inheritedSources = await metaDb
          .select({
            datasetId: metaSchema.metaSnapshotResourceReleaseDetails.datasetId,
            role: metaSchema.metaSnapshotResourceReleaseDetails.role,
            sourceReleaseId:
              metaSchema.metaSnapshotResourceReleaseDetails.resourceReleaseId,
          })
          .from(metaSchema.metaSnapshotResourceReleaseDetails)
          .where(
            eq(
              metaSchema.metaSnapshotResourceReleaseDetails.snapshotId,
              snapshot.parentSnapshotId,
            ),
          )
          .all()
        for (const source of selectCenstatdInheritedSnapshotResourceReleases(
          inheritedSources,
        )) {
          await upsertSnapshotSource(
            metaDb,
            snapshot.id,
            source.sourceReleaseId,
            'enrichment',
            {
              selectedByRule:
                'provenance:censtatd-geometry:carried-forward-contributors:v1',
              selectionMode: 'carried_forward_companion',
            },
          )
        }
      }
      await upsertSnapshotSource(
        metaDb,
        snapshot.id,
        dataset.resourceReleaseId,
        'primary',
        {
          anchorReleaseId: dataset.resourceReleaseId,
          selectedByRule: 'assembly:division-geometry:source-release:v1',
          selectionMode: isCenstatdGeometryCompanionPlan(previewPlan)
            ? 'contributed_geometry'
            : 'exact_ref',
        },
      )
      await upsertSnapshotShardAssignment(metaDb, snapshot.id, historyShard.id)
    }
    if (options.curatedSourceReleases)
      await retainCuratedSourceReleases(
        metaDb,
        snapshot.id,
        dataset.resourceReleaseId,
        options.curatedSourceReleases,
      )
    await recordSnapshotAssembly(metaDb, {
      snapshotId: snapshot.id,
      resourceType: previewPlan.resourceType,
      anchorReleaseId: dataset.resourceReleaseId,
    })
    if (divisionLookup) {
      await recordSnapshotLookupDependency(metaDb, {
        anchorReleaseId: dataset.resourceReleaseId,
        lookupSnapshotId: divisionLookup.id,
        selectedByRule: divisionLookup.selectedByRule,
        selectionMode: divisionLookup.selectionMode,
        snapshotId: snapshot.id,
      })
    }
    progress.complete(
      formatGeometryCompletedLabel(
        'Assemble draft',
        `${previewPlan.resourceType} snapshot`,
        undefined,
        Date.now() - snapshotStartedAt,
      ),
    )
    const writeStartedAt = Date.now()
    progress.beginPhase(
      formatGeometryProgressLabel('Materialise', `${previewPlan.resourceType} @ local`),
      {
        current: 0,
        max: null,
      },
    )
    const writeResult = await writeGeometryRowsDurably(
      dbContext,
      previewPlan.resourceType,
      normalised,
      {
        datasetCode,
        source: previewPlan.source,
        publisherRows,
        variant: geometryVariant(previewPlan),
        resourceReleaseId,
        releaseCode,
        sourceVersion: previewPlan.sourceVersion,
        snapshotId: snapshot.id,
        snapshotLineageId: snapshot.snapshotLineageId,
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
        `${previewPlan.resourceType} @ local`,
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
      const geometryStats = await buildGeometryStats(
        dbContext.currentDb,
        dbContext.historyDb,
        metaDb,
        previewPlan,
        normalised,
        writeResult.churn,
        dbContext.historyTargets as never,
      )
      const sourceStats =
        previewPlan.source === 'overture'
          ? buildChurnStatsRows(
              await geometrySourceChurn(
                metaDb,
                [
                  ...new Set([
                    dbContext.sourceDb,
                    ...dbContext.sourceTargets.map(target => target.db),
                  ]),
                ] as HarbourReadableDb[],
                resourceReleaseId,
                previewPlan.resourceType,
              ),
            )
          : null
      await replaceDatasetStats(
        metaDb,
        resourceReleaseId,
        sourceStats
          ? [...geometryStats.filter(row => row.category !== 'changes'), ...sourceStats]
          : geometryStats,
      )
    }
    const sourceAudit = await retainDivisionSourceAudit(bucket, {
      resourceReleaseId,
      datasetCode,
      source: previewPlan.source,
      resourceType: previewPlan.resourceType,
      sourceVersion: previewPlan.sourceVersion,
      excludedGeometry:
        previewPlan.source === 'overture' && !options.normalisedInput
          ? cnGdExcludedRecords
          : undefined,
      guards: [
        ...(options.sourceAuditGuards ?? []),
        ...(previewPlan.source === 'overture' && divisionLookup
          ? [
              {
                id: 'source-geometry-division-references',
                summary:
                  'Require geometry references to resolve against the matching Division cohort.',
                consequence: 'block-ingestion' as const,
                status: 'passed' as const,
                checked: publisherRows.length,
                failed: 0,
                reason:
                  'All retained geometry references resolved against the selected Division cohort.',
              },
            ]
          : []),
      ],
      inputCount: previewPlan.rowCount,
      outputCount: publisherRows.length,
    })
    await deliverProcessingResult(target, bucket, sourceAudit.ref)
    // Identical reuse does not assemble a new snapshot. Keep its published
    // assembly evidence immutable; the new intake owns only its source audit.
    if (!reusesExistingGeometrySnapshot) {
      const audit = await retainDivisionProvenance(bucket, {
        scope: { stage: 'assembly', ownerId: snapshot.id },
        resourceReleaseId,
        datasetCode,
        inputCount: previewPlan.rowCount,
        curationDocuments: curationDocumentsFor(providerBridgeRows),
        normalisation:
          previewPlan.resourceType === 'divisionArea'
            ? divisionAreaGeometryRule.declaration
            : divisionBoundaryGeometryRule.declaration,
        actions: [],
        outputCount: publisherRows.length,
      })
      await deliverProcessingResult(target, bucket, audit.ref)
    }
    progress.complete(
      formatGeometryCompletedLabel(
        'Calculate',
        'release statistics',
        undefined,
        Date.now() - statsStartedAt,
      ),
    )
    if (target.remote) {
      const deliveryContext = await resolveCurrentWriteContext(
        target,
        previewPlan.regionCode,
        historyShardYear,
        {
          resumeSqlDeliveryReleaseId: resourceReleaseId,
          sourceShardYear,
        },
      )
      try {
        await replayGeometryIntoRemote(
          target,
          dbContext,
          previewPlan,
          resourceReleaseId,
          snapshot.id,
          reusesExistingGeometrySnapshot,
          (subject, operation) =>
            runGeometryProgressPhase(progress, 'Sync up', subject, operation),
          await deliveryFileSha256(preparedUpload.filePath),
          releaseCode,
          writeResult.currentChanges,
          deliveryContext,
        )
      } finally {
        deliveryContext.cleanup()
      }
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
          resourceReleaseId,
          'processDataset',
          {
            resourceType: previewPlan.resourceType,
            sourceRows: previewPlan.rowCount,
            processedRows: normalised.length,
            rejectedRows,
          } satisfies DatasetProcessingStats & Record<string, unknown>,
          releaseCode,
        ),
    )
    const publishResult = await runGeometryProgressPhase(
      progress,
      'Publish',
      'source release',
      () =>
        client.publishDataset(resourceReleaseId, releaseCode, {
          rebuildPublishedSnapshot: options.rebuildPublishedSnapshot,
          carriedSnapshots: curatedInventorySnapshots(options.curatedSourceReleases),
          deferApiReleaseSet: options.deferApiReleaseSet,
          deferSourcePublish: options.deferSourcePublish,
          skipSnapshotCleanup: options.skipSnapshotCleanup,
        }),
    )
    remotePublished = target.remote && !options.deferSourcePublish
    if (target.remote) {
      const publicationCacheDir = resolveRemoteCacheDir(
        target.environment === 'production' ? 'production' : 'preview',
      )
      try {
        if (
          (options.deferApiReleaseSet || options.deferSourcePublish) &&
          publishResult
        ) {
          await applyPublishMetadataDeltaToRemoteCache(
            target.environment === 'production' ? 'production' : 'preview',
            publicationCacheDir,
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
                publicationCacheDir,
                resourceReleaseId,
              ),
          )
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        if (!(await readPendingSqlDelivery(publicationCacheDir)))
          await invalidateRemoteDbCache(
            target.environment === 'production' ? 'production' : 'preview',
            publicationCacheDir,
            reason,
          )
        throw new Error(
          `Remote publish succeeded, but refreshing the local meta cache failed. ${reason}`,
        )
      }
    }
    await completeSqlDeliveryRelease(dbContext.state.dbCacheDir, resourceReleaseId)
    if (target.remote)
      await completeSqlDeliveryRelease(
        resolveRemoteCacheDir(
          target.environment === 'production' ? 'production' : 'preview',
        ),
        resourceReleaseId,
      )
    return {
      snapshotId: snapshot.id,
      importedRows: normalised.length,
      normalisedRows: normalised,
      publishResult,
    }
  } catch (error) {
    await retainProcessingFailure({
      scope: failureAuditScope,
      error,
      store: bucket,
      target,
      resourceReleaseId,
      datasetCode,
    })
    progress.fail(error)
    const failureClient =
      controlClient ?? (createHarbourControlClient(target) as HarbourClient)
    if (!remotePublished) {
      await failureClient
        .stageFailed(
          resourceReleaseId,
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
  selectCenstatdInheritedSnapshotResourceReleases,
  hasIdenticalGeometryMaterialisation,
  simplifyHkgovDivisionAreas,
  asOptionalInteger,
} from './processLocalDivisionGeometrySqlUploadPreparation.ts'

export {
  hasDivisionReferences,
  formatMissingDivisionReferenceRecords,
} from './processLocalDivisionGeometrySqlUploadReferences.ts'

export {
  canonicalGeometryBrotliQuality,
  shouldCompressCanonicalGeometry,
  shouldWriteExactGeometryReleaseStats,
  createGeometryChurnCounts,
  supportsDistrictGeometryStatistics,
  decodeStoredGeoJsonGeometry,
  calculateHousingMarketAreaDistrictCoverage,
} from './processLocalDivisionGeometrySqlUploadStatistics.ts'

export { selectOvertureHongKongAreasWithoutSourceGeometry } from './processLocalDivisionGeometrySqlUploadSyntheticGeometry.ts'
