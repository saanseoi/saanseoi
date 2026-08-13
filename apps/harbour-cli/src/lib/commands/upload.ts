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
import { join } from 'node:path'

import type { HarbourReadableDb } from '@repo/core/db/types'
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import { resolveSourceSchemaVersion } from '@repo/core'
import { prepareUpload } from '@repo/core/uploadLocal'
import { metaSchema } from '@repo/db'
import { and, desc, eq, inArray, lte, or, sql } from 'drizzle-orm'

import {
  resolveLocalAddressDbContext,
  withRemoteCachedMetaDb,
} from '../addressSql/localDbCache.ts'
import {
  HKGOV_CENSTATD_SIMPLIFIED_TRANSFORM,
  prepareHkgovCenstatdDistrictUpload,
} from '../sources/hkgov/hkgovCenstatd.ts'
import { prepareHkgovHadDistrictUpload } from '../sources/hkgov/hkgovHad.ts'
import { prepareLandsdPlaceNameDivisionUpload } from '../sources/landsd/landsdPlaceName.ts'
import {
  describeTarget,
  formatMutedValue,
  formatSchemaCheck,
  formatSummary,
  formatUploadResult,
} from '../cli/display.ts'
import { processLocalAddressSqlUpload } from '../addressSql/processLocalAddressSqlUpload.ts'
import { processLocalStreetSqlUpload } from '../streetSql/processLocalStreetSqlUpload.ts'
import { processLocalDivisionSqlUpload } from '../divisionSql/processLocalDivisionSqlUpload.ts'
import { processLocalHkgovPlandDivisionSqlUpload } from '../divisionSql/processLocalHkgovPlandDivisionSqlUpload.ts'
import { processLocalDivisionGeometrySqlUpload } from '../divisionSql/processLocalDivisionGeometrySqlUpload.ts'
import { processLocalHkgovCenstatdDistrictStatisticSqlUpload } from '../statisticsSql/processLocalHkgovCenstatdDistrictStatisticSqlUpload.ts'
import { processLocalHkgovCenstatdStatisticSqlUpload } from '../statisticsSql/processLocalHkgovCenstatdStatisticSqlUpload.ts'
import {
  buildRegisterOptions,
  type ParsedArgs,
  type UploadTarget,
} from '../cli/options.ts'
import { checkOvertureUploadAssumptions } from '../upload/overtureAssumptions.ts'
import { prepareUploadFileForDispatch } from '../upload/parquetRepack.ts'
import { resolveReleaseNotesUrl } from '../upload/releaseNotes.ts'
import { validateOvertureSchema } from '../schema/overture.ts'
import { uploadSourceReleaseAsset } from '../sources/sourceAssets.ts'
import { dispatchUpload } from '../upload/upload.ts'
import { formatDurationMs } from '../localPipeline/progressFormatting.ts'
import {
  discardDerivedReleaseArtefacts,
  shouldCacheArtefacts,
} from '../localPipeline/releaseArtefacts.ts'

