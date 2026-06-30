import { log, progress } from '@clack/prompts'

import type { UploadTarget } from './options.ts'
import {
  fetchIngestRunReport,
  fetchReleaseReport,
  type IngestRunReportRow,
  type ReleaseReportRow,
} from './reporting.ts'

const RELEASE_WATCH_LIMIT = 100
const INGEST_WATCH_LIMIT = 100
const WATCH_POLL_INTERVAL_MS = 1000
const WATCH_NEXT_RELEASE_POLL_LIMIT = 3

export type UploadWatchResult = {
  hadActivity: boolean
}

type ReleaseWatchSnapshot = {
  releaseCode: string
  releaseId: string
  rowCount: number | null
  processedCount: number
}

type ProgressBar = ReturnType<typeof progress>

type WatchDependencies = {
  createProgressBar(max: number): ProgressBar
  fetchIngestRunReport: typeof fetchIngestRunReport
  fetchReleaseReport: typeof fetchReleaseReport
  reportFailed(message: string): void
  reportSuccess(message: string): void
  sleep(ms: number): Promise<void>
}

function isActiveReleaseStatus(status: string) {
  return status === 'staged' || status === 'processing'
}

function isTerminalReleaseStatus(status: string) {
  return status === 'published' || status === 'superseded' || status === 'revoked'
}

export function findProcessingRelease(rows: ReleaseReportRow[]) {
  const processingRelease = rows.find(row => row.status === 'processing') ?? null

  if (processingRelease) {
    return processingRelease
  }

  const stagedReleases = rows.filter(row => row.status === 'staged')

  return stagedReleases.at(-1) ?? null
}

export function isReleaseStillProcessing(rows: ReleaseReportRow[], releaseId: string) {
  return rows.some(
    row => row.releaseId === releaseId && isActiveReleaseStatus(row.status),
  )
}

export function getReleaseRowCount(release: ReleaseReportRow, label: string): number {
  return release.rowCounts.find(rowCount => rowCount.label === label)?.rowCount ?? 0
}

export function getReleaseProcessedRowCount(release: ReleaseReportRow): number {
  const progressLabels = new Set([
    'source',
    'historyVersions',
    'history2dVersions',
    'history3dVersions',
  ])

  return release.rowCounts
    .filter(rowCount => progressLabels.has(rowCount.label))
    .reduce((max, rowCount) => Math.max(max, rowCount.rowCount), 0)
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

export function getProcessedDatasetRowCount(
  rows: IngestRunReportRow[],
  releaseId: string,
): number | null {
  let maxProcessedRows: number | null = null

  for (const row of rows) {
    if (row.releaseId !== releaseId || !row.stats || typeof row.stats !== 'object') {
      continue
    }

    if (Array.isArray(row.stats)) {
      continue
    }

    const processedRows = (row.stats as Record<string, unknown>).processedRows

    if (typeof processedRows !== 'number' || !Number.isFinite(processedRows)) {
      continue
    }

    maxProcessedRows =
      maxProcessedRows == null
        ? processedRows
        : Math.max(maxProcessedRows, processedRows)
  }

  return maxProcessedRows
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 3,
  }).format(value)
}

function formatWatchMessage(snapshot: ReleaseWatchSnapshot) {
  if (snapshot.rowCount == null || snapshot.rowCount <= 0) {
    return `${snapshot.releaseCode} ${formatNumber(snapshot.processedCount)} rows`
  }

  return `${snapshot.releaseCode} ${formatNumber(snapshot.processedCount)}/${formatNumber(snapshot.rowCount)} rows`
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
  deps: Pick<WatchDependencies, 'fetchIngestRunReport'>,
): Promise<ReleaseWatchSnapshot> {
  const ingestReport = await deps.fetchIngestRunReport(target, {
    limit: INGEST_WATCH_LIMIT,
    releaseId: release.releaseId,
  })
  const releaseSourceCount = getReleaseRowCount(release, 'source')
  const releaseProcessedCount = getReleaseProcessedRowCount(release)
  const processedSourceCount =
    getProcessedDatasetRowCount(ingestReport.rows, release.releaseId) ?? 0

  return {
    releaseCode: release.releaseCode,
    releaseId: release.releaseId,
    rowCount: getStageDatasetRowCount(ingestReport.rows, release.releaseId),
    processedCount: Math.max(
      releaseSourceCount,
      releaseProcessedCount,
      processedSourceCount,
    ),
  }
}

