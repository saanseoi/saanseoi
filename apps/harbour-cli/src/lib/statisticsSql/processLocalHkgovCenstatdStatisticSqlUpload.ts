import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { updateDatasetStatus } from '@repo/core/db/metaRegistry'
import { createHash } from '@repo/core/pipeline/utils'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'
import { readParquetObjectsInBatches } from '@repo/core/pipeline/parquetR2'

import {
  resolveLocalAddressDbContext,
  updateDbCacheProgress,
} from '../addressSql/localDbCache.ts'
import type { UploadTarget } from '../cli/options.ts'
import { createHarbourControlClient } from '../api/harbourControl.ts'
import { createLocalControlClient } from '../localPipeline/localControlClient.ts'
import type { PreparedUploadFile } from '../upload/parquetRepack.ts'
import { LocalUploadProgress } from '../upload/localUploadProgress.ts'
import {
  buildStatisticSqlBatches,
  replayStatisticSqlBatches,
  type StatisticSqlReplayProgress,
} from './statisticSqlReplay.ts'

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
        cacheTableProfile: 'nativeSource',
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
    progress.complete(
      `Prepared statistic cache in ${formatDuration(Date.now() - cacheStartedAt)}`,
    )
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
  try {
    const processingStepCount = target.remote ? 6 : 4
    progress.beginPhase('Start statistic processing', { max: processingStepCount })
    await client.stageRunning(
      releaseId,
      'processDataset',
      { resourceType: 'divisionStatistic', sourceRows: plan.rowCount },
      releaseCode,
    )
    progress.update(1, { label: 'Read publisher statistic rows' })
    const rows = await readRows(prepared.filePath, releaseId, releaseCode)
    if (rows.length !== plan.rowCount)
      throw new Error(
        `Expected ${plan.rowCount} C&SD statistic rows; found ${rows.length}.`,
      )
    progress.update(2, { label: 'Build idempotent statistic replay SQL' })
    const batches = buildStatisticSqlBatches({
      releaseCode,
      releaseId,
      source: { rows, table: 'hkgovCenstatdStatistics' },
    })
    await replayStatisticSqlBatches(
      target,
      context,
      plan.sourceVersion.slice(0, 4),
      batches,
      {
        onProgress(event) {
          updateStatisticReplayProgress(progress, event, target.remote)
        },
      },
    )
    progress.update(processingStepCount - 1, { label: 'Complete statistic replay' })
    await client.stageCompleted(
      releaseId,
      'processDataset',
      { importedRows: rows.length },
      releaseCode,
    )
    progress.update(processingStepCount, { label: 'Publish statistic release' })
    const published = await client.publishDataset(releaseId, releaseCode)
    progress.complete('Published statistic release')
    return published
  } catch (error) {
    progress.fail()
    await client
      .stageFailed(
        releaseId,
        'processDataset',
        error instanceof Error ? error.message : String(error),
        undefined,
        releaseCode,
      )
      .catch(() => undefined)
    throw error
  } finally {
    context.cleanup()
  }
}

function formatDuration(durationMs: number) {
  return `${Math.max(0, Math.round(durationMs / 1_000))} s`
}

function updateStatisticReplayProgress(
  progress: LocalUploadProgress,
  event: StatisticSqlReplayProgress,
  isRemote: boolean,
) {
  const phaseStep =
    event.phase === 'local-replay' ? 3 : event.phase === 'remote-source-replay' ? 4 : 5
  if (!isRemote && event.phase !== 'local-replay') return
  const labels = {
    'local-replay': 'Replay source in local cache',
    'remote-history-replay': 'Replay history into remote D1',
    'remote-source-replay': 'Replay source into remote D1',
  } as const
  progress.update(phaseStep, {
    label: `${labels[event.phase]} (${event.completedBatches}/${event.totalBatches})`,
  })
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
        versionHash: await createHash(JSON.stringify(payload)),
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
