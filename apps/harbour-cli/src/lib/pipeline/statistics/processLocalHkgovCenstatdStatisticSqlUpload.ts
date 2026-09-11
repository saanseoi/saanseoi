import { calculateAndStorePublishedStatisticsStats } from '../../api/apiReleaseSetStats'
import { nativeSourcePayloadHashInput } from '@repo/core/pipeline/services/sources/sourcePayload'
import { retainProcessingFailure } from '../../api/processingFailureAudit'
import { curationDocumentsFor } from '../../curationDocuments'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { deliveryFileSha256 } from '../local/sqlDeliveryFiles.ts'
import {
  sqlDeliveryPhaseDirectory,
  type SqlDeliveryPhase,
} from '../local/sqlDeliveryPhase.ts'
import { prepareCachedArtefact } from '../local/preparedArtefact.ts'
import { hashCanonicalStatisticPreparation } from './statisticPreparation.ts'
import { normaliseCachedStatistics } from './cachedStatisticNormalisation.ts'
import { retainStatisticProvenance } from './statisticProvenance.ts'
import { LocalPipelineBucket } from '../local/localBucket.ts'
import { deliverProcessingResult } from '../../api/provenance.ts'
import {
  completeSqlDeliveryRelease,
  readPendingSqlDelivery,
} from '../local/sqlDeliveryPending.ts'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import { replaceDatasetStatsAndReturnRows } from '@repo/core/pipeline/db/stats'
import { hashStatisticContent } from './statisticsRecordIdentity'
import {
  buildCenstatdReleaseStats,
  buildCenstatdStructuralChurnStats,
  censtatdReleaseStatsProfileFor,
} from '@repo/core/pipeline/services/metrics/censtatdReleaseStats'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'
import { readParquetObjectsInBatches } from '@repo/core/pipeline/parquetR2'

import {
  invalidateRemoteDbCache,
  applyPublishMetadataDeltaToRemoteCache,
  refreshRemoteMetaCache,
  resolveLocalAddressDbContext,
  updateDbCacheProgress,
} from '../../dbCache/localDbCache.ts'
import type { UploadTarget } from '../../cli/options.ts'
import { createHarbourControlClient } from '../../api/harbourControl.ts'
import { createLocalControlClient } from '../local/localControlClient.ts'
import { syncStagedReleaseIntoLocalMetaCache } from '../local/syncStagedRelease.ts'
import type { PreparedUploadFile } from '../../upload/parquetRepack.ts'
import { OperationProgress } from '../../cli/operationProgress.ts'
import {
  buildStatisticSqlBatches,
  replayStatisticSqlBatches,
} from './statisticSqlReplay.ts'
import { replayCanonicalStatsSqlBatches } from './canonicalStatsSql.ts'
import {
  resolveCenstatdDistrictBridgeCohort,
  censtatdDistrictIdentityRule,
  resolveCenstatdNewTownBridgeCohort,
  resolveHkgovCenstatdDistrictBridge,
  resolveHkgovCenstatdNewTownBridge,
} from './censtatdDistrictBridge.ts'
import type { normaliseHkgovCenstatdStatistics } from './normaliseHkgovCenstatdStatistics.ts'
import {
  loadCenstatdMeasureMetadata,
  resolveCenstatdFieldMetadata,
} from './censtatdMeasureCuration.ts'
import { hkgovCenstatdStatisticDivisionId } from '../../sources/hkgov/censtatd/hkgovCenstatdStatistics.ts'
import { sourceStatisticAssertion } from './sourceStatisticAssertion.ts'
import { loadDatasetFixtures } from '../../sources/sourceUpdates.ts'
import { findPreviousComparableCenstatdReleaseStats } from './censtatdReleaseChurn.ts'
import {
  replayReleaseStatsMetaToRemote,
  replayStatisticSnapshotMetaToRemote,
} from './releaseStatsMetaReplay.ts'
import {
  completeStatisticCache,
  runStatisticProgressStep,
} from './statisticProgress.ts'
import { materialiseStatisticSnapshots } from './materialiseStatisticSnapshot.ts'
import { planCanonicalStatistics } from './planCanonicalStatistics'

