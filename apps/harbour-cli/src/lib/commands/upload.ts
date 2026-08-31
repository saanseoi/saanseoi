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
import {
  listCurrentApiCompositionMembersForType,
  resolveEarliestPublishedSnapshotForResourceTypeRegionAtOrAfterCohortKey,
  resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey,
  resolvePublishedSnapshotForResourceTypeRegionCohortKey,
  resolvePublishedSnapshotsForResourceTypeRegionAtOrBeforeCohortKey,
} from '@repo/core/db/metaRegistry'
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import { publisherCodeForSource, resolveSourceSchemaVersion } from '@repo/core'
import { prepareUpload } from '@repo/core/uploadLocal'
import { metaSchema } from '@repo/db'
import { and, eq, or, sql } from 'drizzle-orm'

import {
  resolveLocalAddressDbContext,
  updateDbCacheProgress,
  withRemoteCachedMetaDb,
} from '../dbCache/localDbCache.ts'
import { prepareHkgovCenstatdDistrictUpload } from '../sources/hkgov/hkgovCenstatd.ts'
import { prepareHkgovHadDistrictUpload } from '../sources/hkgov/hkgovHad.ts'
import { prepareLandsdPlaceNameDivisionUpload } from '../sources/landsd/landsdPlaceName.ts'
import { loadDatasetFixtures } from '../sources/sourceUpdates.ts'
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
import {
  createApiReleaseSetInitialDraft,
  createApiReleaseSetRevisionDraft,
} from './docs.ts'
import { recordInitialisationSummaryEvent } from './initialisationSummary.ts'
import { validateOvertureSchema } from '../schema/overture.ts'
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
} from '../localPipeline/progressFormatting.ts'
import { LocalUploadProgress } from '../upload/localUploadProgress.ts'
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
    processingActions?: ReleaseProcessingAction[]
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
        type: registerOptions.type ?? hkgovHadPreparation.type,
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
        type: registerOptions.type ?? hkgovCenstatdPreparation.type,
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

    if (options.deferApiReleaseSet && previewResult.plan.theme !== 'divisions') {
      throw new Error('--defer-api-release-set requires a Divisions upload.')
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

    if (
      processingStrategy.mode === 'local-address-sql' ||
      processingStrategy.mode === 'local-division-geometry-sql'
    ) {
      const prerequisiteProgress = new LocalUploadProgress()

      try {
        if (target.remote) {
          const dbCacheStartedAt = Date.now()
          let reusedDbCache = false
          const dbContext = await resolveLocalAddressDbContext(
            target,
            previewResult.plan.regionCode,
            previewResult.plan.sourceVersion.slice(0, 4),
            {
              onProgress(event) {
                reusedDbCache ||= event.action === 'reuse-cache'
                updateDbCacheProgress(prerequisiteProgress, event, {
                  completeOnReuse: false,
                })
              },
              cacheTableProfile:
                previewResult.plan.type === 'divisionArea' ||
                previewResult.plan.type === 'divisionBoundary'
                  ? previewResult.plan.source === 'hkgov-pland-pu' ||
                    previewResult.plan.source === 'hkgov-pland-new-town'
                    ? 'planningDivisionGeometry'
                    : 'divisionGeometry'
                  : undefined,
              includePreviousShardYears: true,
            },
          )
          dbContext.cleanup()

          if (prerequisiteProgress.hasActivePhase()) {
            prerequisiteProgress.complete(
              appendPhaseDetails(
                formatCompletedPhaseLabel(
                  colorTeal(reusedDbCache ? 'Use cache' : 'Clone cache'),
                  colorRed(target.environment),
                ),
                [formatDurationMs(Date.now() - dbCacheStartedAt)],
              ),
            )
          }
        }

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
          resumeStagedRelease,
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
        await logApiReleaseSetPublication(
          processingResult.publishResult,
          revisionDraft(),
          target,
        )
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
            source: previewResult.plan.source as
              | 'hkgov-censtatd'
              | 'hkgov-landsd'
              | 'overture',
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
        await logApiReleaseSetPublication(
          processingResult.publishResult,
          revisionDraft(),
          target,
        )
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
        const processingResult = await processLocalStreetSqlUpload(
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
        await logApiReleaseSetPublication(
          processingResult.publishResult,
          revisionDraft(),
          target,
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
        await logApiReleaseSetPublication(
          processingResult.publishResult ?? undefined,
          revisionDraft(),
          target,
        )
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

        const shouldDeriveHkgovSimplifiedGeometry =
          previewResult.plan.type === 'divisionArea' &&
          (previewResult.plan.source === 'hkgov-had' ||
            previewResult.plan.source === 'hkgov-censtatd' ||
            previewResult.plan.source === 'hkgov-pland-pu' ||
            previewResult.plan.source === 'hkgov-pland-new-town')

        const processingResult = await processLocalDivisionGeometrySqlUpload(
          target,
          {
            cohortKey: previewResult.plan.cohortKey,
            datasetCode: previewResult.plan.datasetCode,
            regionCode: previewResult.plan.regionCode,
            releaseCode: previewResult.plan.releaseCode,
            rowCount: previewResult.plan.rowCount,
            source: previewResult.plan.source,
            sourceVersion: previewResult.plan.sourceVersion,
            geometryStatus: previewResult.plan.geometryStatus,
            transform: divisionGeometryTransform,
            theme: 'divisions',
            type: previewResult.plan.type,
          },
          uploadResult,
          preparedUploadFile,
          {
            deferApiReleaseSet: options.deferApiReleaseSet,
            deferPublish: shouldDeriveHkgovSimplifiedGeometry,
            skipSnapshotCleanup: options.skipSnapshotCleanup,
            validateGeometry: options.validateGeometry,
          },
        )
        let companionProcessingResult:
          | Awaited<ReturnType<typeof processLocalDivisionGeometrySqlUpload>>
          | undefined
        if (shouldDeriveHkgovSimplifiedGeometry) {
          note(
            'Building the derived simplified Hong Kong Government display geometry.',
            'SIMPLIFYING GEOMETRY PASS',
          )
          companionProcessingResult = await processLocalDivisionGeometrySqlUpload(
            target,
            {
              cohortKey: previewResult.plan.cohortKey,
              datasetCode: previewResult.plan.datasetCode,
              regionCode: previewResult.plan.regionCode,
              releaseCode: previewResult.plan.releaseCode,
              rowCount: previewResult.plan.rowCount,
              source: previewResult.plan.source,
              sourceVersion: previewResult.plan.sourceVersion,
              geometryStatus: previewResult.plan.geometryStatus,
              transform: 'simplified',
              theme: 'divisions',
              type: 'divisionArea',
            },
            uploadResult,
            preparedUploadFile,
            {
              deferApiReleaseSet: options.deferApiReleaseSet,
              inputFilePath: preparedUploadFile.filePath,
              normalisedInput: processingResult.normalisedRows,
              reuseRunningRelease: true,
              skipRawSeed: true,
              skipSnapshotCleanup: options.skipSnapshotCleanup,
              validateGeometry: options.validateGeometry,
            },
          )
        }

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
        await logApiReleaseSetPublication(
          (companionProcessingResult ?? processingResult).publishResult,
          revisionDraft(),
          target,
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
        const processingResult =
          await processLocalHkgovCenstatdDistrictStatisticSqlUpload(
            target,
            {
              cohortKey: previewResult.plan.cohortKey,
              datasetCode: previewResult.plan.datasetCode,
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
            {
              deferStatsReleaseSet: options.deferStatsReleaseSet,
              promptForCuration: !options.skipConfirm,
            },
          )
        await logApiReleaseSetPublication(processingResult, revisionDraft(), target)
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
        const processingResult = await processLocalHkgovCenstatdStatisticSqlUpload(
          target,
          {
            cohortKey: previewResult.plan.cohortKey,
            datasetCode: previewResult.plan.datasetCode,
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
          {
            deferStatsReleaseSet: options.deferStatsReleaseSet,
            promptForCuration: !options.skipConfirm,
          },
        )
        await logApiReleaseSetPublication(processingResult, revisionDraft(), target)
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
  datasetCode: string | undefined,
  source: string | undefined,
  sourceVersion: string | undefined,
  transform: string | undefined,
  sourceArchive: { key: string; sha256: string } | undefined,
) {
  if (!isHkgovCenstatdDistrictFile(filePath, source)) return null

  const inputSourceVersion = sourceVersion ?? inferCenstatdSourceVersion(filePath)
  if (
    inputSourceVersion !== '2016' &&
    inputSourceVersion !== '2021' &&
    inputSourceVersion !== '2024'
  ) {
    throw new Error(
      'C&SD District Council GML requires --source-version 2016, 2021, or 2024.',
    )
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
      {
        datasetCode: censtatdDistrictDatasetCode(datasetCode),
        sourceArchive,
      },
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

export function censtatdDistrictDatasetCode(datasetCode: string | undefined) {
  if (
    datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district' ||
    datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district' ||
    datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-population-households-district' ||
    datasetCode === 'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district'
  ) {
    return datasetCode
  }
  if (datasetCode) {
    throw new Error(
      `C&SD District Council GML does not support dataset ${datasetCode}.`,
    )
  }
  return undefined
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
  return filePath.match(/(?:^|[^0-9])(2016|2021|2024)(?:[^0-9]|$)/)?.[1]
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
      previewResult.plan.source === 'hkgov-landsd' ||
      previewResult.plan.source === 'hkgov-censtatd')
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

const LEGACY_OVERTURE_DIVISION_DATASET_CODE = 'ds-hk-overture-division'

type DivisionReleaseSetMemberReadiness = {
  cohortKeys: string[]
  cohortMatchingMode: string
  isRequired: boolean
  releaseCode: string | null
  resourceType: string
  variant: string
}

type DivisionReleaseSetReadiness = {
  domainCode: string
  members: DivisionReleaseSetMemberReadiness[]
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
  if (
    plan.source === 'hkgov-had' ||
    (plan.source === 'hkgov-censtatd' &&
      (plan.datasetCode === 'ds-hk-hkgov-censtatd-division-area-district' ||
        plan.datasetCode ===
          'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district' ||
        plan.datasetCode ===
          'ds-hk-hkgov-censtatd-division-statistic-population-households-district' ||
        plan.datasetCode ===
          'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district' ||
        plan.datasetCode ===
          'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district'))
  ) {
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
      `No published division snapshot was found for the ${plan.cohortKey} cohort.`,
      'Upload the division release first, then rerun this upload.',
    ].join(' '),
  )
}

export async function resolveDivisionApiReleaseSetReadiness(
  target: UploadTarget,
  plan: DivisionGeometryPlan,
): Promise<DivisionReleaseSetReadiness> {
  const domainCode = resolveDivisionDomainCode(plan.source, plan.datasetCode)
  const resolveReadiness = (db: HarbourReadableDb) =>
    resolveDivisionCompositionReadiness(db, plan, domainCode)

  if (target.remote) {
    return withRemoteCachedMetaDb(target, db =>
      resolveReadiness(db as unknown as HarbourReadableDb),
    )
  }

  const dbContext = await resolveLocalAddressDbContext(
    target,
    plan.regionCode,
    resolveShardYear(plan.cohortKey, plan.sourceVersion),
    { cacheTableProfile: 'division' },
  )
  try {
    return await resolveReadiness(dbContext.metaDb as unknown as HarbourReadableDb)
  } finally {
    dbContext.cleanup()
  }
}

export function formatDivisionApiReleaseSetReadiness(
  plan: Pick<DivisionGeometryPlan, 'cohortKey' | 'regionCode'> &
    Partial<Pick<DivisionGeometryPlan, 'datasetCode' | 'source'>>,
  readiness: DivisionReleaseSetReadiness,
) {
  const width = Math.max(...readiness.members.map(member => member.resourceType.length))

  return [
    '# REQUIRED MEMBERS',
    `${plan.regionCode.toUpperCase()} / ${readiness.domainCode} / ${plan.cohortKey}`,
    ...readiness.members.map(member => {
      const available = member.releaseCode !== null
      const cohort = member.cohortKeys.join(', ')
      const mode = member.cohortMatchingMode.replaceAll('_', ' ')
      return `  ${available ? greenText('✓') : member.isRequired ? redText('○') : yellowText('○')} ${formatResourceType(member.resourceType.padEnd(width))}  ${mutedText(`(${member.variant}; ${mode}${cohort ? `: ${cohort}` : ''})`)}  ${available ? greenText('available') : member.isRequired ? redText('unavailable') : yellowText('[optional]')}`
    }),
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
  const domainCode = releaseSetCode?.match(/--([a-z0-9-]+)$/i)?.[1] ?? 'official'

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

async function logApiReleaseSetPublication(
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
  revisionDraft?: {
    datasetName: string
    prompt: boolean
    publisherCode: string
    sourceVersion: string
  },
  target?: UploadTarget,
) {
  const publications = selectPublishedApiReleaseSetPublications(result)
  for (const publication of publications) {
    log.success(
      `Published API domain release ${rainbowWaveText(publication.apiReleaseSetCode)}.`,
    )
    await recordInitialisationSummaryEvent({
      apiReleaseSetCode: publication.apiReleaseSetCode,
      type: 'published-api-release-set',
    })
    if (publication.apiCatalogRevisionCode) {
      log.info(`Catalogue revision ${blueText(publication.apiCatalogRevisionCode)}`)
    }
  }

  const releaseSetCode = result?.apiReleaseSetCode
  if (releaseSetCode && result?.apiReleaseSetStatus !== 'current') {
    log.warn(`${redText('DRAFT')} ${blueText(releaseSetCode)}`)
  }

  if (!revisionDraft || !target) return

  for (const { apiReleaseSetCode } of publications) {
    try {
      const draft =
        (await createApiReleaseSetInitialDraft(apiReleaseSetCode, target)) ??
        (await createApiReleaseSetRevisionDraft(
          { apiReleaseSetCode, ...revisionDraft },
          { prompt: revisionDraft.prompt },
        ))
      if (draft?.status === 'created') {
        log.info(`Drafted API release docs: ${draft.path}`)
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      log.warn(`API release docs were not drafted: ${reason}`)
    }
  }
}

export function selectPublishedApiReleaseSetPublications(
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
  const publications = new Map<
    string,
    { apiCatalogRevisionCode?: string; apiReleaseSetCode: string }
  >()
  for (const publication of result?.apiReleaseSetPublications ?? []) {
    publications.set(publication.apiReleaseSetCode, publication)
  }
  if (result?.apiReleaseSetCode && result.apiReleaseSetStatus === 'current') {
    const existing = publications.get(result.apiReleaseSetCode)
    publications.set(result.apiReleaseSetCode, {
      apiCatalogRevisionCode:
        existing?.apiCatalogRevisionCode ?? result.apiCatalogRevisionCode,
      apiReleaseSetCode: result.apiReleaseSetCode,
    })
  }
  return [...publications.values()]
}

export function resolveDivisionDomainCode(
  source: DivisionGeometryPlan['source'] | undefined,
  datasetCode?: string,
) {
  if (
    datasetCode ===
    'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups'
  ) {
    return 'hkgov-censtatd-hma'
  }
  return source === 'hkgov-landsd' ||
    source === 'hkgov-pland-pu' ||
    source === 'hkgov-pland-new-town'
    ? source
    : 'geographic'
}

function matchesDivisionDomain(
  source: DivisionGeometryPlan['source'] | undefined,
  datasetCode?: string,
) {
  const domainCode = resolveDivisionDomainCode(source, datasetCode)

  // The initial Overture division snapshot predates snapshot lineages. Its
  // primary dataset is therefore the durable domain identity until it is
  // superseded by a lineage-backed revision.
  return domainCode === 'geographic'
    ? or(
        eq(metaSchema.metaSnapshotLineages.variant, 'overture'),
        eq(metaSchema.metaDatasets.code, LEGACY_OVERTURE_DIVISION_DATASET_CODE),
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
    if (isCenstatdPermanentLivingQuartersPlan(plan)) {
      return await resolveCenstatdPermanentLivingQuartersDivisionSnapshot(
        db as unknown as HarbourReadableDb,
        plan,
      )
    }
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
            matchesDivisionDomain(plan.source, plan.datasetCode),
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
  return withRemoteCachedMetaDb(target, async db => {
    if (isCenstatdPermanentLivingQuartersPlan(plan)) {
      return resolveCenstatdPermanentLivingQuartersDivisionSnapshot(
        db as unknown as HarbourReadableDb,
        plan,
      )
    }
    return (
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
            matchesDivisionDomain(plan.source, plan.datasetCode),
            eq(metaSchema.metaSnapshots.cohortKey, plan.cohortKey),
            eq(metaSchema.metaSnapshotSources.role, 'primary'),
          ),
        )
        .limit(1)
        .get()) ?? null
    )
  })
}

async function resolveCenstatdPermanentLivingQuartersDivisionSnapshot(
  db: HarbourReadableDb,
  plan: DivisionGeometryPlan,
) {
  return (
    (await resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey(
      db,
      'division',
      plan.regionCode,
      plan.cohortKey,
      { publisherCode: 'overture' },
    )) ??
    (await resolveEarliestPublishedSnapshotForResourceTypeRegionAtOrAfterCohortKey(
      db,
      'division',
      plan.regionCode,
      plan.cohortKey,
      { publisherCode: 'overture' },
    ))
  )
}

function isCenstatdPermanentLivingQuartersPlan(plan: DivisionGeometryPlan) {
  return (
    plan.source === 'hkgov-censtatd' &&
    plan.datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters'
  )
}

async function resolveDivisionCompositionReadiness(
  db: HarbourReadableDb,
  plan: DivisionGeometryPlan,
  domainCode: string,
): Promise<DivisionReleaseSetReadiness> {
  const members = (await listCurrentApiCompositionMembersForType(db, 'division'))
    .filter(member => member.domainCode === domainCode)
    .filter(member => member.resourceType.startsWith('division'))

  if (members.length === 0) {
    throw new Error(
      `No current Divisions API composition members were found for domain ${domainCode}.`,
    )
  }

  const readinessMembers = await Promise.all(
    members.map(async member => {
      const snapshots = await resolveCompositionMemberSnapshots(db, member, plan)
      return {
        cohortKeys: snapshots.map(snapshot => snapshot.cohortKey),
        cohortMatchingMode: member.cohortMatchingMode,
        isRequired: member.isRequired,
        releaseCode: snapshots[0]?.code ?? null,
        resourceType: member.resourceType,
        variant: member.variant,
      }
    }),
  )

  return {
    domainCode,
    members: readinessMembers,
    ready: readinessMembers.every(member => !member.isRequired || member.releaseCode),
  }
}

async function resolveCompositionMemberSnapshots(
  db: HarbourReadableDb,
  member: Awaited<ReturnType<typeof listCurrentApiCompositionMembersForType>>[number],
  plan: DivisionGeometryPlan,
): Promise<Array<{ code: string; cohortKey: string }>> {
  if (member.variant === 'default') {
    const snapshot = await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
      db,
      member.resourceType,
      plan.regionCode,
      plan.cohortKey,
    )
    return snapshot ? [{ code: snapshot.code, cohortKey: plan.cohortKey }] : []
  }

  const datasetCode = member.variant.startsWith('ds-') ? member.variant : undefined
  const source = member.variant.split(':')[0] ?? member.variant
  const publisherCode = datasetCode ? undefined : publisherCodeForSource(source)
  const snapshots =
    await resolvePublishedSnapshotsForResourceTypeRegionAtOrBeforeCohortKey(
      db,
      member.resourceType,
      plan.regionCode,
      plan.cohortKey,
      { datasetCode, publisherCode, variant: member.variant },
    )

  if (member.cohortMatchingMode === 'latest_at_or_before_cohort_per_dataset') {
    return snapshots.map(snapshot => ({
      code: snapshot.code,
      cohortKey: snapshot.cohortKey,
    }))
  }
  if (member.cohortMatchingMode === 'latest_at_or_before_or_earliest_after_cohort') {
    if (snapshots.length > 0) {
      return snapshots.map(snapshot => ({
        code: snapshot.code,
        cohortKey: snapshot.cohortKey,
      }))
    }
    const snapshot =
      await resolveEarliestPublishedSnapshotForResourceTypeRegionAtOrAfterCohortKey(
        db,
        member.resourceType,
        plan.regionCode,
        plan.cohortKey,
        { datasetCode, publisherCode },
      )
    return snapshot ? [{ code: snapshot.code, cohortKey: snapshot.cohortKey }] : []
  }

  return snapshots
    .filter(snapshot => snapshot.cohortKey === plan.cohortKey)
    .map(snapshot => ({ code: snapshot.code, cohortKey: snapshot.cohortKey }))
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
