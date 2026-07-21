import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  note,
  outro,
  spinner,
} from '@clack/prompts'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import type { HarbourReadableDb } from '@repo/core/db/types'
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import { resolveSourceSchemaVersion } from '@repo/core'
import { prepareUpload } from '@repo/core/uploadLocal'
import { metaSchema } from '@repo/db'
import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm'

import { resolveLocalAddressDbContext } from '../addressSql/localDbCache.ts'
import {
  HKGOV_CENSTATD_SIMPLIFIED_TRANSFORM,
  prepareHkgovCenstatdDistrictUpload,
} from '../hkgovCenstatd.ts'
import { prepareHkgovHadDistrictUpload } from '../hkgovHad.ts'
import {
  describeTarget,
  formatMutedValue,
  formatSchemaCheck,
  formatSummary,
  formatUploadResult,
} from '../display.ts'
import { processLocalAddressSqlUpload } from '../addressSql/processLocalAddressSqlUpload.ts'
import { processLocalDivisionSqlUpload } from '../divisionSql/processLocalDivisionSqlUpload.ts'
import { processLocalHkgovPlandDivisionSqlUpload } from '../divisionSql/processLocalHkgovPlandDivisionSqlUpload.ts'
import { processLocalDivisionGeometrySqlUpload } from '../divisionSql/processLocalDivisionGeometrySqlUpload.ts'
import { buildRegisterOptions, type ParsedArgs, type UploadTarget } from '../options.ts'
import { checkOvertureUploadAssumptions } from '../overtureAssumptions.ts'
import { prepareUploadFileForDispatch } from '../parquetRepack.ts'
import { resolveReleaseNotesUrl } from '../releaseNotes.ts'
import { validateOvertureSchema } from '../schema/overture.ts'
import { dispatchUpload } from '../upload.ts'
import { formatDurationMs } from '../localPipeline/progressFormatting.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const HARBOUR_API_WRANGLER_CONFIG = resolve(
  REPO_ROOT,
  'apps/harbour-api/wrangler.jsonc',
)

