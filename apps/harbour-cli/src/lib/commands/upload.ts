import { assertUploadApiFieldCompatibility } from './uploadApiFields'
import { cancel, confirm, intro, isCancel, log, note, outro } from '@clack/prompts'
import { resolve } from 'node:path'
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import type { AddressDivisionQualityCounts } from '@repo/core/pipeline/services/metrics/releaseStats'
import { resolveSourceSchemaVersion } from '@repo/core'
import { prepareUpload } from '@repo/core/uploadLocal'
import { loadDatasetFixtures } from '../sources/sourceUpdates.ts'
import { describeTarget, formatSummary, formatUploadResult } from '../cli/display.ts'
import {
  buildRegisterOptions,
  type ParsedArgs,
  type UploadTarget,
} from '../cli/options.ts'
import { prepareUploadFileForDispatch } from '../upload/parquetRepack.ts'
import { resumePendingSqlDeliveryForUpload } from '../upload/upload.ts'
import { resolveReleaseNotesUrl } from '../upload/releaseNotes.ts'
import {
  assertRetainableSourceReleaseInput,
  linkManagedSourceAssetToRelease,
  uploadSourceReleaseAsset,
} from '../sources/sourceAssets.ts'
import { dispatchUpload } from '../upload/upload.ts'
import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  formatCompletedPhaseLabel,
  formatDurationMs,
} from '../pipeline/local/progressFormatting.ts'
import { OperationProgress } from '../cli/operationProgress.ts'
import {
  discardDerivedReleaseArtefacts,
  shouldCacheArtefacts,
} from '../pipeline/local/releaseArtefacts.ts'
import {
  prepareHkgovCenstatdGmlUpload,
  prepareHkgovHadGeoJsonUpload,
  prepareLandsdPlaceNameGeoJsonUpload,
  resolveAssumptionWarnings,
  resolveSchemaVersionId,
  sourceArchiveReference,
} from './uploadPreparation.ts'
import {
  processPreparedUpload,
  resolveUploadProcessingStrategy,
} from './uploadProcessing.ts'
import {
  assertAddressUploadPrerequisites,
  assertDivisionGeometryUploadPrerequisites,
} from './uploadReadiness.ts'
import { formatSuccessfulReleaseMessage } from './uploadDisplay.ts'

