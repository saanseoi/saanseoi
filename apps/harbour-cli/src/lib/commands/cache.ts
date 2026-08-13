import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import {
  readRemoteCachedCompletedReleaseCodes,
  rebuildRemoteDbCache,
  updateDbCacheProgress,
  type CacheTableProfile,
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
  const cacheTableProfile = args.options['table-profile']
  const cohortKey = args.options['cohort-key']
  if (
    args.positionals.length > 0 ||
    Object.keys(args.options).some(
      key => key !== 'target' && key !== 'table-profile' && key !== 'cohort-key',
    ) ||
    (cacheTableProfile !== undefined &&
      cacheTableProfile !== 'divisionGeometry' &&
      cacheTableProfile !== 'planningDivisionGeometry') ||
    (cohortKey !== undefined &&
      (typeof cohortKey !== 'string' || !/^\d{4}$/.test(cohortKey))) ||
    (cohortKey !== undefined && cacheTableProfile !== 'planningDivisionGeometry') ||
    !target.remote
  ) {
    printUsage()
    throw new Error(
      '`cache:rebuild` accepts `--target preview|production`, optional `--table-profile divisionGeometry|planningDivisionGeometry`, and `--cohort-key YYYY` with the Planning profile.',
    )
  }

  const progress = new LocalUploadProgress()
  const startedAt = Date.now()

  try {
    await rebuildRemoteDbCache(
      target,
      event => updateDbCacheProgress(progress, event),
      cacheTableProfile as CacheTableProfile | undefined,
      cohortKey as string | undefined,
    )
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

export async function runCacheCompletedReleasesCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  const cacheTableProfile = args.options['table-profile']
  if (
    args.positionals.length > 0 ||
    Object.keys(args.options).some(
      key => key !== 'target' && key !== 'table-profile',
    ) ||
    (cacheTableProfile !== undefined &&
      cacheTableProfile !== 'planningDivisionGeometry') ||
    !target.remote
  ) {
    printUsage()
    throw new Error(
      '`cache:completed-releases` accepts `--target preview|production` and optional `--table-profile planningDivisionGeometry`.',
    )
  }

  const releaseCodes = await readRemoteCachedCompletedReleaseCodes(target, {
    allowPartialCache: cacheTableProfile === 'planningDivisionGeometry',
  })
  if (releaseCodes.length > 0) {
    process.stdout.write(`${releaseCodes.join('\n')}\n`)
  }
}
