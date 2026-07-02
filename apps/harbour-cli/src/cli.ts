import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  autocomplete,
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  note,
  outro,
  select,
} from '@clack/prompts'

import { prepareUpload } from '@repo/core/uploadLocal'
import { inferSourceVersionFromPath } from '@repo/core/uploadLocal'
import {
  isReleaseId,
  resolveSourceSchemaVersion,
  resourceTypes,
  resourceThemes,
} from '@repo/core'
import type { ResourceType } from '@repo/core'
import {
  describeTarget,
  formatIngestionReportTable,
  formatField,
  formatReleaseReportTable,
  formatSchemaCheck,
  formatSummary,
  formatStatsReportTable,
  formatUploadResult,
} from './lib/display.ts'
import { importD1SqlFile } from './lib/d1Import.ts'
import { prepareHkgovAlsAddressParquet } from './lib/hkgovAls.ts'
import {
  inspectDbShards,
  inspectLocalArtifact,
  inspectResourceTypes,
  inspectSampleStrategies,
  listInspectableReleaseCodes,
  normalizeInspectDbShard,
  normalizeInspectResourceType,
  normalizeInspectSampleStrategy,
  normalizeInspectStage,
  type InspectDbShard,
  type InspectResourceType,
  type InspectSampleStrategy,
  type InspectStage,
} from './lib/inspect.ts'
import { buildRegisterOptions, parseArgs, resolveUploadTarget } from './lib/options.ts'
import { checkOvertureUploadAssumptions } from './lib/overtureAssumptions.ts'
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
  scheduleSnapshotCleanup,
  scheduleStagingCleanup,
} from './lib/upload.ts'
import { watchCurrentUpload } from './lib/watch.ts'