export async function runUploadCommand(
  args: ParsedArgs,
  target: UploadTarget,
  options: {
    dryRun: boolean
    forceUpload: boolean
    /** Allows a source-specific local repair to reprocess a published release. */
    allowReprocessPublished?: boolean
    /** Add another materialisation to an already registered source release. */
    reuseExistingRelease?: boolean
    /** Verify that a locally interrupted processing release has no active phase. */
    resumeInterruptedProcessingRelease?: boolean
    /** Allows a native importer to register an independent older cohort. */
    allowHistoricalCohort?: boolean
    invocationCwd: string
    printUsage: () => void
    /** Explicit out-of-cohort Overture dependency selected during local preparation. */
    divisionCohortKey?: string
    /** Publish source data and snapshots, but leave the API release set draft. */
    deferApiReleaseSet?: boolean
    /** Leave Statistics API release-set publication to a cohort bootstrap. */
    deferStatsReleaseSet?: boolean
    /** Keep a multi-resource source release open until its final resource. */
    deferSourcePublish?: boolean
    processingActions?: ReleaseProcessingAction[]
    quality?: AddressDivisionQualityCounts
    quiet?: boolean
    /** Interactive command to offer when a non-interactive run lacks release notes. */
    releaseNotesRetryCommand?: string
    skipConfirm: boolean
    skipSnapshotCleanup: boolean
    validateGeometry: boolean
  },
) {
  const inputFile = args.positionals[0]
  const commandStartedAt = Date.now()
  const mutedBar = '\u001B[90m│\u001B[39m'
  const cacheArtefacts = shouldCacheArtefacts(args.options)
  const resumeStagedRelease =
    args.options.continue === true ||
    options.resumeInterruptedProcessingRelease === true

  if (args.options.continue !== undefined && !resumeStagedRelease) {
    throw new Error('`upload --continue` does not take a value.')
  }
  if (args.options.continue === true && options.forceUpload) {
    throw new Error('Use either `upload --continue` or `upload --force`, not both.')
  }

  if (args.options.verbose) {
    process.env.HARBOUR_VERBOSE = '1'
    process.env.SAANSEOI_VERBOSE = '1'
  }

  if (!inputFile) {
    options.printUsage()
    throw new Error('Missing file path.')
  }
  const sourceArtefactPath = resolve(options.invocationCwd, inputFile)
  if (!sourceArchiveReference(args)) {
    assertRetainableSourceReleaseInput(inputFile)
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
    if (options.allowHistoricalCohort) {
      registerOptions.allowHistoricalCohort = true
    }
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
        resourceType: registerOptions.resourceType ?? hkgovHadPreparation.resourceType,
      })
      log.message('Prepared Home Affairs Department District Boundary GeoJSON.')
    }
    const hkgovCenstatdPreparation = await prepareHkgovCenstatdGmlUpload(
      registerOptions.filePath,
      registerOptions.datasetCode,
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
        resourceType:
          registerOptions.resourceType ?? hkgovCenstatdPreparation.resourceType,
      })
      log.message('Prepared Census and Statistics Department District Council GML.')
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
        resourceType:
          registerOptions.resourceType ?? landsdPlaceNamePreparation.resourceType,
      })
      log.message('Prepared LandsD Settlement Place Name GeoJSON.')
    }
    let previewResult = await prepareUpload(registerOptions)
    const sourceSchemaVersion = await resolveSourceSchemaVersion({
      source: previewResult.plan.source,
      sourceVersion: previewResult.plan.sourceVersion,
    })
    const apiFieldCompatibility = assertUploadApiFieldCompatibility(
      previewResult.plan,
      sourceSchemaVersion,
    )
    if (apiFieldCompatibility.status === 'covered') {
      log.message(
        `API-field schema coverage passed: ${apiFieldCompatibility.mappings.join(', ')}.`,
      )
    }
    const assumptionWarnings = await resolveAssumptionWarnings(
      registerOptions.filePath,
      previewResult,
    )
    const [datasetFixture] = await loadDatasetFixtures(
      new Set([previewResult.plan.datasetCode]),
    )
    const revisionDraft = () => ({
      datasetName:
        datasetFixture?.i18n?.find(entry => entry.locale === 'en')?.name ??
        previewResult.plan.datasetCode,
      prompt: !options.skipConfirm,
      publisherCode: datasetFixture?.publisherCode ?? previewResult.plan.source,
      sourceVersion: previewResult.plan.sourceVersion,
    })

    if (
      options.deferApiReleaseSet &&
      previewResult.plan.theme !== 'addresses' &&
      previewResult.plan.theme !== 'divisions' &&
      previewResult.plan.theme !== 'places'
    ) {
      throw new Error(
        '--defer-api-release-set requires an Addresses, Divisions, or Places upload.',
      )
    }

    note(
      formatSummary(previewResult, target, {
        schemaURL: datasetFixture?.schemaURL,
      }).join('\n'),
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
      interactiveRetryCommand: options.releaseNotesRetryCommand,
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

    if (!options.dryRun) {
      await resumePendingSqlDeliveryForUpload(target, options.invocationCwd)
    }

    if (
      processingStrategy.mode === 'local-address-sql' ||
      processingStrategy.mode === 'local-division-geometry-sql'
    ) {
      const prerequisiteProgress = new OperationProgress()

      try {
        const prerequisiteStartedAt = Date.now()
        prerequisiteProgress.beginPhase('Check prerequisites', {
          current: 0,
          max: null,
        })
        if (processingStrategy.mode === 'local-address-sql') {
          await assertAddressUploadPrerequisites(target, previewResult.plan, {
            divisionCohortKey: options.divisionCohortKey,
          })
        } else {
          await assertDivisionGeometryUploadPrerequisites(target, previewResult.plan)
        }
        prerequisiteProgress.complete(
          appendPhaseDetails(
            formatCompletedPhaseLabel(colorTeal('Check'), colorRed('prerequisites')),
            [formatDurationMs(Date.now() - prerequisiteStartedAt)],
          ),
        )
      } catch (error) {
        prerequisiteProgress.fail()
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
          allowHistoricalCohort: options.allowHistoricalCohort,
          resumeStagedRelease,
          allowReprocessPublished:
            options.forceUpload || options.allowReprocessPublished,
          reuseExistingRelease: options.reuseExistingRelease,
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

      const sourceArchive = sourceArchiveReference(args)
      const releaseId =
        typeof uploadResult?.releaseId === 'string' ? uploadResult.releaseId : null
      if (sourceArchive) {
        if (!releaseId) {
          throw new Error('Source archive linkage requires a registered release.')
        }
        await linkManagedSourceAssetToRelease(target, {
          assetKey: sourceArchive.key,
          releaseId,
        })
      }

      if (previewResult.plan.source === 'overture') {
        const datasetId =
          typeof uploadResult?.datasetId === 'string' ? uploadResult.datasetId : null
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
      } else if (!sourceArchive) {
        const datasetId =
          typeof uploadResult?.datasetId === 'string' ? uploadResult.datasetId : null
        if (!datasetId || !releaseId) {
          throw new Error('Source retention requires release identifiers.')
        }
        const sourceAsset = await uploadSourceReleaseAsset(target, {
          datasetCode: previewResult.plan.datasetCode,
          datasetId,
          fileName: inputFile,
          filePath: sourceArtefactPath,
          publisherCode: previewResult.plan.source,
          releaseCode: previewResult.plan.releaseCode,
          releaseId,
          sourceVersion: previewResult.plan.sourceVersion,
        })
        log.message(`Retained published source artefact: ${sourceAsset.url}`)
      }

      await processPreparedUpload({
        processingStrategy,
        previewResult,
        preparedUploadFile,
        target,
        uploadResult,
        options,
        revisionDraft,
        divisionGeometryTransform,
        cacheArtefacts,
      })
      await discardSuccessfulReleaseArtefacts(
        cacheArtefacts,
        target,
        previewResult.plan.releaseCode,
      )
      if (!options.quiet) outro(formatSuccessfulReleaseMessage(commandStartedAt))
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

export {
  formatDivisionApiReleaseSetReadiness,
  formatAddressApiReleaseSetReadiness,
  selectPublishedApiReleaseSetPublications,
} from './uploadDisplay.ts'

export { censtatdDistrictDatasetCode } from './uploadPreparation.ts'

export {
  assertAddressUploadPrerequisites,
  assertDivisionGeometryUploadPrerequisites,
  resolveDivisionApiReleaseSetReadiness,
  resolveDivisionDomainCode,
  parseDivisionReleaseSetCohortKey,
} from './uploadReadiness.ts'
