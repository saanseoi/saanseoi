import { cancel } from '@clack/prompts'

import { runSnapshotCleanupCommand } from './lib/commands/cleanup.ts'
import { runDocsNewCommand, runDocsPublishCommand } from './lib/commands/docs.ts'
import { runInspectCommand } from './lib/commands/inspect.ts'
import { runReportCommand } from './lib/commands/reports.ts'
import { runRollbackReleaseCommand } from './lib/commands/rollback.ts'
import { runScheduleCommand, runScheduledCommand } from './lib/commands/schedule.ts'
import { runUpdateCommand } from './lib/commands/update.ts'
import { runUploadCommand } from './lib/commands/upload.ts'
import { runInitialisationCommand } from './lib/commands/init.ts'
import {
  runTilesImportCommand,
  runTilesRebuildCommand,
  runTilesRetractCommand,
  runTilesRenderCommand,
  runTilesRefreshCommand,
} from './lib/commands/tiles.ts'
import {
  runVersionBumpCommand,
  runVersionDoctorCommand,
  runVersionPromoteCommand,
  runVersionPublishCommand,
  runVersionStatusCommand,
} from './lib/commands/version.ts'
import { parseArgs, resolveUploadTarget } from './lib/cli/options.ts'
import { printUsage } from './lib/cli/usage.ts'

async function main() {
  const args = parseArgs(process.argv)
  // `bin/saanseoi` changes into the CLI package before launching Bun. Keep
  // user-provided relative paths anchored to the directory from which that
  // launcher was invoked.
  const invocationCwd =
    process.env.SAANSEOI_INVOCATION_CWD ?? process.env.INIT_CWD ?? process.cwd()
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
    case 'inspect':
      await runInspectCommand(args)
      return
    case 'reports:ingestion':
    case 'reports:stats':
    case 'reports:processing-actions':
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
    case 'init:addresses:default':
    case 'init':
    case 'init:divisions:hkgov-pland-new-town':
    case 'init:divisions:hkgov-pland-pu':
    case 'init:divisions:hkgov-landsd':
    case 'init:divisions:overture':
    case 'init:streets:hkgov-landsd':
      await runInitialisationCommand(args, printUsage)
      return
    case 'tiles:refresh':
      await runTilesRefreshCommand(args, printUsage)
      return
    case 'tiles:import':
      await runTilesImportCommand(args, printUsage)
      return
    case 'tiles:rebuild':
      await runTilesRebuildCommand(args, printUsage)
      return
    case 'tiles:retract':
      await runTilesRetractCommand(args, printUsage)
      return
    case 'tiles:render':
      await runTilesRenderCommand(args, printUsage)
      return
    case 'schedule':
      await runScheduleCommand(args, printUsage)
      return
    case 'schedule:run':
      await runScheduledCommand(args, printUsage)
      return
    case 'update':
      await runUpdateCommand(args, target, printUsage)
      return
    default:
      throw new Error(`Unsupported harbour command: ${args.command}`)
  }
}

main().catch(error => {
  cancel(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