function printUsage() {
  console.log(`  Usage:
  saanseoi upload <file> [--target local|preview|production] [--type ${resourceTypes.join('|')}] [--theme ${resourceThemes.join('|')}] [--region hk|mo] [--cohort-key VALUE] [--dry-run] [--force] [--skip-cleanup] [--yes]
  saanseoi upload:sql <file> [--target local|preview|production] [--type ${resourceTypes.join('|')}] [--theme ${resourceThemes.join('|')}] [--region hk|mo] [--cohort-key VALUE] [--dry-run] [--force] [--skip-cleanup] [--yes]
  saanseoi upload:finalize --release <release-id|release-code> [--target local|preview|production] [--skip-cleanup] [--yes]
  saanseoi upload:requeue --release <release-id|release-code> [--target local|preview|production] [--skip-cleanup] [--force] [--yes]
  saanseoi upload:watch [--target local|preview|production]
  saanseoi cleanup:snapshots [--target local|preview|production] [--type ${resourceTypes.join('|')}] [--snapshot <snapshot-id>[,<snapshot-id>...]] [--delay-seconds 30] [--dry-run] [--yes]
  saanseoi cleanup:staging --release <release-id|release-code> [--target local|preview|production] [--delay-seconds 30] [--dry-run] [--yes]
  saanseoi d1:import-sql <file.sql> --account-id VALUE --database-id VALUE [--api-token VALUE|--api-token-env ENV] [--poll-interval-ms 1000]
  saanseoi inspect [--stage normalized|resolved|operations] [--resourceType address] [--releaseCode VALUE] [--dbShard source|history|current] [--sample first|last|random] [--persist-to .local/d1/dev] [--out-dir .]
  saanseoi prep-hkgov-als <source-dir> [--target local|preview|production] [--source-version YYYY-MM-DD.NN] [--cohort-key VALUE] [--db /path/to/local.sqlite]
  saanseoi reports:ingestion [--target local|preview|production] [--limit 1-100] [--release <release-id|release-code>] [--source SOURCE] [--type TYPE]
  saanseoi reports:stats [--target local|preview|production] [--limit 1-100] [--source SOURCE] [--type TYPE]
  saanseoi reports:releases [--target local|preview|production] [--limit 1-100] [--release <release-id|release-code>] [--source SOURCE] [--type TYPE]
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
  const forceUpload = Boolean(args.options.force)
  const skipSnapshotCleanup = Boolean(args.options['skip-cleanup'])
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
      cohortKey:
        typeof args.options['cohort-key'] === 'string'
          ? args.options['cohort-key']
          : sourceVersion,
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

  if (args.command === 'inspect') {
    const inspectOptions = await resolveInspectOptions(args)
    const result = inspectLocalArtifact(inspectOptions)

    note(
      [
        formatField('outputPath', result.outputPath),
        formatField('stage', result.stage),
        formatField('resourceType', result.resourceType),
        formatField('releaseCode', result.releaseCode),
        ...(result.dbShard ? [formatField('dbShard', result.dbShard)] : []),
        formatField('sample', result.sample),
        formatField(
          'rowRange',
          result.rowStart == null
            ? '-'
            : `${String(result.rowStart)}-${String(result.rowEnd ?? '?')}`,
        ),
        formatField('sourceKeys', result.sourceKeys.join(', ')),
      ].join('\n'),
      'INSPECT RESULT',
    )
    outro('Harbour artifact inspection complete')
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

    const finalized = await finalizeExistingUpload(target, releaseSpecifier, {
      skipSnapshotCleanup,
    })

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

    const requeued = await requeueExistingUpload(target, releaseSpecifier, {
      force: Boolean(args.options.force),
      skipSnapshotCleanup,
    })

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

  if (args.command === 'upload:watch') {
    const result = await watchCurrentUpload(target)

    if (!result.hadActivity) {
      log.message('No active Harbour upload processing found.')
    }

    outro('Harbour upload watch complete')
    return
  }

  if (args.command === 'd1:import-sql') {
    const filePath = args.positionals[0]
    const accountId =
      typeof args.options['account-id'] === 'string'
        ? args.options['account-id']
        : process.env.CLOUDFLARE_ACCOUNT_ID
    const databaseId =
      typeof args.options['database-id'] === 'string'
        ? args.options['database-id']
        : undefined
    const apiTokenEnv =
      typeof args.options['api-token-env'] === 'string'
        ? args.options['api-token-env']
        : 'CLOUDFLARE_D1_TOKEN'
    const apiToken =
      typeof args.options['api-token'] === 'string'
        ? args.options['api-token']
        : process.env[apiTokenEnv]
    const pollIntervalMs = resolveOptionalPositiveInteger(
      args.options['poll-interval-ms'],
      'poll-interval-ms',
    )

    if (!filePath || !accountId || !databaseId || !apiToken) {
      printUsage()
      throw new Error(
        'Invalid arguments for `d1:import-sql`. Pass <file.sql>, --account-id, --database-id, and --api-token or --api-token-env.',
      )
    }

    if (!skipConfirm) {
      const shouldContinue = await confirm({
        message: `Import ${filePath} into D1 database ${databaseId}?`,
        initialValue: false,
      })

      if (isCancel(shouldContinue) || !shouldContinue) {
        cancel('D1 IMPORT CANCELLED')
        process.exit(1)
      }
    }

    const result = await importD1SqlFile({
      accountId,
      apiToken,
      databaseId,
      filePath,
      pollIntervalMs,
    })

    note(
      [
        formatField('file', filePath),
        formatField('databaseId', databaseId),
        formatField('bytes', String(result.bytes)),
        formatField('etag', result.etag),
        formatField('uploadedEtag', result.uploadedEtag ?? '-'),
        formatField('filename', result.filename),
        formatField('success', String(result.poll.success)),
        formatField('status', result.poll.status ?? '-'),
        formatField('error', result.poll.error ?? '-'),
      ].join('\n'),
      'D1 IMPORT RESULT',
    )
    outro('D1 SQL import complete')
    return
  }

  if (args.command === 'cleanup:snapshots') {
    const resourceType = resolveSnapshotCleanupResourceType(args.options.type)
    const snapshotIds = resolveSnapshotIds(args.options.snapshot)
    const delaySeconds = resolveDelaySeconds(args.options['delay-seconds'])

    if (!skipConfirm && !dryRun) {
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
      dryRun,
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
    return
  }

  if (args.command === 'cleanup:staging') {
    const releaseSpecifier =
      typeof args.options.release === 'string' ? args.options.release : undefined
    const delaySeconds = resolveDelaySeconds(args.options['delay-seconds'])

    if (!releaseSpecifier) {
      printUsage()
      throw new Error(
        'Missing release identifier. Pass `--release <release-id|release-code>`.',
      )
    }

    if (!skipConfirm && !dryRun) {
      const shouldContinue = await confirm({
        message: `Schedule SQL staging cleanup for ${releaseSpecifier} on ${describeTarget(target).label}?`,
        initialValue: true,
      })

      if (isCancel(shouldContinue) || !shouldContinue) {
        cancel('STAGING CLEANUP CANCELLED')
        process.exit(1)
      }
    }

    const result = await scheduleStagingCleanup(target, {
      delaySeconds,
      dryRun,
      ...(isReleaseId(releaseSpecifier)
        ? { releaseId: releaseSpecifier }
        : { releaseCode: releaseSpecifier }),
    })

    note(
      [
        formatField('status', result.status),
        formatField('dryRun', String(result.dryRun)),
        formatField('releaseCode', result.releaseCode),
        formatField('releaseId', result.releaseId),
        formatField('delaySeconds', String(result.delaySeconds)),
      ].join('\n'),
      'STAGING CLEANUP',
    )
    outro('Harbour SQL staging cleanup request complete')
    return
  }

  const isUploadCommand = args.command === 'upload' || args.command === 'upload:sql'
  const isSqlUpload = args.command === 'upload:sql'

  if (!isUploadCommand) {
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
  const sourceSchemaVersion = await resolveSourceSchemaVersion({
    source: previewResult.plan.source,
    sourceVersion: previewResult.plan.sourceVersion,
  })
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
    dryRun ? 'UPLOAD DRY RUN' : isSqlUpload ? 'SQL UPLOAD PLAN' : 'UPLOAD PLAN',
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

  let schemaVersionId: string

  if (previewResult.plan.source === 'overture') {
    try {
      schemaVersionId = validateOvertureSchema(
        previewResult.plan,
        previewResult.inspection,
      ).schema.id
      log.message(formatSchemaCheck('passed'))
    } catch (error) {
      log.message(formatSchemaCheck('failed'))
      throw error
    }
  } else {
    schemaVersionId = `${previewResult.plan.source}-${previewResult.plan.type}-unvalidated`
    log.message(formatSchemaCheck('skipped'))
  }

  const uploadResult = await dispatchUpload(
    target,
    registerOptions,
    previewResult,
    schemaVersionId,
    {
      force: forceUpload,
      processingMode: isSqlUpload ? 'sql' : undefined,
      skipSnapshotCleanup,
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

function resolveSnapshotCleanupResourceType(
  value: string | boolean | undefined,
): ResourceType | undefined {
  if (value === undefined || value === false) {
    return undefined
  }

  if (
    typeof value === 'string' &&
    (resourceTypes as readonly string[]).includes(value)
  ) {
    return value as ResourceType
  }

  throw new Error(
    `Unsupported snapshot cleanup type: ${String(value)}. Use division, address, street, or place.`,
  )
}

function resolveSnapshotIds(value: string | boolean | undefined) {
  if (typeof value !== 'string') {
    return undefined
  }

  const snapshotIds = value
    .split(',')
    .map(snapshotId => snapshotId.trim())
    .filter(Boolean)

  if (snapshotIds.length === 0) {
    throw new Error('Invalid --snapshot value. Expected one or more snapshot IDs.')
  }

  return snapshotIds
}

function resolveDelaySeconds(value: string | boolean | undefined) {
  if (value === undefined || value === false) {
    return undefined
  }

  if (typeof value !== 'string') {
    throw new Error('Invalid --delay-seconds value.')
  }

  if (!/^\d+$/.test(value)) {
    throw new Error('Invalid --delay-seconds value. Expected a non-negative integer.')
  }

  const delaySeconds = Number(value)

  if (!Number.isInteger(delaySeconds) || delaySeconds < 0) {
    throw new Error('Invalid --delay-seconds value. Expected a non-negative integer.')
  }

  return delaySeconds
}

function resolveOptionalPositiveInteger(
  value: string | boolean | undefined,
  name: string,
) {
  if (value === undefined || value === false) {
    return undefined
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(`Invalid --${name} value. Expected a positive integer.`)
  }

  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid --${name} value. Expected a positive integer.`)
  }

  return parsed
}

