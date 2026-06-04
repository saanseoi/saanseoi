import {
  activateDataset,
  getDatasetRecordById,
  insertIngestRun,
  revokeDataset,
  type HarbourReadableDb,
  type HarbourWritableDb,
  updateDatasetStatus,
} from '@repo/core/db/repository'

type StageRequest = {
  datasetId: string
  error?: string
  phase: string
  stats?: Record<string, unknown>
}

type PublishRequest = {
  datasetId: string
}

export async function handleStageStarted(
  db: HarbourReadableDb & HarbourWritableDb,
  request: StageRequest,
) {
  const dataset = await requireDataset(db, request.datasetId)
  const now = new Date().toISOString()

  if (request.phase === 'processDataset') {
    await updateDatasetStatus(db, dataset.datasetId, 'processing')
  }

  await insertIngestRun(
    db,
    dataset.datasetId,
    request.phase,
    'running',
    stringifyOptional(request.stats),
    now,
    null,
  )

  return {
    datasetId: dataset.datasetId,
    phase: request.phase,
    status: 'running',
  }
}

export async function handleStageCompleted(
  db: HarbourReadableDb & HarbourWritableDb,
  request: StageRequest,
) {
  const dataset = await requireDataset(db, request.datasetId)
  const now = new Date().toISOString()

  await insertIngestRun(
    db,
    dataset.datasetId,
    request.phase,
    'completed',
    stringifyOptional(request.stats),
    now,
    now,
  )

  return {
    datasetId: dataset.datasetId,
    phase: request.phase,
    status: 'completed',
  }
}

export async function handleStageFailed(
  db: HarbourReadableDb & HarbourWritableDb,
  request: StageRequest,
) {
  const dataset = await requireDataset(db, request.datasetId)
  const now = new Date().toISOString()

  await updateDatasetStatus(db, dataset.datasetId, 'failed')
  await insertIngestRun(
    db,
    dataset.datasetId,
    request.phase,
    'error',
    stringifyOptional(request.stats),
    now,
    now,
    stringifyOptional({
      message: request.error ?? 'Unknown processing error.',
    }),
  )

  return {
    datasetId: dataset.datasetId,
    phase: request.phase,
    status: 'error',
  }
}

export async function handlePublishDataset(
  db: HarbourReadableDb & HarbourWritableDb,
  request: PublishRequest,
) {
  const dataset = await requireDataset(db, request.datasetId)

  await activateDataset(db, dataset.datasetId)

  if (dataset.supersedesDatasetId) {
    await revokeDataset(
      db,
      dataset.supersedesDatasetId,
      `Superseded by ${dataset.datasetId}.`,
      new Date().toISOString(),
    )
  }

  return {
    datasetId: dataset.datasetId,
    phase: null,
    status: 'active',
  }
}

async function requireDataset(
  db: HarbourReadableDb,
  datasetId: string,
) {
  const dataset = await getDatasetRecordById(db, datasetId)

  if (!dataset) {
    throw new Error(`Dataset not found: ${datasetId}`)
  }

  return dataset
}

function stringifyOptional(value?: Record<string, unknown>) {
  return value ? JSON.stringify(value) : null
}
