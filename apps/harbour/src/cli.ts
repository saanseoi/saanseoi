import { resolve } from 'node:path'

import { cancel, confirm, intro, isCancel, log, note, outro } from '@clack/prompts'

import { registerUpload } from './lib/services/upload'

type ParsedArgs = {
  command: string | null
  positionals: string[]
  options: Record<string, string | boolean>
}

type RegisterUploadOptions = Parameters<typeof registerUpload>[0]

function cyanLabel(label: string) {
  return `\u001B[36m${label}\u001B[39m`
}

function deEmphasize(text: string) {
  return `\u001B[90m${text}\u001B[39m`
}

function formatField(label: string, value: string | number, inferredFrom?: string) {
  const suffix = inferredFrom ? ` ${deEmphasize(`(${inferredFrom})`)}` : ''
  return `${cyanLabel(label)}: ${value}${suffix}`
}

function parseArgs(argv: string[]): ParsedArgs {
  const [, , command, ...rest] = argv
  const positionals: string[] = []
  const options: Record<string, string | boolean> = {}

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]

    if (!token) {
      continue
    }

    if (!token.startsWith('--')) {
      positionals.push(token)
      continue
    }

    const key = token.slice(2)
    const next = rest[index + 1]

    if (!next || next.startsWith('--')) {
      options[key] = true
      continue
    }

    options[key] = next
    index += 1
  }

  return {
    command: command ?? null,
    positionals,
    options,
  }
}

function printUsage() {
  console.log(`Usage:
  bun run upload <file> [--type place|division|address] [--theme places|divisions] [--region hk|mo] [--month YYYY-MM] [--dry-run] [--yes]
  bun run --filter harbour upload <file> [--db /path/to/local.sqlite] [--raw-root /path/to/staging]
`)
}

function buildRegisterOptions(
  invocationCwd: string,
  inputFile: string,
  args: ParsedArgs,
): RegisterUploadOptions {
  return {
    filePath: resolve(invocationCwd, inputFile),
    type:
      typeof args.options.type === 'string' ? args.options.type : undefined,
    theme:
      typeof args.options.theme === 'string' ? args.options.theme : undefined,
    regionCode:
      typeof args.options.region === 'string' ? args.options.region : undefined,
    snapshotMonth:
      typeof args.options.month === 'string' ? args.options.month : undefined,
    source:
      typeof args.options.source === 'string' ? args.options.source : undefined,
    sourceVersion:
      typeof args.options['source-version'] === 'string'
        ? args.options['source-version']
        : undefined,
    dryRun: Boolean(args.options['dry-run']),
    localDbPath:
      typeof args.options.db === 'string'
        ? resolve(invocationCwd, args.options.db)
        : undefined,
    localRawRoot:
      typeof args.options['raw-root'] === 'string'
        ? resolve(invocationCwd, args.options['raw-root'])
        : undefined,
  }
}

function formatPlan(result: Awaited<ReturnType<typeof registerUpload>>) {
  return [
    formatField('datasetId', result.plan.datasetId),
    formatField('theme', result.plan.theme, result.plan.inferredFrom.theme),
    formatField('type', result.plan.type, result.plan.inferredFrom.type),
    formatField('region', result.plan.regionCode, result.plan.inferredFrom.regionCode),
    formatField(
      'snapshotMonth',
      result.plan.snapshotMonth,
      result.plan.inferredFrom.snapshotMonth,
    ),
    formatField('sourceVersion', result.plan.sourceVersion),
    formatField('rows', result.plan.rowCount),
    formatField('supersedes', result.plan.supersedesDatasetId ?? '-'),
  ]
}

function formatSummary(result: Awaited<ReturnType<typeof registerUpload>>) {
  return [
    ...formatPlan(result),
    formatField('stagedFilePath', result.stagedFilePath ?? '(dry run)'),
    formatField('metadataPath', result.metadataPath ?? '(dry run)'),
  ]
}

async function main() {
  const args = parseArgs(process.argv)
  const invocationCwd = process.env.INIT_CWD ?? process.cwd()
  const dryRun = Boolean(args.options['dry-run'])
  const skipConfirm = Boolean(args.options.yes)

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

  const previewResult = await registerUpload({
    ...registerOptions,
    dryRun: true,
  })

  note(
    formatPlan(previewResult).join('\n'),
    dryRun ? 'UPLOAD DRY RUN' : 'UPLOAD PLAN',
  )

  if (dryRun) {
    log.success('Local validation passed.')
    log.message('No files were staged and no database rows were written.')
    outro('Harbour upload complete')
    return
  }

  if (!skipConfirm) {
    const shouldContinue = await confirm({
      message: `Register and stage ${previewResult.plan.datasetId}?`,
      initialValue: true,
    })

    if (isCancel(shouldContinue) || !shouldContinue) {
      cancel('UPLOAD CANCELLED')
      process.exit(1)
    }
  }

  const result = await registerUpload(registerOptions)

  note(
    formatSummary(result).join('\n'),
    'UPLOAD RESULT',
  )
  log.success(`Registered ${result.plan.datasetId}`)
  outro('TIDE WENT OUT')
}

main().catch(error => {
  cancel(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
