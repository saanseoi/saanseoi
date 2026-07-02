import { isReleaseId } from '@repo/core'
import { cancel, confirm, isCancel, note, outro } from '@clack/prompts'

import {
  resolveDelaySeconds,
  resolveSnapshotCleanupResourceType,
  resolveSnapshotIds,
} from '../cleanupOptions.ts'
import { describeTarget, formatField } from '../display.ts'
import { getStringOption, type ParsedArgs, type UploadTarget } from '../options.ts'
import { scheduleSnapshotCleanup, scheduleStagingCleanup } from '../upload.ts'

export async function runSnapshotCleanupCommand(
  args: ParsedArgs,
  target: UploadTarget,
  options: {
    dryRun: boolean
    skipConfirm: boolean
  },
) {
  const resourceType = resolveSnapshotCleanupResourceType(args.options.type)
  const snapshotIds = resolveSnapshotIds(args.options.snapshot)
  const delaySeconds = resolveDelaySeconds(args.options['delay-seconds'])

  if (!options.skipConfirm && !options.dryRun) {
    const shouldContinue = await confirm({
      message: `Schedule current snapshot cleanup for ${describeTarget(target).label}?`,
      initialValue: true,
    })

    if (isCancel(shouldContinue) || !shouldContinue) {
      cancel('SNAPSHOT CLEANUP CANCELLED')
      process.exit(1)
    }
  }

  const result = await scheduleSnapshotCleanup(target, {
    delaySeconds,
    dryRun: options.dryRun,
    resourceType,
    snapshotIds,
  })

  note(
    [
      formatField('status', result.status),
      formatField('dryRun', String(result.dryRun)),
      formatField('candidateCount', String(result.candidateCount)),
      formatField('delaySeconds', String(result.delaySeconds)),
      formatField(
        'snapshotIds',
        result.snapshotIds.length > 0 ? result.snapshotIds.join(', ') : '-',
      ),
    ].join('\n'),
    'SNAPSHOT CLEANUP',
  )
  outro('Harbour snapshot cleanup request complete')
}

export async function runStagingCleanupCommand(
  args: ParsedArgs,
  target: UploadTarget,
  options: {
    dryRun: boolean
    printUsage: () => void
    skipConfirm: boolean
  },
) {
  const releaseSpecifier = getStringOption(args, ['release'])
  const delaySeconds = resolveDelaySeconds(args.options['delay-seconds'])

  if (!releaseSpecifier) {
    options.printUsage()
    throw new Error(
      'Missing release identifier. Pass `--release <release-id|release-code>`.',
    )
  }

  if (!options.skipConfirm && !options.dryRun) {
    const shouldContinue = await confirm({
      message: `Schedule SQL staging cleanup for ${releaseSpecifier} on ${describeTarget(target).label}?`,
      initialValue: true,
    })

    if (isCancel(shouldContinue) || !shouldContinue) {
      cancel('STAGING CLEANUP CANCELLED')
      process.exit(1)
    }
  }

  const result = await scheduleStagingCleanup(target, {
    delaySeconds,
    dryRun: options.dryRun,
    ...(isReleaseId(releaseSpecifier)
      ? { releaseId: releaseSpecifier }
      : { releaseCode: releaseSpecifier }),
  })

  note(
    [
      formatField('status', result.status),
      formatField('dryRun', String(result.dryRun)),
      formatField('releaseCode', result.releaseCode),
      formatField('releaseId', result.releaseId),
      formatField('delaySeconds', String(result.delaySeconds)),
    ].join('\n'),
    'STAGING CLEANUP',
  )
  outro('Harbour SQL staging cleanup request complete')
}
