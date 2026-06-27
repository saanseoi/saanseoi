import { progress } from '@clack/prompts'

import type { UploadTarget } from './options.ts'
import {
  fetchIngestRunReport,
  fetchReleaseReport,
  type IngestRunReportRow,
  type ReleaseReportRow,
} from './reporting.ts'

const RELEASE_WATCH_LIMIT = 10
const INGEST_WATCH_LIMIT = 100
const WATCH_POLL_INTERVAL_MS = 10000

export type UploadWatchResult = {
  hadActivity: boolean
}

type ReleaseWatchSnapshot = {
  releaseCode: string
  releaseId: string
  rowCount: number | null
  sourceCount: number
}

export function findProcessingRelease(rows: ReleaseReportRow[]) {
  return rows.find(row => row.status === 'processing') ?? null
}

export function getReleaseRowCount(release: ReleaseReportRow, label: string): number {
  return release.rowCounts.find(rowCount => rowCount.label === label)?.rowCount ?? 0
}

export function getStageDatasetRowCount(
  rows: IngestRunReportRow[],
  releaseId: string,
): number | null {
  const stageDatasetRow = rows.find(
    row => row.releaseId === releaseId && row.phase === 'stageDataset',
  )

  if (!stageDatasetRow?.stats || typeof stageDatasetRow.stats !== 'object') {
    return null
  }

  if (Array.isArray(stageDatasetRow.stats)) {
    return null
  }

  const rowCount = (stageDatasetRow.stats as Record<string, unknown>).rowCount

  return typeof rowCount === 'number' && Number.isFinite(rowCount) ? rowCount : null
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 3,
  }).format(value)
}

function formatWatchMessage(snapshot: ReleaseWatchSnapshot) {
  if (snapshot.rowCount == null || snapshot.rowCount <= 0) {
    return `${snapshot.releaseCode} ${formatNumber(snapshot.sourceCount)} source rows`
  }

  return `${snapshot.releaseCode} ${formatNumber(snapshot.sourceCount)}/${formatNumber(snapshot.rowCount)} source rows`
}

function formatCompletedMessage(snapshot: ReleaseWatchSnapshot) {
  if (snapshot.rowCount == null || snapshot.rowCount <= 0) {
    return `✓ ${snapshot.releaseCode}`
  }

  return `✓ ${snapshot.releaseCode} (${formatNumber(snapshot.rowCount)})`
}

function formatFailedMessage(snapshot: ReleaseWatchSnapshot) {
  return `✗ ${snapshot.releaseCode}`
}

function clampProgressValue(current: number, max: number | null) {
  if (max == null || max <= 0) {
    return current
  }

  return Math.min(current, max)
}

async function buildReleaseWatchSnapshot(
  target: UploadTarget,
  release: ReleaseReportRow,
): Promise<ReleaseWatchSnapshot> {
  const ingestReport = await fetchIngestRunReport(target, {
    limit: INGEST_WATCH_LIMIT,
    releaseId: release.releaseId,
  })

  return {
    releaseCode: release.releaseCode,
    releaseId: release.releaseId,
    rowCount: getStageDatasetRowCount(ingestReport.rows, release.releaseId),
    sourceCount: getReleaseRowCount(release, 'source'),
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function watchCurrentUpload(
  target: UploadTarget,
): Promise<UploadWatchResult> {
  const initialReleaseReport = await fetchReleaseReport(target, {
    limit: RELEASE_WATCH_LIMIT,
  })
  const initialRelease = findProcessingRelease(initialReleaseReport.rows)

  if (!initialRelease) {
    return {
      hadActivity: false,
    }
  }

  let activeSnapshot = await buildReleaseWatchSnapshot(target, initialRelease)
  let progressBar = progress({
    max: Math.max(activeSnapshot.rowCount ?? activeSnapshot.sourceCount, 1),
  })
  let appliedProgress = 0

  progressBar.start(formatWatchMessage(activeSnapshot))
  appliedProgress = clampProgressValue(
    activeSnapshot.sourceCount,
    activeSnapshot.rowCount,
  )

  if (appliedProgress > 0) {
    progressBar.advance(appliedProgress, formatWatchMessage(activeSnapshot))
  }

  while (true) {
    await sleep(WATCH_POLL_INTERVAL_MS)

    const releaseReport = await fetchReleaseReport(target, {
      limit: RELEASE_WATCH_LIMIT,
    })
    const matchingRelease = releaseReport.rows.find(
      row => row.releaseId === activeSnapshot.releaseId,
    )
    const processingRelease = findProcessingRelease(releaseReport.rows)

    if (processingRelease?.releaseId === activeSnapshot.releaseId) {
      activeSnapshot = await buildReleaseWatchSnapshot(target, processingRelease)
      const nextProgress = clampProgressValue(
        activeSnapshot.sourceCount,
        activeSnapshot.rowCount,
      )

      if (nextProgress > appliedProgress) {
        progressBar.advance(
          nextProgress - appliedProgress,
          formatWatchMessage(activeSnapshot),
        )
      } else {
        progressBar.message(formatWatchMessage(activeSnapshot))
      }

      appliedProgress = nextProgress
      continue
    }

    if (matchingRelease?.status === 'failed') {
      progressBar.error(formatFailedMessage(activeSnapshot))
    } else {
      progressBar.stop(formatCompletedMessage(activeSnapshot))
    }

    await sleep(WATCH_POLL_INTERVAL_MS)

    const nextReleaseReport = await fetchReleaseReport(target, {
      limit: RELEASE_WATCH_LIMIT,
    })
    const nextProcessingRelease = findProcessingRelease(nextReleaseReport.rows)

    if (!nextProcessingRelease) {
      return {
        hadActivity: true,
      }
    }

    activeSnapshot = await buildReleaseWatchSnapshot(target, nextProcessingRelease)
    progressBar = progress({
      max: Math.max(activeSnapshot.rowCount ?? activeSnapshot.sourceCount, 1),
    })
    appliedProgress = 0
    progressBar.start(formatWatchMessage(activeSnapshot))
    appliedProgress = clampProgressValue(
      activeSnapshot.sourceCount,
      activeSnapshot.rowCount,
    )

    if (appliedProgress > 0) {
      progressBar.advance(appliedProgress, formatWatchMessage(activeSnapshot))
    }
  }
}
