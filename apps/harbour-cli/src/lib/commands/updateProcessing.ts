import { confirm, isCancel } from '@clack/prompts'
import { stat } from 'node:fs/promises'
import { relative } from 'node:path'
import { describeTarget } from '../cli/display.ts'
import type { UploadTarget } from '../cli/options.ts'
import { runUploadCommand } from './upload.ts'
import {
  loadPreparedSourceArchive,
  mirrorCsdiSourceArchive,
} from '../sources/sourceArchives.ts'
import type { DatasetUpdate, UpdateProcessingResult } from './updateTypes.ts'
import {
  type UpdateRow,
  clearResolvedPrompt,
  replaceResolvedDecision,
} from './updateDisplay.ts'
import {
  UPDATE_LINE_WIDTH,
  dim,
  formatDatasetPromptLabel,
  formatLandsdIngestPrompt,
  formatUpdateLine,
} from './updateFormatting.ts'

export async function processUpdate(
  update: DatasetUpdate,
  options: {
    printUsage: () => void
    releaseNotesUrl?: string
    row: UpdateRow
    shouldDownload: boolean
    forceDownload: boolean
    forceUpload: boolean
    continueUpload: boolean
    deferStatsReleaseSet: boolean
    includeGeography: boolean
    skipPrompts: boolean
    skipUpload: boolean
    target: UploadTarget
    targetVersion: string | undefined
    updateIndex: number
    updateTotal: number
  },
): Promise<UpdateProcessingResult> {
  if (update.status === 'review') {
    return resolveMetadataReview(options.skipPrompts, () => askToInvestigate(update))
  }
  if (update.status === 'error' || update.status === 'manual') return 'skipped' as const
  if (update.ingest) {
    if (!shouldIngestUpdate(update)) return 'skipped' as const
    if (options.skipUpload) return 'skipped' as const
    options.row.clear()
    const promptForIngest = !options.skipPrompts
    const ingest = promptForIngest
      ? await askToIngest(
          update,
          options.targetVersion,
          options.updateIndex,
          options.updateTotal,
        )
      : true
    if (isCancel(ingest)) throw new Error('Update cancelled.')
    if (!ingest) {
      clearResolvedPrompt()
      return 'skipped' as const
    }
    if (promptForIngest) replaceResolvedDecision()
    await update.ingest(options.target, {
      forceUpload: options.forceUpload,
      onProgress: progress => options.row.ingesting(progress, options.target),
      skipPrompts: options.skipPrompts,
    })
    return 'ingested' as const
  }
  if (!shouldDownloadUpdate(update, options.forceDownload)) return 'skipped' as const

  options.row.clear()

  const archiveMustMirror = Boolean(update.archive)
  const promptForDownload =
    !archiveMustMirror && !options.shouldDownload && !options.skipPrompts
  const download = promptForDownload
    ? archiveMustMirror
      ? true
      : await askToDownload(update, options.targetVersion)
    : true
  if (isCancel(download)) throw new Error('Update cancelled.')
  if (!download) {
    clearResolvedPrompt()
    return 'skipped' as const
  }
  if (promptForDownload) replaceResolvedDecision()

  const path = await downloadWithSpinner(update, {
    forceDownload: options.forceDownload,
    index: options.updateIndex,
    row: options.row,
    total: options.updateTotal,
    targetVersion: options.targetVersion,
  })

  if (update.archive) {
    const prepared = await loadPreparedSourceArchive(path)
    await update.recordIdenticalArchive?.(prepared.manifest.original.sha256)
    await mirrorCsdiSourceArchive(options.target, update.archive, prepared)
    update.mirroredArchive = {
      contentHash: prepared.manifest.archive.sha256,
      mirroredAt: new Date().toISOString(),
      objectKey: prepared.manifest.archive.objectKey,
    }
    if (!update.postArchiveIngest || options.skipUpload) return 'mirrored' as const

    const promptForIngest = !options.skipPrompts
    const ingest = promptForIngest
      ? await askToIngest(
          update,
          options.targetVersion,
          options.updateIndex,
          options.updateTotal,
        )
      : true
    if (isCancel(ingest)) throw new Error('Update cancelled.')
    if (!ingest) {
      clearResolvedPrompt()
      return 'mirrored' as const
    }
    if (promptForIngest) replaceResolvedDecision()
    const result = await update.postArchiveIngest(
      options.target,
      prepared,
      options.skipPrompts,
      {
        deferStatsReleaseSet: options.deferStatsReleaseSet,
        includeGeography: options.includeGeography,
      },
    )
    return result === 'ingested' ? ('ingested' as const) : ('mirrored' as const)
  }

  if (!update.upload || options.skipUpload) return 'downloaded' as const
  const promptForUpload = !options.skipPrompts
  const upload = promptForUpload ? await askToUpload(path, options.target) : true
  if (isCancel(upload)) throw new Error('Update cancelled.')
  if (!upload) {
    clearResolvedPrompt()
    return 'downloaded' as const
  }
  if (promptForUpload) replaceResolvedDecision()

  await runUploadCommand(
    {
      command: 'upload',
      positionals: [path],
      options: {
        ...update.upload.options,
        ...(options.continueUpload ? { continue: true } : {}),
        ...(options.releaseNotesUrl
          ? { 'release-notes-url': options.releaseNotesUrl }
          : {}),
      },
    },
    options.target,
    {
      dryRun: false,
      forceUpload: options.forceUpload,
      // A continued initialiser may need to recover a release which reached
      // `processing` before an owned SQL phase could complete. The upload
      // guard still rejects an active phase before it is reused.
      reuseExistingRelease: options.continueUpload,
      invocationCwd: process.env.SAANSEOI_INVOCATION_CWD ?? process.cwd(),
      printUsage: options.printUsage,
      releaseNotesRetryCommand: `./bin/saanseoi update --target ${options.target.remote ? options.target.environment : 'local'} --dataset ${update.dataset.code} --download --check-now`,
      skipConfirm: true,
      skipSnapshotCleanup: false,
      quiet: true,
      validateGeometry: false,
    },
  )
  return 'uploaded' as const
}

