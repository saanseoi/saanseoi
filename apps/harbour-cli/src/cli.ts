import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cancel, confirm, intro, isCancel, log, note, outro } from '@clack/prompts'

import { prepareUpload } from '@repo/core/upload-local'
import { inferSourceVersionFromPath } from '@repo/core/upload-local'
import {
  describeTarget,
  explainDispatch,
  formatField,
  formatSummary,
} from './lib/display.ts'
import { prepareHkgovAlsAddressParquet } from './lib/hkgov-als.ts'
import {
  buildRegisterOptions,
  parseArgs,
  resolveUploadTarget,
  type UploadEnvironment,
} from './lib/options.ts'
import { checkOvertureUploadAssumptions } from './lib/overture-assumptions.ts'
import { validateOvertureSchema } from './lib/schema/overture.ts'
import { dispatchUpload } from './lib/upload.ts'

function printUsage() {
  console.log(`  Usage:
  bun run upload[:cf:environment] <file> [--target local|cf-preview|cf-production] [--remote] [--env dev|preview|production] [--api URL] [--type place|division|address] [--theme addresses|places|divisions] [--region hk|mo] [--month YYYY-MM] [--dry-run] [--yes]
  bun run prep-hkgov-als[:cf:environment] <source-dir> [--source-version YYYY-MM-DD.NN] [--db /path/to/local.sqlite]
`)
}

async function createHkgovAlsTempOutputFile(sourceVersion: string) {
  const tempDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-als-'))

  return join(tempDir, `hkgov-hk-${sourceVersion}-address.parquet`)
}

function resolveHkgovAlsEnvironment(command: string): UploadEnvironment {
  switch (command) {
    case 'prep-hkgov-als:preview':
      return 'preview'
    case 'prep-hkgov-als:production':
      return 'production'
    case 'prep-hkgov-als':
    case 'prepare-hkgov-als':
      return 'dev'
    default:
      throw new Error(`Unsupported harbour command: ${command}`)
  }
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

  if (
    args.command === 'prepare-hkgov-als' ||
    args.command === 'prep-hkgov-als' ||
    args.command === 'prep-hkgov-als:preview' ||
    args.command === 'prep-hkgov-als:production'
  ) {
    const sourceDir = args.positionals[0]
    const sourceVersion =
      typeof args.options['source-version'] === 'string'
        ? args.options['source-version']
        : inferSourceVersionFromPath(sourceDir ?? '')

    if (!sourceDir || !sourceVersion) {
      printUsage()
      throw new Error(
        'Invalid arguments for `prep-hkgov-als`. Pass <source-dir> and include --source-version only when it cannot be inferred from the path.',
      )
    }
    const environment = resolveHkgovAlsEnvironment(args.command)
    const outputFile = await createHkgovAlsTempOutputFile(sourceVersion)

    const result = await prepareHkgovAlsAddressParquet({
      dbPath: typeof args.options.db === 'string' ? args.options.db : undefined,
      environment,
      outputFile,
      snapshotMonth: sourceVersion.slice(0, 7),
      sourceDir,
      sourceVersion,
    })

    note(
      [
        formatField('outputFile', result.outputFile),
        formatField('sourceFiles', String(result.sourceFileCount)),
        formatField('featureCount', String(result.featureCount)),
      ].join('\n'),
      'PREP RESULT',
    )
    outro('ALS parquet preparation complete')
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
│  ▗▄▄▖▗▞▀▜▌▗▞▀▜▌▄▄▄▄   ▗▄▄▖▗▞▀▚▖ ▄▄▄  ▄
│ ▐▌   ▝▚▄▟▌▝▚▄▟▌█   █ ▐▌   ▐▛▀▀▘█   █ ▄
│  ▝▀▚▖          █   █  ▝▀▚▖▝▚▄▄▖▀▄▄▄▀ █
│ ▗▄▄▞▘                ▗▄▄▞▘           █
│
│            山水 UPLOADER
│  `)

  const registerOptions = buildRegisterOptions(invocationCwd, inputFile, args)
  const previewResult = await prepareUpload(registerOptions)
  let assumptionWarnings: string[] = []

  if (previewResult.plan.source === 'overture') {
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

  log.message(explainDispatch(target))
  const schemaVersionId =
    previewResult.plan.source === 'overture'
      ? validateOvertureSchema(previewResult.plan, previewResult.inspection).schema.id
      : `${previewResult.plan.source}-${previewResult.plan.type}-unvalidated`

  if (previewResult.plan.source === 'overture') {
    log.success(`Schema check passed: ${schemaVersionId}`)
  } else {
    log.message(
      `Schema check skipped for ${previewResult.plan.source} ${previewResult.plan.type}.`,
    )
  }

  const uploadResult = await dispatchUpload(
    args,
    target,
    registerOptions,
    previewResult,
    schemaVersionId,
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
