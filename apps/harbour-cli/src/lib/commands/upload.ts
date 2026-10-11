import { prepareOvertureCountryAnchor } from '../sources/overtureCountryAnchor'
import { prepareCuratedArchive } from '../pipeline/curatedDivisions/archiveInput'
import { assertUploadApiFieldCompatibility } from './uploadApiFields'
import { cancel, confirm, intro, isCancel, log, note, outro } from '@clack/prompts'
import { resolve } from 'node:path'
import type { ReleaseProcessingAction } from '@repo/core/provenance/processingAction'
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
import { readFixturePublicationDate } from '../upload/publicationDate.ts'
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
  withMaterialisationCohort,
} from './uploadProcessing.ts'
import {
  assertAddressUploadPrerequisites,
  assertDivisionGeometryUploadPrerequisites,
  assertIslandCurationUploadPrerequisites,
} from './uploadReadiness.ts'
import { formatSuccessfulReleaseMessage } from './uploadDisplay.ts'

export async function runUploadCommand(
  args: ParsedArgs,
  target: UploadTarget,
  options: {
    sourceAuditGuards?: import('@repo/core/provenance').AuditGuard[]
    countryPreparation?: {
      reference: import('../sources/overtureCountryAnchor').CountryPreparationReference
      sourceVersion: string
      inputCount: number
      outputCount: number
    }
    curatedPreparation?: import('../pipeline/curatedDivisions/preparationAudit').PreparationEvidence
    curatedSourceReleases?: import('../pipeline/curatedDivisions/archiveInput').CuratedSourceRelease[]
    dryRun: boolean
    forceUpload: boolean
    /** Allows a source-specific local repair to reprocess a published release. */
    allowReprocessPublished?: boolean
    /** Add another materialisation to an already registered source release. */
    reuseExistingRelease?: boolean
    /** Rebuild a published snapshot while preserving the source release identity. */
    rebuildPublishedSnapshot?: boolean
    /** Snapshot cohort carried inside a broader publisher release. */
    materialisationCohortKey?: string
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
  const resumeStagedRelease = args.options.continue === true
  const rebuildPublishedSnapshot =
    options.rebuildPublishedSnapshot ??
    (resumeStagedRelease ||
      options.forceUpload ||
      options.allowReprocessPublished ||
      options.reuseExistingRelease)

  if (args.options.continue !== undefined && !resumeStagedRelease) {
    throw new Error('`upload --continue` does not take a value.')
  }
  if (resumeStagedRelease && options.forceUpload) {
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
  const sourceArtefactPath = resolve(
    options.invocationCwd,
    typeof args.options['release-source-file'] === 'string'
      ? args.options['release-source-file']
      : inputFile,
  )
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
    const curated = await prepareCuratedArchive(
      registerOptions.filePath,
      registerOptions.source,
    )
    if (curated) {
      sourcePreparationCleanup = curated.cleanup
      for (const key of [
        'sourceVersion',
        'cohortKey',
        'datasetCode',
        'resourceType',
      ] as const)
        if (registerOptions[key] && registerOptions[key] !== curated[key])
          throw new Error(`Archive ${key} does not match upload options.`)
      const {
        cleanup: _cleanup,
        sourceReleases: _sources,
        preparation: _preparation,
        ...archiveOptions
      } = curated
      Object.assign(registerOptions, archiveOptions)
      options.curatedSourceReleases = curated.sourceReleases
      options.curatedPreparation = curated.preparation
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
    if (
      previewResult.plan.source === 'overture' &&
      previewResult.plan.resourceType === 'division'
    ) {
      const prepared = await prepareOvertureCountryAnchor(
        registerOptions.filePath,
        previewResult.plan.sourceVersion,
      )
      if (prepared.reference) {
        const inputCount = previewResult.plan.rowCount
        Object.assign(registerOptions, {
          filePath: prepared.filePath,
          source: previewResult.plan.source,
          sourceVersion: previewResult.plan.sourceVersion,
          regionCode: previewResult.plan.regionCode,
          resourceType: 'division',
          datasetCode: previewResult.plan.datasetCode,
          cohortKey: previewResult.plan.cohortKey,
          originalFileName: previewResult.plan.originalFileName,
        })
        delete registerOptions.inspection
        previewResult = await prepareUpload(registerOptions)
        options.countryPreparation = {
          reference: prepared.reference,
          sourceVersion: previewResult.plan.sourceVersion,
          inputCount,
          outputCount: previewResult.plan.rowCount,
        }
      }
    }
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
      datasetName: datasetFixture?.i18n?.en?.name ?? previewResult.plan.datasetCode,
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
    registerOptions.publicationDate = await readFixturePublicationDate(
      previewResult.plan,
    )
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

    // The island review is a gate for the separate SaanSeoi assembly. Native
    // Overture uploads retain only their publisher records.
    await assertIslandCurationUploadPrerequisites(previewResult.plan)

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
          await assertDivisionGeometryUploadPrerequisites(
            target,
            withMaterialisationCohort(
              previewResult.plan,
              options.materialisationCohortKey,
            ),
          )
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
          resourceReleaseId:
            typeof uploadResult?.resourceReleaseId === 'string'
              ? uploadResult.resourceReleaseId
              : '-',
          datasetId:
            typeof uploadResult?.datasetId === 'string' ? uploadResult.datasetId : '-',
          schemaVersion: sourceSchemaVersion,
          status:
            typeof uploadResult?.status === 'string' ? uploadResult.status : 'staged',
        }).join('\n'),
        'UPLOAD RESULT',
      )

      const sourceArchive = sourceArchiveReference(args)
      const resourceReleaseId =
        typeof uploadResult?.resourceReleaseId === 'string'
          ? uploadResult.resourceReleaseId
          : null
      if (sourceArchive) {
        if (!resourceReleaseId) {
          throw new Error('Source archive linkage requires a registered release.')
        }
        await linkManagedSourceAssetToRelease(target, {
          assetKey: sourceArchive.key,
          resourceReleaseId,
        })
      }

      if (previewResult.plan.source === 'overture') {
        const datasetId =
          typeof uploadResult?.datasetId === 'string' ? uploadResult.datasetId : null
        if (!datasetId || !resourceReleaseId) {
          throw new Error('Overture source retention requires release identifiers.')
        }
        const sourceAsset = await uploadSourceReleaseAsset(target, {
          datasetCode: previewResult.plan.datasetCode,
          datasetId,
          filePath: sourceArtefactPath,
          publisherCode: 'overture',
          releaseCode: previewResult.plan.releaseCode,
          resourceReleaseId,
          sourceVersion: previewResult.plan.sourceVersion,
        })
        await linkManagedSourceAssetToRelease(target, {
          assetKey: sourceAsset.assetKey,
          resourceReleaseId,
        })
        log.message(`Retained Overture source: ${sourceAsset.url}`)
      } else if (!sourceArchive) {
        const datasetId =
          typeof uploadResult?.datasetId === 'string' ? uploadResult.datasetId : null
        if (!datasetId || !resourceReleaseId) {
          throw new Error('Source retention requires release identifiers.')
        }
        const sourceAsset = await uploadSourceReleaseAsset(target, {
          datasetCode: previewResult.plan.datasetCode,
          datasetId,
          fileName: sourceArtefactPath,
          filePath: sourceArtefactPath,
          publisherCode: previewResult.plan.source,
          releaseCode: previewResult.plan.releaseCode,
          resourceReleaseId,
          sourceVersion: previewResult.plan.sourceVersion,
        })
        await linkManagedSourceAssetToRelease(target, {
          assetKey: sourceAsset.assetKey,
          resourceReleaseId,
        })
        log.message(`Retained published source artefact: ${sourceAsset.url}`)
      }

      if (registerOptions.filePath.toLowerCase().endsWith('.parquet')) {
        if (!resourceReleaseId || typeof uploadResult?.datasetId !== 'string')
          throw new Error('Resource source retention requires release identifiers.')
        await uploadSourceReleaseAsset(target, {
          datasetCode: previewResult.plan.datasetCode,
          datasetId: uploadResult.datasetId,
          filePath: registerOptions.filePath,
          publisherCode: previewResult.plan.source,
          releaseCode: previewResult.plan.releaseCode,
          resourceReleaseId,
          sourceVersion: previewResult.plan.sourceVersion,
          role: 'resourceSourceArchive',
        })
      }

      await processPreparedUpload({
        processingStrategy,
        previewResult,
        preparedUploadFile,
        target,
        uploadResult,
        options: {
          ...options,
          rebuildPublishedSnapshot,
          sourceAuditGuards:
            apiFieldCompatibility.status === 'covered'
              ? [
                  {
                    id: 'source-api-field-compatibility',
                    summary:
                      'Require a reviewed API-field mapping for the publisher schema version.',
                    consequence: 'block-ingestion',
                    status: 'passed',
                    checked: 1,
                    failed: 0,
                    reason: JSON.stringify({
                      sourceSchemaVersion,
                      mappings: apiFieldCompatibility.mappings,
                    }),
                  },
                ]
              : [],
        },
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
