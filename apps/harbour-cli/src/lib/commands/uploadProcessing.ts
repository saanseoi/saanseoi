import { note } from '@clack/prompts'
import type { prepareUpload } from '@repo/core/uploadLocal'
import { processLocalAddressSqlUpload } from '../pipeline/addresses/processLocalAddressSqlUpload.ts'
import { processLocalStreetSqlUpload } from '../pipeline/streets/processLocalStreetSqlUpload.ts'
import { processLocalDivisionSqlUpload } from '../pipeline/divisions/processLocalDivisionSqlUpload.ts'
import { processLocalHkgovPlandDivisionSqlUpload } from '../pipeline/divisions/processLocalHkgovPlandDivisionSqlUpload.ts'
import { processLocalDivisionGeometrySqlUpload } from '../pipeline/divisions/processLocalDivisionGeometrySqlUpload.ts'
import { processLocalHkgovCenstatdDistrictStatisticSqlUpload } from '../pipeline/statistics/processLocalHkgovCenstatdDistrictStatisticSqlUpload.ts'
import { processLocalHkgovCenstatdStatisticSqlUpload } from '../pipeline/statistics/processLocalHkgovCenstatdStatisticSqlUpload.ts'
import { processLocalPlaceSqlUpload } from '../pipeline/places/processLocalPlaceSqlUpload.ts'
import type { UploadTarget } from '../cli/options.ts'
import type { prepareUploadFileForDispatch } from '../upload/parquetRepack.ts'
import type { dispatchUpload } from '../upload/upload.ts'
import type { runUploadCommand } from './upload.ts'
import {
  formatAddressApiReleaseSetReadiness,
  formatDivisionApiReleaseSetReadiness,
  logApiReleaseSetPublication,
  wideApiDomainReleaseNote,
} from './uploadDisplay.ts'
import {
  resolveAddressApiReleaseSetReadiness,
  resolveDivisionApiReleaseSetReadiness,
  withReleaseSetCohort,
} from './uploadReadiness.ts'

export function resolveUploadProcessingStrategy(
  previewResult: Awaited<ReturnType<typeof prepareUpload>>,
) {
  if (
    previewResult.plan.resourceType === 'divisionStatistic' &&
    previewResult.plan.theme === 'stats' &&
    previewResult.plan.source === 'hkgov-censtatd' &&
    previewResult.plan.datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district'
  ) {
    return { mode: 'local-hkgov-censtatd-statistic-sql' as const }
  }

  if (
    previewResult.plan.resourceType === 'divisionStatistic' &&
    previewResult.plan.theme === 'stats' &&
    previewResult.plan.source === 'hkgov-censtatd'
  )
    return { mode: 'local-hkgov-censtatd-generic-statistic-sql' as const }

  if (
    previewResult.plan.resourceType === 'address' &&
    previewResult.plan.theme === 'addresses'
  ) {
    return {
      mode: 'local-address-sql' as const,
    }
  }

  if (
    previewResult.plan.resourceType === 'place' &&
    previewResult.plan.theme === 'places' &&
    previewResult.plan.source === 'overture'
  ) {
    return { mode: 'local-place-sql' as const }
  }

  if (
    previewResult.plan.resourceType === 'street' &&
    previewResult.plan.theme === 'streets' &&
    previewResult.plan.source === 'hkgov-landsd'
  ) {
    return { mode: 'local-street-sql' as const }
  }

  if (
    previewResult.plan.resourceType === 'division' &&
    previewResult.plan.theme === 'divisions' &&
    (previewResult.plan.source === 'hkgov-pland-pu' ||
      previewResult.plan.source === 'hkgov-pland-new-town')
  ) {
    return { mode: 'local-hkgov-pland-division-sql' as const }
  }

  if (
    previewResult.plan.resourceType === 'division' &&
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
    (previewResult.plan.resourceType === 'divisionArea' ||
      previewResult.plan.resourceType === 'divisionBoundary') &&
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
    `Unsupported upload type for local SQL processing: ${previewResult.plan.source}/${previewResult.plan.resourceType}.`,
  )
}

