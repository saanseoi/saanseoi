import { cancel, confirm, isCancel, note, outro } from '@clack/prompts'

import {
  resolveDelaySeconds,
  resolveSnapshotCleanupResourceType,
  resolveSnapshotIds,
} from '../cli/cleanupOptions.ts'
import { describeTarget, formatField } from '../cli/display.ts'
import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import { scheduleSnapshotCleanup } from '../upload/upload.ts'

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