export async function runUploadCommand(
  args: ParsedArgs,
  target: UploadTarget,
  options: {
    dryRun: boolean
    forceUpload: boolean
    invocationCwd: string
    printUsage: () => void
    processingActions?: ReleaseProcessingAction[]
    skipConfirm: boolean
    skipSnapshotCleanup: boolean
    validateGeometry: boolean
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

  let sourcePreparationCleanup: (() => Promise<void>) | undefined
  let divisionGeometryTransform: 'simplified' | undefined
  try {
    const registerOptions = buildRegisterOptions(options.invocationCwd, inputFile, args)
    const hkgovHadPreparation = await prepareHkgovHadGeoJsonUpload(
      registerOptions.filePath,
      registerOptions.source,
      registerOptions.sourceVersion,
    )
    if (hkgovHadPreparation) {
      sourcePreparationCleanup = hkgovHadPreparation.cleanup
      Object.assign(registerOptions, {
        filePath: hkgovHadPreparation.filePath,
        originalFileName: hkgovHadPreparation.originalFileName,
        regionCode: registerOptions.regionCode ?? hkgovHadPreparation.regionCode,
        source: registerOptions.source ?? hkgovHadPreparation.source,
        sourceVersion:
          registerOptions.sourceVersion ?? hkgovHadPreparation.sourceVersion,
        theme: registerOptions.theme ?? hkgovHadPreparation.theme,
        type: registerOptions.type ?? hkgovHadPreparation.type,
      })
      log.message('Prepared Home Affairs Department District Boundary GeoJSON.')
    }
    const hkgovCenstatdPreparation = await prepareHkgovCenstatdGmlUpload(
      registerOptions.filePath,
      registerOptions.source,
      registerOptions.sourceVersion,
      typeof args.options.transform === 'string' ? args.options.transform : undefined,
    )
    if (hkgovCenstatdPreparation) {
      sourcePreparationCleanup = hkgovCenstatdPreparation.cleanup
      divisionGeometryTransform = hkgovCenstatdPreparation.transform
      Object.assign(registerOptions, {
        filePath: hkgovCenstatdPreparation.filePath,
        originalFileName: hkgovCenstatdPreparation.originalFileName,
        regionCode: registerOptions.regionCode ?? hkgovCenstatdPreparation.regionCode,
        source: hkgovCenstatdPreparation.source,
        sourceVersion: hkgovCenstatdPreparation.sourceVersion,
        theme: registerOptions.theme ?? hkgovCenstatdPreparation.theme,
        type: registerOptions.type ?? hkgovCenstatdPreparation.type,
      })
      log.message(
        hkgovCenstatdPreparation.transform === HKGOV_CENSTATD_SIMPLIFIED_TRANSFORM
          ? 'Prepared simplified, land-clipped C&SD display geometry.'
          : 'Prepared Census and Statistics Department District Council GML.',
      )
      if (!hkgovCenstatdPreparation.transform) {
        log.message(
          'This upload will also publish the derived simplified C&SD display geometry.',
        )
      }
    }
    let previewResult = await prepareUpload(registerOptions)
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

    const releaseNotesUrl = await resolveReleaseNotesUrl(previewResult.plan, {
      explicitUrl: registerOptions.releaseNotesUrl,
      skipPrompt: options.skipConfirm,
    })
    registerOptions.releaseNotesUrl = releaseNotesUrl
    registerOptions.inspection = previewResult.inspection
    previewResult = await prepareUpload(registerOptions)

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

    if (
      processingStrategy.mode === 'local-address-sql' ||
      processingStrategy.mode === 'local-division-geometry-sql'
    ) {
      const prerequisiteSpinner = spinner()
      prerequisiteSpinner.start('Prerequisites')

      try {
        if (processingStrategy.mode === 'local-address-sql') {
          await assertAddressUploadPrerequisites(target, previewResult.plan)
        } else {
          await assertDivisionGeometryUploadPrerequisites(target, previewResult.plan)
        }
        prerequisiteSpinner.stop(`${greenText('✓')} Prerequisites`)
      } catch (error) {
        prerequisiteSpinner.error('Prerequisites')
        throw error
      }
    }

    let preparedUploadFile: Awaited<ReturnType<typeof prepareUploadFileForDispatch>>

    preparedUploadFile = await prepareUploadFileForDispatch(
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

        const processingResult = await processLocalAddressSqlUpload(
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
            processingActions: options.processingActions,
            skipSnapshotCleanup: options.skipSnapshotCleanup,
          },
        )

        const releaseSetReadiness = await resolveAddressApiReleaseSetReadiness(
          target,
          previewResult.plan,
        )
        note(
          formatAddressApiReleaseSetReadiness(
            previewResult.plan,
            processingResult.publishResult?.apiReleaseSetStatus === 'current',
            processingResult.publishResult?.apiReleaseSetCode,
            releaseSetReadiness.divisionCohortKey,
          ),
          'API DOMAIN RELEASE',
        )
        logApiReleaseSetPublication(processingResult.publishResult)
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

        const processingResult = await processLocalDivisionSqlUpload(
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

        const releaseSetReadiness = await resolveDivisionApiReleaseSetReadiness(
          target,
          previewResult.plan,
        )
        note(
          formatDivisionApiReleaseSetReadiness(previewResult.plan, releaseSetReadiness),
          'API DOMAIN RELEASE',
        )
        logApiReleaseSetPublication(processingResult.publishResult)
        outro(formatSuccessfulReleaseMessage(commandStartedAt))
        return
      }

      if (processingStrategy.mode === 'local-hkgov-pland-division-sql') {
        if (!preparedUploadFile) {
          throw new Error('Expected a prepared upload file for local SQL processing.')
        }
        const processingResult = await processLocalHkgovPlandDivisionSqlUpload(
          target,
          {
            cohortKey: previewResult.plan.cohortKey,
            regionCode: previewResult.plan.regionCode,
            releaseCode: previewResult.plan.releaseCode,
            rowCount: previewResult.plan.rowCount,
            source: previewResult.plan.source as
              | 'hkgov-pland-pu'
              | 'hkgov-pland-new-town',
            sourceVersion: previewResult.plan.sourceVersion,
            theme: 'divisions',
            type: 'division',
          },
          uploadResult,
          preparedUploadFile,
          { skipSnapshotCleanup: options.skipSnapshotCleanup },
        )
        const releaseSetReadiness = await resolveDivisionApiReleaseSetReadiness(
          target,
          withReleaseSetCohort(
            previewResult.plan,
            processingResult.publishResult?.apiReleaseSetCode,
          ),
        )
        note(
          formatDivisionApiReleaseSetReadiness(previewResult.plan, releaseSetReadiness),
          'API DOMAIN RELEASE',
        )
        logApiReleaseSetPublication(processingResult.publishResult ?? undefined)
        outro(formatSuccessfulReleaseMessage(commandStartedAt))
        return
      }

      if (processingStrategy.mode === 'local-division-geometry-sql') {
        if (
          (previewResult.plan.type !== 'divisionArea' &&
            previewResult.plan.type !== 'divisionBoundary') ||
          previewResult.plan.theme !== 'divisions' ||
          (previewResult.plan.source !== 'overture' &&
            previewResult.plan.source !== 'hkgov-had' &&
            previewResult.plan.source !== 'hkgov-censtatd' &&
            previewResult.plan.source !== 'hkgov-pland-pu' &&
            previewResult.plan.source !== 'hkgov-pland-new-town')
        ) {
          throw new Error(
            'Local division geometry SQL processing requires an Overture, Home Affairs Department, Census and Statistics Department, Planning Unit, or New Town divisionArea or divisionBoundary dataset.',
          )
        }

        if (!preparedUploadFile) {
          throw new Error('Expected a prepared upload file for local SQL processing.')
        }

        const processingResult = await processLocalDivisionGeometrySqlUpload(
          target,
          {
            cohortKey: previewResult.plan.cohortKey,
            regionCode: previewResult.plan.regionCode,
            releaseCode: previewResult.plan.releaseCode,
            rowCount: previewResult.plan.rowCount,
            source: previewResult.plan.source,
            sourceVersion: previewResult.plan.sourceVersion,
            transform: divisionGeometryTransform,
            theme: 'divisions',
            type: previewResult.plan.type,
          },
          uploadResult,
          preparedUploadFile,
          {
            deferPublish: Boolean(hkgovCenstatdPreparation?.displayFilePath),
            skipSnapshotCleanup: options.skipSnapshotCleanup,
            validateGeometry: options.validateGeometry,
          },
        )
        const companionProcessingResult = hkgovCenstatdPreparation?.displayFilePath
          ? await processLocalDivisionGeometrySqlUpload(
              target,
              {
                cohortKey: previewResult.plan.cohortKey,
                regionCode: previewResult.plan.regionCode,
                releaseCode: previewResult.plan.releaseCode,
                rowCount: previewResult.plan.rowCount,
                source: 'hkgov-censtatd',
                sourceVersion: previewResult.plan.sourceVersion,
                transform: HKGOV_CENSTATD_SIMPLIFIED_TRANSFORM,
                theme: 'divisions',
                type: 'divisionArea',
              },
              uploadResult,
              preparedUploadFile,
              {
                inputFilePath: hkgovCenstatdPreparation.displayFilePath,
                skipRawSeed: true,
                skipSnapshotCleanup: options.skipSnapshotCleanup,
                validateGeometry: options.validateGeometry,
              },
            )
          : undefined

        const releaseSetReadiness = await resolveDivisionApiReleaseSetReadiness(
          target,
          withReleaseSetCohort(
            previewResult.plan,
            (companionProcessingResult ?? processingResult).publishResult
              ?.apiReleaseSetCode,
          ),
        )
        note(
          formatDivisionApiReleaseSetReadiness(
            withReleaseSetCohort(
              previewResult.plan,
              (companionProcessingResult ?? processingResult).publishResult
                ?.apiReleaseSetCode,
            ),
            releaseSetReadiness,
          ),
          'API DOMAIN RELEASE',
        )
        logApiReleaseSetPublication(
          (companionProcessingResult ?? processingResult).publishResult,
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
  } finally {
    await sourcePreparationCleanup?.()
  }
}

async function prepareHkgovHadGeoJsonUpload(
  filePath: string,
  source: string | undefined,
  sourceVersion: string | undefined,
) {
  if (!isHkgovHadGeoJson(filePath, source)) {
    return null
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-had-'))
  try {
    const prepared = await prepareHkgovHadDistrictUpload(
      filePath,
      tempDir,
      sourceVersion ?? '2022',
    )
    return {
      ...prepared,
      cleanup: async () => {
        await prepared.cleanup()
        await rm(tempDir, { force: true, recursive: true })
      },
    }
  } catch (error) {
    await rm(tempDir, { force: true, recursive: true })
    throw error
  }
}

async function prepareHkgovCenstatdGmlUpload(
  filePath: string,
  source: string | undefined,
  sourceVersion: string | undefined,
  transform: string | undefined,
) {
  if (!isHkgovCenstatdDistrictFile(filePath, source)) return null

  const inputSourceVersion = sourceVersion ?? inferCenstatdSourceVersion(filePath)
  if (inputSourceVersion !== '2016' && inputSourceVersion !== '2021') {
    throw new Error('C&SD District Council GML requires --source-version 2016 or 2021.')
  }
  if (transform) {
    throw new Error(
      'C&SD display geometry is derived during its exact source upload; omit --transform.',
    )
  }
  const tempDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-censtatd-'))
  try {
    const prepared = await prepareHkgovCenstatdDistrictUpload(
      filePath,
      tempDir,
      inputSourceVersion,
      undefined,
    )
    const displayPrepared = await prepareHkgovCenstatdDistrictUpload(
      filePath,
      tempDir,
      inputSourceVersion,
      { transform: HKGOV_CENSTATD_SIMPLIFIED_TRANSFORM },
    )
    return {
      ...prepared,
      displayFilePath: displayPrepared?.filePath,
      cleanup: async () => {
        await prepared.cleanup()
        await displayPrepared?.cleanup()
        await rm(tempDir, { force: true, recursive: true })
      },
    }
  } catch (error) {
    await rm(tempDir, { force: true, recursive: true })
    throw error
  }
}

function isHkgovHadGeoJson(filePath: string, source: string | undefined) {
  return (
    filePath.toLowerCase().endsWith('.geojson') &&
    (source === 'hkgov-had' || /(^|[._/\\-])hkgov-had([._/\\-]|$)/i.test(filePath))
  )
}

function isHkgovCenstatdDistrictFile(filePath: string, source: string | undefined) {
  const fileName = filePath.toLowerCase()
  return (
    (fileName.endsWith('.gml') || fileName.endsWith('.xml')) &&
    source === 'hkgov-censtatd'
  )
}

function inferCenstatdSourceVersion(filePath: string) {
  return filePath.match(/(?:^|[^0-9])(2016|2021)(?:[^0-9]|$)/)?.[1]
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
    (previewResult.plan.source === 'hkgov-pland-pu' ||
      previewResult.plan.source === 'hkgov-pland-new-town')
  ) {
    return { mode: 'local-hkgov-pland-division-sql' as const }
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

  if (
    (previewResult.plan.type === 'divisionArea' ||
      previewResult.plan.type === 'divisionBoundary') &&
    previewResult.plan.theme === 'divisions' &&
    (previewResult.plan.source === 'overture' ||
      previewResult.plan.source === 'hkgov-had' ||
      previewResult.plan.source === 'hkgov-censtatd' ||
      previewResult.plan.source === 'hkgov-pland-pu' ||
      previewResult.plan.source === 'hkgov-pland-new-town')
  ) {
    return {
      mode: 'local-division-geometry-sql' as const,
    }
  }

  throw new Error(
    `Unsupported upload type for local SQL processing: ${previewResult.plan.source}/${previewResult.plan.type}.`,
  )
}

function formatSuccessfulReleaseMessage(startedAt: number) {
  const elapsed = formatDurationMs(Date.now() - startedAt) ?? '0 ms'
  return `✔ ${blueText('Release successful')} ${formatMutedValue(`(${elapsed})`)}`
}

function blueText(value: string) {
  return `\u001B[34m${value}\u001B[39m`
}

function greenText(value: string) {
  return `\u001B[32m${value}\u001B[39m`
}

function yellowText(value: string) {
  return `\u001B[33m${value}\u001B[39m`
}

function orangeText(value: string) {
  return `\u001B[38;5;208m${value}\u001B[39m`
}

function mutedText(value: string) {
  return `\u001B[90m${value}\u001B[39m`
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
  options: {
    resolveRemotePublishedDivisionSnapshot?: (
      target: UploadTarget,
      plan: Awaited<ReturnType<typeof prepareUpload>>['plan'],
    ) => Promise<unknown>
  } = {},
) {
  if (plan.type !== 'address' || plan.theme !== 'addresses') {
    return
  }

  if (target.remote) {
    const snapshot = await (
      options.resolveRemotePublishedDivisionSnapshot ??
      resolveRemotePublishedDivisionSnapshotForAddressPlan
    )(target, plan)

    if (snapshot) {
      return
    }

    throw new Error(
      [
        `Address uploads require a published division snapshot for region ${plan.regionCode.toUpperCase()}.`,
        `No published division snapshot was found for the ${plan.sourceVersion.slice(0, 4)} address shard.`,
        'Upload the division release(s) first, then rerun the address upload.',
      ].join(' '),
    )
  }

  const shardYear = resolveShardYear(plan.cohortKey, plan.sourceVersion)
  const dbContext = await resolveLocalAddressDbContext(
    target,
    plan.regionCode,
    shardYear,
    { cacheTableProfile: 'division' },
  )

  try {
    const metaReadDb = dbContext.metaDb as unknown as HarbourReadableDb
    const cohortSnapshot = await metaReadDb
      .select({ id: metaSchema.metaSnapshots.id })
      .from(metaSchema.metaSnapshots)
      .innerJoin(
        metaSchema.metaSnapshotLineages,
        eq(
          metaSchema.metaSnapshots.snapshotLineageId,
          metaSchema.metaSnapshotLineages.id,
        ),
      )
      .where(
        and(
          eq(metaSchema.metaSnapshots.resourceType, 'division'),
          eq(metaSchema.metaSnapshots.status, 'published'),
          sql`${metaSchema.metaSnapshots.cohortKey} LIKE ${`${plan.sourceVersion.slice(0, 4)}-%`}`,
          eq(metaSchema.metaSnapshotLineages.regionCode, plan.regionCode),
          eq(metaSchema.metaSnapshotLineages.variant, 'overture'),
        ),
      )
      .limit(1)
      .get()

    if (cohortSnapshot) {
      return
    }
  } finally {
    dbContext.cleanup()
  }

  throw new Error(
    [
      `Address uploads require a published division snapshot for region ${plan.regionCode.toUpperCase()}.`,
      `No published division snapshot was found for the ${plan.sourceVersion.slice(0, 4)} address shard.`,
      'Upload the division release(s) first, then rerun the address upload.',
    ].join(' '),
  )
}

type DivisionGeometryPlan = Awaited<ReturnType<typeof prepareUpload>>['plan']

type AddressPlan = Awaited<ReturnType<typeof prepareUpload>>['plan']

type AddressReleaseSetReadiness = {
  divisionCohortKey: string | null
}

type CohortIndependentReleaseDefinition = {
  cohortKey?: string
  datasetCode: string
  domainCode: string
  optional: boolean
  resourceType: string
}

const COHORT_INDEPENDENT_DIVISION_RELEASE_DATASETS: readonly CohortIndependentReleaseDefinition[] =
  [
    {
      datasetCode: 'ds-hk-hkgov-had-division-area-district',
      domainCode: 'hkgov-had',
      optional: false,
      resourceType: 'divisionArea',
    },
    {
      cohortKey: '2016',
      datasetCode: 'ds-hk-hkgov-censtatd-division-area-district',
      domainCode: 'hkgov-censtatd',
      optional: false,
      resourceType: 'divisionArea',
    },
    {
      cohortKey: '2021',
      datasetCode: 'ds-hk-hkgov-censtatd-division-area-district',
      domainCode: 'hkgov-censtatd',
      optional: false,
      resourceType: 'divisionArea',
    },
  ]

type CohortIndependentReleaseReadiness = {
  cohortKey: string | null
  datasetCode: string
  domainCode: string
  optional: boolean
  releaseCode: string | null
  resourceType: string
}

type DivisionReleaseSetReadiness = {
  areaAvailable: boolean
  boundaryAvailable: boolean
  cohortIndependentReleases: CohortIndependentReleaseReadiness[]
  divisionAvailable: boolean
  ready: boolean
}

export async function assertDivisionGeometryUploadPrerequisites(
  target: UploadTarget,
  plan: DivisionGeometryPlan,
  options: {
    resolveRemotePublishedDivisionSnapshot?: (
      target: UploadTarget,
      plan: DivisionGeometryPlan,
    ) => Promise<unknown>
  } = {},
) {
  if (
    (plan.type !== 'divisionArea' && plan.type !== 'divisionBoundary') ||
    plan.theme !== 'divisions'
  ) {
    return
  }

  // HAD and C&SD district areas are independently bridged to canonical divisions.
  if (plan.source === 'hkgov-had' || plan.source === 'hkgov-censtatd') {
    return
  }

  const snapshot = target.remote
    ? await (
        options.resolveRemotePublishedDivisionSnapshot ??
        resolveRemotePublishedSnapshotForGeometryPlan
      )(target, plan)
    : await resolveLocalPublishedDivisionSnapshotForGeometryPlan(target, plan)

  if (snapshot) return

  throw new Error(
    [
      `${plan.type} uploads require a published division snapshot for region ${plan.regionCode.toUpperCase()}.`,
      `No published division snapshot was found for the ${plan.sourceVersion.slice(0, 4)} address shard.`,
      'Upload the division release first, then rerun this upload.',
    ].join(' '),
  )
}

export async function resolveDivisionApiReleaseSetReadiness(
  target: UploadTarget,
  plan: DivisionGeometryPlan,
): Promise<DivisionReleaseSetReadiness> {
  const snapshots = target.remote
    ? await resolveRemoteDivisionReleaseSetSnapshots(target, plan)
    : await resolveLocalDivisionReleaseSetSnapshots(target, plan)
  const domainCode = resolveDivisionDomainCode(plan.source)
  const cohortIndependentReleases =
    domainCode === 'overture'
      ? target.remote
        ? await resolveRemoteCohortIndependentDivisionReleases(target, plan)
        : await resolveLocalCohortIndependentDivisionReleases(target, plan)
      : []
  const divisionAvailable = snapshots.division
  const areaAvailable = snapshots.divisionArea
  const cohortIndependentRequirementsAvailable = cohortIndependentReleases.every(
    release => release.optional || release.releaseCode !== null,
  )
  const boundaryAvailable = snapshots.divisionBoundary
  const ready =
    domainCode === 'overture'
      ? divisionAvailable &&
        areaAvailable &&
        cohortIndependentRequirementsAvailable &&
        boundaryAvailable
      : divisionAvailable && areaAvailable

  return {
    areaAvailable,
    boundaryAvailable,
    cohortIndependentReleases,
    divisionAvailable,
    ready,
  }
}

export function formatDivisionApiReleaseSetReadiness(
  plan: Pick<DivisionGeometryPlan, 'cohortKey' | 'regionCode'> &
    Partial<Pick<DivisionGeometryPlan, 'source'>>,
  readiness: DivisionReleaseSetReadiness,
) {
  const rows = [
    ['division', readiness.divisionAvailable],
    ['divisionArea', readiness.areaAvailable],
    ...(resolveDivisionDomainCode(plan.source) === 'overture'
      ? ([['divisionBoundary', readiness.boundaryAvailable]] as const)
      : []),
  ] as const
  const width = Math.max(...rows.map(([dataset]) => dataset.length))

  return [
    '# EXACT REF',
    `${plan.regionCode.toUpperCase()} / ${resolveDivisionDomainCode(plan.source)} / ${plan.cohortKey}`,
    ...rows.map(
      ([dataset, available]) =>
        `  ${available ? greenText('✓') : redText('○')} ${formatResourceType(dataset.padEnd(width))}  ${available ? greenText('available') : redText('unavailable')}`,
    ),
    ...(readiness.cohortIndependentReleases.length > 0
      ? [
          '',
          '# AT OR BEFORE',
          ...readiness.cohortIndependentReleases.flatMap(release => [
            [plan.regionCode.toUpperCase(), release.domainCode, release.cohortKey]
              .filter((segment): segment is string => segment !== null)
              .join(' / '),
            `  ${release.releaseCode === null ? (release.optional ? yellowText('○') : redText('○')) : greenText('✓')} ${formatResourceType(release.resourceType)}  ${release.releaseCode === null ? (release.optional ? yellowText('[optional]') : redText('unavailable')) : greenText('available')}`,
          ]),
        ]
      : []),
  ].join('\n')
}

function formatResourceType(resourceType: string) {
  const [type = '', subType] = resourceType.split('::')
  return `${greenText(type)}${subType ? `${mutedText('::')}${orangeText(subType)}` : ''}`
}

export function formatAddressApiReleaseSetReadiness(
  plan: Pick<AddressPlan, 'cohortKey' | 'regionCode'>,
  addressAvailable: boolean,
  releaseSetCode?: string,
  divisionCohortKey?: string | null,
) {
  const domainCode = releaseSetCode?.match(/--([a-z0-9-]+)$/i)?.[1] ?? 'default'

  return [
    `${plan.regionCode.toUpperCase()} / ${domainCode} / ${plan.cohortKey}`,
    `  ${addressAvailable ? greenText('✓') : yellowText('○')} address  ${addressAvailable ? 'available' : 'unavailable'}`,
    ...(divisionCohortKey && divisionCohortKey !== plan.cohortKey
      ? [
          '',
          'Out of Cohort',
          `  ${greenText('✓')} division (overture)  ${divisionCohortKey}`,
        ]
      : []),
  ].join('\n')
}

async function resolveAddressApiReleaseSetReadiness(
  target: UploadTarget,
  plan: Pick<AddressPlan, 'cohortKey' | 'regionCode' | 'sourceVersion'>,
): Promise<AddressReleaseSetReadiness> {
  if (target.remote) return { divisionCohortKey: null }

  const dbContext = await resolveLocalAddressDbContext(
    target,
    plan.regionCode,
    resolveShardYear(plan.cohortKey, plan.sourceVersion),
    { cacheTableProfile: 'division' },
  )
  try {
    const rows = await (dbContext.metaDb as unknown as HarbourReadableDb)
      .select({ cohortKey: metaSchema.metaSnapshots.cohortKey })
      .from(metaSchema.metaSnapshots)
      .innerJoin(
        metaSchema.metaSnapshotLineages,
        eq(
          metaSchema.metaSnapshots.snapshotLineageId,
          metaSchema.metaSnapshotLineages.id,
        ),
      )
      .where(
        and(
          eq(metaSchema.metaSnapshots.resourceType, 'division'),
          eq(metaSchema.metaSnapshots.status, 'published'),
          eq(metaSchema.metaSnapshotLineages.regionCode, plan.regionCode),
          eq(metaSchema.metaSnapshotLineages.variant, 'overture'),
        ),
      )
      .all()
    const cohorts = [...new Set(rows.map(row => row.cohortKey))].sort()
    return {
      divisionCohortKey:
        cohorts.filter(cohort => cohort <= plan.cohortKey).at(-1) ?? cohorts[0] ?? null,
    }
  } finally {
    dbContext.cleanup()
  }
}

function logApiReleaseSetPublication(
  result:
    | {
        apiCatalogRevisionCode?: string
        apiReleaseSetCode?: string
        apiReleaseSetStatus?: 'current' | 'draft'
      }
    | void
    | null
    | undefined,
) {
  const releaseSetCode = result?.apiReleaseSetCode

  if (releaseSetCode && result?.apiReleaseSetStatus === 'current') {
    log.success(`Published API domain release ${rainbowWaveText(releaseSetCode)}.`)
    if (result.apiCatalogRevisionCode) {
      log.info(`Catalog revision ${blueText(result.apiCatalogRevisionCode)}`)
    }
  } else if (releaseSetCode) {
    log.warn(`${redText('DRAFT')} ${blueText(releaseSetCode)}`)
  }
}

function resolveDivisionDomainCode(source: DivisionGeometryPlan['source'] | undefined) {
  return source === 'hkgov-pland-pu' || source === 'hkgov-pland-new-town'
    ? source
    : 'overture'
}

export function rainbowWaveText(value: string) {
  const colors = [196, 202, 226, 46, 51, 21, 201]
  return [...value]
    .map(
      (character, index) => `\u001B[38;5;${colors[index % colors.length]}m${character}`,
    )
    .join('')
    .concat('\u001B[39m')
}

function redText(value: string) {
  return `\u001B[31m${value}\u001B[39m`
}

function withReleaseSetCohort(
  plan: DivisionGeometryPlan,
  releaseSetCode: string | undefined,
): DivisionGeometryPlan {
  const cohortKey = parseDivisionReleaseSetCohortKey(releaseSetCode)
  return cohortKey ? { ...plan, cohortKey } : plan
}

export function parseDivisionReleaseSetCohortKey(releaseSetCode: string | undefined) {
  return releaseSetCode?.match(
    /^data-[a-z0-9]+-divisions-(.+?)(?:-r\d+)?(?:--[a-z0-9-]+)?$/i,
  )?.[1]
}

async function resolveLocalPublishedDivisionSnapshotForGeometryPlan(
  target: UploadTarget,
  plan: DivisionGeometryPlan,
) {
  const shardYear = resolveShardYear(plan.cohortKey, plan.sourceVersion)
  const dbContext = await resolveLocalAddressDbContext(
    target,
    plan.regionCode,
    shardYear,
    { cacheTableProfile: 'division' },
  )
  try {
    const db = dbContext.metaDb as unknown as HarbourReadableDb
    return (
      (await db
        .select({
          code: metaSchema.metaSnapshots.code,
          id: metaSchema.metaSnapshots.id,
        })
        .from(metaSchema.metaSnapshots)
        .innerJoin(
          metaSchema.metaSnapshotLineages,
          eq(
            metaSchema.metaSnapshots.snapshotLineageId,
            metaSchema.metaSnapshotLineages.id,
          ),
        )
        .innerJoin(
          metaSchema.metaSnapshotSources,
          eq(metaSchema.metaSnapshots.id, metaSchema.metaSnapshotSources.snapshotId),
        )
        .innerJoin(
          metaSchema.metaDatasets,
          eq(metaSchema.metaSnapshotSources.datasetId, metaSchema.metaDatasets.id),
        )
        .where(
          and(
            eq(metaSchema.metaSnapshots.resourceType, 'division'),
            eq(metaSchema.metaSnapshots.status, 'published'),
            eq(metaSchema.metaSnapshots.cohortKey, plan.cohortKey),
            eq(metaSchema.metaDatasets.regionCode, plan.regionCode),
            eq(
              metaSchema.metaSnapshotLineages.variant,
              resolveDivisionDomainCode(plan.source),
            ),
            eq(metaSchema.metaSnapshotSources.role, 'primary'),
          ),
        )
        .limit(1)
        .get()) ?? null
    )
  } finally {
    dbContext.cleanup()
  }
}

async function resolveRemotePublishedSnapshotForGeometryPlan(
  target: UploadTarget,
  plan: DivisionGeometryPlan,
) {
  const rows = await runRemoteSnapshotQuery(
    target,
    `
    SELECT s.resourceType, s.id AS snapshotId
    FROM snapshots s
    INNER JOIN snapshotLineages sl ON sl.id = s.snapshotLineageId
    INNER JOIN snapshotSources ss ON ss.snapshotId = s.id
    INNER JOIN datasets d ON d.id = ss.datasetId
    WHERE s.resourceType = 'division'
      AND s.status = 'published'
      AND d.regionCode = ${sqlLiteral(plan.regionCode)}
      AND sl.variant = ${sqlLiteral(resolveDivisionDomainCode(plan.source))}
      AND s.cohortKey LIKE ${sqlLiteral(`${plan.sourceVersion.slice(0, 4)}-%`)}
      AND ss.role = 'primary'
    LIMIT 1
  `,
  )
  return rows[0] ?? null
}

async function resolveLocalDivisionReleaseSetSnapshots(
  target: UploadTarget,
  plan: DivisionGeometryPlan,
) {
  const shardYear = resolveShardYear(plan.cohortKey, plan.sourceVersion)
  const dbContext = await resolveLocalAddressDbContext(
    target,
    plan.regionCode,
    shardYear,
    { cacheTableProfile: 'division' },
  )
  try {
    const db = dbContext.metaDb as unknown as HarbourReadableDb
    const resourceTypes = ['division', 'divisionArea', 'divisionBoundary'] as const
    const entries = await Promise.all(
      resourceTypes.map(
        async resourceType =>
          [
            resourceType,
            Boolean(
              await db
                .select({ id: metaSchema.metaSnapshots.id })
                .from(metaSchema.metaSnapshots)
                .innerJoin(
                  metaSchema.metaSnapshotLineages,
                  eq(
                    metaSchema.metaSnapshots.snapshotLineageId,
                    metaSchema.metaSnapshotLineages.id,
                  ),
                )
                .innerJoin(
                  metaSchema.metaSnapshotSources,
                  eq(
                    metaSchema.metaSnapshots.id,
                    metaSchema.metaSnapshotSources.snapshotId,
                  ),
                )
                .innerJoin(
                  metaSchema.metaDatasets,
                  eq(
                    metaSchema.metaSnapshotSources.datasetId,
                    metaSchema.metaDatasets.id,
                  ),
                )
                .where(
                  and(
                    eq(metaSchema.metaSnapshots.resourceType, resourceType),
                    eq(metaSchema.metaSnapshots.status, 'published'),
                    eq(metaSchema.metaSnapshots.cohortKey, plan.cohortKey),
                    eq(metaSchema.metaDatasets.regionCode, plan.regionCode),
                    eq(
                      metaSchema.metaSnapshotLineages.variant,
                      resolveDivisionDomainCode(plan.source),
                    ),
                    eq(metaSchema.metaSnapshotSources.role, 'primary'),
                  ),
                )
                .limit(1)
                .get(),
            ),
          ] as const,
      ),
    )
    return Object.fromEntries(entries) as Record<
      (typeof resourceTypes)[number],
      boolean
    >
  } finally {
    dbContext.cleanup()
  }
}

async function resolveRemoteDivisionReleaseSetSnapshots(
  target: UploadTarget,
  plan: DivisionGeometryPlan,
) {
  const resourceTypes = ['division', 'divisionArea', 'divisionBoundary'] as const
  const values = resourceTypes.map(sqlLiteral).join(', ')
  const rows = await runRemoteSnapshotQuery(
    target,
    `
    SELECT s.resourceType, s.id AS snapshotId
    FROM snapshots s
    INNER JOIN snapshotLineages sl ON sl.id = s.snapshotLineageId
    INNER JOIN snapshotSources ss ON ss.snapshotId = s.id
    INNER JOIN datasets d ON d.id = ss.datasetId
    WHERE s.resourceType IN (${values})
      AND s.status = 'published'
      AND d.regionCode = ${sqlLiteral(plan.regionCode)}
      AND sl.variant = ${sqlLiteral(resolveDivisionDomainCode(plan.source))}
      AND s.cohortKey LIKE ${sqlLiteral(`${plan.sourceVersion.slice(0, 4)}-%`)}
      AND ss.role = 'primary'
  `,
  )
  const present = new Set(rows.map(row => row.resourceType))
  return Object.fromEntries(
    resourceTypes.map(resourceType => [resourceType, present.has(resourceType)]),
  ) as Record<(typeof resourceTypes)[number], boolean>
}

async function resolveLocalCohortIndependentDivisionReleases(
  target: UploadTarget,
  plan: DivisionGeometryPlan,
): Promise<CohortIndependentReleaseReadiness[]> {
  const shardYear = resolveShardYear(plan.cohortKey, plan.sourceVersion)
  const dbContext = await resolveLocalAddressDbContext(
    target,
    plan.regionCode,
    shardYear,
    { cacheTableProfile: 'division' },
  )

  try {
    const rows = await (dbContext.metaDb as unknown as HarbourReadableDb)
      .select({
        cohortKey: metaSchema.metaReleases.cohortKey,
        datasetCode: metaSchema.metaDatasets.code,
        releaseCode: metaSchema.metaReleases.code,
      })
      .from(metaSchema.metaReleases)
      .innerJoin(
        metaSchema.metaDatasets,
        eq(metaSchema.metaReleases.datasetId, metaSchema.metaDatasets.id),
      )
      .where(
        and(
          eq(metaSchema.metaDatasets.regionCode, plan.regionCode),
          inArray(
            metaSchema.metaDatasets.code,
            COHORT_INDEPENDENT_DIVISION_RELEASE_DATASETS.map(
              dataset => dataset.datasetCode,
            ),
          ),
          eq(metaSchema.metaReleases.status, 'published'),
          lte(metaSchema.metaReleases.cohortKey, plan.cohortKey),
        ),
      )
      .orderBy(
        desc(metaSchema.metaReleases.cohortKey),
        desc(metaSchema.metaReleases.ingestedAt),
        desc(metaSchema.metaReleases.createdAt),
      )
      .all()

    return resolveCohortIndependentReleaseReadiness(rows)
  } finally {
    dbContext.cleanup()
  }
}

async function resolveRemoteCohortIndependentDivisionReleases(
  target: UploadTarget,
  plan: DivisionGeometryPlan,
): Promise<CohortIndependentReleaseReadiness[]> {
  const datasetCodes = COHORT_INDEPENDENT_DIVISION_RELEASE_DATASETS.map(dataset =>
    sqlLiteral(dataset.datasetCode),
  ).join(', ')
  const rows = await runRemoteMetaQuery(
    target,
    `
    SELECT d.code AS datasetCode, r.code AS releaseCode, r.cohortKey AS cohortKey
    FROM releases r
    INNER JOIN datasets d ON d.id = r.datasetId
    WHERE d.code IN (${datasetCodes})
      AND d.regionCode = ${sqlLiteral(plan.regionCode)}
      AND r.status = 'published'
      AND r.cohortKey <= ${sqlLiteral(plan.cohortKey)}
    ORDER BY r.cohortKey DESC, r.ingestedAt DESC, r.createdAt DESC
  `,
  )

  return resolveCohortIndependentReleaseReadiness(
    rows.flatMap(row =>
      typeof row.datasetCode === 'string' &&
      typeof row.releaseCode === 'string' &&
      typeof row.cohortKey === 'string'
        ? [
            {
              cohortKey: row.cohortKey,
              datasetCode: row.datasetCode,
              releaseCode: row.releaseCode,
            },
          ]
        : [],
    ),
  )
}

function resolveCohortIndependentReleaseReadiness(
  releases: Array<{
    cohortKey: string
    datasetCode: string
    releaseCode: string
  }>,
): CohortIndependentReleaseReadiness[] {
  const latestReleaseByDatasetCohort = new Map<string, (typeof releases)[number]>()
  for (const release of releases) {
    const key = `${release.datasetCode}:${release.cohortKey}`
    if (!latestReleaseByDatasetCohort.has(key)) {
      latestReleaseByDatasetCohort.set(key, release)
    }
  }

  const readiness: CohortIndependentReleaseReadiness[] = []
  for (const dataset of COHORT_INDEPENDENT_DIVISION_RELEASE_DATASETS) {
    const matchingReleases = [...latestReleaseByDatasetCohort.values()]
      .filter(
        release =>
          release.datasetCode === dataset.datasetCode &&
          (!dataset.cohortKey || release.cohortKey === dataset.cohortKey),
      )
      .sort((left, right) => left.cohortKey.localeCompare(right.cohortKey))

    const matchingRelease = matchingReleases.at(-1)
    readiness.push(
      matchingRelease
        ? { ...dataset, ...matchingRelease }
        : { ...dataset, cohortKey: dataset.cohortKey ?? null, releaseCode: null },
    )
  }

  return readiness
}

async function resolveRemotePublishedDivisionSnapshotForAddressPlan(
  target: UploadTarget,
  plan: Awaited<ReturnType<typeof prepareUpload>>['plan'],
) {
  const environment = target.environment === 'production' ? 'production' : 'preview'
  const databaseName =
    environment === 'production' ? 'ss-meta-db-prod' : 'ss-meta-db-preview'
  const sql = `
    SELECT s.id AS snapshotId
    FROM snapshots s
    INNER JOIN snapshotLineages sl ON sl.id = s.snapshotLineageId
    INNER JOIN snapshotSources ss ON ss.snapshotId = s.id
    INNER JOIN datasets d ON d.id = ss.datasetId
    WHERE s.resourceType = 'division'
      AND s.status = 'published'
      AND s.cohortKey = ${sqlLiteral(plan.cohortKey)}
      AND d.regionCode = ${sqlLiteral(plan.regionCode)}
      AND sl.variant = 'overture'
      AND ss.role = 'primary'
    LIMIT 1
  `
  const process = Bun.spawn({
    cmd: [
      'bun',
      'x',
      'wrangler',
      'd1',
      'execute',
      databaseName,
      '--remote',
      '--config',
      HARBOUR_API_WRANGLER_CONFIG,
      '--env',
      environment,
      '--json',
      '--command',
      sql,
    ],
    cwd: REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])

  if (exitCode !== 0) {
    throw new Error(
      `Failed to query published division prerequisites from ${environment} meta D1.\n${stderr.trim() || stdout.trim()}`,
    )
  }

  const payload = JSON.parse(stdout) as Array<{
    results?: Array<{ snapshotId?: string }>
    success?: boolean
  }>
  const firstResult = payload[0]

  return firstResult?.success && firstResult.results?.[0]?.snapshotId
    ? firstResult.results[0]
    : null
}

function sqlLiteral(value: string | number | boolean | null | undefined) {
  if (value == null) {
    return 'NULL'
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL'
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0'
  }

  return `'${value.replaceAll("'", "''")}'`
}

async function runRemoteSnapshotQuery(
  target: UploadTarget,
  sql: string,
): Promise<Array<{ resourceType: string; snapshotId: string }>> {
  const rows = await runRemoteMetaQuery(target, sql)
  return rows.filter(
    (row): row is { resourceType: string; snapshotId: string } =>
      typeof row.resourceType === 'string' && typeof row.snapshotId === 'string',
  )
}

async function runRemoteMetaQuery(
  target: UploadTarget,
  sql: string,
): Promise<Array<Record<string, unknown>>> {
  const environment = target.environment === 'production' ? 'production' : 'preview'
  const databaseName =
    environment === 'production' ? 'ss-meta-db-prod' : 'ss-meta-db-preview'
  const process = Bun.spawn({
    cmd: [
      'bun',
      'x',
      'wrangler',
      'd1',
      'execute',
      databaseName,
      '--remote',
      '--config',
      HARBOUR_API_WRANGLER_CONFIG,
      '--env',
      environment,
      '--json',
      '--command',
      sql,
    ],
    cwd: REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  if (exitCode !== 0) {
    throw new Error(
      `Failed to query published snapshots from ${environment} meta D1.\n${stderr.trim() || stdout.trim()}`,
    )
  }
  const payload = JSON.parse(stdout) as Array<{
    results?: Array<Record<string, unknown>>
    success?: boolean
  }>
  return payload[0]?.success ? (payload[0].results ?? []) : []
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
  const schemaSpinner = spinner()
  schemaSpinner.start('Schema Check')

  if (previewResult.plan.source === 'overture') {
    try {
      const schemaVersionId = validateOvertureSchema(
        previewResult.plan,
        previewResult.inspection,
      ).schema.id
      schemaSpinner.stop(formatSchemaCheck('passed'))
      return schemaVersionId
    } catch (error) {
      schemaSpinner.error(formatSchemaCheck('failed'))
      throw error
    }
  }

  schemaSpinner.stop(formatSchemaCheck('passed'))
  return `${previewResult.plan.source}-${previewResult.plan.type}-unvalidated`
}
