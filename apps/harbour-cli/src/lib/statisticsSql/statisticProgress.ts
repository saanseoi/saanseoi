import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  formatCompletedPhaseLabel,
  formatDurationMs,
  formatRunningPhaseLabel,
} from '../localPipeline/progressFormatting.ts'
import type { LocalUploadProgress } from '../upload/localUploadProgress.ts'

/**
 * Gives the direct statistic SQL pipeline the same discrete, timed terminal
 * stages as the streamed address and division pipelines.
 */
export async function runStatisticProgressStep<T>(
  progress: LocalUploadProgress,
  input: {
    action: string
    count?: number
    subject: string
  },
  operation: () => Promise<T> | T,
) {
  const total = Math.max(1, input.count ?? 1)
  const startedAt = Date.now()
  const runningLabel = formatRunningPhaseLabel(
    colorTeal(input.action),
    colorRed(input.subject),
    0,
    total,
  )

  progress.beginPhase(runningLabel, { current: 0, max: total })
  const result = await operation()
  progress.update(total, {
    label: formatRunningPhaseLabel(
      colorTeal(input.action),
      colorRed(input.subject),
      total,
      total,
    ),
  })
  progress.complete(
    appendPhaseDetails(
      formatCompletedPhaseLabel(
        colorTeal(input.action),
        colorRed(input.subject),
        input.count,
      ),
      [formatDurationMs(Date.now() - startedAt)],
    ),
  )
  return result
}

export function completeStatisticCache(
  progress: LocalUploadProgress,
  input: { durationMs: number; remote: boolean },
) {
  if (!progress.hasActivePhase()) return

  progress.complete(
    appendPhaseDetails(
      formatCompletedPhaseLabel(
        colorTeal(input.remote ? 'Clone cache' : 'Prepare'),
        colorRed(input.remote ? 'remote' : 'local'),
      ),
      [formatDurationMs(input.durationMs)],
    ),
  )
}
