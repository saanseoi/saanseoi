import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  formatCompletedPhaseLabel,
  formatDurationMs,
} from '../localPipeline/progressFormatting.ts'
import { runLocalProgressPhase } from '../localPipeline/orchestrator.ts'
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
  return runLocalProgressPhase(
    progress,
    {
      action: input.action,
      completedCount: input.count,
      subject: input.subject,
      totalUnits: Math.max(1, input.count ?? 1),
    },
    operation,
  )
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