function buildFinishedReleaseSnapshot(release: ReleaseReportRow): ReleaseWatchSnapshot {
  const processedCount = getReleaseProcessedRowCount(release)

  return {
    releaseCode: release.releaseCode,
    releaseId: release.releaseId,
    rowCount: processedCount > 0 ? processedCount : null,
    processedCount,
  }
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

function startProgressBar(progressBar: ProgressBar, snapshot: ReleaseWatchSnapshot) {
  let appliedProgress = 0

  progressBar.start(formatWatchMessage(snapshot))
  appliedProgress = clampProgressValue(snapshot.processedCount, snapshot.rowCount)

  if (appliedProgress > 0) {
    progressBar.advance(appliedProgress, formatWatchMessage(snapshot))
  }

  return appliedProgress
}

function getActiveReleases(rows: ReleaseReportRow[]) {
  return rows.filter(row => isActiveReleaseStatus(row.status))
}

function addTrackedActiveReleaseIds(
  trackedReleaseIds: Set<string>,
  rows: ReleaseReportRow[],
) {
  for (const row of rows) {
    if (isActiveReleaseStatus(row.status)) {
      trackedReleaseIds.add(row.releaseId)
    }
  }
}

function emitTrackedFinishedReleases(
  rows: ReleaseReportRow[],
  trackedReleaseIds: Set<string>,
  completedReleaseIds: Set<string>,
  activeReleaseId: string | null,
  deps: Pick<WatchDependencies, 'reportFailed' | 'reportSuccess'>,
) {
  const finishedTrackedReleases = rows
    .filter(
      row =>
        trackedReleaseIds.has(row.releaseId) &&
        row.releaseId !== activeReleaseId &&
        !completedReleaseIds.has(row.releaseId) &&
        (row.status === 'failed' || isTerminalReleaseStatus(row.status)),
    )
    .reverse()

  for (const release of finishedTrackedReleases) {
    const snapshot = buildFinishedReleaseSnapshot(release)

    if (release.status === 'failed') {
      deps.reportFailed(formatFailedMessage(snapshot))
    } else {
      deps.reportSuccess(formatCompletedMessage(snapshot))
    }

    completedReleaseIds.add(release.releaseId)
  }
}

async function waitForNextProcessingRelease(
  target: UploadTarget,
  trackedReleaseIds: Set<string>,
  completedReleaseIds: Set<string>,
  deps: WatchDependencies,
) {
  for (let attempt = 0; attempt < WATCH_NEXT_RELEASE_POLL_LIMIT; attempt += 1) {
    const nextReleaseReport = await deps.fetchReleaseReport(target, {
      limit: RELEASE_WATCH_LIMIT,
    })
    addTrackedActiveReleaseIds(trackedReleaseIds, nextReleaseReport.rows)
    const activeReleases = getActiveReleases(nextReleaseReport.rows)
    const nextProcessingRelease = findProcessingRelease(activeReleases)

    emitTrackedFinishedReleases(
      nextReleaseReport.rows,
      trackedReleaseIds,
      completedReleaseIds,
      nextProcessingRelease?.releaseId ?? null,
      deps,
    )

    if (
      nextProcessingRelease &&
      !completedReleaseIds.has(nextProcessingRelease.releaseId)
    ) {
      return nextProcessingRelease
    }

    if (attempt < WATCH_NEXT_RELEASE_POLL_LIMIT - 1) {
      await deps.sleep(WATCH_POLL_INTERVAL_MS)
    }
  }

  return null
}

export function createWatchCurrentUpload(
  deps: WatchDependencies = {
    createProgressBar: max => progress({ max }),
    fetchIngestRunReport,
    fetchReleaseReport,
    reportFailed: message => log.error(message),
    reportSuccess: message => log.success(message),
    sleep,
  },
) {
  return async function watchCurrentUpload(
    target: UploadTarget,
  ): Promise<UploadWatchResult> {
    const completedReleaseIds = new Set<string>()
    const trackedReleaseIds = new Set<string>()
    const initialReleaseReport = await deps.fetchReleaseReport(target, {
      limit: RELEASE_WATCH_LIMIT,
    })
    addTrackedActiveReleaseIds(trackedReleaseIds, initialReleaseReport.rows)
    const initialActiveReleases = getActiveReleases(initialReleaseReport.rows)
    const initialRelease = findProcessingRelease(initialActiveReleases)

    if (!initialRelease) {
      return {
        hadActivity: false,
      }
    }

    let activeSnapshot = await buildReleaseWatchSnapshot(target, initialRelease, deps)
    let progressBar = deps.createProgressBar(
      Math.max(activeSnapshot.rowCount ?? activeSnapshot.processedCount, 1),
    )
    let appliedProgress = startProgressBar(progressBar, activeSnapshot)
    trackedReleaseIds.add(activeSnapshot.releaseId)

    while (true) {
      await deps.sleep(WATCH_POLL_INTERVAL_MS)

      const activeReleaseReport = await deps.fetchReleaseReport(target, {
        limit: RELEASE_WATCH_LIMIT,
      })
      addTrackedActiveReleaseIds(trackedReleaseIds, activeReleaseReport.rows)
      const matchingRelease =
        activeReleaseReport.rows.find(
          row => row.releaseId === activeSnapshot.releaseId,
        ) ?? null

      emitTrackedFinishedReleases(
        activeReleaseReport.rows,
        trackedReleaseIds,
        completedReleaseIds,
        activeSnapshot.releaseId,
        deps,
      )

      if (matchingRelease && isActiveReleaseStatus(matchingRelease.status)) {
        activeSnapshot = await buildReleaseWatchSnapshot(target, matchingRelease, deps)
        const nextProgress = clampProgressValue(
          activeSnapshot.processedCount,
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

      completedReleaseIds.add(activeSnapshot.releaseId)

      const nextProcessingRelease = await waitForNextProcessingRelease(
        target,
        trackedReleaseIds,
        completedReleaseIds,
        deps,
      )

      if (!nextProcessingRelease) {
        return {
          hadActivity: true,
        }
      }

      activeSnapshot = await buildReleaseWatchSnapshot(
        target,
        nextProcessingRelease,
        deps,
      )
      progressBar = deps.createProgressBar(
        Math.max(activeSnapshot.rowCount ?? activeSnapshot.processedCount, 1),
      )
      appliedProgress = startProgressBar(progressBar, activeSnapshot)
      trackedReleaseIds.add(activeSnapshot.releaseId)
    }
  }
}

export const watchCurrentUpload = createWatchCurrentUpload()
