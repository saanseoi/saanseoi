import {
  getDatasetRecordById,
  insertIngestRun,
  markDatasetCurrent,
  markDatasetHistoric,
  revokeDataset,
  type HarbourReadableDb,
  type HarbourWritableDb,
  updateLatestOpenIngestRun,
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

  const updated = await updateLatestOpenIngestRun(
    db,
    dataset.datasetId,
    request.phase,
    'completed',
    now,
    stringifyOptional(request.stats),
  )

  if (!updated) {
    await insertIngestRun(
      db,
      dataset.datasetId,
      request.phase,
      'completed',
      stringifyOptional(request.stats),
      now,
      now,
    )
  }

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
  const errorJson = stringifyOptional({
    message: request.error ?? 'Unknown processing error.',
  })

  await updateDatasetStatus(db, dataset.datasetId, 'failed')
  const updated = await updateLatestOpenIngestRun(
    db,
    dataset.datasetId,
    request.phase,
    'error',
    now,
    stringifyOptional(request.stats),
    errorJson,
  )

  if (!updated) {
    await insertIngestRun(
      db,
      dataset.datasetId,
      request.phase,
      'error',
      stringifyOptional(request.stats),
      now,
      now,
      errorJson,
    )
  }

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
  const publishedAt = new Date().toISOString()

  await markDatasetCurrent(db, dataset.datasetId)

  if (dataset.supersedesDatasetId) {
    if (isCorrectedRelease(dataset.supersedesDatasetId, dataset.datasetId)) {
      await revokeDataset(
        db,
        dataset.supersedesDatasetId,
        `Superseded by corrected release ${dataset.datasetId}.`,
        publishedAt,
      )
    } else {
      await markDatasetHistoric(db, dataset.supersedesDatasetId, publishedAt)
    }
  }

  return {
    datasetId: dataset.datasetId,
    phase: null,
    status: 'current',
  }
}

async function requireDataset(db: HarbourReadableDb, datasetId: string) {
  const dataset = await getDatasetRecordById(db, datasetId)

  if (!dataset) {
    throw new Error(`Dataset not found: ${datasetId}`)
  }

  return dataset
}

function stringifyOptional(value?: Record<string, unknown>) {
  return value ? JSON.stringify(value) : null
}

function isCorrectedRelease(previousDatasetId: string, nextDatasetId: string) {
  const previousSourceVersion = getSourceVersionFromDatasetId(previousDatasetId)
  const nextSourceVersion = getSourceVersionFromDatasetId(nextDatasetId)

  if (!previousSourceVersion || !nextSourceVersion) {
    return false
  }

  return previousSourceVersion.split('.')[0] === nextSourceVersion.split('.')[0]
}

function getSourceVersionFromDatasetId(datasetId: string) {
  const match = datasetId.match(/^[^-]+-[^-]+-(.+)-[^-]+$/)
  return match?.[1] ?? null
}
