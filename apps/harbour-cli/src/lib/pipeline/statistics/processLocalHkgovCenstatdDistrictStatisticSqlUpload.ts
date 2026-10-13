import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { replaceDatasetStatsAndReturnRows } from '@repo/core/pipeline/db/stats'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import { readParquetObjectsInBatches } from '@repo/core/pipeline/parquetR2'
import type { DatasetProcessingStats } from '@repo/core/pipeline/processingRunStats'
import {
  buildHkgovCenstatdDistrictStatisticHistoryRecord,
  type ResolvedHkgovCenstatdDistrict,
} from '@repo/core/pipeline/services/divisions/divisionStatistics'
import {
  buildCenstatdReleaseStats,
  buildCenstatdStructuralChurnStats,
  censtatdReleaseStatsProfileFor,
} from '@repo/core/pipeline/services/metrics/censtatdReleaseStats'
import { censtatdGeometryRow } from '@repo/core/pipeline/services/sources/censtatdGeometry'
import { nativeSourcePayloadHashInput } from '@repo/core/pipeline/services/sources/sourcePayload'
import { resolveStatisticEvents } from '@repo/core/pipeline/services/statistics/statisticSnapshotRecords'
import { createHash, stableJsonStringify } from '@repo/core/pipeline/utils'
import { registerRule, ruleDeclarationFromFixture } from '@repo/core/provenance'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'
import sourceAssertionFixture from '../../../../../../fixtures/meta/processing-rules/ingestion/censtatd-source-assertion.json'
import { calculateAndStorePublishedStatisticsStats } from '../../api/apiReleaseSetStats'
import { createHarbourControlClient } from '../../api/harbourControl.ts'
import { retainProcessingFailure } from '../../api/processingFailureAudit'
import { deliverProcessingResult } from '../../api/provenance.ts'
import { OperationProgress } from '../../cli/operationProgress.ts'
import type { UploadTarget } from '../../cli/options.ts'
import { curationDocumentsFor } from '../../curationDocuments'
import { resolveCurrentWriteContext } from '../../dbCache/currentWriteContext.ts'
import {
  applyPublishMetadataDeltaToRemoteCache,
  invalidateRemoteDbCache,
  refreshRemoteMetaCache,
  updateDbCacheProgress,
} from '../../dbCache/localDbCache.ts'
import { loadDatasetFixtures } from '../../sources/sourceUpdates.ts'
import type { PreparedUploadFile } from '../../upload/parquetRepack.ts'
import { LocalPipelineBucket } from '../local/localBucket.ts'
import { createLocalControlClient } from '../local/localControlClient.ts'
import { prepareCachedArtefact } from '../local/preparedArtefact.ts'
import { deliveryFileSha256 } from '../local/sqlDeliveryFiles.ts'
import {
  completeSqlDeliveryRelease,
  readPendingSqlDelivery,
} from '../local/sqlDeliveryPending.ts'
import {
  type SqlDeliveryPhase,
  sqlDeliveryPhaseDirectory,
} from '../local/sqlDeliveryPhase.ts'
import { syncStagedReleaseIntoLocalMetaCache } from '../local/syncStagedRelease.ts'
import { normaliseCachedStatistics } from './cachedStatisticNormalisation.ts'
import { replayCanonicalStatsSqlBatches } from './canonicalStatsSql.ts'
import {
  censtatdDistrictIdentityRule,
  resolveHkgovCenstatdDistrictBridge,
} from './censtatdDistrictBridge.ts'
import {
  prepareCenstatdGeometryAudit,
  retainCenstatdGeometryAudit,
} from './censtatdGeometryAudit'
import { formatCenstatdGeometryReuse } from './censtatdGeometryStorage'
import {
  loadCenstatdMeasureMetadata,
  resolveCenstatdFieldMetadata,
} from './censtatdMeasureCuration.ts'
import { findPreviousComparableCenstatdReleaseStats } from './censtatdReleaseChurn.ts'
import {
  materialiseStatisticSnapshots,
  resolveStatisticSnapshotPredecessors,
} from './materialiseStatisticSnapshot.ts'
import type { normaliseHkgovCenstatdStatistics } from './normaliseHkgovCenstatdStatistics.ts'
import {
  planCanonicalStatistics,
  selectStatisticReferencePeriodsWithChanges,
} from './planCanonicalStatistics'
import {
  replayReleaseStatsMetaToRemote,
  replayStatisticSnapshotMetaToRemote,
} from './releaseStatsMetaReplay.ts'
import { statisticAuditPeriod } from './statisticAuditPeriod'
import { hashCanonicalStatisticPreparation } from './statisticPreparation.ts'
import {
  completeStatisticCache,
  runStatisticProgressStep,
} from './statisticProgress.ts'
import { retainStatisticProvenance } from './statisticProvenance.ts'
import {
  buildStatisticSqlBatches,
  replayStatisticSqlBatches,
} from './statisticSqlReplay.ts'

