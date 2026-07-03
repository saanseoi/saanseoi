import { cancel } from '@clack/prompts'

import { runSnapshotCleanupCommand } from './lib/commands/cleanup.ts'
import { runHkgovAlsPrepCommand } from './lib/commands/hkgovAls.ts'
import { runInspectCommand } from './lib/commands/inspect.ts'
import { runReportCommand } from './lib/commands/reports.ts'
import { runRollbackReleaseCommand } from './lib/commands/rollback.ts'
import { runUploadCommand } from './lib/commands/upload.ts'
import { parseArgs, resolveUploadTarget } from './lib/options.ts'
import { printUsage } from './lib/usage.ts'

async function main() {
  const args = parseArgs(process.argv)
  const invocationCwd = process.env.INIT_CWD ?? process.cwd()
  const dryRun = Boolean(args.options['dry-run'])
  const forceUpload = Boolean(args.options.force)
  const skipSnapshotCleanup = Boolean(args.options['skip-cleanup'])
  const skipConfirm = Boolean(args.options.yes)
  const target = resolveUploadTarget(args)

  if (!args.command || args.command === '--help' || args.options.help) {
    printUsage()
    return
  }

  switch (args.command) {
    case 'prepare-hkgov-als':
    case 'prep-hkgov-als':
      await runHkgovAlsPrepCommand(args, target, printUsage)
      return
    case 'inspect':
      await runInspectCommand(args)
      return
    case 'reports:ingestion':
    case 'reports:stats':
    case 'reports:releases':
      await runReportCommand(args, target)
      return
    case 'cleanup:snapshots':
      await runSnapshotCleanupCommand(args, target, {
        dryRun,
        skipConfirm,
      })
      return
    case 'rollback:release':
      await runRollbackReleaseCommand(args, target, {
        dryRun,
        printUsage,
      })
      return
    case 'upload':
      await runUploadCommand(args, target, {
        dryRun,
        forceUpload,
        invocationCwd,
        printUsage,
        skipConfirm,
        skipSnapshotCleanup,
      })
      return
    default:
      throw new Error(`Unsupported harbour command: ${args.command}`)
  }
}

main().catch(error => {
  cancel(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
