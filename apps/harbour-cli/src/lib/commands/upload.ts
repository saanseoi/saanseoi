import { cancel, confirm, intro, isCancel, log, note, outro } from '@clack/prompts'

import { resolveSourceSchemaVersion } from '@repo/core'
import { prepareUpload } from '@repo/core/uploadLocal'

import {
  describeTarget,
  formatSchemaCheck,
  formatSummary,
  formatUploadResult,
} from '../display.ts'
import { buildRegisterOptions, type ParsedArgs, type UploadTarget } from '../options.ts'
import { checkOvertureUploadAssumptions } from '../overtureAssumptions.ts'
import { validateOvertureSchema } from '../schema/overture.ts'
import { dispatchUpload } from '../upload.ts'

export async function runUploadCommand(
  args: ParsedArgs,
  target: UploadTarget,
  options: {
    dryRun: boolean
    forceUpload: boolean
    invocationCwd: string
    printUsage: () => void
    skipConfirm: boolean
    skipSnapshotCleanup: boolean
  },
) {
  const isSqlUpload = args.command === 'upload:sql'
  const inputFile = args.positionals[0]

  if (!inputFile) {
    options.printUsage()
    throw new Error('Missing file path.')
  }

  intro(`
│
│      ▗▄▄▖▗▞▀▜▌▗▞▀▜▌▄▄▄▄   ▗▄▄▖▗▞▀▚▖ ▄▄▄  ▄
│     ▐▌   ▝▚▄▟▌▝▚▄▟▌█   █ ▐▌   ▐▛▀▀▘█   █ ▄
│      ▝▀▚▖          █   █  ▝▀▚▖▝▚▄▄▖▀▄▄▄▀ █
│     ▗▄▄▞▘                ▗▄▄▞▘           █
│
│               山水 UPLOADER
│  `)

  const registerOptions = buildRegisterOptions(options.invocationCwd, inputFile, args)
  const previewResult = await prepareUpload(registerOptions)
  const sourceSchemaVersion = await resolveSourceSchemaVersion({
    source: previewResult.plan.source,
    sourceVersion: previewResult.plan.sourceVersion,
  })
  const assumptionWarnings = await resolveAssumptionWarnings(
    registerOptions.filePath,
    previewResult,
  )

  note(
    formatSummary(previewResult, target).join('\n'),
    options.dryRun ? 'UPLOAD DRY RUN' : isSqlUpload ? 'SQL UPLOAD PLAN' : 'UPLOAD PLAN',
  )

  if (assumptionWarnings.length > 0) {
    note(assumptionWarnings.join('\n'), 'UPLOAD WARNINGS')
  }

  if (options.dryRun) {
    log.success('Local parquet validation passed.')
    log.message(
      'No object upload, API call, queue enqueue, or database mutation was attempted.',
    )
    outro('Harbour upload complete')
    return
  }

  if (!options.skipConfirm) {
    const shouldContinue = await confirm({
      message: `Prepare ${previewResult.plan.releaseCode} for ${describeTarget(target).label}?`,
      initialValue: true,
    })

    if (isCancel(shouldContinue) || !shouldContinue) {
      cancel('UPLOAD CANCELLED')
      process.exit(1)
    }
  }

  const schemaVersionId = resolveSchemaVersionId(previewResult)

  const uploadResult = await dispatchUpload(
    target,
    registerOptions,
    previewResult,
    schemaVersionId,
    {
      force: options.forceUpload,
      processingMode: isSqlUpload ? 'sql' : undefined,
      skipSnapshotCleanup: options.skipSnapshotCleanup,
    },
  )

  note(
    formatUploadResult(previewResult, {
      datasetCode:
        typeof uploadResult?.datasetCode === 'string'
          ? uploadResult.datasetCode
          : previewResult.plan.datasetCode,
      rawObjectKey:
        typeof uploadResult?.rawObjectKey === 'string'
          ? uploadResult.rawObjectKey
          : '-',
      releaseId:
        typeof uploadResult?.releaseId === 'string' ? uploadResult.releaseId : '-',
      datasetId:
        typeof uploadResult?.datasetId === 'string' ? uploadResult.datasetId : '-',
      schemaVersion: sourceSchemaVersion,
      status: typeof uploadResult?.status === 'string' ? uploadResult.status : 'staged',
    }).join('\n'),
    isSqlUpload ? 'SQL UPLOAD RESULT' : 'UPLOAD RESULT',
  )
  outro(
    isSqlUpload
      ? 'Dataset uploaded and SQL generation queued in Harbour'
      : 'Dataset uploaded and registered in Harbour',
  )
}

async function resolveAssumptionWarnings(
  filePath: string,
  previewResult: Awaited<ReturnType<typeof prepareUpload>>,
) {
  if (previewResult.plan.source !== 'overture') {
    return []
  }

  try {
    return await checkOvertureUploadAssumptions(filePath, previewResult.plan)
  } catch (error) {
    return [
      `Could not run dropped-field assumption checks: ${error instanceof Error ? error.message : String(error)}`,
    ]
  }
}

function resolveSchemaVersionId(
  previewResult: Awaited<ReturnType<typeof prepareUpload>>,
) {
  if (previewResult.plan.source === 'overture') {
    try {
      const schemaVersionId = validateOvertureSchema(
        previewResult.plan,
        previewResult.inspection,
      ).schema.id
      log.message(formatSchemaCheck('passed'))
      return schemaVersionId
    } catch (error) {
      log.message(formatSchemaCheck('failed'))
      throw error
    }
  }

  log.message(formatSchemaCheck('skipped'))
  return `${previewResult.plan.source}-${previewResult.plan.type}-unvalidated`
}