async function resolveInspectOptions(args: ReturnType<typeof parseArgs>) {
  const persistDir = getStringOption(args, ['persist-to']) ?? '.local/d1/dev'
  const outDir = getStringOption(args, ['out-dir']) ?? '.'
  const stage =
    resolveProvidedInspectStage(args) ??
    (await promptSelect<InspectStage>('Stage', [
      {
        label: 'JSON Normalised',
        value: 'normalized',
      },
      {
        label: 'Resolved JSON',
        value: 'resolved',
      },
      {
        label: 'Operations SQL',
        value: 'operations',
      },
    ]))
  const resourceType =
    resolveProvidedInspectResourceType(args) ??
    (await promptSelect<InspectResourceType>(
      'Resource type',
      inspectResourceTypes.map(value => ({
        label: value,
        value,
      })),
    ))
  const releaseCode =
    getStringOption(args, ['releaseCode', 'release-code', 'release']) ??
    (await promptReleaseCode({
      persistDir,
      resourceType,
      stage,
    }))
  const dbShard =
    stage === 'operations'
      ? (resolveProvidedInspectDbShard(args) ??
        (await promptSelect<InspectDbShard>(
          'DB family',
          inspectDbShards.map(value => ({
            label: value,
            value,
          })),
        )))
      : undefined
  const sample =
    resolveProvidedInspectSampleStrategy(args) ??
    (await promptSelect<InspectSampleStrategy>(
      'Sample strategy',
      inspectSampleStrategies.map(value => ({
        label: value,
        value,
      })),
    ))

  return {
    dbShard,
    outDir,
    persistDir,
    releaseCode,
    resourceType,
    sample,
    stage,
  }
}

