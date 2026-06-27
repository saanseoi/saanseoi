import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cancel, confirm, intro, isCancel, log, note, outro } from '@clack/prompts'

import { prepareUpload } from '@repo/core/upload-local'
import { inferSourceVersionFromPath } from '@repo/core/upload-local'
import { isReleaseId } from '@repo/core'
import {
  describeTarget,
  explainDispatch,
  formatIngestionReportTable,
  formatField,
  formatReleaseReportTable,
  formatSummary,
  formatStatsReportTable,
} from './lib/display.ts'
import { prepareHkgovAlsAddressParquet } from './lib/hkgov-als.ts'
import { buildRegisterOptions, parseArgs, resolveUploadTarget } from './lib/options.ts'
import { checkOvertureUploadAssumptions } from './lib/overture-assumptions.ts'
import {
  fetchIngestRunReport,
  fetchReleaseReport,
  fetchStatsReport,
} from './lib/reporting.ts'
import { validateOvertureSchema } from './lib/schema/overture.ts'
import {
  dispatchUpload,
  finalizeExistingUpload,
  requeueExistingUpload,
} from './lib/upload.ts'

function printUsage() {
  console.log(`  Usage:
  saanseoi upload <file> [--target local|cf-preview|cf-production] [--type place|division|address] [--theme addresses|places|divisions] [--region hk|mo] [--month YYYY-MM] [--dry-run] [--yes]
  saanseoi upload:finalize --release <release-id|release-code> [--target local|cf-preview|cf-production] [--yes]
  saanseoi upload:requeue --release <release-id|release-code> [--target local|cf-preview|cf-production] [--yes]
  saanseoi prep-hkgov-als <source-dir> [--target local|cf-preview|cf-production] [--source-version YYYY-MM-DD.NN] [--db /path/to/local.sqlite]
  saanseoi reports:ingestion [--target local|cf-preview|cf-production] [--limit 1-100]
  saanseoi reports:stats [--target local|cf-preview|cf-production] [--limit 1-100] [--source SOURCE] [--type TYPE]
  saanseoi reports:releases [--target local|cf-preview|cf-production] [--limit 1-100]
`)
}

