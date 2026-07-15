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

import {
  resolveLatestPublishedSnapshotForResourceTypeRegion,
  resolvePublishedSnapshotForResourceTypeRegionCohortKey,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { resolveSourceSchemaVersion } from '@repo/core'
import { prepareUpload } from '@repo/core/uploadLocal'
import { metaSchema } from '@repo/db'
import { and, desc, eq, inArray, lte } from 'drizzle-orm'

import { resolveLocalAddressDbContext } from '../addressSql/localDbCache.ts'
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

  let sourcePreparationCleanup: (() => Promise<void>) | undefined
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

    const prepareSpinner = spinner()
    prepareSpinner.start(resolvePrepareUploadFileMessage(previewResult))

    let preparedUploadFile: Awaited<ReturnType<typeof prepareUploadFileForDispatch>>

    try {
      preparedUploadFile = await prepareUploadFileForDispatch(
        registerOptions.filePath,
        previewResult,
      )

      if (preparedUploadFile?.transformed) {
        prepareSpinner.stop('Prepared upload file')
      } else {
        prepareSpinner.clear()
      }
    } catch (error) {
      prepareSpinner.error('Upload file preparation failed')
      throw error
    }

    try {
      const uploadSpinner = spinner()
      uploadSpinner.start('Uploading')

      let uploadResult: Awaited<ReturnType<typeof dispatchUpload>>
      try {
        uploadResult = await dispatchUpload(
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
        uploadSpinner.clear()
      } catch (error) {
        uploadSpinner.error('Upload failed')
        throw error
      }

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

        const releaseSetReadiness = await resolveDivisionApiReleaseSetReadiness(
          target,
          previewResult.plan,
        )
        note(
          formatDivisionApiReleaseSetReadiness(previewResult.plan, releaseSetReadiness),
          'API RELEASE SET',
        )
        outro(formatSuccessfulReleaseMessage(commandStartedAt))
        return
      }

      if (processingStrategy.mode === 'local-division-geometry-sql') {
        if (
          (previewResult.plan.type !== 'divisionArea' &&
            previewResult.plan.type !== 'divisionBoundary') ||
          previewResult.plan.theme !== 'divisions' ||
          (previewResult.plan.source !== 'overture' &&
            previewResult.plan.source !== 'hkgov-had')
        ) {
          throw new Error(
            'Local division geometry SQL processing requires an Overture or Home Affairs Department divisionArea or divisionBoundary dataset.',
          )
        }

        if (!preparedUploadFile) {
          throw new Error('Expected a prepared upload file for local SQL processing.')
        }

        await processLocalDivisionGeometrySqlUpload(
          target,
          {
            cohortKey: previewResult.plan.cohortKey,
            regionCode: previewResult.plan.regionCode,
            releaseCode: previewResult.plan.releaseCode,
            rowCount: previewResult.plan.rowCount,
            source: previewResult.plan.source,
            sourceVersion: previewResult.plan.sourceVersion,
            theme: 'divisions',
            type: previewResult.plan.type,
          },
          uploadResult,
          preparedUploadFile,
          { skipSnapshotCleanup: options.skipSnapshotCleanup },
        )

        const releaseSetReadiness = await resolveDivisionApiReleaseSetReadiness(
          target,
          previewResult.plan,
        )
        note(
          formatDivisionApiReleaseSetReadiness(previewResult.plan, releaseSetReadiness),
          'API RELEASE SET',
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

function isHkgovHadGeoJson(filePath: string, source: string | undefined) {
  return (
    filePath.toLowerCase().endsWith('.geojson') &&
    (source === 'hkgov-had' || /(^|[._/\\-])hkgov-had([._/\\-]|$)/i.test(filePath))
  )
}

function resolvePrepareUploadFileMessage(
  _previewResult: Awaited<ReturnType<typeof prepareUpload>>,
) {
  return 'Preparing upload file'
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

  if (
    (previewResult.plan.type === 'divisionArea' ||
      previewResult.plan.type === 'divisionBoundary') &&
    previewResult.plan.theme === 'divisions' &&
    (previewResult.plan.source === 'overture' ||
      previewResult.plan.source === 'hkgov-had')
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
        `No published division snapshot was found for cohort ${plan.cohortKey}.`,
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

type DivisionGeometryPlan = Awaited<ReturnType<typeof prepareUpload>>['plan']

const COHORT_INDEPENDENT_DIVISION_RELEASE_DATASETS = [
  'ds-hk-hkgov-had-district',
] as const

type CohortIndependentReleaseReadiness = {
  datasetCode: string
  releaseCode: string | null
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

  // HAD district areas are bridged directly to canonical division identifiers.
  // They are selected as a geometry variant when a later release set is cut.
  if (plan.source === 'hkgov-had') return

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
      `No published division snapshot was found for cohort ${plan.cohortKey}.`,
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
  const cohortIndependentReleases = target.remote
    ? await resolveRemoteCohortIndependentDivisionReleases(target, plan)
    : await resolveLocalCohortIndependentDivisionReleases(target, plan)
  const divisionAvailable = snapshots.division
  const areaAvailable =
    snapshots.divisionArea ||
    cohortIndependentReleases.some(release => release.releaseCode !== null)
  const boundaryAvailable = snapshots.divisionBoundary
  const ready = divisionAvailable && areaAvailable && boundaryAvailable

  return {
    areaAvailable,
    boundaryAvailable,
    cohortIndependentReleases,
    divisionAvailable,
    ready,
  }
}

export function formatDivisionApiReleaseSetReadiness(
  plan: Pick<DivisionGeometryPlan, 'cohortKey' | 'regionCode'>,
  readiness: DivisionReleaseSetReadiness,
) {
  const rows = [
    ['division', readiness.divisionAvailable],
    ['divisionArea', readiness.areaAvailable],
    ['divisionBoundary', readiness.boundaryAvailable],
  ] as const
  const width = Math.max(...rows.map(([dataset]) => dataset.length))
  const cohortIndependentRows: Array<[release: string, available: boolean]> =
    readiness.cohortIndependentReleases.map(release => [
      release.releaseCode ?? release.datasetCode,
      release.releaseCode !== null,
    ])
  const cohortIndependentWidth = Math.max(
    ...cohortIndependentRows.map(([release]) => release.length),
  )

  return [
    `${plan.regionCode.toUpperCase()} / ${plan.cohortKey}`,
    ...rows.map(
      ([dataset, available]) =>
        `  ${available ? greenText('✓') : yellowText('○')} ${dataset.padEnd(width)}  ${available ? 'available' : 'unavailable'}`,
    ),
    '',
    'At or Before Cohort',
    ...cohortIndependentRows.map(
      ([release, available]) =>
        `  ${available ? greenText('✓') : yellowText('○')} ${release.padEnd(cohortIndependentWidth)}  ${available ? 'available' : 'unavailable'}`,
    ),
  ].join('\n')
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
    return await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
      dbContext.metaDb as unknown as HarbourReadableDb,
      'division',
      plan.regionCode,
      plan.cohortKey,
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
    INNER JOIN snapshotSources ss ON ss.snapshotId = s.id
    INNER JOIN datasets d ON d.id = ss.datasetId
    WHERE s.resourceType = 'division'
      AND s.status = 'published'
      AND d.regionCode = ${sqlLiteral(plan.regionCode)}
      AND s.cohortKey = ${sqlLiteral(plan.cohortKey)}
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
              await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
                db,
                resourceType,
                plan.regionCode,
                plan.cohortKey,
              ),
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
    INNER JOIN snapshotSources ss ON ss.snapshotId = s.id
    INNER JOIN datasets d ON d.id = ss.datasetId
    WHERE s.resourceType IN (${values})
      AND s.status = 'published'
      AND d.regionCode = ${sqlLiteral(plan.regionCode)}
      AND s.cohortKey = ${sqlLiteral(plan.cohortKey)}
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
            COHORT_INDEPENDENT_DIVISION_RELEASE_DATASETS,
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
  const datasetCodes =
    COHORT_INDEPENDENT_DIVISION_RELEASE_DATASETS.map(sqlLiteral).join(', ')
  const rows = await runRemoteMetaQuery(
    target,
    `
    SELECT d.code AS datasetCode, r.code AS releaseCode
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
      typeof row.datasetCode === 'string' && typeof row.releaseCode === 'string'
        ? [{ datasetCode: row.datasetCode, releaseCode: row.releaseCode }]
        : [],
    ),
  )
}

function resolveCohortIndependentReleaseReadiness(
  releases: Array<{ datasetCode: string; releaseCode: string }>,
): CohortIndependentReleaseReadiness[] {
  const latestReleaseByDataset = new Map<string, string>()
  for (const release of releases) {
    if (!latestReleaseByDataset.has(release.datasetCode)) {
      latestReleaseByDataset.set(release.datasetCode, release.releaseCode)
    }
  }

  return COHORT_INDEPENDENT_DIVISION_RELEASE_DATASETS.map(datasetCode => ({
    datasetCode,
    releaseCode: latestReleaseByDataset.get(datasetCode) ?? null,
  }))
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
    INNER JOIN snapshotSources ss ON ss.snapshotId = s.id
    INNER JOIN datasets d ON d.id = ss.datasetId
    WHERE s.resourceType = 'division'
      AND s.status = 'published'
      AND d.regionCode = ${sqlLiteral(plan.regionCode)}
      AND ss.role = 'primary'
    ORDER BY
      CASE WHEN s.cohortKey = ${sqlLiteral(plan.cohortKey)} THEN 0 ELSE 1 END,
      s.publishedAt DESC,
      s.createdAt DESC
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

  schemaSpinner.stop(formatSchemaCheck('skipped'))
  return `${previewResult.plan.source}-${previewResult.plan.type}-unvalidated`
}
