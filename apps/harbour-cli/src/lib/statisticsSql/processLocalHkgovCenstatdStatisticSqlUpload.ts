import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { updateDatasetStatus } from '@repo/core/db/metaRegistry'
import { replaceDatasetStatsAndReturnRows } from '@repo/core/pipeline/db/stats'
import { replaceReleaseProcessingActionsAndReturnRows } from '@repo/core/pipeline/db/processingActions'
import { stableJsonStringify } from '@repo/core/pipeline/utils'
import {
  buildCenstatdGeographyLinkAuditActions,
  buildCenstatdMeasureCurationAuditActions,
  buildCenstatdNormalisationAuditActions,
  buildCenstatdReleaseStats,
  buildCenstatdStructuralChurnStats,
  censtatdReleaseStatsProfileFor,
} from '@repo/core/pipeline/services/censtatdReleaseStats'
import { createHash } from 'node:crypto'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'
import { readParquetObjectsInBatches } from '@repo/core/pipeline/parquetR2'

import {
  refreshRemoteMetaCache,
  resolveLocalAddressDbContext,
  updateDbCacheProgress,
} from '../dbCache/localDbCache.ts'
import type { UploadTarget } from '../cli/options.ts'
import { createHarbourControlClient } from '../api/harbourControl.ts'
import { createLocalControlClient } from '../localPipeline/localControlClient.ts'
import type { PreparedUploadFile } from '../upload/parquetRepack.ts'
import { LocalUploadProgress } from '../upload/localUploadProgress.ts'
import {
  buildStatisticSqlBatches,
  replayStatisticSqlBatches,
} from './statisticSqlReplay.ts'
import {
  buildCanonicalStatsSqlBatches,
  replayCanonicalStatsSqlBatches,
} from './canonicalStatsSql.ts'
import {
  resolveCenstatdDistrictBridgeCohort,
  resolveHkgovCenstatdDistrictBridge,
} from './censtatdDistrictBridge.ts'
import { normaliseHkgovCenstatdStatistics } from './normaliseHkgovCenstatdStatistics.ts'
import { resolveCenstatdMeasureMetadata } from './censtatdMeasureCuration.ts'
import { hkgovCenstatdStatisticDivisionId } from '../sources/hkgov/hkgovCenstatdStatistics.ts'
import { findPreviousComparableCenstatdReleaseStats } from './censtatdReleaseChurn.ts'
import {
  replayReleaseProcessingActionsMetaToRemote,
  replayReleaseStatsMetaToRemote,
} from './releaseStatsMetaReplay.ts'
import {
  completeStatisticCache,
  runStatisticProgressStep,
} from './statisticProgress.ts'

