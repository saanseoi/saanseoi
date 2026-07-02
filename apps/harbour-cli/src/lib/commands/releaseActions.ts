import { cancel, confirm, isCancel, log, note, outro } from '@clack/prompts'

import { describeTarget, formatField } from '../display.ts'
import { getStringOption, type ParsedArgs, type UploadTarget } from '../options.ts'
import { finalizeExistingUpload, requeueExistingUpload } from '../upload.ts'

export async function runFinalizeCommand(
  args: ParsedArgs,
  target: UploadTarget,
  options: {
    printUsage: () => void
    skipConfirm: boolean
    skipSnapshotCleanup: boolean
  },
) {
  const releaseSpecifier = getStringOption(args, ['release'])

  if (!releaseSpecifier) {
    options.printUsage()
    throw new Error(
      'Missing release identifier. Pass `--release <release-id|release-code>`.',
    )
  }

  if (!options.skipConfirm) {
    const shouldContinue = await confirm({
      message: `Finalize ${releaseSpecifier} for ${describeTarget(target).label}?`,
      initialValue: true,
    })

    if (isCancel(shouldContinue) || !shouldContinue) {
      cancel('FINALIZE CANCELLED')
      process.exit(1)
    }
  }

  const finalized = await finalizeExistingUpload(target, releaseSpecifier, {
    skipSnapshotCleanup: options.skipSnapshotCleanup,
  })

  note(
    [
      formatField('datasetCode', finalized.release.datasetCode),
      formatField('releaseCode', finalized.release.releaseCode),
      formatField('releaseId', finalized.release.releaseId),
      formatField('rawObjectKey', finalized.release.rawObjectKey ?? '-'),
      formatField(
        'status',
        typeof finalized.result?.status === 'string'
          ? finalized.result.status
          : 'staged',
      ),
    ].join('\n'),
    'FINALIZE RESULT',
  )
  log.success('Upload finalization requested and processing re-queued in Harbour.')
  outro('Harbour upload finalize complete')
}

export async function runRequeueCommand(
  args: ParsedArgs,
  target: UploadTarget,
  options: {
    printUsage: () => void
    skipConfirm: boolean
    skipSnapshotCleanup: boolean
  },
) {
  const releaseSpecifier = getStringOption(args, ['release'])

  if (!releaseSpecifier) {
    options.printUsage()
    throw new Error(
      'Missing release identifier. Pass `--release <release-id|release-code>`.',
    )
  }

  if (!options.skipConfirm) {
    const shouldContinue = await confirm({
      message: `Requeue ${releaseSpecifier} for ${describeTarget(target).label}?`,
      initialValue: true,
    })

    if (isCancel(shouldContinue) || !shouldContinue) {
      cancel('REQUEUE CANCELLED')
      process.exit(1)
    }
  }

  const requeued = await requeueExistingUpload(target, releaseSpecifier, {
    force: Boolean(args.options.force),
    skipSnapshotCleanup: options.skipSnapshotCleanup,
  })

  note(
    [
      formatField('datasetCode', requeued.release.datasetCode),
      formatField('releaseCode', requeued.release.releaseCode),
      formatField('releaseId', requeued.release.releaseId),
      formatField('rawObjectKey', requeued.release.rawObjectKey ?? '-'),
      formatField(
        'status',
        typeof requeued.result?.status === 'string'
          ? requeued.result.status
          : requeued.release.status,
      ),
    ].join('\n'),
    'REQUEUE RESULT',
  )
  log.success('Release processing re-queued in Harbour.')
  outro('Harbour upload requeue complete')
}
