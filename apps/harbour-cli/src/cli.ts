import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { cancel, confirm, intro, isCancel, log, note, outro } from '@clack/prompts'

import { prepareUpload } from '@repo/core/upload-local'

type ParsedArgs = {
  command: string | null
  positionals: string[]
  options: Record<string, string | boolean>
}

type CliUploadOptions = Parameters<typeof prepareUpload>[0]
type UploadEnvironment = 'dev' | 'preview' | 'production'
type UploadTarget = {
  remote: boolean
  environment: UploadEnvironment
}

function cyanText(label: string) {
  return `\u001B[36m${label}\u001B[39m`
}

function deEmphasize(text: string) {
  return `\u001B[90m${text}\u001B[39m`
}

function redText(text: string) {
  return `\u001B[31m${text}\u001B[39m`
}

function formatField(label: string, value: string | number, inferredFrom?: string) {
  const suffix = inferredFrom ? ` ${deEmphasize(`(${inferredFrom})`)}` : ''
  return `${cyanText(label)}: ${value}${suffix}`
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
  bun run upload <file> [--target local|cf-preview|cf-production] [--remote] [--env dev|preview|production] [--api URL] [--type place|division|address] [--theme places|divisions] [--region hk|mo] [--month YYYY-MM] [--dry-run] [--yes]
`)
}

function buildRegisterOptions(
  invocationCwd: string,
  inputFile: string,
  args: ParsedArgs,
): CliUploadOptions {
  return {
    filePath: resolve(invocationCwd, inputFile),
    type: typeof args.options.type === 'string' ? args.options.type : undefined,
    theme: typeof args.options.theme === 'string' ? args.options.theme : undefined,
    regionCode:
      typeof args.options.region === 'string' ? args.options.region : undefined,
    snapshotMonth:
      typeof args.options.month === 'string' ? args.options.month : undefined,
    source: typeof args.options.source === 'string' ? args.options.source : undefined,
    sourceVersion:
      typeof args.options['source-version'] === 'string'
        ? args.options['source-version']
        : undefined,
    dryRun: Boolean(args.options['dry-run']),
  }
}

function resolveUploadTarget(args: ParsedArgs): UploadTarget {
  const explicitRemote =
    typeof args.options.remote === 'boolean' ? args.options.remote : undefined
  const explicitEnvironment =
    typeof args.options.env === 'string' ? args.options.env : undefined

  if (explicitRemote !== undefined || explicitEnvironment !== undefined) {
    const remote = explicitRemote ?? false

    switch (explicitEnvironment) {
      case undefined:
        return {
          remote,
          environment: remote ? 'preview' : 'dev',
        }
      case 'dev':
      case 'preview':
      case 'production':
        return {
          remote,
          environment: explicitEnvironment,
        }
      default:
        throw new Error(
          `Unsupported upload environment: ${explicitEnvironment}. Use dev, preview, or production.`,
        )
    }
  }

  const rawTarget =
    typeof args.options.target === 'string'
      ? args.options.target
      : process.env.HARBOUR_UPLOAD_TARGET

  switch (rawTarget) {
    case undefined:
    case 'local':
      return {
        remote: false,
        environment: 'dev',
      }
    case 'cf-preview':
      return {
        remote: true,
        environment: 'preview',
      }
    case 'cf-production':
      return {
        remote: true,
        environment: 'production',
      }
    default:
      throw new Error(
        `Unsupported upload target: ${rawTarget}. Use local, cf-preview, or cf-production.`,
      )
  }
}

function describeTarget(target: UploadTarget) {
  if (!target.remote) {
    switch (target.environment) {
      case 'dev':
        return {
          label: 'local-dev',
          destination: 'local Wrangler dev / Miniflare environment',
        }
      case 'preview':
      case 'production':
        throw new Error(
          `Invalid local upload environment: ${target.environment}. Local uploads must use env=dev.`,
        )
    }
  }

  switch (target.environment) {
    case 'dev':
      return {
        label: 'cf-dev',
        destination: 'Cloudflare dev environment',
      }
    case 'preview':
      return {
        label: 'cf-preview',
        destination: 'Cloudflare preview environment',
      }
    case 'production':
      return {
        label: 'cf-production',
        destination: 'Cloudflare production environment',
      }
  }
}

function formatPlan(result: Awaited<ReturnType<typeof prepareUpload>>) {
  return [
    formatField('datasetId', result.plan.datasetId),
    formatField('sourceVersion', result.plan.sourceVersion),
    formatField('region', result.plan.regionCode, result.plan.inferredFrom.regionCode),
    formatField(
      'snapshotMonth',
      result.plan.snapshotMonth,
      result.plan.inferredFrom.snapshotMonth,
    ),
    formatField('type', result.plan.type, result.plan.inferredFrom.type),
    formatField('rows', result.plan.rowCount),
    formatField('supersedes', result.plan.supersedesDatasetId ?? '-'),
  ]
}

function formatSummary(
  result: Awaited<ReturnType<typeof prepareUpload>>,
  target: UploadTarget,
) {
  const targetMode = target.remote ? 'cf' : 'local'
  const harbourBaseUrl = resolveHarbourBaseUrl(target)
  const uploadEndpoint = buildUploadEndpoint(harbourBaseUrl)

  return [
    formatField('target', `${target.environment} (${redText(targetMode)})`),
    formatField('harbourApi', harbourBaseUrl),
    formatField('uploadEndpoint', uploadEndpoint),
    ...formatPlan(result),
  ]
}

function explainDispatch(target: UploadTarget, apiBaseUrl: string) {
  const targetDetails = describeTarget(target)
  const uploadEndpoint = buildUploadEndpoint(apiBaseUrl)

  return [
    `CLI target: ${targetDetails.label}`,
    `Destination: ${targetDetails.destination}`,
    `POST ${uploadEndpoint}`,
    'Expected runtime flow:',
    '1. send parquet plus upload metadata to the Harbour API',
    '2. write the parquet into the bound R2 bucket',
    '3. register the dataset and initial ingest phases in Harbour D1',
    '',
    'Downstream ingest execution is still deferred after dataset registration.',
  ].join('\n')
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function resolveHarbourBaseUrl(target: UploadTarget) {
  switch (target.environment) {
    case 'dev':
      return 'http://localhost:8788'
    case 'preview':
      return 'https://ss-harbour-preview.hypehk.workers.dev'
    case 'production':
      return 'https://ss-harbour-production.hypehk.workers.dev'
  }
}

function resolveHarbourApiUrl(args: ParsedArgs, target: UploadTarget) {
  const explicitUrl =
    typeof args.options.api === 'string' ? args.options.api.trim() : undefined

  if (explicitUrl) {
    return normalizeBaseUrl(explicitUrl)
  }

  const genericBaseUrl =
    process.env.HARBOUR_BASE_URL?.trim() ?? process.env.HARBOUR_API_URL?.trim()

  switch (target.environment) {
    case 'dev':
      return normalizeBaseUrl(
        process.env.HARBOUR_BASE_URL_DEV?.trim() ??
          process.env.HARBOUR_API_URL_DEV?.trim() ??
          genericBaseUrl ??
          resolveHarbourBaseUrl(target),
      )
    case 'preview':
      return normalizeBaseUrl(
        process.env.HARBOUR_BASE_URL_PREVIEW?.trim() ??
          process.env.HARBOUR_API_URL_PREVIEW?.trim() ??
          genericBaseUrl ??
          resolveHarbourBaseUrl(target),
      )
    case 'production':
      return normalizeBaseUrl(
        process.env.HARBOUR_BASE_URL_PRODUCTION?.trim() ??
          process.env.HARBOUR_API_URL_PRODUCTION?.trim() ??
          genericBaseUrl ??
          resolveHarbourBaseUrl(target),
      )
  }
}

function buildUploadEndpoint(apiBaseUrl: string) {
  return `${apiBaseUrl}/v1/uploads`
}

function buildUploadFormData(
  inputFilePath: string,
  previewResult: Awaited<ReturnType<typeof prepareUpload>>,
): Promise<FormData> {
  return readFile(inputFilePath).then(fileBytes => {
    const formData = new FormData()
    const fileName = inputFilePath.split(/[\\/]+/).pop() ?? 'upload.parquet'

    formData.set(
      'file',
      new File([fileBytes], fileName, {
        type: 'application/octet-stream',
      }),
    )

    formData.set('type', previewResult.plan.type)
    formData.set('theme', previewResult.plan.theme)
    formData.set('regionCode', previewResult.plan.regionCode)
    formData.set('snapshotMonth', previewResult.plan.snapshotMonth)
    formData.set('source', previewResult.plan.source)
    formData.set('sourceVersion', previewResult.plan.sourceVersion)

    return formData
  })
}

async function dispatchUpload(
  args: ParsedArgs,
  target: UploadTarget,
  registerOptions: CliUploadOptions,
  previewResult: Awaited<ReturnType<typeof prepareUpload>>,
) {
  const apiBaseUrl = resolveHarbourApiUrl(args, target)

  if (!apiBaseUrl) {
    throw new Error(
      `Missing Harbour API URL for ${describeTarget(target).label}. Pass --api or set HARBOUR_API_URL${target.environment === 'preview' ? '_PREVIEW' : target.environment === 'production' ? '_PRODUCTION' : '_DEV'}.`,
    )
  }

  const formData = await buildUploadFormData(registerOptions.filePath, previewResult)
  const uploadEndpoint = buildUploadEndpoint(apiBaseUrl)
  const response = await fetch(uploadEndpoint, {
    method: 'POST',
    body: formData,
  })

  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null

  if (!response.ok) {
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : `Harbour API upload failed with status ${response.status}.`

    throw new Error(message)
  }

  return payload
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

  note(
    formatSummary(previewResult, target).join('\n'),
    dryRun ? 'UPLOAD DRY RUN' : 'UPLOAD PLAN',
  )

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
  const uploadResult = await dispatchUpload(
    args,
    target,
    registerOptions,
    previewResult,
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
  log.message('Downstream ingest execution is not implemented yet.')
  outro('Harbour upload complete')
}

main().catch(error => {
  cancel(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