type Plan = {
  cohortKey: string
  datasetCode: string
  regionCode: 'hk'
  releaseCode: string
  rowCount: number
  source: 'hkgov-censtatd'
  sourceVersion: string
  theme: 'stats'
  resourceType: 'divisionStatistic'
}
type UploadResult = {
  datasetCode?: string
  rawObjectKey?: string
  releaseCode?: string
  resourceReleaseId?: string
}

type SourceStatisticRow = {
  createdAt: string
  districtCode: number
  districtEn: string
  districtZhHant: string
  isCurrent: boolean
  landAreaSqKm: number
  midYearPopulation: number
  midYearPopulationDensityPerSqKm: number
  properties: unknown
  referencePeriodCode: string
  referencePeriodEnd: string | null
  referencePeriodEndYear: string
  referencePeriodGranularity: string
  referencePeriodStart: string | null
  resourceReleaseId: string
  sourceGeometry: unknown
  sourceRecordId: string
  sources: unknown
  updatedAt: string
  validFromRelease: string
  validToRelease: null
  version: number
  versionHash: string
}

type HistoryStatisticRow = {
  createdAt: string
  districtCode: string
  divisionId: string
  id: string
  isCurrent: boolean
  landAreaSqKm: number
  midYearPopulation: number
  midYearPopulationDensityPerSqKm: number
  referenceYear: string
  sourceReleaseId: string
  sources: unknown
  updatedAt: string
  versionHash: string
}

/**
 * Persists raw C&SD source records, then publishes their canonical
 * Division Statistics history observations. Source rows never contain a
 * canonical district code or division ID.
 */
