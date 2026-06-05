import { cancel, confirm, intro, isCancel, log, note, outro } from '@clack/prompts'

import { prepareUpload } from '@repo/core/upload-local'
import {
  describeTarget,
  explainDispatch,
  formatField,
  formatSummary,
} from './lib/display.ts'
import { buildRegisterOptions, parseArgs, resolveUploadTarget } from './lib/options.ts'
import { checkOvertureUploadAssumptions } from './lib/overture-assumptions.ts'
import { validateOvertureSchema } from './lib/schema/overture.ts'
import { dispatchUpload, resolveHarbourApiUrl } from './lib/upload.ts'

function printUsage() {
  console.log(`Usage:
  bun run upload <file> [--target local|cf-preview|cf-production] [--remote] [--env dev|preview|production] [--api URL] [--type place|division|address] [--theme addresses|places|divisions] [--region hk|mo] [--month YYYY-MM] [--dry-run] [--yes]
`)
}

async function main() {
  const args = parseArgs(process.argv)
  const invocationCwd = process.env.INIT_CWD ?? process.cwd()
  const dryRun = Boolean(args.options['dry-run'])
  const skipConfirm = Boolean(args.options.yes)
  const target = resolveUploadTarget(args)

  if (!args.command || args.command === '--help' || args.options.help) {
    printUsage()
    return
  }

  if (args.command !== 'upload') {
    throw new Error(`Unsupported harbour command: ${args.command}`)
  }

  const inputFile = args.positionals[0]

  if (!inputFile) {
    printUsage()
    throw new Error('Missing file path.')
  }

  intro(`
│
│  ▗▖ ▗▖▗▞▀▜▌ ▄▄▄ ▗▖    ▄▄▄  █  ▐▌ ▄▄▄
│  ▐▌ ▐▌▝▚▄▟▌█    ▐▌   █   █ ▀▄▄▞▘█
│  ▐▛▀▜▌     █    ▐▛▀▚▖▀▄▄▄▀      █
│  ▐▌ ▐▌          ▐▙▄▞▘
│
│           山水 UPLOADER
│  `)

  const registerOptions = buildRegisterOptions(invocationCwd, inputFile, args)
  const previewResult = await prepareUpload(registerOptions)
  let assumptionWarnings: string[] = []

  try {
    assumptionWarnings = await checkOvertureUploadAssumptions(
      registerOptions.filePath,
      previewResult.plan,
    )
  } catch (error) {
    assumptionWarnings = [
      `Could not run dropped-field assumption checks: ${error instanceof Error ? error.message : String(error)}`,
    ]
  }

  note(
    formatSummary(previewResult, target).join('\n'),
    dryRun ? 'UPLOAD DRY RUN' : 'UPLOAD PLAN',
  )

  if (assumptionWarnings.length > 0) {
    note(assumptionWarnings.join('\n'), 'UPLOAD WARNINGS')
  }

  if (dryRun) {
    log.success('Local parquet validation passed.')
    log.message(
      'No object upload, API call, queue enqueue, or database mutation was attempted.',
    )
    outro('Harbour upload complete')
    return
  }

  if (!skipConfirm) {
    const shouldContinue = await confirm({
      message: `Prepare ${previewResult.plan.datasetId} for ${describeTarget(target).label}?`,
      initialValue: true,
    })

    if (isCancel(shouldContinue) || !shouldContinue) {
      cancel('UPLOAD CANCELLED')
      process.exit(1)
    }
  }

  log.message(explainDispatch(target, resolveHarbourApiUrl(args, target)))
  const schemaValidation = validateOvertureSchema(
    previewResult.plan,
    previewResult.inspection,
  )
  log.success(`Schema check passed: ${schemaValidation.schema.id}`)
  const uploadResult = await dispatchUpload(
    args,
    target,
    registerOptions,
    previewResult,
    schemaValidation.schema.id,
  )

  note(
    [
      formatField(
        'datasetId',
        typeof uploadResult?.datasetId === 'string'
          ? uploadResult.datasetId
          : previewResult.plan.datasetId,
      ),
      formatField(
        'rawObjectKey',
        typeof uploadResult?.rawObjectKey === 'string'
          ? uploadResult.rawObjectKey
          : '-',
      ),
      formatField(
        'status',
        typeof uploadResult?.status === 'string' ? uploadResult.status : 'staged',
      ),
    ].join('\n'),
    'UPLOAD RESULT',
  )
  log.success('Dataset uploaded and registered in Harbour.')
  outro('Harbour upload complete')
}

main().catch(error => {
  cancel(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
