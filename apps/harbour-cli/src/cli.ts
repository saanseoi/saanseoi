import { cancel } from '@clack/prompts'

import { runSnapshotCleanupCommand } from './lib/commands/cleanup.ts'
import { runDocsNewCommand, runDocsPublishCommand } from './lib/commands/docs.ts'
import {
  runHkgovAlsLocalIngestCommand,
  runHkgovAlsPrepCommand,
} from './lib/commands/hkgovAls.ts'
import { runHkgovPlandBackfillCommand } from './lib/commands/backfillHkgovPland.ts'
import { runHkgovPlandPrepCommand } from './lib/commands/hkgovPland.ts'
import { runInspectCommand } from './lib/commands/inspect.ts'
import { runReportCommand } from './lib/commands/reports.ts'
import { runRollbackReleaseCommand } from './lib/commands/rollback.ts'
import { runUploadCommand } from './lib/commands/upload.ts'
import {
  runVersionBumpCommand,
  runVersionDoctorCommand,
  runVersionPromoteCommand,
  runVersionPublishCommand,
  runVersionStatusCommand,
} from './lib/commands/version.ts'
import { parseArgs, resolveUploadTarget } from './lib/options.ts'
import { printUsage } from './lib/usage.ts'

async function main() {
  const args = parseArgs(process.argv)
  const invocationCwd = process.env.INIT_CWD ?? process.cwd()
  const dryRun = Boolean(args.options['dry-run'])
  const forceUpload = Boolean(args.options.force)
  const skipSnapshotCleanup = Boolean(args.options['skip-cleanup'])
  const skipConfirm = Boolean(args.options.yes)
  const validateGeometry = Boolean(args.options['validate-geometry'])
  const target = resolveUploadTarget(args)

  if (!args.command || args.command === '--help' || args.options.help) {
    printUsage()
    return
  }

  switch (args.command) {
    case 'prepare-hkgov-dpo':
    case 'prep-hkgov-dpo':
      await runHkgovAlsPrepCommand(args, target, printUsage)
      return
    case 'ingest-hkgov-dpo-local':
      await runHkgovAlsLocalIngestCommand(args, target, printUsage)
      return
    case 'prepare-hkgov-pland':
    case 'prep-hkgov-pland':
      await runHkgovPlandPrepCommand(args, printUsage)
      return
    case 'backfill:hkgov-pland-pu':
      await runHkgovPlandBackfillCommand(args, target, 'pu', printUsage)
      return
    case 'backfill:hkgov-pland-new-town':
      await runHkgovPlandBackfillCommand(args, target, 'new-town', printUsage)
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
    case 'docs:new':
      await runDocsNewCommand(args, target)
      return
    case 'docs:publish':
      await runDocsPublishCommand(args, target)
      return
    case 'rollback:release':
      await runRollbackReleaseCommand(args, target, {
        dryRun,
        printUsage,
      })
      return
    case 'version:bump':
      await runVersionBumpCommand(args)
      return
    case 'version:publish':
      await runVersionPublishCommand(args, target)
      return
    case 'version:promote':
      await runVersionPromoteCommand(args, target)
      return
    case 'version:status':
      await runVersionStatusCommand()
      return
    case 'version:doctor':
      await runVersionDoctorCommand()
      return
    case 'upload':
      await runUploadCommand(args, target, {
        dryRun,
        forceUpload,
        invocationCwd,
        printUsage,
        skipConfirm,
        skipSnapshotCleanup,
        validateGeometry,
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