async function createHkgovAlsTempOutputFile(sourceVersion: string) {
  const tempDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-als-'))

  return join(tempDir, `hkgov-hk-${sourceVersion}-address.parquet`)
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

  if (args.command === 'prepare-hkgov-als' || args.command === 'prep-hkgov-als') {
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
    const outputFile = await createHkgovAlsTempOutputFile(sourceVersion)

    const result = await prepareHkgovAlsAddressParquet({
      dbPath: typeof args.options.db === 'string' ? args.options.db : undefined,
      environment: target.environment,
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

  const reportLimit =
    typeof args.options.limit === 'string'
      ? Number.parseInt(args.options.limit, 10)
      : 10
  const reportSource =
    typeof args.options.source === 'string' ? args.options.source : undefined
  const reportType =
    typeof args.options.type === 'string' ? args.options.type : undefined
  const hasExplicitLimit = typeof args.options.limit === 'string'

  if (args.command === 'reports:ingestion') {
    const report = await fetchIngestRunReport(target, {
      limit: hasExplicitLimit ? reportLimit : 100,
      source: reportSource,
      type: reportType,
    })
    console.log(
      formatIngestionReportTable(report.rows, {
        applyDefaultReleaseFilter: !hasExplicitLimit,
      }),
    )
    return
  }

  if (args.command === 'reports:stats') {
    const report = await fetchStatsReport(target, {
      limit: hasExplicitLimit ? reportLimit : 1,
      source: reportSource,
      type: reportType,
    })
    console.log(formatStatsReportTable(report.rows))
    return
  }

  if (args.command === 'reports:releases') {
    const report = await fetchReleaseReport(target, {
      limit: reportLimit,
      releaseCode:
        typeof args.options.release === 'string' && !isReleaseId(args.options.release)
          ? args.options.release
          : undefined,
      releaseId:
        typeof args.options.release === 'string' && isReleaseId(args.options.release)
          ? args.options.release
          : undefined,
      source: reportSource,
      type: reportType,
    })
    console.log(formatReleaseReportTable(report.rows))
    return
  }

  if (args.command === 'upload:finalize') {
    const releaseSpecifier =
      typeof args.options.release === 'string' ? args.options.release : undefined

    if (!releaseSpecifier) {
      printUsage()
      throw new Error(
        'Missing release identifier. Pass `--release <release-id|release-code>`.',
      )
    }

    if (!skipConfirm) {
      const shouldContinue = await confirm({
        message: `Finalize ${releaseSpecifier} for ${describeTarget(target).label}?`,
        initialValue: true,
      })

      if (isCancel(shouldContinue) || !shouldContinue) {
        cancel('FINALIZE CANCELLED')
        process.exit(1)
      }
    }

    log.message(explainDispatch(target))
    const finalized = await finalizeExistingUpload(target, releaseSpecifier)

    note(
      [
        formatField('datasetCode', finalized.release.datasetCode),
        formatField('releaseCode', finalized.release.releaseCode),
        formatField('releaseId', finalized.release.releaseId),
        formatField('rawObjectKey', finalized.release.rawObjectKey ?? '-'),
        formatField(
          'status',
          typeof finalized.result?.status === 'string'
            ? finalized.result.status
            : 'staged',
        ),
      ].join('\n'),
      'FINALIZE RESULT',
    )
    log.success('Upload finalization requested and processing re-queued in Harbour.')
    outro('Harbour upload finalize complete')
    return
  }

  if (args.command === 'upload:requeue') {
    const releaseSpecifier =
      typeof args.options.release === 'string' ? args.options.release : undefined

    if (!releaseSpecifier) {
      printUsage()
      throw new Error(
        'Missing release identifier. Pass `--release <release-id|release-code>`.',
      )
    }

    if (!skipConfirm) {
      const shouldContinue = await confirm({
        message: `Requeue ${releaseSpecifier} for ${describeTarget(target).label}?`,
        initialValue: true,
      })

      if (isCancel(shouldContinue) || !shouldContinue) {
        cancel('REQUEUE CANCELLED')
        process.exit(1)
      }
    }

    log.message(explainDispatch(target))
    const requeued = await requeueExistingUpload(target, releaseSpecifier)

    note(
      [
        formatField('datasetCode', requeued.release.datasetCode),
        formatField('releaseCode', requeued.release.releaseCode),
        formatField('releaseId', requeued.release.releaseId),
        formatField('rawObjectKey', requeued.release.rawObjectKey ?? '-'),
        formatField(
          'status',
          typeof requeued.result?.status === 'string'
            ? requeued.result.status
            : requeued.release.status,
        ),
      ].join('\n'),
      'REQUEUE RESULT',
    )
    log.success('Release processing re-queued in Harbour.')
    outro('Harbour upload requeue complete')
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
│      ▗▄▄▖▗▞▀▜▌▗▞▀▜▌▄▄▄▄   ▗▄▄▖▗▞▀▚▖ ▄▄▄  ▄
│     ▐▌   ▝▚▄▟▌▝▚▄▟▌█   █ ▐▌   ▐▛▀▀▘█   █ ▄
│      ▝▀▚▖          █   █  ▝▀▚▖▝▚▄▄▖▀▄▄▄▀ █
│     ▗▄▄▞▘                ▗▄▄▞▘           █
│
│               山水 UPLOADER
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
      message: `Prepare ${previewResult.plan.releaseCode} for ${describeTarget(target).label}?`,
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
    target,
    registerOptions,
    previewResult,
    schemaVersionId,
  )

  note(
    [
      formatField(
        'datasetCode',
        typeof uploadResult?.datasetCode === 'string'
          ? uploadResult.datasetCode
          : previewResult.plan.datasetCode,
      ),
      formatField(
        'releaseCode',
        typeof uploadResult?.releaseCode === 'string'
          ? uploadResult.releaseCode
          : previewResult.plan.releaseCode,
      ),
      formatField(
        'rawObjectKey',
        typeof uploadResult?.rawObjectKey === 'string'
          ? uploadResult.rawObjectKey
          : '-',
      ),
      formatField(
        'releaseId',
        typeof uploadResult?.releaseId === 'string' ? uploadResult.releaseId : '-',
      ),
      formatField(
        'datasetId',
        typeof uploadResult?.datasetId === 'string' ? uploadResult.datasetId : '-',
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