export async function processLocalHkgovCenstatdStatisticSqlUpload(
  target: UploadTarget,
  plan: {
    cohortKey: string
    datasetCode: string
    regionCode: 'hk'
    releaseCode: string
    rowCount: number
    source: 'hkgov-censtatd'
    sourceVersion: string
    theme: 'stats'
    resourceType: 'divisionStatistic'
  },
  upload: {
    datasetCode?: string
    rawObjectKey?: string
    releaseCode?: string
    releaseId?: string
  },
  prepared: PreparedUploadFile,
  options: {
    deferStatsReleaseSet?: boolean
    deferSourcePublish?: boolean
    promptForCuration: boolean
    reuseExistingRelease?: boolean
  },
) {
  const releaseId = required(upload.releaseId, 'releaseId')
  const releaseCode = required(upload.releaseCode, 'releaseCode')
  const progress = new OperationProgress()
  const cacheStartedAt = Date.now()
  progress.beginPhase('Prepare statistic processing cache', { max: null })
  let context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>
  try {
    context = await resolveLocalAddressDbContext(
      target,
      'hk',
      plan.sourceVersion.slice(0, 4),
      {
        cacheTableProfile: 'statistics',
        resumeSqlDeliveryReleaseId: releaseId,
        includeAllHistoryShardYears: true,
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
  const datasetCode = required(upload.datasetCode, 'datasetCode')
  if (datasetCode !== plan.datasetCode) {
    throw new Error(
      `Registered dataset ${datasetCode} does not match upload plan ${plan.datasetCode}.`,
    )
  }
  await syncStagedReleaseIntoLocalMetaCache(
    context.metaDb,
    {
      datasetCode,
      rawObjectKey: required(upload.rawObjectKey, 'rawObjectKey'),
      releaseCode,
      releaseId,
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
  const preparedSha256 = await deliveryFileSha256(prepared.filePath)
  let canonicalSha256: string | undefined
  const delivery = (phase: string): SqlDeliveryPhase => ({
    ...(['statistics-source', 'statistics-canonical'].includes(phase)
      ? { resolvedFamily: 'statistics' as const }
      : {}),
    nativeLocal: true,
    context,
    releaseId,
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
  try {
    const rows = await runStatisticProgressStep(
      progress,
      { action: 'Prepare', count: plan.rowCount, subject: 'statistic rows' },
      () =>
        prepareCachedArtefact({
          directory: sqlDeliveryPhaseDirectory(
            delivery('statistics-source-preparation'),
          ),
          inputs: {
            contract: 'censtatd-general-source-v4',
            preparedSha256,
            releaseId,
            releaseCode,
            datasetCode,
            sourceVersion: plan.sourceVersion,
            rowCount: plan.rowCount,
          },
          generate: () => readRows(prepared.filePath, releaseId, plan.sourceVersion),
        }),
    )
    if (rows.length !== plan.rowCount)
      throw new Error(
        `Expected ${plan.rowCount} C&SD statistic rows; found ${rows.length}.`,
      )
    const importedDatasetCode = requiredString(rows[0]?.datasetCode, 'datasetCode')
    if (importedDatasetCode !== datasetCode) {
      throw new Error(
        `Imported dataset ${importedDatasetCode} does not match registered dataset ${datasetCode}.`,
      )
    }
    const [dataset] = await loadDatasetFixtures(new Set([datasetCode]))
    if (!dataset) throw new Error(`Missing dataset fixture: ${datasetCode}.`)
    const sourceFeatures = rows.map(row => ({
      featureId: requiredString(row.featureId, 'featureId'),
      layerName: requiredString(row.layerName, 'layerName'),
    }))
    const bridgeCohort = resolveCenstatdDistrictBridgeCohort(
      datasetCode,
      plan.sourceVersion,
    )
    const newTownBridgeCohort = resolveCenstatdNewTownBridgeCohort(
      datasetCode,
      plan.sourceVersion,
    )
    const districtsBySourceCode = bridgeCohort
      ? await resolveHkgovCenstatdDistrictBridge(bridgeCohort)
      : null
    const newTownsBySourceCode = newTownBridgeCohort
      ? await resolveHkgovCenstatdNewTownBridge(newTownBridgeCohort)
      : null
    const canonicalInput = rows.map(row => {
      const properties = object(row.properties, 'properties')
      const rawSourceFeatureId = `${requiredString(row.layerName, 'layerName')}:${requiredString(row.featureId, 'featureId')}`
      const sourceFeatureRef = [
        'hkgov-censtatd',
        datasetCode,
        plan.sourceVersion,
        rawSourceFeatureId,
      ].join('/')
      const divisionId = divisionIdForSourceProperties(
        datasetCode,
        properties,
        rawSourceFeatureId,
        districtsBySourceCode,
        newTownsBySourceCode,
      )
      if ((bridgeCohort || newTownBridgeCohort) && !divisionId) {
        throw new Error(
          `C&SD ${datasetCode} feature ${rawSourceFeatureId} does not resolve through its reviewed canonical Division bridge.`,
        )
      }
      return {
        datasetCode: requiredString(row.datasetCode, 'datasetCode'),
        divisionId,
        properties,
        sourceFeatureRef,
        sourceReleaseId: releaseId,
        sourceVersion: plan.sourceVersion,
        ...(districtsBySourceCode
          ? {
              geography: geographyForSourceProperties(
                datasetCode,
                properties,
                districtsBySourceCode,
              ),
            }
          : {}),
        areaCompanionByReferencePeriod: dataset.areaCompanionByReferencePeriod,
      }
    })
    let canonical = await runStatisticProgressStep(
      progress,
      { action: 'Normalise', count: rows.length, subject: 'records' },
      () =>
        normaliseCachedStatistics(
          sqlDeliveryPhaseDirectory(delivery('statistics-normalisation')),
          canonicalInput,
        ),
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
    const batches = () =>
      buildStatisticSqlBatches({
        sourceVersion: plan.sourceVersion,
        releaseId,
        source: {
          rows: rows.map(sourceStatisticAssertion),
          table: 'hkgovCenstatdStatistics',
        },
      })
    const snapshots = await materialiseStatisticSnapshots({
      datasetCode,
      metaDb,
      referencePeriods: uniqueReferencePeriods(canonical.records),
      releaseId,
      target,
    })
    const canonicalPlan = await planCanonicalStatistics({
      canonical,
      snapshots,
      metaDb,
      historyDbs: context.historyTargets.map(target => target.db as HarbourReadableDb),
      sourceReleaseId: releaseId,
    })
    progress.message(
      `Statistics: ${canonicalPlan.changedRecords.length} changed packs, ${canonicalPlan.unchangedRecords} unchanged packs`,
    )
    const canonicalBatches = () =>
      canonicalPlan.buildBatches(
        statisticSourceResolutions(
          canonicalPlan.changedRecords,
          new Map(
            rows.map(row => [
              `hkgov-censtatd/${datasetCode}/${plan.sourceVersion}/${row.layerName}:${row.featureId}`,
              {
                sourceRecordId: String(row.sourceRecordId),
                versionHash: String(row.versionHash),
              },
            ]),
          ),
          releaseId,
        ),
      )
    await client.stageRunning(
      releaseId,
      'processDataset',
      { resourceType: 'divisionStatistic', sourceRows: plan.rowCount },
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
    const statsProfile = censtatdReleaseStatsProfileFor(datasetCode, plan.sourceVersion)
    const structuralStats = buildCenstatdReleaseStats(
      sourceFeatures,
      canonical,
      statsProfile,
    )
    const previousStats = await findPreviousComparableCenstatdReleaseStats(
      metaDb,
      releaseId,
    )
    const { materialisedStats } = await runStatisticProgressStep(
      progress,
      { action: 'Calculate', count: structuralStats.length, subject: 'stats' },
      async () => {
        const materialisedStats = await replaceDatasetStatsAndReturnRows(
          metaDb,
          releaseId,
          [
            ...structuralStats,
            ...buildCenstatdStructuralChurnStats(structuralStats, previousStats),
          ],
        )
        await replayReleaseStatsMetaToRemote(
          target,
          context,
          releaseId,
          materialisedStats,
          { delivery: delivery('statistics-meta-stats') },
        )
        return { materialisedStats }
      },
    )
    await client.stageCompleted(
      releaseId,
      'processDataset',
      {
        importedRows: rows.length,
        statsRows: materialisedStats.length,
      },
      releaseCode,
    )
    await replayStatisticSnapshotMetaToRemote(
      target,
      context,
      metaDb,
      releaseId,
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
        const result = await retainStatisticProvenance(store, {
          releaseId,
          datasetCode,
          source: canonicalInput,
          canonical,
          fieldMetadata,
          measureMetadata,
          additionalRules: districtsBySourceCode
            ? [
                {
                  declaration: censtatdDistrictIdentityRule.declaration,
                  count: districtsBySourceCode.size,
                },
              ]
            : [],
          geographyFixtures: curationDocumentsFor(
            districtsBySourceCode,
            newTownsBySourceCode,
          ),
        })
        await deliverProcessingResult(target, store, result.ref)
      },
    )
    const published = await runStatisticProgressStep(
      progress,
      { action: 'Publish', subject: 'statistic release' },
      async () => {
        const published = await client.publishDataset(releaseId, releaseCode, {
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
            await refreshRemoteMetaCache(targetName, context.state.dbCacheDir)
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
          releaseId,
        },
        published,
      )
    }
    await completeSqlDeliveryRelease(context.state.dbCacheDir, releaseId)
    return published
  } catch (error) {
    await retainProcessingFailure({
      error,
      target,
      releaseId,
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
    context.cleanup()
  }
}

async function* readRows(filePath: string, releaseId: string, sourceVersion: string) {
  for await (const batch of readParquetObjectsInBatches(
    await asyncBufferFromFile(filePath),
    2048,
  )) {
    for (const row of batch) {
      if (!Object.hasOwn(row, 'properties'))
        throw new Error(
          'C&SD source properties are missing; prepare the release again.',
        )
      const sourceRecordId = requiredString(row.id, 'id')
      const properties = json(row.properties, 'properties')
      const source = json(row.sources, 'sources')
      const payload = {
        datasetCode: requiredString(row.dataset_code, 'dataset_code'),
        featureId: requiredString(row.feature_id, 'feature_id'),
        layerName: requiredString(row.layer_name, 'layer_name'),
        referencePeriodCode: requiredString(
          row.reference_period_code,
          'reference_period_code',
        ),
        referencePeriodEnd: optionalString(row.reference_period_end),
        referencePeriodEndYear: requiredString(
          row.reference_period_end_year,
          'reference_period_end_year',
        ),
        referencePeriodGranularity: requiredString(
          row.reference_period_granularity,
          'reference_period_granularity',
        ),
        referencePeriodStart: optionalString(row.reference_period_start),
        sourceGeometry: json(row.source_geometry, 'source_geometry'),
        sources: source,
        properties,
      }
      const now = new Date().toISOString()
      yield {
        ...payload,
        sourceRecordId,
        releaseId,
        validFromRelease: sourceVersion,
        validToRelease: null,
        isCurrent: true,
        version: 1,
        versionHash: hashStatisticContent(nativeSourcePayloadHashInput(payload)),
        createdAt: now,
        updatedAt: now,
      }
    }
  }
}
function json(value: unknown, field: string) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value
  } catch {
    throw new Error(`Invalid ${field} JSON.`)
  }
}
function required(value: string | undefined, field: string) {
  if (!value) throw new Error(`Missing ${field}.`)
  return value
}
function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${field}.`)
  return value
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function object(value: unknown, field: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected ${field} object.`)
  }
  return value as Record<string, unknown>
}

function divisionIdForSourceProperties(
  datasetCode: string,
  properties: Record<string, unknown>,
  rawSourceFeatureId: string,
  districtsBySourceCode: ReadonlyMap<
    number,
    { districtCode: string; divisionId: string }
  > | null,
  newTownsBySourceCode: ReadonlyMap<string, { divisionId: string }> | null,
) {
  if (
    datasetCode === 'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters'
  ) {
    return hkgovCenstatdStatisticDivisionId(
      datasetCode,
      rawSourceFeatureId.split(':').at(-1) ?? '',
    )
  }
  if (
    datasetCode ===
    'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups'
  ) {
    if (!rawSourceFeatureId.startsWith('HMA_21C:')) return null
    const code = typeof properties.hma === 'string' ? properties.hma : ''
    return hkgovCenstatdStatisticDivisionId(datasetCode, code)
  }
  if (datasetCode === 'ds-hk-hkgov-censtatd-division-statistic-new-towns') {
    if (!rawSourceFeatureId.startsWith('NewTown_21C:')) return null
    const code = typeof properties.newtown === 'string' ? properties.newtown.trim() : ''
    return newTownsBySourceCode?.get(code)?.divisionId ?? null
  }
  if (!districtsBySourceCode) return null
  return (
    districtResolutionForSourceProperties(
      datasetCode,
      properties,
      districtsBySourceCode,
    )?.divisionId ?? null
  )
}

function geographyForSourceProperties(
  datasetCode: string,
  properties: Record<string, unknown>,
  districtsBySourceCode: ReadonlyMap<
    number,
    { districtCode: string; divisionId: string }
  >,
) {
  const district = districtResolutionForSourceProperties(
    datasetCode,
    properties,
    districtsBySourceCode,
  )
  return district ? { code: district.districtCode, kind: 'district' } : undefined
}

function districtResolutionForSourceProperties(
  datasetCode: string,
  properties: Record<string, unknown>,
  districtsBySourceCode: ReadonlyMap<
    number,
    { districtCode: string; divisionId: string }
  >,
) {
  if (!datasetCode.endsWith('-district')) return null
  const rawCode = properties.DC ?? properties.dc
  if (typeof rawCode !== 'string' && typeof rawCode !== 'number') return null
  const districtCode = Number(rawCode)
  if (!Number.isInteger(districtCode)) return null
  return districtsBySourceCode.get(districtCode) ?? null
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