function resolveProvidedInspectStage(args: ReturnType<typeof parseArgs>) {
  const rawValue = getStringOption(args, ['stage'])

  if (!rawValue) {
    return null
  }

  const stage = normalizeInspectStage(rawValue)

  if (!stage) {
    throw new Error(
      `Invalid --stage value: ${rawValue}. Use normalized, resolved, or operations.`,
    )
  }

  return stage
}

function resolveProvidedInspectResourceType(args: ReturnType<typeof parseArgs>) {
  const rawValue = getStringOption(args, ['resourceType', 'resource-type'])

  if (!rawValue) {
    return null
  }

  const resourceType = normalizeInspectResourceType(rawValue)

  if (!resourceType) {
    throw new Error(`Invalid --resourceType value: ${rawValue}. Use address.`)
  }

  return resourceType
}

function resolveProvidedInspectDbShard(args: ReturnType<typeof parseArgs>) {
  const rawValue = getStringOption(args, ['dbShard', 'db-shard'])

  if (!rawValue) {
    return null
  }

  const dbShard = normalizeInspectDbShard(rawValue)

  if (!dbShard) {
    throw new Error(
      `Invalid --dbShard value: ${rawValue}. Use source, history, or current.`,
    )
  }

  return dbShard
}

function resolveProvidedInspectSampleStrategy(args: ReturnType<typeof parseArgs>) {
  const rawValue = getStringOption(args, ['sample'])

  if (!rawValue) {
    return null
  }

  const sample = normalizeInspectSampleStrategy(rawValue)

  if (!sample) {
    throw new Error(`Invalid --sample value: ${rawValue}. Use first, last, or random.`)
  }

  return sample
}

async function promptReleaseCode(options: {
  persistDir: string
  resourceType: InspectResourceType
  stage: InspectStage
}) {
  const releaseCodes = listInspectableReleaseCodes(options)

  if (releaseCodes.length === 0) {
    throw new Error(
      `No local ${options.stage} artifacts found for ${options.resourceType}.`,
    )
  }

  const value = await autocomplete({
    initialValue: releaseCodes[0],
    maxItems: 10,
    message: 'Release code',
    options: releaseCodes.map(releaseCode => ({
      label: releaseCode,
      value: releaseCode,
    })),
  })

  if (isCancel(value)) {
    cancel('INSPECT CANCELLED')
    process.exit(1)
  }

  return value
}

async function promptSelect<T extends string>(
  message: string,
  options: Array<{ label: string; value: T }>,
) {
  const value = await select<T>({
    message,
    options: options as Parameters<typeof select<T>>[0]['options'],
  })

  if (isCancel(value)) {
    cancel('INSPECT CANCELLED')
    process.exit(1)
  }

  return value
}

function getStringOption(
  args: ReturnType<typeof parseArgs>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = args.options[key]

    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return undefined
}

main().catch(error => {
  cancel(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