export function shouldIngestUpdate(update: Pick<DatasetUpdate, 'ingest' | 'status'>) {
  return update.status === 'new' && Boolean(update.ingest)
}

export function shouldDownloadUpdate(
  update: Pick<DatasetUpdate, 'download' | 'status'>,
  forceDownload = false,
) {
  return Boolean(update.download) && (forceDownload || update.status !== 'current')
}

async function askToDownload(
  update: DatasetUpdate,
  _targetVersion: string | undefined,
) {
  const answer = await confirm({
    message: formatUpdateLine(
      update.dataset,
      update.version,
      _targetVersion,
      undefined,
      UPDATE_LINE_WIDTH - 3,
    ),
    initialValue: true,
    withGuide: false,
  })
  return answer
}

async function askToIngest(
  update: DatasetUpdate,
  targetVersion: string | undefined,
  index: number,
  total: number,
) {
  return confirm({
    message: formatLandsdIngestPrompt(update, targetVersion, index, total),
    initialValue: true,
    withGuide: false,
  })
}

async function askToInvestigate(update: DatasetUpdate) {
  const answer = await confirm({
    message: `${formatDatasetPromptLabel(update.dataset)} ${dim('·')} metadata changed — have you reviewed and accepted this change?`,
    initialValue: false,
    withGuide: false,
  })
  if (isCancel(answer)) throw new Error('Update cancelled.')
  clearResolvedPrompt()
  return answer
}

export async function resolveMetadataReview(
  skipPrompts: boolean,
  confirmReview: () => Promise<boolean>,
): Promise<'reviewed' | 'review-required'> {
  if (skipPrompts) return 'review-required'
  return (await confirmReview()) ? 'reviewed' : 'review-required'
}

async function downloadWithSpinner(
  update: DatasetUpdate,
  options: {
    forceDownload: boolean
    index: number
    row: UpdateRow
    targetVersion: string | undefined
    total: number
  },
) {
  const cached = options.forceDownload
    ? undefined
    : await findCachedDownload(update.downloadPath)
  if (cached) {
    options.row.cached(
      update,
      options.index,
      options.total,
      options.targetVersion,
      cached.size,
    )
    return update.downloadPath as string
  }

  const startedAt = Date.now()
  options.row.downloading(update, options.index, options.total)

  try {
    const path = await update.download?.()
    if (!path) throw new Error('The update did not provide a download path.')
    const file = await stat(path)
    options.row.downloaded(
      update,
      options.index,
      options.total,
      options.targetVersion,
      Date.now() - startedAt,
      file.size,
    )
    return path
  } catch (error) {
    options.row.error('Download failed')
    throw error
  }
}

async function findCachedDownload(path: string | undefined) {
  if (!path) return undefined

  try {
    const file = await stat(path)
    return file.isFile() && file.size > 0 ? file : undefined
  } catch {
    return undefined
  }
}

async function askToUpload(path: string, target: UploadTarget) {
  return confirm({
    message: `Upload ${relative(process.cwd(), path)} to ${describeTarget(target).label}?`,
    initialValue: true,
    withGuide: true,
  })
}