export async function processPreparedUpload({
  processingStrategy,
  previewResult,
  preparedUploadFile,
  target,
  uploadResult,
  options,
  revisionDraft,
  divisionGeometryTransform,
  cacheArtefacts,
}: {
  cacheArtefacts: boolean
  processingStrategy: ReturnType<typeof resolveUploadProcessingStrategy>
  previewResult: Awaited<ReturnType<typeof prepareUpload>>
  preparedUploadFile: Awaited<ReturnType<typeof prepareUploadFileForDispatch>>
  target: UploadTarget
  uploadResult: Awaited<ReturnType<typeof dispatchUpload>>
  options: Parameters<typeof runUploadCommand>[2]
  revisionDraft: () => Parameters<typeof logApiReleaseSetPublication>[1]
  divisionGeometryTransform: 'simplified' | undefined
}) {
  if (processingStrategy.mode === 'local-address-sql') {
    if (
      previewResult.plan.resourceType !== 'address' ||
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
        resourceType: previewResult.plan.resourceType,
      },
      uploadResult,
      preparedUploadFile,
      {
        deferApiReleaseSet: options.deferApiReleaseSet,
        processingActions: options.processingActions,
        quality: options.quality,
        skipSnapshotCleanup: options.skipSnapshotCleanup,
      },
    )

    const releaseSetReadiness = await resolveAddressApiReleaseSetReadiness(
      target,
      previewResult.plan,
      options.divisionCohortKey,
    )
    wideApiDomainReleaseNote(
      formatAddressApiReleaseSetReadiness(
        previewResult.plan,
        processingResult.publishResult?.apiReleaseSetStatus === 'current',
        processingResult.publishResult?.apiReleaseSetCode,
        releaseSetReadiness.divisionCohortKey,
      ),
    )
    await logApiReleaseSetPublication(
      processingResult.publishResult,
      revisionDraft(),
      target,
    )
    return
  }

  if (processingStrategy.mode === 'local-place-sql') {
    if (
      previewResult.plan.resourceType !== 'place' ||
      previewResult.plan.theme !== 'places' ||
      previewResult.plan.source !== 'overture'
    ) {
      throw new Error('Local Places SQL processing requires an Overture place dataset.')
    }
    if (!preparedUploadFile) {
      throw new Error('Expected a prepared upload file for local SQL processing.')
    }
    const processingResult = await processLocalPlaceSqlUpload(
      target,
      {
        cohortKey: previewResult.plan.cohortKey,
        datasetCode: previewResult.plan.datasetCode,
        regionCode: previewResult.plan.regionCode,
        releaseCode: previewResult.plan.releaseCode,
        rowCount: previewResult.plan.rowCount,
        source: 'overture',
        sourceVersion: previewResult.plan.sourceVersion,
        theme: 'places',
        resourceType: 'place',
      },
      uploadResult,
      preparedUploadFile,
      {
        deferApiReleaseSet: options.deferApiReleaseSet,
        skipSnapshotCleanup: options.skipSnapshotCleanup,
      },
    )
    await logApiReleaseSetPublication(
      processingResult.publishResult,
      revisionDraft(),
      target,
    )
    return
  }

  if (processingStrategy.mode === 'local-division-sql') {
    if (
      previewResult.plan.resourceType !== 'division' ||
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
        resourceType: previewResult.plan.resourceType,
      },
      uploadResult,
      preparedUploadFile,
      {
        deferApiReleaseSet: options.deferApiReleaseSet,
        deferSourcePublish: options.deferSourcePublish,
        reuseExistingRelease: options.reuseExistingRelease,
        skipSnapshotCleanup: options.skipSnapshotCleanup,
      },
    )

    const releaseSetReadiness = await resolveDivisionApiReleaseSetReadiness(
      target,
      previewResult.plan,
    )
    wideApiDomainReleaseNote(
      formatDivisionApiReleaseSetReadiness(previewResult.plan, releaseSetReadiness),
    )
    await logApiReleaseSetPublication(
      processingResult.publishResult,
      revisionDraft(),
      target,
    )
    return
  }

  if (processingStrategy.mode === 'local-street-sql') {
    if (
      previewResult.plan.resourceType !== 'street' ||
      previewResult.plan.theme !== 'streets' ||
      previewResult.plan.source !== 'hkgov-landsd'
    ) {
      throw new Error('LandsD street SQL processing requires a LandsD street dataset.')
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
        resourceType: 'street',
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
        source: previewResult.plan.source as 'hkgov-pland-pu' | 'hkgov-pland-new-town',
        sourceVersion: previewResult.plan.sourceVersion,
        theme: 'divisions',
        resourceType: 'division',
      },
      uploadResult,
      preparedUploadFile,
      {
        cacheArtefacts,
        skipSnapshotCleanup: options.skipSnapshotCleanup,
      },
    )
    const releaseSetReadiness = await resolveDivisionApiReleaseSetReadiness(
      target,
      withReleaseSetCohort(
        previewResult.plan,
        processingResult.publishResult?.apiReleaseSetCode,
      ),
    )
    wideApiDomainReleaseNote(
      formatDivisionApiReleaseSetReadiness(previewResult.plan, releaseSetReadiness),
    )
    await logApiReleaseSetPublication(
      processingResult.publishResult ?? undefined,
      revisionDraft(),
      target,
    )
    return
  }

  if (processingStrategy.mode === 'local-division-geometry-sql') {
    if (
      (previewResult.plan.resourceType !== 'divisionArea' &&
        previewResult.plan.resourceType !== 'divisionBoundary') ||
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
      previewResult.plan.resourceType === 'divisionArea' &&
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
        resourceType: previewResult.plan.resourceType,
      },
      uploadResult,
      preparedUploadFile,
      {
        cacheArtefacts,
        deferApiReleaseSet: options.deferApiReleaseSet,
        deferSourcePublish: options.deferSourcePublish,
        deferPublish: shouldDeriveHkgovSimplifiedGeometry,
        reuseExistingRelease: options.reuseExistingRelease,
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
          resourceType: 'divisionArea',
        },
        uploadResult,
        preparedUploadFile,
        {
          cacheArtefacts,
          deferApiReleaseSet: options.deferApiReleaseSet,
          deferSourcePublish: options.deferSourcePublish,
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
    wideApiDomainReleaseNote(
      formatDivisionApiReleaseSetReadiness(
        withReleaseSetCohort(
          previewResult.plan,
          (companionProcessingResult ?? processingResult).publishResult
            ?.apiReleaseSetCode,
        ),
        releaseSetReadiness,
      ),
    )
    await logApiReleaseSetPublication(
      (companionProcessingResult ?? processingResult).publishResult,
      revisionDraft(),
      target,
    )
    return
  }

  if (processingStrategy.mode === 'local-hkgov-censtatd-statistic-sql') {
    if (!preparedUploadFile) {
      throw new Error('Expected a prepared upload file for local SQL processing.')
    }
    if (
      previewResult.plan.resourceType !== 'divisionStatistic' ||
      previewResult.plan.theme !== 'stats' ||
      previewResult.plan.source !== 'hkgov-censtatd'
    ) {
      throw new Error(
        'C&SD statistic SQL processing requires its district statistic dataset.',
      )
    }
    const processingResult = await processLocalHkgovCenstatdDistrictStatisticSqlUpload(
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
        resourceType: 'divisionStatistic',
      },
      uploadResult,
      preparedUploadFile,
      {
        deferStatsReleaseSet: options.deferStatsReleaseSet,
        deferSourcePublish: options.deferSourcePublish,
        promptForCuration: !options.skipConfirm,
        reuseExistingRelease: options.reuseExistingRelease,
      },
    )
    await logApiReleaseSetPublication(processingResult, revisionDraft(), target)
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
        deferSourcePublish: options.deferSourcePublish,
        promptForCuration: !options.skipConfirm,
        reuseExistingRelease: options.reuseExistingRelease,
      },
    )
    await logApiReleaseSetPublication(processingResult, revisionDraft(), target)
    return
  }

  throw new Error(
    `No local SQL upload processor is available for ${previewResult.plan.source}/${previewResult.plan.resourceType}.`,
  )
}
