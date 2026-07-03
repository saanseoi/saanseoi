import { cancel, confirm, intro, isCancel, log, note, outro } from '@clack/prompts'

import {
  resolveLatestPublishedSnapshotForResourceTypeRegion,
  resolvePublishedSnapshotForResourceTypeRegionCohortKey,
} from '@repo/core/db/metaRepository'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { resolveSourceSchemaVersion } from '@repo/core'
import { prepareUpload } from '@repo/core/uploadLocal'

import { resolveLocalAddressDbContext } from '../addressSql/localDbCache.ts'
import {
  describeTarget,
  formatMutedValue,
  formatSchemaCheck,
  formatSummary,
  formatUploadResult,
} from '../display.ts'
import { processLocalAddressSqlUpload } from '../addressSql/processLocalAddressSqlUpload.ts'
import { processLocalDivisionSqlUpload } from '../divisionSql/processLocalDivisionSqlUpload.ts'
import { buildRegisterOptions, type ParsedArgs, type UploadTarget } from '../options.ts'
import { checkOvertureUploadAssumptions } from '../overtureAssumptions.ts'
import { prepareUploadFileForDispatch } from '../parquetRepack.ts'
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
  const inputFile = args.positionals[0]
  const commandStartedAt = Date.now()
  const mutedBar = '\u001B[90m│\u001B[39m'

  if (args.options.verbose) {
    process.env.HARBOUR_VERBOSE = '1'
    process.env.SAANSEOI_VERBOSE = '1'
  }

  if (!inputFile) {
    options.printUsage()
    throw new Error('Missing file path.')
  }

  intro(`
${mutedBar}
${mutedBar}      ▗▄▄▖▗▞▀▜▌▗▞▀▜▌▄▄▄▄   ▗▄▄▖▗▞▀▚▖ ▄▄▄  ▄
${mutedBar}     ▐▌   ▝▚▄▟▌▝▚▄▟▌█   █ ▐▌   ▐▛▀▀▘█   █ ▄
${mutedBar}      ▝▀▚▖          █   █  ▝▀▚▖▝▚▄▄▖▀▄▄▄▀ █
${mutedBar}     ▗▄▄▞▘                ▗▄▄▞▘           █
${mutedBar}
${mutedBar}               山水 UPLOADER
${mutedBar}  `)

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
    options.dryRun ? 'UPLOAD DRY RUN' : 'UPLOAD PLAN',
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
  const processingStrategy = resolveUploadProcessingStrategy(previewResult)

  if (processingStrategy.mode === 'local-address-sql') {
    await assertAddressUploadPrerequisites(target, previewResult.plan)
  }

  const preparedUploadFile = await prepareUploadFileForDispatch(
    registerOptions.filePath,
    previewResult,
  )

  try {
    const uploadResult = await dispatchUpload(
      target,
      registerOptions,
      previewResult,
      schemaVersionId,
      {
        force: options.forceUpload,
        skipSnapshotCleanup: options.skipSnapshotCleanup,
        uploadFilePath: preparedUploadFile?.filePath,
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
        status:
          typeof uploadResult?.status === 'string' ? uploadResult.status : 'staged',
      }).join('\n'),
      'UPLOAD RESULT',
    )

    if (processingStrategy.mode === 'local-address-sql') {
      if (
        previewResult.plan.type !== 'address' ||
        previewResult.plan.theme !== 'addresses'
      ) {
        throw new Error('Local address SQL processing requires an address dataset.')
      }

      if (!preparedUploadFile) {
        throw new Error('Expected a prepared upload file for local SQL processing.')
      }

      await processLocalAddressSqlUpload(
        target,
        {
          cohortKey: previewResult.plan.cohortKey,
          regionCode: previewResult.plan.regionCode,
          releaseCode: previewResult.plan.releaseCode,
          rowCount: previewResult.plan.rowCount,
          source: previewResult.plan.source,
          sourceVersion: previewResult.plan.sourceVersion,
          theme: previewResult.plan.theme,
          type: previewResult.plan.type,
        },
        uploadResult,
        preparedUploadFile,
        {
          skipSnapshotCleanup: options.skipSnapshotCleanup,
        },
      )

      outro(formatSuccessfulReleaseMessage(commandStartedAt))
      return
    }

    if (processingStrategy.mode === 'local-division-sql') {
      if (
        previewResult.plan.type !== 'division' ||
        previewResult.plan.theme !== 'divisions'
      ) {
        throw new Error('Local division SQL processing requires a division dataset.')
      }

      if (!preparedUploadFile) {
        throw new Error('Expected a prepared upload file for local SQL processing.')
      }

      await processLocalDivisionSqlUpload(
        target,
        {
          cohortKey: previewResult.plan.cohortKey,
          regionCode: previewResult.plan.regionCode,
          releaseCode: previewResult.plan.releaseCode,
          rowCount: previewResult.plan.rowCount,
          source: previewResult.plan.source as 'overture',
          sourceVersion: previewResult.plan.sourceVersion,
          theme: previewResult.plan.theme,
          type: previewResult.plan.type,
        },
        uploadResult,
        preparedUploadFile,
        {
          skipSnapshotCleanup: options.skipSnapshotCleanup,
        },
      )

      outro(formatSuccessfulReleaseMessage(commandStartedAt))
      return
    }

    throw new Error(
      `No local SQL upload processor is available for ${previewResult.plan.source}/${previewResult.plan.type}.`,
    )
  } finally {
    await preparedUploadFile?.cleanup()
  }
}

