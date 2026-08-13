import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import {
  rebuildRemoteDbCache,
  updateDbCacheProgress,
} from '../addressSql/localDbCache.ts'
import { LocalUploadProgress } from '../upload/localUploadProgress.ts'
import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  formatCompletedPhaseLabel,
  formatDurationMs,
} from '../localPipeline/progressFormatting.ts'

export async function runCacheRebuildCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  if (
    args.positionals.length > 0 ||
    Object.keys(args.options).some(key => key !== 'target') ||
    !target.remote
  ) {
    printUsage()
    throw new Error('`cache:rebuild` accepts only `--target preview|production`.')
  }

  const progress = new LocalUploadProgress()
  const startedAt = Date.now()

  try {
    await rebuildRemoteDbCache(target, event => updateDbCacheProgress(progress, event))
  } catch (error) {
    progress.fail()
    throw error
  }

  if (progress.hasActivePhase()) {
    progress.complete(
      appendPhaseDetails(
        formatCompletedPhaseLabel(
          colorTeal('Clone cache'),
          colorRed(target.environment),
        ),
        [formatDurationMs(Date.now() - startedAt)],
      ),
    )
  }
}