export async function processLocalHkgovCenstatdStatisticSqlUpload(
  target: UploadTarget,
  plan: {
    cohortKey: string
    releaseCode: string
    rowCount: number
    sourceVersion: string
  },
  upload: { releaseCode?: string; releaseId?: string },
  prepared: PreparedUploadFile,
  options: { promptForCuration: boolean },
) {
  const releaseId = required(upload.releaseId, 'releaseId')
  const releaseCode = required(upload.releaseCode, 'releaseCode')
  const progress = new LocalUploadProgress()
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
  const client = target.remote
    ? createHarbourControlClient(target)
    : createLocalControlClient(metaDb, {
        publishClient: {
          async publishDataset(id) {
            await updateDatasetStatus(metaDb, id, 'published')
          },
          async stageCompleted() {},
          async stageFailed() {},
          async stageRunning() {},
        },
      })
  let processingStarted = false
  try {
    const rows = await runStatisticProgressStep(
      progress,
      { action: 'Prepare', count: plan.rowCount, subject: 'statistic rows' },
      () => readRows(prepared.filePath, releaseId, releaseCode),
    )
    if (rows.length !== plan.rowCount)
      throw new Error(
        `Expected ${plan.rowCount} C&SD statistic rows; found ${rows.length}.`,
      )
    const datasetCode = requiredString(rows[0]?.datasetCode, 'datasetCode')
    const sourceFeatures = rows.map(row => ({
      featureId: requiredString(row.featureId, 'featureId'),
      layerName: requiredString(row.layerName, 'layerName'),
    }))
    const bridgeCohort = resolveCenstatdDistrictBridgeCohort(
      datasetCode,
      plan.sourceVersion,
    )
    const districtsBySourceCode = bridgeCohort
      ? await resolveHkgovCenstatdDistrictBridge(metaDb, bridgeCohort)
      : null
    const canonicalInput = rows.map(row => {
      const properties = object(row.rawProperties, 'rawProperties')
      const sourceFeatureId = `${requiredString(row.layerName, 'layerName')}:${requiredString(row.featureId, 'featureId')}`
      const divisionId = divisionIdForSourceProperties(
        datasetCode,
        properties,
        sourceFeatureId,
        districtsBySourceCode,
      )
      if (bridgeCohort && !divisionId) {
        throw new Error(
          `C&SD ${datasetCode} feature ${sourceFeatureId} does not resolve through the reviewed ${bridgeCohort} district bridge.`,
        )
      }
      return {
        datasetCode: requiredString(row.datasetCode, 'datasetCode'),
        divisionId,
        properties,
        sourceFeatureId,
        sourceReleaseId: releaseId,
        sourceVersion: plan.sourceVersion,
      }
    })
    let canonical = await runStatisticProgressStep(
      progress,
      { action: 'Normalise', count: rows.length, subject: 'records' },
      () => normaliseHkgovCenstatdStatistics(canonicalInput),
    )
    const measureMetadata = await runStatisticProgressStep(
      progress,
      { action: 'Review', count: canonical.measures.length, subject: 'measures' },
      () =>
        resolveCenstatdMeasureMetadata({
          measures: canonical.measures,
          promptForCuration: options.promptForCuration,
        }),
    )
    canonical = await runStatisticProgressStep(
      progress,
      { action: 'Curate', count: canonical.measures.length, subject: 'measures' },
      () => normaliseHkgovCenstatdStatistics(canonicalInput, { measureMetadata }),
    )
    const batches = await runStatisticProgressStep(
      progress,
      { action: 'Generate SQL', count: rows.length, subject: 'source' },
      () =>
        buildStatisticSqlBatches({
          releaseCode,
          releaseId,
          source: { rows, table: 'hkgovCenstatdStatistics' },
        }),
    )
    const canonicalHistoryBatches = await runStatisticProgressStep(
      progress,
      {
        action: 'Generate SQL',
        count: canonical.records.length,
        subject: 'history',
      },
      () =>
        buildCanonicalStatsSqlBatches({
          current: [],
          history: canonicalHistoryRows(canonical, releaseId),
        }),
    )
    const canonicalCurrentBatches = await runStatisticProgressStep(
      progress,
      {
        action: 'Generate SQL',
        count: canonical.records.length,
        subject: 'current',
      },
      () =>
        buildCanonicalStatsSqlBatches({
          current: canonicalCurrentRows(canonical),
          history: [],
        }),
    )
    const canonicalBatches = {
      current: canonicalCurrentBatches.current,
      history: canonicalHistoryBatches.history,
    }
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
        count:
          (batches.source.length + batches.history.length) * (target.remote ? 2 : 1),
        subject: 'batches',
      },
      () =>
        replayStatisticSqlBatches(
          target,
          context,
          plan.sourceVersion.slice(0, 4),
          batches,
        ),
    )
    await runStatisticProgressStep(
      progress,
      {
        action: 'Import canonical SQL',
        count:
          (canonicalBatches.current.length + canonicalBatches.history.length) *
          (target.remote ? 2 : 1),
        subject: 'batches',
      },
      () =>
        replayCanonicalStatsSqlBatches(
          target,
          context,
          plan.sourceVersion.slice(0, 4),
          canonicalBatches,
          {
            onProgress(event) {
              progress.update(event.completedBatches, {
                label: `Import canonical SQL: ${event.phase} (${event.completedBatches}/${event.totalBatches})`,
              })
            },
          },
        ),
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
    const { materialisedProcessingActions, materialisedStats } =
      await runStatisticProgressStep(
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
          const materialisedProcessingActions =
            await replaceReleaseProcessingActionsAndReturnRows(metaDb, releaseId, [
              ...buildCenstatdGeographyLinkAuditActions(
                statsProfile,
                sourceFeatures.length,
              ),
              ...buildCenstatdMeasureCurationAuditActions(canonical),
              ...buildCenstatdNormalisationAuditActions(canonical),
            ])
          await replayReleaseStatsMetaToRemote(
            target,
            context,
            releaseId,
            materialisedStats,
          )
          await replayReleaseProcessingActionsMetaToRemote(
            target,
            context,
            releaseId,
            materialisedProcessingActions,
          )
          return { materialisedProcessingActions, materialisedStats }
        },
      )
    await client.stageCompleted(
      releaseId,
      'processDataset',
      {
        auditActions: materialisedProcessingActions.actions.length,
        importedRows: rows.length,
        statsRows: materialisedStats.length,
      },
      releaseCode,
    )
    const published = await runStatisticProgressStep(
      progress,
      { action: 'Publish', subject: 'statistic release' },
      async () => {
        const published = await client.publishDataset(releaseId, releaseCode)
        if (target.remote) {
          await refreshRemoteMetaCache(
            target.environment === 'production' ? 'production' : 'preview',
            context.state.dbCacheDir,
          )
        }
        return published
      },
    )
    return published
  } catch (error) {
    progress.fail()
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

async function readRows(filePath: string, releaseId: string, releaseCode: string) {
  const rows: Array<Record<string, unknown>> = []
  for await (const batch of readParquetObjectsInBatches(
    await asyncBufferFromFile(filePath),
    2048,
  ))
    rows.push(...batch)
  return Promise.all(
    rows.map(async row => {
      const sourceRecordId = requiredString(row.id, 'id')
      const properties = json(row.raw_properties, 'raw_properties')
      const source = json(row.sources, 'sources')
      const payload = {
        datasetCode: requiredString(row.dataset_code, 'dataset_code'),
        featureId: requiredString(row.feature_id, 'feature_id'),
        layerName: requiredString(row.layer_name, 'layer_name'),
        referenceYear: requiredString(row.reference_year, 'reference_year'),
        sourceGeometry: json(row.source_geometry, 'source_geometry'),
        sources: source,
        rawProperties: properties,
      }
      const now = new Date().toISOString()
      return {
        ...payload,
        sourceRecordId,
        releaseId,
        validFromRelease: releaseCode,
        validToRelease: null,
        isCurrent: true,
        version: 1,
        versionHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
        createdAt: now,
        updatedAt: now,
      }
    }),
  )
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

function object(value: unknown, field: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected ${field} object.`)
  }
  return value as Record<string, unknown>
}

function divisionIdForSourceProperties(
  datasetCode: string,
  properties: Record<string, unknown>,
  sourceFeatureId: string,
  districtsBySourceCode: ReadonlyMap<number, { divisionId: string }> | null,
) {
  if (
    datasetCode ===
    'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-area-type'
  ) {
    return hkgovCenstatdStatisticDivisionId(
      datasetCode,
      sourceFeatureId.split(':').at(-1) ?? '',
    )
  }
  if (
    datasetCode ===
    'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups'
  ) {
    if (!sourceFeatureId.startsWith('HMA_21C:')) return null
    const code = typeof properties.hma === 'string' ? properties.hma : ''
    return hkgovCenstatdStatisticDivisionId(datasetCode, code)
  }
  if (!districtsBySourceCode) return null
  const rawCode = properties.DC ?? properties.dc
  if (typeof rawCode !== 'string' && typeof rawCode !== 'number') return null
  const districtCode = Number(rawCode)
  if (!Number.isInteger(districtCode)) return null
  return districtsBySourceCode.get(districtCode)?.divisionId ?? null
}

function canonicalCurrentRows(
  canonical: ReturnType<typeof normaliseHkgovCenstatdStatistics>,
) {
  const now = new Date().toISOString()
  return [
    {
      rows: canonical.records.map(row => ({
        ...row,
        createdAt: now,
        updatedAt: now,
      })),
      table: 'statsRecords' as const,
    },
    {
      rows: canonical.measures.map(row => ({ ...row, createdAt: now, updatedAt: now })),
      table: 'statsMeasures' as const,
    },
    {
      rows: canonical.measuresI18n.map(row => ({
        ...row,
        createdAt: now,
        updatedAt: now,
      })),
      table: 'statsMeasuresI18n' as const,
    },
    {
      rows: canonical.dimensions.map(row => ({
        ...row,
        createdAt: now,
        updatedAt: now,
      })),
      table: 'statsDimensions' as const,
    },
    {
      rows: canonical.values.map(row => ({ ...row, createdAt: now, updatedAt: now })),
      table: 'statsValues' as const,
    },
    {
      rows: canonical.valuesI18n.map(row => ({
        ...row,
        createdAt: now,
        updatedAt: now,
      })),
      table: 'statsValuesI18n' as const,
    },
  ]
}

function canonicalHistoryRows(
  canonical: ReturnType<typeof normaliseHkgovCenstatdStatistics>,
  sourceReleaseId: string,
) {
  const now = new Date().toISOString()
  const version = (row: Record<string, unknown>) => ({
    ...row,
    createdAt: now,
    isCurrent: true,
    sourceReleaseId,
    updatedAt: now,
    versionHash: createHash('sha256')
      .update(stableJsonStringify(row) ?? JSON.stringify(row))
      .digest('hex'),
  })
  return [
    { rows: canonical.records.map(version), table: 'statsRecords' as const },
    { rows: canonical.measures.map(version), table: 'statsMeasures' as const },
    { rows: canonical.measuresI18n.map(version), table: 'statsMeasuresI18n' as const },
    { rows: canonical.dimensions.map(version), table: 'statsDimensions' as const },
    { rows: canonical.values.map(version), table: 'statsValues' as const },
    { rows: canonical.valuesI18n.map(version), table: 'statsValuesI18n' as const },
  ]
}