function resolveUploadProcessingStrategy(
  previewResult: Awaited<ReturnType<typeof prepareUpload>>,
) {
  if (
    previewResult.plan.type === 'address' &&
    previewResult.plan.theme === 'addresses'
  ) {
    return {
      mode: 'local-address-sql' as const,
    }
  }

  if (
    previewResult.plan.type === 'division' &&
    previewResult.plan.theme === 'divisions' &&
    previewResult.plan.source === 'overture'
  ) {
    return {
      mode: 'local-division-sql' as const,
    }
  }

  throw new Error(
    `Unsupported upload type for local SQL processing: ${previewResult.plan.source}/${previewResult.plan.type}.`,
  )
}

function formatSuccessfulReleaseMessage(startedAt: number) {
  return `✔ ${blueText('Release successful')} ${formatMutedValue(`(${formatElapsedDuration(Date.now() - startedAt)})`)}`
}

function formatElapsedDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} hr`
  }

  return `${minutes}:${String(seconds).padStart(2, '0')} min`
}

function blueText(value: string) {
  return `\u001B[34m${value}\u001B[39m`
}

function resolveShardYear(cohortKey: string, sourceVersion: string) {
  const cohortYear = cohortKey.slice(0, 4)

  if (/^\d{4}$/.test(cohortYear)) {
    return cohortYear
  }

  return sourceVersion.slice(0, 4)
}

export async function assertAddressUploadPrerequisites(
  target: UploadTarget,
  plan: Awaited<ReturnType<typeof prepareUpload>>['plan'],
) {
  if (plan.type !== 'address' || plan.theme !== 'addresses') {
    return
  }

  const shardYear = resolveShardYear(plan.cohortKey, plan.sourceVersion)
  const dbContext = await resolveLocalAddressDbContext(
    target,
    plan.regionCode,
    shardYear,
    {
      refreshRemoteTables: target.remote,
    },
  )

  try {
    const metaReadDb = dbContext.metaDb as unknown as HarbourReadableDb
    const cohortSnapshot = await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
      metaReadDb,
      'division',
      plan.regionCode,
      plan.cohortKey,
    )
    const regionSnapshot =
      cohortSnapshot ??
      (await resolveLatestPublishedSnapshotForResourceTypeRegion(
        metaReadDb,
        'division',
        plan.regionCode,
      ))

    if (regionSnapshot) {
      return
    }
  } finally {
    dbContext.cleanup()
  }

  throw new Error(
    [
      `Address uploads require a published division snapshot for region ${plan.regionCode.toUpperCase()}.`,
      `No published division snapshot was found for cohort ${plan.cohortKey}.`,
      'Upload the division release(s) first, then rerun the address upload.',
    ].join(' '),
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