export async function processLocalHkgovCenstatdDistrictStatisticSqlUpload(
  target: UploadTarget,
  plan: Plan,
  uploadResult: UploadResult,
  preparedUpload: PreparedUploadFile,
  options: {
    deferStatsReleaseSet?: boolean
    deferSourcePublish?: boolean
    promptForCuration: boolean
    reuseExistingRelease?: boolean
  },
) {
  const [dataset] = await loadDatasetFixtures(new Set([plan.datasetCode]))
  if (!dataset) throw new Error(`Missing dataset fixture: ${plan.datasetCode}.`)
  const resourceReleaseId = required(
    uploadResult.resourceReleaseId,
    'resourceReleaseId',
  )
  const releaseCode = required(uploadResult.releaseCode, 'releaseCode')
  const progress = new OperationProgress()
  const cacheStartedAt = Date.now()
  progress.beginPhase('Prepare statistic processing cache', { max: null })
  let context: Awaited<ReturnType<typeof resolveCurrentWriteContext>>
  try {
    context = await resolveCurrentWriteContext(
      target,
      plan.regionCode,
      plan.sourceVersion.slice(0, 4),
      {
        resumeSqlDeliveryReleaseId: resourceReleaseId,

        onProgress(event) {
          updateDbCacheProgress(progress, event)
        },
      },
    )
  } catch (error) {
    progress.fail()
    throw error
  }
  if (progress.hasActivePhase()) {
    completeStatisticCache(progress, {
      durationMs: Date.now() - cacheStartedAt,
      remote: target.remote,
    })
  }
  const metaDb = context.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  const datasetCode = required(uploadResult.datasetCode, 'datasetCode')
  if (datasetCode !== plan.datasetCode) {
    throw new Error(
      `Registered dataset ${datasetCode} does not match upload plan ${plan.datasetCode}.`,
    )
  }
  await syncStagedReleaseIntoLocalMetaCache(
    context.metaDb,
    {
      datasetCode,
      rawObjectKey: required(uploadResult.rawObjectKey, 'rawObjectKey'),
      releaseCode,
      resourceReleaseId,
    },
    plan,
    {
      reuseExistingRelease: options.reuseExistingRelease,
      retainedDeliveryCacheDir: context.state.dbCacheDir,
    },
  )
  const client = target.remote
    ? (createHarbourControlClient(target) as HarbourClient)
    : createLocalControlClient(metaDb, {
        publishClient: createHarbourControlClient(target) as HarbourClient,
      })

  let processingStarted = false
  let cacheMutationStarted = false
  const preparedSha256 = await deliveryFileSha256(preparedUpload.filePath)
  let canonicalSha256: string | undefined
  const delivery = (phase: string): SqlDeliveryPhase => ({
    ...(['statistics-source', 'statistics-canonical'].includes(phase)
      ? { resolvedFamily: 'statistics' as const }
      : {}),
    nativeLocal: true,
    context,
    resourceReleaseId,
    phase,
    inputs: {
      preparedSha256,
      sourceVersion: plan.sourceVersion,
      releaseCode,
      datasetCode,
      canonicalSha256,
    },
    onProgress: (completed, total) =>
      progress.message(`SQL delivery: ${completed}/${total} batches`),
  })
  let failureAuditScope: import('@repo/core/provenance').AuditScope = {
    stage: 'preparation',
    ownerId: resourceReleaseId,
  }

  try {
    const resolutionBySourceDistrictCode = await runStatisticProgressStep(
      progress,
      { action: 'Prepare', count: 18, subject: 'canonical districts' },
      () => resolveHkgovCenstatdDistrictBridge('2021'),
    )
    const sourceRows = await runStatisticProgressStep(
      progress,
      { action: 'Prepare', count: plan.rowCount, subject: 'statistic rows' },
      () =>
        prepareCachedArtefact({
          directory: sqlDeliveryPhaseDirectory(
            delivery('statistics-source-preparation'),
          ),
          inputs: {
            contract: 'censtatd-features-district-source-v1',
            preparedSha256,
            resourceReleaseId,
            releaseCode,
            datasetCode,
            sourceVersion: plan.sourceVersion,
            rowCount: plan.rowCount,
          },
          generate: () =>
            readSourceRows(
              preparedUpload.filePath,
              resourceReleaseId,
              plan.sourceVersion,
            ),
        }),
    )
    if (sourceRows.length !== 18 || sourceRows.length !== plan.rowCount) {
      throw new Error(
        `Expected 18 C&SD district statistic rows; imported ${sourceRows.length}.`,
      )
    }
    assertUniqueDistrictAssertions(sourceRows)
    const historyRows = await runStatisticProgressStep(
      progress,
      { action: 'Normalise', count: sourceRows.length, subject: 'records' },
      () =>
        Promise.all(
          sourceRows.map(row =>
            normaliseHistoryRow(row, resolutionBySourceDistrictCode, resourceReleaseId),
          ),
        ),
    )
    const canonicalInput = sourceRows.map(row => {
      const resolution = resolutionBySourceDistrictCode.get(row.districtCode)
      return {
        datasetCode: plan.datasetCode,
        divisionId: resolution?.divisionId ?? null,
        geography: resolution
          ? { code: resolution.districtCode, kind: 'district' }
          : undefined,
        areaCompanionByReferencePeriod: dataset.areaCompanionByReferencePeriod,
        properties: object(row.properties, 'properties'),
        sourceFeatureRef: `hkgov-censtatd/${plan.datasetCode}/${plan.sourceVersion}/${row.sourceRecordId}`,
        sourceReleaseId: resourceReleaseId,
        sourceVersion: plan.sourceVersion,
      }
    })
    let canonical = await normaliseCachedStatistics(
      sqlDeliveryPhaseDirectory(delivery('statistics-normalisation')),
      canonicalInput,
    )
    const fieldMetadata = await runStatisticProgressStep(
      progress,
      { action: 'Review', count: canonical.fields.length, subject: 'fields' },
      () =>
        resolveCenstatdFieldMetadata({
          fields: canonical.fields,
          promptForCuration: options.promptForCuration,
        }),
    )
    const measureMetadata = await loadCenstatdMeasureMetadata()
    canonical = await runStatisticProgressStep(
      progress,
      { action: 'Curate', count: canonical.fields.length, subject: 'fields' },
      () =>
        normaliseCachedStatistics(
          sqlDeliveryPhaseDirectory(delivery('statistics-normalisation')),
          canonicalInput,
          {
            fieldMetadata,
            measureMetadata,
          },
        ),
    )
    canonicalSha256 = hashCanonicalStatisticPreparation(canonical)
    const geometryAudit = await prepareCenstatdGeometryAudit({
      directory: sqlDeliveryPhaseDirectory(delivery('statistics-geometry-audit')),
      db: context.sourceDb as unknown as HarbourReadableDb,
      rows: sourceRows,
      resourceReleaseId,
      datasetCode: plan.datasetCode,
      sourceVersion: plan.sourceVersion,
    })
    progress.message(formatCenstatdGeometryReuse(geometryAudit))
    const batches = () =>
      buildStatisticSqlBatches({
        history: { rows: districtHistoryEvents, table: 'divisionStatistics' },
        sourceVersion: plan.sourceVersion,
        resourceReleaseId,
        source: {
          rows: sourceRows.map(row => sourceStatisticAssertion(row, datasetCode)),
          geometries: sourceRows.map(row => censtatdGeometryRow(row.sourceGeometry)),
          table: 'hkgovCenstatdStatistics',
        },
      })
    const referencePeriods = uniqueReferencePeriods(canonical.records)
    const historyDbs = context.historyTargets.map(
      target => target.db as HarbourReadableDb,
    )
    const changedReferencePeriods = await selectStatisticReferencePeriodsWithChanges({
      canonical,
      metaDb,
      historyDbs,
      snapshots: await resolveStatisticSnapshotPredecessors({
        datasetCode: plan.datasetCode,
        metaDb,
        referencePeriods,
      }),
    })
    const snapshots = await materialiseStatisticSnapshots({
      datasetCode: plan.datasetCode,
      metaDb,
      referencePeriods: referencePeriods.filter(referencePeriod =>
        changedReferencePeriods.has(referencePeriod.code),
      ),
      resourceReleaseId,
      target,
    })
    const districtHistoryEvents: Record<string, unknown>[] = []
    for (const snapshot of snapshots) {
      const parentPlan = snapshot.parentSnapshotId
        ? await resolveSnapshotReplayPlan(metaDb, snapshot.parentSnapshotId)
        : []
      const priorGroups = await resolveStatisticEvents(
        historyDbs,
        parentPlan.map(step => step.snapshotId),
        ['divisionStatistic'],
      )
      const previous = new Map(
        [...priorGroups.values()].flat().map(row => [row.recordId, row.versionHash]),
      )
      const incoming = historyRows.filter(
        row => row.referenceYear === snapshot.cohortKey,
      )
      for (const row of incoming) {
        if (previous.get(row.id) !== row.versionHash)
          districtHistoryEvents.push({
            ...row,
            snapshotId: snapshot.id,
            operation: 'upsert',
          })
      }
      const present = new Set(incoming.map(row => row.id))
      for (const id of previous.keys())
        if (!present.has(id))
          districtHistoryEvents.push({
            id,
            snapshotId: snapshot.id,
            operation: 'delete',
            versionHash: null,
            sourceReleaseId: resourceReleaseId,
          })
    }
    if (snapshots[0])
      failureAuditScope = { stage: 'assembly', ownerId: snapshots[0].id }
    const canonicalPlan = await planCanonicalStatistics({
      canonical,
      snapshots,
      metaDb,
      historyDbs,
      sourceReleaseId: resourceReleaseId,
    })
    progress.message(
      `Statistics: ${canonicalPlan.changedRecords.length} changed packs, ${canonicalPlan.unchangedRecords} unchanged packs`,
    )
    const canonicalBatches = () =>
      canonicalPlan.buildBatches(
        statisticSourceResolutions(
          canonicalPlan.changedRecords,
          new Map(
            sourceRows.map(row => [
              `hkgov-censtatd/${plan.datasetCode}/${plan.sourceVersion}/${row.sourceRecordId}`,
              { sourceRecordId: row.sourceRecordId, versionHash: row.versionHash },
            ]),
          ),
          resourceReleaseId,
        ),
      )
    await client.stageRunning(
      resourceReleaseId,
      'processDataset',
      { resourceType: plan.resourceType, sourceRows: plan.rowCount },
      releaseCode,
    )
    processingStarted = true
    await runStatisticProgressStep(
      progress,
      {
        action: 'Import SQL',
        subject: 'batches',
      },
      () =>
        replayStatisticSqlBatches(
          target,
          context,
          plan.sourceVersion.slice(0, 4),
          batches,
          {
            delivery: delivery('statistics-source'),
            onProgress(event) {
              if (event.phase === 'local-replay') cacheMutationStarted = true
              progress.update(event.completedBatches, {
                max: event.totalBatches,
                label: `Import SQL: ${event.phase} (${event.completedBatches}/${event.totalBatches})`,
              })
            },
          },
        ),
    )
    await runStatisticProgressStep(
      progress,
      {
        action: 'Import canonical SQL',
        subject: 'batches',
      },
      () =>
        replayCanonicalStatsSqlBatches(target, context, canonicalBatches, {
          delivery: delivery('statistics-canonical'),
          onProgress(event) {
            progress.update(event.completedBatches, {
              max: event.totalBatches,
              label: `Import canonical SQL: ${event.phase} (${event.completedBatches}/${event.totalBatches})`,
            })
          },
        }),
    )
    const statsProfile = censtatdReleaseStatsProfileFor(
      plan.datasetCode,
      plan.sourceVersion,
    )
    const structuralStats = buildCenstatdReleaseStats(
      sourceRows.map(row => ({
        featureId: String(row.districtCode),
        layerName: `Density_${plan.sourceVersion}`,
      })),
      canonical,
      statsProfile,
    )
    const previousStats = await findPreviousComparableCenstatdReleaseStats(
      metaDb,
      resourceReleaseId,
    )
    const { materialisedStats } = await runStatisticProgressStep(
      progress,
      { action: 'Calculate', count: structuralStats.length, subject: 'stats' },
      async () => {
        const materialisedStats = await replaceDatasetStatsAndReturnRows(
          metaDb,
          resourceReleaseId,
          [
            ...structuralStats,
            ...buildCenstatdStructuralChurnStats(structuralStats, previousStats),
          ],
        )
        await replayReleaseStatsMetaToRemote(
          target,
          context,
          resourceReleaseId,
          materialisedStats,
          { delivery: delivery('statistics-meta-stats') },
        )
        return { materialisedStats }
      },
    )
    await client.stageCompleted(
      resourceReleaseId,
      'processDataset',
      {
        resourceType: plan.resourceType,
        sourceRows: plan.rowCount,
        processedRows: sourceRows.length,
        historyRows: historyRows.length,
        statsRows: materialisedStats.length,
      } satisfies DatasetProcessingStats & Record<string, unknown>,
      releaseCode,
    )
    await replayStatisticSnapshotMetaToRemote(
      target,
      context,
      metaDb,
      resourceReleaseId,
      snapshots.map(snapshot => snapshot.id),
      { delivery: delivery('statistics-meta-snapshots') },
    )
    await runStatisticProgressStep(
      progress,
      { action: 'Retain', subject: 'processing provenance' },
      async () => {
        const store = new LocalPipelineBucket(
          sqlDeliveryPhaseDirectory(delivery('statistics-provenance')),
        )
        const ingestion = await retainCenstatdGeometryAudit(store, {
          resourceReleaseId,
          datasetCode: plan.datasetCode,
          counts: geometryAudit,
        })
        await deliverProcessingResult(target, store, ingestion.ref)
        for (const snapshot of snapshots) {
          const result = await retainStatisticProvenance(store, {
            scope: { stage: 'assembly', ownerId: snapshot.id },
            resourceReleaseId,
            datasetCode: plan.datasetCode,
            ...statisticAuditPeriod(canonical, canonicalInput, snapshot.cohortKey),
            fieldMetadata,
            measureMetadata,
            geographyFixtures: curationDocumentsFor(resolutionBySourceDistrictCode),
            additionalRules: [
              {
                declaration: censtatdDistrictIdentityRule.declaration,
                count: resolutionBySourceDistrictCode.size,
              },
            ],
          })
          await deliverProcessingResult(target, store, result.ref)
        }
      },
    )
    const published = await runStatisticProgressStep(
      progress,
      { action: 'Publish', subject: 'statistic release' },
      async () => {
        const published = await client.publishDataset(resourceReleaseId, releaseCode, {
          deferStatsReleaseSet: options.deferStatsReleaseSet,
          deferSourcePublish: options.deferSourcePublish,
        })
        if (target.remote) {
          const targetName =
            target.environment === 'production' ? 'production' : 'preview'
          if (
            (options.deferStatsReleaseSet || options.deferSourcePublish) &&
            published
          ) {
            await applyPublishMetadataDeltaToRemoteCache(
              targetName,
              context.state.dbCacheDir,
              published,
            )
          } else {
            await refreshRemoteMetaCache(
              targetName,
              context.state.dbCacheDir,
              resourceReleaseId,
            )
          }
        }
        return published
      },
    )
    if (!options.deferStatsReleaseSet) {
      await calculateAndStorePublishedStatisticsStats(
        {
          historyTargets: context.historyTargets,
          currentDb: context.currentDb as unknown as HarbourReadableDb,
          harbourClient: client,
          importOptions: {
            accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
            apiToken: process.env.CLOUDFLARE_D1_TOKEN,
            isLocal: !target.remote,
            metaBinding: context.metaBinding,
            metaDatabaseId: context.state.bindings.DB_META?.databaseId ?? null,
          },
          metaDb,
          progress,
          releaseCode,
          resourceReleaseId,
        },
        published,
      )
    }
    await completeSqlDeliveryRelease(context.state.dbCacheDir, resourceReleaseId)
    return published
  } catch (error) {
    await retainProcessingFailure({
      scope: failureAuditScope,
      error,
      target,
      resourceReleaseId,
      datasetCode,
      store: new LocalPipelineBucket(
        sqlDeliveryPhaseDirectory(delivery('statistics-provenance')),
      ),
    })
    progress.fail()
    if (
      target.remote &&
      cacheMutationStarted &&
      !(await readPendingSqlDelivery(context.state.dbCacheDir))
    ) {
      await invalidateRemoteDbCache(
        target.environment === 'production' ? 'production' : 'preview',
        context.state.dbCacheDir,
        error instanceof Error ? error.message : String(error),
      ).catch(() => undefined)
    }
    if (processingStarted) {
      await client
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
    context.cleanup()
  }
}

async function readSourceRows(
  filePath: string,
  resourceReleaseId: string,
  sourceVersion: string,
) {
  const rows: SourceStatisticRow[] = []
  for await (const batch of readParquetObjectsInBatches(
    await asyncBufferFromFile(filePath),
    18,
  )) {
    rows.push(
      ...(await Promise.all(
        batch.map(row => normaliseSourceRow(row, resourceReleaseId, sourceVersion)),
      )),
    )
  }
  return rows
}

export const censtatdSourceAssertionRule = registerRule(
  ruleDeclarationFromFixture(sourceAssertionFixture),
  (args: Parameters<typeof normaliseSourceRowInternal>) =>
    normaliseSourceRowInternal(...args),
)

function normaliseSourceRow(...args: Parameters<typeof normaliseSourceRowInternal>) {
  return censtatdSourceAssertionRule.execute(args)
}

async function normaliseSourceRowInternal(
  value: Record<string, unknown>,
  resourceReleaseId: string,
  sourceVersion: string,
): Promise<SourceStatisticRow> {
  if (!Object.hasOwn(value, 'properties'))
    throw new Error('C&SD source properties are missing; prepare the release again.')
  const sourceRecordId = string(value.id, 'id')
  const referencePeriodCode = string(
    value.reference_period_code,
    'reference_period_code',
  )
  if (referencePeriodCode !== sourceVersion) {
    throw new Error(`Expected reference_period_code=${sourceVersion}.`)
  }
  const payload = {
    districtCode: integer(value.district_code, 'district_code'),
    districtEn: string(value.name_en, 'name_en'),
    districtZhHant: string(value.name_zh_hant, 'name_zh_hant'),
    landAreaSqKm: number(value.land_area_sq_km, 'land_area_sq_km'),
    midYearPopulationDensityPerSqKm: integer(
      value.mid_year_population_density_per_sq_km,
      'mid_year_population_density_per_sq_km',
    ),
    midYearPopulation: integer(value.mid_year_population, 'mid_year_population'),
    properties: json(value.properties, 'properties'),
    referencePeriodCode,
    referencePeriodEnd: optionalString(value.reference_period_end),
    referencePeriodEndYear: string(
      value.reference_period_end_year,
      'reference_period_end_year',
    ),
    referencePeriodGranularity: string(
      value.reference_period_granularity,
      'reference_period_granularity',
    ),
    referencePeriodStart: optionalString(value.reference_period_start),
    sourceGeometry: json(value.source_geometry, 'source_geometry'),
    sourceRecordId,
    sources: json(value.sources, 'sources'),
  }
  const now = new Date().toISOString()
  return {
    ...payload,
    createdAt: now,
    isCurrent: true,
    resourceReleaseId,
    updatedAt: now,
    validFromRelease: sourceVersion,
    validToRelease: null,
    version: 1,
    versionHash: await createHash(
      stableJsonStringify(nativeSourcePayloadHashInput(payload)),
    ),
  }
}

async function normaliseHistoryRow(
  source: SourceStatisticRow,
  resolutionBySourceDistrictCode: ReadonlyMap<number, ResolvedHkgovCenstatdDistrict>,
  sourceReleaseId: string,
): Promise<HistoryStatisticRow> {
  const resolved = resolutionBySourceDistrictCode.get(source.districtCode)
  if (!resolved) {
    throw new Error(
      `No reviewed canonical district identity for C&SD districtCode=${source.districtCode}.`,
    )
  }
  const payload = buildHkgovCenstatdDistrictStatisticHistoryRecord(
    {
      districtCode: source.districtCode,
      id: source.sourceRecordId,
      landAreaSqKm: source.landAreaSqKm,
      midYearPopulation: source.midYearPopulation,
      midYearPopulationDensityPerSqKm: source.midYearPopulationDensityPerSqKm,
      nameEn: source.districtEn,
      nameZhHant: source.districtZhHant,
      referenceYear: source.referencePeriodCode,
      sources: source.sources,
    },
    resolved,
  )
  const now = new Date().toISOString()
  return {
    ...payload,
    createdAt: now,
    isCurrent: true,
    sourceReleaseId,
    updatedAt: now,
    versionHash: await createHash(stableJsonStringify(payload)),
  }
}

function assertUniqueDistrictAssertions(rows: SourceStatisticRow[]) {
  const sourceRecordIds = new Set(rows.map(row => row.sourceRecordId))
  const districtCodes = new Set(rows.map(row => row.districtCode))
  if (sourceRecordIds.size !== rows.length || districtCodes.size !== rows.length) {
    throw new Error('C&SD district statistic input contains duplicate DC records.')
  }
}

function json(value: unknown, field: string) {
  if (typeof value !== 'string') throw new Error(`Expected ${field} JSON string.`)
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`Invalid ${field} JSON.`)
  }
}

function string(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Expected ${field}.`)
  return value.trim()
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function number(value: unknown, field: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`Expected numeric ${field}.`)
  return parsed
}

function integer(value: unknown, field: string) {
  const parsed = number(value, field)
  if (!Number.isInteger(parsed)) throw new Error(`Expected integer ${field}.`)
  return parsed
}

function required(value: string | undefined, field: string) {
  if (!value) throw new Error(`Expected ${field}.`)
  return value
}

function object(value: unknown, field: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected ${field} object.`)
  }
  return value as Record<string, unknown>
}

function uniqueReferencePeriods(
  records: ReturnType<typeof normaliseHkgovCenstatdStatistics>['records'],
) {
  return [
    ...new Map(
      records.map(record => [
        record.referencePeriodCode,
        {
          code: record.referencePeriodCode,
          endYear: record.referencePeriodEndYear,
        },
      ]),
    ).values(),
  ]
}

import { statisticSourceResolutions } from './sourceResolutions'
import { sourceStatisticAssertion } from './sourceStatisticAssertion.ts'