export async function runUploadCommand(
  args: ParsedArgs,
  target: UploadTarget,
  options: {
    dryRun: boolean
    forceUpload: boolean
    /** Allows a source-specific local repair to reprocess a published release. */
    allowReprocessPublished?: boolean
    invocationCwd: string
    printUsage: () => void
    /** Explicit out-of-cohort Overture dependency selected during local preparation. */
    divisionCohortKey?: string
    processingActions?: ReleaseProcessingAction[]
    quiet?: boolean
    skipConfirm: boolean
    skipSnapshotCleanup: boolean
    validateGeometry: boolean
  },
) {
  const inputFile = args.positionals[0]
  const commandStartedAt = Date.now()
  const mutedBar = '\u001B[90m│\u001B[39m'
  const cacheArtefacts = shouldCacheArtefacts(args.options)

  if (args.options.verbose) {
    process.env.HARBOUR_VERBOSE = '1'
    process.env.SAANSEOI_VERBOSE = '1'
  }

  if (!inputFile) {
    options.printUsage()
    throw new Error('Missing file path.')
  }

  if (!options.quiet)
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
      sourceArchiveReference(args),
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
      sourceArchiveReference(args),
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
    const landsdPlaceNamePreparation = await prepareLandsdPlaceNameGeoJsonUpload(
      registerOptions.filePath,
      registerOptions.source,
      registerOptions.sourceVersion,
    )
    if (landsdPlaceNamePreparation) {
      sourcePreparationCleanup = landsdPlaceNamePreparation.cleanup
      Object.assign(registerOptions, {
        filePath: landsdPlaceNamePreparation.filePath,
        originalFileName: landsdPlaceNamePreparation.originalFileName,
        regionCode: registerOptions.regionCode ?? landsdPlaceNamePreparation.regionCode,
        source: landsdPlaceNamePreparation.source,
        sourceVersion:
          registerOptions.sourceVersion ?? landsdPlaceNamePreparation.sourceVersion,
        theme: registerOptions.theme ?? landsdPlaceNamePreparation.theme,
        type: registerOptions.type ?? landsdPlaceNamePreparation.type,
      })
      log.message('Prepared LandsD Settlement Place Name GeoJSON.')
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
      if (!options.quiet) outro('Harbour upload complete')
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
          await assertAddressUploadPrerequisites(target, previewResult.plan, {
            divisionCohortKey: options.divisionCohortKey,
          })
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
          allowReprocessPublished:
            options.forceUpload || options.allowReprocessPublished,
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

      if (previewResult.plan.source === 'overture') {
        const datasetId =
          typeof uploadResult?.datasetId === 'string' ? uploadResult.datasetId : null
        const releaseId =
          typeof uploadResult?.releaseId === 'string' ? uploadResult.releaseId : null
        if (!datasetId || !releaseId) {
          throw new Error('Overture source retention requires release identifiers.')
        }
        const sourceAsset = await uploadSourceReleaseAsset(target, {
          datasetCode: previewResult.plan.datasetCode,
          datasetId,
          filePath: registerOptions.filePath,
          publisherCode: 'overture',
          releaseCode: previewResult.plan.releaseCode,
          releaseId,
          sourceVersion: previewResult.plan.sourceVersion,
        })
        log.message(`Retained Overture source: ${sourceAsset.url}`)
      }

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
          options.divisionCohortKey,
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
        await discardSuccessfulReleaseArtefacts(
          cacheArtefacts,
          target,
          previewResult.plan.releaseCode,
        )
        if (!options.quiet) outro(formatSuccessfulReleaseMessage(commandStartedAt))
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
            source: previewResult.plan.source as 'hkgov-landsd' | 'overture',
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
        await discardSuccessfulReleaseArtefacts(
          cacheArtefacts,
          target,
          previewResult.plan.releaseCode,
        )
        if (!options.quiet) outro(formatSuccessfulReleaseMessage(commandStartedAt))
        return
      }

      if (processingStrategy.mode === 'local-street-sql') {
        if (
          previewResult.plan.type !== 'street' ||
          previewResult.plan.theme !== 'streets' ||
          previewResult.plan.source !== 'hkgov-landsd'
        ) {
          throw new Error(
            'LandsD street SQL processing requires a LandsD street dataset.',
          )
        }
        if (!preparedUploadFile) {
          throw new Error('Expected a prepared upload file for local SQL processing.')
        }
        await processLocalStreetSqlUpload(
          target,
          {
            cohortKey: previewResult.plan.cohortKey,
            regionCode: previewResult.plan.regionCode,
            releaseCode: previewResult.plan.releaseCode,
            rowCount: previewResult.plan.rowCount,
            source: 'hkgov-landsd',
            sourceVersion: previewResult.plan.sourceVersion,
            theme: 'streets',
            type: 'street',
          },
          uploadResult,
          preparedUploadFile,
          { skipSnapshotCleanup: options.skipSnapshotCleanup },
        )
        await discardSuccessfulReleaseArtefacts(
          cacheArtefacts,
          target,
          previewResult.plan.releaseCode,
        )
        if (!options.quiet) outro(formatSuccessfulReleaseMessage(commandStartedAt))
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
        await discardSuccessfulReleaseArtefacts(
          cacheArtefacts,
          target,
          previewResult.plan.releaseCode,
        )
        if (!options.quiet) outro(formatSuccessfulReleaseMessage(commandStartedAt))
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
                reuseRunningRelease: true,
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
        await discardSuccessfulReleaseArtefacts(
          cacheArtefacts,
          target,
          previewResult.plan.releaseCode,
        )
        if (!options.quiet) outro(formatSuccessfulReleaseMessage(commandStartedAt))
        return
      }

      if (processingStrategy.mode === 'local-hkgov-censtatd-statistic-sql') {
        if (!preparedUploadFile) {
          throw new Error('Expected a prepared upload file for local SQL processing.')
        }
        if (
          previewResult.plan.type !== 'divisionStatistic' ||
          previewResult.plan.theme !== 'stats' ||
          previewResult.plan.source !== 'hkgov-censtatd'
        ) {
          throw new Error(
            'C&SD statistic SQL processing requires its district statistic dataset.',
          )
        }
        await processLocalHkgovCenstatdDistrictStatisticSqlUpload(
          target,
          {
            cohortKey: previewResult.plan.cohortKey,
            regionCode: 'hk',
            releaseCode: previewResult.plan.releaseCode,
            rowCount: previewResult.plan.rowCount,
            source: 'hkgov-censtatd',
            sourceVersion: previewResult.plan.sourceVersion,
            theme: 'stats',
            type: 'divisionStatistic',
          },
          uploadResult,
          preparedUploadFile,
        )
        await discardSuccessfulReleaseArtefacts(
          cacheArtefacts,
          target,
          previewResult.plan.releaseCode,
        )
        if (!options.quiet) outro(formatSuccessfulReleaseMessage(commandStartedAt))
        return
      }

      if (processingStrategy.mode === 'local-hkgov-censtatd-generic-statistic-sql') {
        if (!preparedUploadFile)
          throw new Error('Expected a prepared upload file for local SQL processing.')
        await processLocalHkgovCenstatdStatisticSqlUpload(
          target,
          {
            cohortKey: previewResult.plan.cohortKey,
            releaseCode: previewResult.plan.releaseCode,
            rowCount: previewResult.plan.rowCount,
            sourceVersion: previewResult.plan.sourceVersion,
          },
          uploadResult,
          preparedUploadFile,
        )
        await discardSuccessfulReleaseArtefacts(
          cacheArtefacts,
          target,
          previewResult.plan.releaseCode,
        )
        if (!options.quiet) outro(formatSuccessfulReleaseMessage(commandStartedAt))
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

async function discardSuccessfulReleaseArtefacts(
  cacheArtefacts: boolean,
  target: UploadTarget,
  releaseCode: string,
) {
  if (cacheArtefacts) {
    return
  }

  await discardDerivedReleaseArtefacts(target, releaseCode)
}

async function prepareHkgovHadGeoJsonUpload(
  filePath: string,
  source: string | undefined,
  sourceVersion: string | undefined,
  sourceArchive: { key: string; sha256: string } | undefined,
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
      { sourceArchive },
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
  sourceArchive: { key: string; sha256: string } | undefined,
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
      { sourceArchive },
    )
    const displayPrepared = await prepareHkgovCenstatdDistrictUpload(
      filePath,
      tempDir,
      inputSourceVersion,
      { sourceArchive, transform: HKGOV_CENSTATD_SIMPLIFIED_TRANSFORM },
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

function sourceArchiveReference(args: ParsedArgs) {
  const key = args.options['source-archive-key']
  const sha256 = args.options['source-archive-sha256']
  if (key === undefined && sha256 === undefined) return undefined
  if (
    typeof key !== 'string' ||
    typeof sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(sha256)
  ) {
    throw new Error(
      'Source archive provenance requires both --source-archive-key and a SHA-256 --source-archive-sha256.',
    )
  }
  return { key, sha256 }
}

async function prepareLandsdPlaceNameGeoJsonUpload(
  filePath: string,
  source: string | undefined,
  sourceVersion: string | undefined,
) {
  if (!isLandsdPlaceNameGeoJson(filePath, source)) return null
  if (!sourceVersion) {
    throw new Error('LandsD Place Name GeoJSON requires --source-version.')
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-landsd-'))
  try {
    const prepared = await prepareLandsdPlaceNameDivisionUpload(
      filePath,
      tempDir,
      sourceVersion,
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

function isLandsdPlaceNameGeoJson(filePath: string, source: string | undefined) {
  return (
    filePath.toLowerCase().endsWith('.geojson') &&
    (source === 'hkgov-landsd' ||
      /(^|[._/\\-])hkgov-landsd-division([._/\\-]|$)/i.test(filePath))
  )
}

function inferCenstatdSourceVersion(filePath: string) {
  return filePath.match(/(?:^|[^0-9])(2016|2021)(?:[^0-9]|$)/)?.[1]
}

function resolveUploadProcessingStrategy(
  previewResult: Awaited<ReturnType<typeof prepareUpload>>,
) {
  if (
    previewResult.plan.type === 'divisionStatistic' &&
    previewResult.plan.theme === 'stats' &&
    previewResult.plan.source === 'hkgov-censtatd' &&
    previewResult.plan.datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district'
  ) {
    return { mode: 'local-hkgov-censtatd-statistic-sql' as const }
  }

  if (
    previewResult.plan.type === 'divisionStatistic' &&
    previewResult.plan.theme === 'stats' &&
    previewResult.plan.source === 'hkgov-censtatd'
  )
    return { mode: 'local-hkgov-censtatd-generic-statistic-sql' as const }

  if (
    previewResult.plan.type === 'address' &&
    previewResult.plan.theme === 'addresses'
  ) {
    return {
      mode: 'local-address-sql' as const,
    }
  }

  if (
    previewResult.plan.type === 'street' &&
    previewResult.plan.theme === 'streets' &&
    previewResult.plan.source === 'hkgov-landsd'
  ) {
    return { mode: 'local-street-sql' as const }
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
    (previewResult.plan.source === 'overture' ||
      previewResult.plan.source === 'hkgov-landsd')
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
    divisionCohortKey?: string
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
    const dependencyPlan = options.divisionCohortKey
      ? { ...plan, cohortKey: options.divisionCohortKey }
      : plan
    const snapshot = await (
      options.resolveRemotePublishedDivisionSnapshot ??
      resolveRemotePublishedDivisionSnapshotForAddressPlan
    )(target, dependencyPlan)

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
          options.divisionCohortKey
            ? eq(metaSchema.metaSnapshots.cohortKey, options.divisionCohortKey)
            : sql`${metaSchema.metaSnapshots.cohortKey} LIKE ${`${plan.sourceVersion.slice(0, 4)}-%`}`,
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
  divisionCohortKey?: string,
): Promise<AddressReleaseSetReadiness> {
  if (divisionCohortKey) return { divisionCohortKey }
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
        apiReleaseSetPublications?: Array<{
          apiCatalogRevisionCode?: string
          apiReleaseSetCode: string
        }>
        apiReleaseSetStatus?: 'current' | 'draft'
      }
    | void
    | null
    | undefined,
) {
  if (result?.apiReleaseSetPublications?.length) {
    for (const publication of result.apiReleaseSetPublications) {
      log.success(
        `Published API domain release ${rainbowWaveText(publication.apiReleaseSetCode)}.`,
      )
      if (publication.apiCatalogRevisionCode) {
        log.info(`Catalogue revision ${blueText(publication.apiCatalogRevisionCode)}`)
      }
    }

    if (result.apiReleaseSetStatus === 'current') return
  }

  const releaseSetCode = result?.apiReleaseSetCode

  if (releaseSetCode && result?.apiReleaseSetStatus === 'current') {
    log.success(`Published API domain release ${rainbowWaveText(releaseSetCode)}.`)
    if (result.apiCatalogRevisionCode) {
      log.info(`Catalogue revision ${blueText(result.apiCatalogRevisionCode)}`)
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

function matchesDivisionDomain(source: DivisionGeometryPlan['source'] | undefined) {
  const domainCode = resolveDivisionDomainCode(source)

  // The initial Overture division snapshot predates snapshot lineages. Its
  // primary dataset is therefore the durable domain identity until it is
  // superseded by a lineage-backed revision.
  return domainCode === 'overture'
    ? or(
        eq(metaSchema.metaSnapshotLineages.variant, domainCode),
        eq(metaSchema.metaDatasets.code, 'ds-hk-overture-division'),
      )
    : eq(metaSchema.metaSnapshotLineages.variant, domainCode)
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
    const db = dbContext.metaDb
    return (
      (await db
        .select({
          code: metaSchema.metaSnapshots.code,
          id: metaSchema.metaSnapshots.id,
        })
        .from(metaSchema.metaSnapshots)
        .leftJoin(
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
            matchesDivisionDomain(plan.source),
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
  return withRemoteCachedMetaDb(
    target,
    async db =>
      (await db
        .select({
          resourceType: metaSchema.metaSnapshots.resourceType,
          snapshotId: metaSchema.metaSnapshots.id,
        })
        .from(metaSchema.metaSnapshots)
        .leftJoin(
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
            eq(metaSchema.metaDatasets.regionCode, plan.regionCode),
            matchesDivisionDomain(plan.source),
            sql`${metaSchema.metaSnapshots.cohortKey} LIKE ${`${plan.sourceVersion.slice(0, 4)}-%`}`,
            eq(metaSchema.metaSnapshotSources.role, 'primary'),
          ),
        )
        .limit(1)
        .get()) ?? null,
  )
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
    const db = dbContext.metaDb
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
                .leftJoin(
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
                    matchesDivisionDomain(plan.source),
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
  const rows = await withRemoteCachedMetaDb(target, db =>
    db
      .select({
        resourceType: metaSchema.metaSnapshots.resourceType,
        snapshotId: metaSchema.metaSnapshots.id,
      })
      .from(metaSchema.metaSnapshots)
      .leftJoin(
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
          inArray(metaSchema.metaSnapshots.resourceType, resourceTypes),
          eq(metaSchema.metaSnapshots.status, 'published'),
          eq(metaSchema.metaDatasets.regionCode, plan.regionCode),
          matchesDivisionDomain(plan.source),
          sql`${metaSchema.metaSnapshots.cohortKey} LIKE ${`${plan.sourceVersion.slice(0, 4)}-%`}`,
          eq(metaSchema.metaSnapshotSources.role, 'primary'),
        ),
      )
      .all(),
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
  const rows = await withRemoteCachedMetaDb(target, db =>
    db
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
          inArray(
            metaSchema.metaDatasets.code,
            COHORT_INDEPENDENT_DIVISION_RELEASE_DATASETS.map(
              dataset => dataset.datasetCode,
            ),
          ),
          eq(metaSchema.metaDatasets.regionCode, plan.regionCode),
          eq(metaSchema.metaReleases.status, 'published'),
          lte(metaSchema.metaReleases.cohortKey, plan.cohortKey),
        ),
      )
      .orderBy(
        desc(metaSchema.metaReleases.cohortKey),
        desc(metaSchema.metaReleases.ingestedAt),
        desc(metaSchema.metaReleases.createdAt),
      )
      .all(),
  )

  return resolveCohortIndependentReleaseReadiness(
    rows.flatMap(row =>
      row.cohortKey === null
        ? []
        : [
            {
              cohortKey: row.cohortKey,
              datasetCode: row.datasetCode,
              releaseCode: row.releaseCode,
            },
          ],
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
  return withRemoteCachedMetaDb(
    target,
    async db =>
      (await db
        .select({ snapshotId: metaSchema.metaSnapshots.id })
        .from(metaSchema.metaSnapshots)
        .leftJoin(
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
            matchesDivisionDomain('overture'),
            eq(metaSchema.metaSnapshotSources.role, 'primary'),
          ),
        )
        .limit(1)
        .get()) ?? null,
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
