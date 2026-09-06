import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises'
import { createReadStream, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'

import {
  ensureDraftSnapshotForRelease,
  resolveEarliestPublishedSnapshotForResourceTypeRegionAtOrAfterCohortKey,
  resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey,
  resolveShardForTypeRegionYear,
  recordSnapshotLookupDependency,
  upsertReleaseShardAssignment,
  upsertSnapshotShardAssignment,
  upsertSnapshotSource,
  publishSnapshot,
} from '@repo/core/db/metaRegistry'
import type { DatasetProcessingMessage } from '@repo/core'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type {
  HarbourClient,
  PublishDatasetResult,
} from '@repo/core/pipeline/harbourClient'
import { replaceDatasetStats } from '@repo/core/pipeline/db/stats'
import { replaceReleaseProcessingActions } from '@repo/core/pipeline/db/processingActions'
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import { calculateAndStoreApiReleaseSetStats } from '../api/apiReleaseSetStats.ts'
import { resolveApiReleaseSetStatsTarget } from '../api/apiReleaseSetStats.ts'
import type { PreparedUploadFile } from '../upload/parquetRepack.ts'
import type { UploadTarget } from '../cli/options.ts'
import { resolvePipelineEnvironment } from '../cli/options.ts'
import {
  createAsyncBufferFromR2,
  readParquetObjectsInBatches,
} from '@repo/core/pipeline/parquetR2'
import {
  hashNormalisedPlace,
  hashPlaceMaterialisation,
  assertPlaceAddressCardinality,
  buildPlaceLocalisationStatistics,
  extractPlaceAddressTexts,
  getPlaceAddressCountry,
  normaliseOverturePlace,
  type PlaceLocalisationStatistics,
  type NormalisedPlace,
} from '@repo/core/pipeline/services/place'
import {
  addressFingerprint,
  createSupplementaryAddressAnalyser,
  parseSupplementaryCuration,
  type AddressResolution,
} from './supplementaryPlaceAddress.ts'
import type { PlaceAddressDefinition } from './placeAddressMatcher.ts'
import {
  buildSupplementaryAddressRows,
  SUPPLEMENTARY_ADDRESS_VARIANT,
} from './supplementaryPlaceAddressRows.ts'
import { createHash } from '@repo/core/pipeline/utils'
import { parseWkbGeometry } from '@repo/core/pipeline/services/division'
import { recordPlaceAddressAssembly } from '@repo/core/pipeline/services/placeAddressAssembly'
import { buildAddressBuildingNumberLookupRows } from '@repo/core/pipeline/services/addressPipeline/normalisation'
import {
  currentSchema,
  historySchema,
  metaSchema,
  buildDeterministicUuidV5,
} from '@repo/db'
import type { ReleaseScopedStatsRow } from '@repo/db/metaSchema'
import { and, eq, ne, isNotNull, lte } from 'drizzle-orm'
import { latLngToCell } from 'h3-js'

import { createHarbourControlClient } from '../api/harbourControl.ts'
import {
  replayRemoteCacheWithRetry,
  refreshRemoteMetaCache,
  resolveLocalAddressDbContext,
  type LocalAddressDbContext,
} from '../dbCache/localDbCache.ts'
import {
  executeSqlText,
  type SqlImportExecutionOptions,
  type SqlImportTargetContext,
} from '../localPipeline/sqlImport.ts'
import {
  mapWithConcurrency,
  runLocalProgressPhase,
} from '../localPipeline/orchestrator.ts'
import { createLocalControlClient } from '../localPipeline/localControlClient.ts'
import { syncStagedReleaseIntoLocalMetaCache } from '../localPipeline/syncStagedRelease.ts'
import { LocalPipelineBucket } from '../localPipeline/localBucket.ts'
import { OperationProgress } from '../cli/operationProgress.ts'

type PlaceUploadPlan = {
  datasetCode: string
  cohortKey: string
  regionCode: 'hk' | 'mo'
  releaseCode: string
  rowCount: number
  source: 'overture'
  sourceVersion: string
  theme: 'places'
  type: 'place'
}

type UploadResult = {
  datasetCode?: string
  datasetId?: string
  rawObjectKey?: string
  releaseCode?: string
  releaseId?: string
}

type EnrichedPlace = {
  place: NormalisedPlace
  addressSnapshotId?: string | null
  address2dId: string | null
  address3dId: string | null
  divisionIds: string[]
  versionHash: string
  sourcePayloadHash: string
}

/** Only retain history fields needed for replay and address continuity. */
type PlaceHistoryRow = Pick<
  typeof historySchema.places.$inferSelect,
  | 'id'
  | 'address2dId'
  | 'addressSnapshotId'
  | 'addresses'
  | 'createdAt'
  | 'firstSeenMonth'
  | 'lastSeenMonth'
  | 'releaseId'
  | 'versionHash'
>

type PlaceHistoryState = {
  bindingName: string
  row: PlaceHistoryRow
}

type BuildPlaceSqlInput = {
  activeHistoryBindingName: string
  activeSourceBindingName: string
  sourceBindingNames: string[]
  datasetId: string
  message: DatasetProcessingMessage
  snapshots: {
    addressSnapshotId: string
    divisionSnapshotId: string
    snapshotId: string
  }
  places: EnrichedPlace[]
  historyRows: PlaceHistoryState[]
}

type BuildPlaceSqlOptions = {
  includeInitialStatements?: boolean
  includeRemovedPlaces?: boolean
  onProgress?: (current: number) => void
  timestamp?: string
}

type PlaceSqlProgressEvent = {
  current: number
  detail?: string
  phase: 'generate' | 'import'
}

type StagedPlaces = {
  actions: ReleaseProcessingAction[]
  includedRows: number
  path: string
  processedRows: number
}

type StagedEnrichedPlaces = {
  path: string
  processedRows: number
  stats: PlaceReleaseStatsAccumulator
}

type PlaceReleaseStatsAccumulator = {
  addressLinkedRows: number
  divisionLinkedRows: number
  localeCounts: Map<string, number>
  localisedPlaceCount: number
  localisedRows: number
  localisation: PlaceLocalisationStatistics
  processedRows: number
}

const LOCAL_RELEASE_ROOT = resolve(
  import.meta.dir,
  '../../../../../.local/harbour-sql/releases',
)
const PLACE_BATCH_SIZE = 512
const PLACE_ENRICHMENT_CONCURRENCY = 4
const PLACE_SQL_BATCH_SIZE = 512
const MAX_SQL_BYTES = 90_000
const PLACE_H3_LEVELS = [5, 7, 9] as const
const SUPPLEMENTARY_CURATION_PATH = resolve(
  import.meta.dir,
  '../../../../../fixtures/meta/curations/overture-place-address.json',
)
const NORMALISED_PLACES_FILE = 'normalised-places.jsonl'
const ENRICHED_PLACES_FILE = 'enriched-places.jsonl'

/**
 * Materialises an Overture Places release. The lifecycle is intentionally
 * family-neutral at its edges: registration, cache preparation, staged
 * progress, SQL import, publication, and failure reporting are the same
 * operations used by the address and division adapters.
 */
export async function processLocalPlaceSqlUpload(
  target: UploadTarget,
  previewPlan: PlaceUploadPlan,
  uploadResult: UploadResult,
  preparedUpload: PreparedUploadFile,
  options: {
    deferApiReleaseSet?: boolean
    skipSnapshotCleanup?: boolean
  } = {},
) {
  const releaseId = required(uploadResult.releaseId, 'releaseId')
  const releaseCode = required(uploadResult.releaseCode, 'releaseCode')
  const datasetId = required(uploadResult.datasetId, 'datasetId')
  const datasetCode = required(uploadResult.datasetCode, 'datasetCode')
  const rawObjectKey = required(uploadResult.rawObjectKey, 'rawObjectKey')
  const shardYear = resolveShardYear(previewPlan.cohortKey, previewPlan.sourceVersion)
  const releaseRoot = resolve(LOCAL_RELEASE_ROOT, targetName(target), releaseCode)
  await mkdir(releaseRoot, { recursive: true })

  const bucket = new LocalPipelineBucket(releaseRoot)
  const progress = new OperationProgress({ compact: true })
  let dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>> | undefined
  let client: HarbourClient | undefined
  let shouldRefreshRemoteMetaCache = false
  let postPublishCacheError: Error | null = null
  let publishResult: PublishDatasetResult | void | null = null

  try {
    await runPlaceProgressPhase(progress, 'Prepare', 'workspace', () =>
      bucket.seedRawObject(rawObjectKey, preparedUpload.filePath),
    )
    dbContext = await runPlaceProgressPhase(
      progress,
      'Open local D1',
      'Places data',
      () =>
        resolveLocalAddressDbContext(target, previewPlan.regionCode, shardYear, {
          cacheTableProfile: 'places',
          includePreviousShardYears: true,
          refreshRemoteTables: false,
        }),
    )
    const context = dbContext
    if (!context) throw new Error('Places database context was not opened.')

    const metaDb = context.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
    const message: DatasetProcessingMessage = {
      datasetId,
      datasetCode,
      rawObjectKey,
      releaseCode,
      releaseId,
      regionCode: previewPlan.regionCode,
      shardYear,
      cohortKey: previewPlan.cohortKey,
      source: previewPlan.source,
      sourceVersion: previewPlan.sourceVersion,
      theme: previewPlan.theme,
      type: previewPlan.type,
      processingMode: 'sql',
      ...(options.skipSnapshotCleanup ? { skipSnapshotCleanup: true } : {}),
    }
    await runPlaceProgressPhase(progress, 'Sync down', 'release metadata', () =>
      syncStagedReleaseIntoLocalMetaCache(
        metaDb as never,
        { datasetCode, rawObjectKey, releaseCode, releaseId },
        message,
      ),
    )

    const remoteClient = createHarbourControlClient(target) as HarbourClient
    const processingClient = target.remote
      ? remoteClient
      : createLocalControlClient(metaDb as never, { publishClient: remoteClient })
    client = processingClient
    const importOptions: SqlImportExecutionOptions = {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_D1_TOKEN,
      isLocal: !target.remote,
      localWriteMaxRetries: 8,
      metaDatabaseId: context.state.bindings.DB_META?.databaseId ?? null,
      remoteImportBatchBytes: 64 * 1024 * 1024,
    }
    await runPlaceProgressPhase(progress, 'Mark as', "'processing'", () =>
      processingClient.stageRunning(
        releaseId,
        'processDataset',
        undefined,
        releaseCode,
      ),
    )
    const snapshots = await runPlaceProgressPhase(
      progress,
      'Prepare',
      'Place snapshots',
      () =>
        resolvePlaceSnapshots(
          metaDb,
          context.currentDb as unknown as HarbourReadableDb,
          previewPlan,
          datasetId,
          releaseId,
        ),
    )
    const stagedPlaces = await runPlaceProgressPhase(
      progress,
      'Read and normalise',
      'source Places',
      reportProgress =>
        stagePlaces(
          bucket,
          rawObjectKey,
          previewPlan.sourceVersion,
          releaseRoot,
          current => reportProgress(current),
        ),
      previewPlan.rowCount,
    )
    await runPlaceProgressPhase(
      progress,
      'Review',
      'source Places',
      () => replaceReleaseProcessingActions(metaDb, releaseId, stagedPlaces.actions),
      stagedPlaces.processedRows,
    )
    const historyRows = await runPlaceProgressPhase(
      progress,
      'Prepare',
      'Place history',
      () => loadCurrentPlaceHistory(context.historyTargets),
    )
    const targets = await placeTargets(
      context,
      metaDb,
      target,
      previewPlan.regionCode,
      shardYear,
    )
    const supplementary = await prepareSupplementaryAddresses({
      context,
      metaDb,
      snapshots,
      places: readStagedJsonLines<NormalisedPlace>(stagedPlaces.path),
      historyRows,
      releaseRoot,
      plan: previewPlan,
      releaseId,
      datasetId,
      targets,
      importOptions,
      actions: stagedPlaces.actions,
    })
    const stagedEnrichedPlaces = await runPlaceProgressPhase(
      progress,
      'Match and enrich',
      'Places',
      reportProgress =>
        stageEnrichedPlaces(
          context.currentDb as unknown as HarbourReadableDb,
          snapshots,
          readStagedJsonLines<NormalisedPlace>(stagedPlaces.path),
          readStagedJsonLines<AddressResolution>(supplementary.resolutionPath),
          releaseRoot,
          current => reportProgress(current),
          supplementary,
        ),
      stagedPlaces.includedRows,
    )
    const sqlInput: BuildPlaceSqlInput = {
      activeHistoryBindingName: findTargetBindingName(
        context.historyTargets,
        context.historyDb,
      ),
      activeSourceBindingName: findTargetBindingName(
        context.sourceTargets,
        context.sourceDb,
      ),
      sourceBindingNames: context.sourceTargets.map(target => target.bindingName),
      datasetId,
      message,
      snapshots,
      places: [],
      historyRows,
    }
    const sqlTimestamp = new Date().toISOString()

    await runPlaceProgressPhase(
      progress,
      'Calculate',
      'release statistics',
      () =>
        replaceDatasetStats(
          metaDb,
          releaseId,
          buildPlaceReleaseStatsRowsFromAccumulator(stagedEnrichedPlaces.stats),
        ),
      stagedEnrichedPlaces.processedRows,
    )

    await runPlaceProgressPhase(progress, 'Write', 'release metadata', () =>
      upsertPlaceMetadata(
        metaDb,
        { ...snapshots, supplementaryAddressSnapshotId: supplementary.snapshotId },
        datasetId,
        releaseId,
        previewPlan,
        target,
      ),
    )
    if (target.remote) {
      await runPlaceProgressPhase(progress, 'Import SQL', 'snapshot metadata', () =>
        buildPlaceMetadataSql(metaDb, snapshots.snapshotId, releaseId).then(sql =>
          executeSqlText(targets.meta, sql, importOptions),
        ),
      )
    }
    await runPlaceProgressPhase(
      progress,
      'Generate and import SQL',
      'Places',
      reportProgress =>
        importPlaceSqlBatches(
          targets,
          sqlInput,
          stagedEnrichedPlaces.path,
          stagedEnrichedPlaces.processedRows,
          sqlTimestamp,
          importOptions,
          event =>
            reportProgress(
              event.current,
              event.detail ?? (event.phase === 'generate' ? 'generation' : 'import'),
            ),
        ),
      stagedEnrichedPlaces.processedRows,
    )
    await runPlaceProgressPhase(progress, 'Rebuild', 'Places search index', () =>
      executeSqlText(
        targets.current,
        readFileSync(
          resolve(
            import.meta.dir,
            '../../../../../libs/db/scripts/sql/rebuild-places-fts.sql',
          ),
          'utf8',
        ),
        importOptions,
      ),
    )
    await runPlaceProgressPhase(
      progress,
      'Mark as',
      "'completed'",
      () =>
        processingClient.stageCompleted(
          releaseId,
          'extractPlaces',
          {
            processedRows: stagedEnrichedPlaces.processedRows,
            addressLinkedRows: stagedEnrichedPlaces.stats.addressLinkedRows,
            divisionLinkedRows: stagedEnrichedPlaces.stats.divisionLinkedRows,
          },
          releaseCode,
        ),
      stagedEnrichedPlaces.processedRows,
    )
    await runPlaceProgressPhase(
      progress,
      'Mark as',
      "'completed'",
      () =>
        processingClient.stageCompleted(
          releaseId,
          'extractPlacesI18n',
          {
            localisedRows: stagedEnrichedPlaces.stats.localisedRows,
          },
          releaseCode,
        ),
      stagedEnrichedPlaces.stats.localisedRows,
    )
    await runPlaceProgressPhase(progress, 'Publish', 'curated Address collection', () =>
      processingClient.publishDataset(
        supplementary.releaseId,
        supplementary.releaseCode,
        {
          carriedSnapshots: [
            {
              resourceType: 'address',
              snapshotId: snapshots.addressSnapshotId,
              variant: 'default',
            },
            {
              resourceType: 'division',
              snapshotId: snapshots.divisionSnapshotId,
              variant: 'overture',
            },
          ],
          deferSourcePublish: true,
          deferApiReleaseSet: options.deferApiReleaseSet,
          skipSnapshotCleanup: true,
        },
      ),
    )
    publishResult = (await runPlaceProgressPhase(
      progress,
      'Publish',
      'source release',
      () =>
        processingClient.publishDataset(releaseId, releaseCode, {
          carriedSnapshots: [
            {
              resourceType: 'address',
              snapshotId: snapshots.addressSnapshotId,
              variant: 'default',
            },
            {
              resourceType: 'division',
              snapshotId: snapshots.divisionSnapshotId,
              variant: 'overture',
            },
          ],
          deferApiReleaseSet: options.deferApiReleaseSet,
          skipSnapshotCleanup: options.skipSnapshotCleanup,
        }),
    )) as PublishDatasetResult | void
    if (target.remote) {
      try {
        const cacheImportOptions: SqlImportExecutionOptions = {
          ...importOptions,
          accountId: undefined,
          apiToken: undefined,
          isLocal: true,
        }
        await runPlaceProgressPhase(
          progress,
          'Sync down',
          'remote cache',
          reportProgress =>
            replayRemoteCacheWithRetry(
              target.environment === 'production' ? 'production' : 'preview',
              context.state.dbCacheDir,
              releaseCode,
              async () => {
                await importPlaceSqlBatches(
                  targets,
                  sqlInput,
                  stagedEnrichedPlaces.path,
                  stagedEnrichedPlaces.processedRows,
                  sqlTimestamp,
                  cacheImportOptions,
                  event =>
                    reportProgress(
                      event.current,
                      event.detail ?? `remote cache SQL ${event.phase}`,
                    ),
                )
                reportProgress(
                  stagedEnrichedPlaces.processedRows,
                  'remote cache search index',
                )
                await executeSqlText(
                  targets.current,
                  readFileSync(
                    resolve(
                      import.meta.dir,
                      '../../../../../libs/db/scripts/sql/rebuild-places-fts.sql',
                    ),
                    'utf8',
                  ),
                  cacheImportOptions,
                )
              },
            ),
          stagedEnrichedPlaces.processedRows,
        )
        shouldRefreshRemoteMetaCache = true
      } catch (error) {
        postPublishCacheError = normaliseError(error)
      }
    }
    if (postPublishCacheError) throw postPublishCacheError
    if (!options.deferApiReleaseSet) {
      await calculateAndStoreApiReleaseSetStats({
        family: 'place',
        currentDb: context.currentDb as unknown as HarbourReadableDb,
        harbourClient: processingClient,
        importOptions: {
          accountId: importOptions.accountId,
          apiToken: importOptions.apiToken,
          isLocal: importOptions.isLocal,
          metaDatabaseId: importOptions.metaDatabaseId,
        },
        metaDb,
        progress,
        releaseCode,
        releaseId,
        target: resolveApiReleaseSetStatsTarget(publishResult),
      })
    }
    await runPlaceProgressPhase(
      progress,
      'Complete',
      'Places processing',
      () =>
        processingClient.stageCompleted(
          releaseId,
          'processDataset',
          {
            processedRows: stagedEnrichedPlaces.processedRows,
            snapshotId: snapshots.snapshotId,
          },
          releaseCode,
        ),
      stagedEnrichedPlaces.processedRows,
    )
    progress.finish('Places processing complete')
  } catch (error) {
    progress.fail(error)
    await client
      ?.stageFailed(
        releaseId,
        'processDataset',
        error instanceof Error ? error.message : String(error),
        undefined,
        releaseCode,
      )
      .catch(() => undefined)
    throw error
  } finally {
    dbContext?.cleanup()
    if (shouldRefreshRemoteMetaCache && target.remote && dbContext) {
      try {
        await refreshRemoteMetaCache(
          target.environment === 'production' ? 'production' : 'preview',
          dbContext.state.dbCacheDir,
        )
      } catch (error) {
        postPublishCacheError = normaliseError(error)
      }
    }
  }

  if (postPublishCacheError) throw postPublishCacheError

  return { publishResult }
}

/**
 * Records a country review action for Places with an excluded or missing
 * publisher address country code. Missing-country Places remain included.
 */
export function buildPlaceCountryReviewProcessingActions(
  places: NormalisedPlace[],
): ReleaseProcessingAction[] {
  return places.flatMap(place => {
    const country = getPlaceAddressCountry(place.raw.addresses)?.toUpperCase() ?? ''
    const excluded = country === 'CN' || country === 'MO'
    const missing = !country
    if (!excluded && !missing) return []

    return [
      {
        action: 'overture_place_country_review_required',
        affectedRecordCount: 1,
        evidence: {
          placeId: place.id,
          names: place.i18n,
          addresses: place.addresses,
          country: country || null,
          disposition: excluded ? 'excluded' : 'included',
          reason: excluded ? 'excluded_country_code' : 'missing_country_code',
        },
        mode: 'automatic',
        summary: excluded
          ? 'Excluded an Overture Place with a CN or MO address country code; retained it in the audit for review.'
          : 'Included an Overture Place with no address country code; retained it in the audit for review.',
      },
    ]
  })
}

/**
 * Preserves locale/script conflicts as release audit evidence without adding
 * resolver diagnostics to the public PlaceI18n record.
 */
export function buildPlaceLocaleConflictProcessingActions(
  places: NormalisedPlace[],
): ReleaseProcessingAction[] {
  return places.flatMap(place =>
    place.localeConflicts.map(conflict => ({
      action: 'overture_place_locale_conflict',
      affectedRecordCount: 1,
      evidence: {
        placeId: place.id,
        field: conflict.field === 'brand' ? 'brandName' : conflict.field,
        sourceLocale: conflict.sourceLocale,
        resolvedLocale: conflict.resolvedLocale,
        script: conflict.script,
        sourceText: conflict.sourceText,
        conflict: conflict.conflict,
        reason: conflict.reason,
      },
      mode: 'automatic',
      summary:
        'Resolved a Place localisation from script evidence and retained the source value and locale conflict for review.',
    })),
  )
}

export function isExcludedOverturePlace(place: NormalisedPlace) {
  const country = getPlaceAddressCountry(place.raw.addresses)?.toUpperCase()
  return country === 'CN' || country === 'MO'
}

async function resolvePlaceSnapshots(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  currentDb: HarbourReadableDb,
  plan: PlaceUploadPlan,
  datasetId: string,
  releaseId: string,
) {
  const place = await ensureDraftSnapshotForRelease(metaDb, 'place', {
    cohortKey: plan.cohortKey,
    datasetCode: plan.datasetCode,
    datasetId,
    regionCode: plan.regionCode,
    sourceReleaseId: releaseId,
    variant: 'default',
  })
  const previousRuns = await metaDb
    .select()
    .from(metaSchema.metaSnapshotAssemblyRuns)
    .where(eq(metaSchema.metaSnapshotAssemblyRuns.snapshotId, place.id))
    .all()
  const recordedAddressId = previousRuns
    .map(
      run =>
        (run.selectionSummaryJson as { addressSnapshotId?: string } | null)
          ?.addressSnapshotId,
    )
    .find(Boolean)
  const address = recordedAddressId
    ? await metaDb
        .select({ id: metaSchema.metaSnapshots.id })
        .from(metaSchema.metaSnapshots)
        .where(
          and(
            eq(metaSchema.metaSnapshots.id, recordedAddressId),
            eq(metaSchema.metaSnapshots.status, 'published'),
            eq(metaSchema.metaSnapshots.resourceType, 'address'),
          ),
        )
        .get()
    : ((await resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey(
        metaDb,
        'address',
        plan.regionCode,
        plan.cohortKey,
        { variant: 'default' },
      )) ??
      (await resolveEarliestPublishedSnapshotForResourceTypeRegionAtOrAfterCohortKey(
        metaDb,
        'address',
        plan.regionCode,
        plan.cohortKey,
        { variant: 'default' },
      )))
  if (!address) throw new Error('Places require a published address snapshot.')

  const addressRow = await currentDb
    .select({
      divisionSnapshotId: currentSchema.address2d.divisionSnapshotId,
    })
    .from(currentSchema.address2d)
    .where(eq(currentSchema.address2d.snapshotId, address.id))
    .limit(1)
    .get()
  if (!addressRow?.divisionSnapshotId) {
    throw new Error(
      `Selected Places address snapshot ${address.id} has no division snapshot from which to derive Place divisions.`,
    )
  }

  const inconsistentAddress = await currentDb
    .select({ id: currentSchema.address2d.id })
    .from(currentSchema.address2d)
    .where(
      and(
        eq(currentSchema.address2d.snapshotId, address.id),
        ne(currentSchema.address2d.divisionSnapshotId, addressRow.divisionSnapshotId),
      ),
    )
    .limit(1)
    .get()
  if (inconsistentAddress) {
    throw new Error(
      `Selected Places address snapshot ${address.id} contains multiple division snapshots; refusing to build an ambiguous Place index.`,
    )
  }

  const division = await metaDb
    .select({
      id: metaSchema.metaSnapshots.id,
      status: metaSchema.metaSnapshots.status,
    })
    .from(metaSchema.metaSnapshots)
    .where(
      and(
        eq(metaSchema.metaSnapshots.id, addressRow.divisionSnapshotId),
        eq(metaSchema.metaSnapshots.resourceType, 'division'),
        eq(metaSchema.metaSnapshots.status, 'published'),
      ),
    )
    .limit(1)
    .get()
  if (!division) {
    throw new Error(
      `Places require the published division snapshot ${addressRow.divisionSnapshotId} selected by address snapshot ${address.id}.`,
    )
  }
  if (!recordedAddressId)
    await recordPlaceAddressAssembly(metaDb, {
      snapshotId: place.id,
      resourceType: 'place',
      anchorReleaseId: releaseId,
      anchorCohortKey: plan.cohortKey,
      selectionSummaryJson: {
        addressSnapshotId: address.id,
        divisionSnapshotId: division.id,
        addressReviewRequired: null,
      },
    })
  return {
    addressSnapshotId: address.id,
    divisionSnapshotId: division.id,
    snapshotId: place.id,
  }
}

async function stagePlaces(
  bucket: LocalPipelineBucket,
  rawObjectKey: string,
  sourceVersion: string,
  releaseRoot: string,
  onProgress?: (current: number) => void,
): Promise<StagedPlaces> {
  const file = await createAsyncBufferFromR2(bucket, rawObjectKey)
  const path = resolve(releaseRoot, NORMALISED_PLACES_FILE)
  const tempPath = `${path}.tmp`
  const output = await open(tempPath, 'w')
  const actions: ReleaseProcessingAction[] = []
  let includedRows = 0
  let processedRows = 0
  try {
    for await (const batch of readParquetObjectsInBatches(file, PLACE_BATCH_SIZE)) {
      for (const row of batch) {
        const place = normaliseOverturePlace(row, sourceVersion)
        if (place) {
          assertPlaceAddressCardinality([place])
          actions.push(
            ...buildPlaceCountryReviewProcessingActions([place]),
            ...buildPlaceLocaleConflictProcessingActions([place]),
          )
          if (!isExcludedOverturePlace(place)) {
            await output.write(`${JSON.stringify(place)}\n`)
            includedRows += 1
          }
        }
        processedRows += 1
      }
      onProgress?.(processedRows)
    }
  } finally {
    await output.close()
  }
  await rename(tempPath, path)
  return { actions, includedRows, path, processedRows }
}

async function* readStagedJsonBatches<T>(path: string, batchSize = PLACE_BATCH_SIZE) {
  let batch: T[] = []
  for await (const value of readStagedJsonLines<T>(path)) {
    batch.push(value)
    if (batch.length < batchSize) continue
    yield batch
    batch = []
  }
  if (batch.length) yield batch
}

async function* readStagedJsonLines<T>(path: string) {
  const lines = createInterface({
    crlfDelay: Infinity,
    input: createReadStream(path, { encoding: 'utf8' }),
  })
  for await (const line of lines) {
    if (line.trim()) yield JSON.parse(line) as T
  }
}

async function stageEnrichedPlaces(
  currentDb: HarbourReadableDb,
  snapshots: { addressSnapshotId: string; divisionSnapshotId: string },
  places: AsyncIterable<NormalisedPlace>,
  resolutions: AsyncIterable<AddressResolution>,
  releaseRoot: string,
  onProgress?: (current: number) => void,
  supplementary?: {
    resolutionPath: string
    snapshotId: string
    addresses: Awaited<ReturnType<typeof buildSupplementaryAddressRows>>
  },
): Promise<StagedEnrichedPlaces> {
  const addresses = await currentDb
    .select({
      areaId: currentSchema.address2d.areaId,
      countryId: currentSchema.address2d.countryId,
      districtId: currentSchema.address2d.districtId,
      hamletId: currentSchema.address2d.hamletId,
      id: currentSchema.address2d.id,
      macrohoodId: currentSchema.address2d.macrohoodId,
      microhoodId: currentSchema.address2d.microhoodId,
      neighbourhoodId: currentSchema.address2d.neighbourhoodId,
      snapshotId: currentSchema.address2d.snapshotId,
      townId: currentSchema.address2d.townId,
      villageId: currentSchema.address2d.villageId,
    })
    .from(currentSchema.address2d)
    .where(eq(currentSchema.address2d.snapshotId, snapshots.addressSnapshotId))
    .all()
  const divisionIds = new Set(
    (
      await currentDb
        .select({ id: currentSchema.divisions.id })
        .from(currentSchema.divisions)
        .where(eq(currentSchema.divisions.snapshotId, snapshots.divisionSnapshotId))
        .all()
    ).map(row => row.id),
  )
  const addressById = new Map(addresses.map(row => [row.id, row]))
  if (!supplementary)
    throw new Error('Places require supplementary address analysis before enrichment.')
  const supplementaryById = new Map(
    supplementary.addresses.map(row => [row.current.id, row.current]),
  )
  const path = resolve(releaseRoot, ENRICHED_PLACES_FILE)
  const tempPath = `${path}.tmp`
  const output = await open(tempPath, 'w')
  const stats = createPlaceReleaseStatsAccumulator()
  let processedPlaces = 0
  try {
    for await (const batch of groupAsyncIterable(
      zipPlacesAndResolutions(places, resolutions),
      PLACE_BATCH_SIZE,
    )) {
      const enriched = await mapWithConcurrency(
        batch,
        PLACE_ENRICHMENT_CONCURRENCY,
        async ({ place, resolution }) => {
          if (resolution.tier === 'review')
            throw new Error(`Unresolved Place Address ${place.id}.`)
          const addressId = resolution.addressId
          const addressSnapshotId =
            resolution.tier === 'supplementary'
              ? supplementary.snapshotId
              : snapshots.addressSnapshotId
          const address = addressId
            ? resolution.tier === 'supplementary'
              ? supplementaryById.get(addressId)
              : addressById.get(addressId)
            : undefined
          if (addressId && !address)
            throw new Error(`Place Address ${addressId} did not materialise.`)
          const referencedDivisionIds = address
            ? [
                address.countryId,
                address.areaId,
                address.districtId,
                address.townId,
                address.macrohoodId,
                address.villageId,
                address.neighbourhoodId,
                address.hamletId,
                address.microhoodId,
              ].filter(
                (id): id is string => typeof id === 'string' && divisionIds.has(id),
              )
            : []
          const contentHash = await hashNormalisedPlace(place)
          const result = {
            place,
            addressSnapshotId: addressId ? addressSnapshotId : null,
            address2dId: addressId,
            address3dId: null,
            divisionIds: [...new Set(referencedDivisionIds)],
            versionHash: await hashPlaceMaterialisation(place, {
              addressSnapshotId,
              divisionSnapshotId: snapshots.divisionSnapshotId,
              addressId,
              divisionIds: referencedDivisionIds,
              contentHash,
            }),
            sourcePayloadHash: await createHash(place.raw),
          }
          return result
        },
      )
      for (const place of enriched) {
        await output.write(`${JSON.stringify(place)}\n`)
        addPlaceReleaseStats(stats, place)
      }
      processedPlaces += enriched.length
      onProgress?.(processedPlaces)
    }
  } finally {
    await output.close()
  }
  await rename(tempPath, path)
  return { path, processedRows: processedPlaces, stats }
}

async function* groupAsyncIterable<T>(values: AsyncIterable<T>, batchSize: number) {
  let batch: T[] = []
  for await (const value of values) {
    batch.push(value)
    if (batch.length < batchSize) continue
    yield batch
    batch = []
  }
  if (batch.length) yield batch
}

async function* zipPlacesAndResolutions(
  places: AsyncIterable<NormalisedPlace>,
  resolutions: AsyncIterable<AddressResolution>,
) {
  const iterator = resolutions[Symbol.asyncIterator]()
  for await (const place of places) {
    const next = await iterator.next()
    if (next.done) throw new Error(`Missing Place Address resolution for ${place.id}.`)
    if (next.value.placeId !== place.id)
      throw new Error(
        `Place Address resolution order diverged at ${place.id}/${next.value.placeId}.`,
      )
    yield { place, resolution: next.value }
  }
  if (!(await iterator.next()).done)
    throw new Error('Place Address resolution stream has extra rows.')
}

type PrepareSupplementaryAddressesInput = {
  curationPath?: string
  context: LocalAddressDbContext
  metaDb: HarbourReadableDb & HarbourWritableDb
  snapshots: {
    snapshotId: string
    addressSnapshotId: string
    divisionSnapshotId: string
  }
  places: Iterable<NormalisedPlace> | AsyncIterable<NormalisedPlace>
  historyRows: PlaceHistoryState[]
  releaseRoot: string
  plan: PlaceUploadPlan
  releaseId: string
  datasetId: string
  targets: Awaited<ReturnType<typeof placeTargets>>
  importOptions: SqlImportExecutionOptions
  actions: ReleaseProcessingAction[]
}

export async function prepareSupplementaryAddresses(
  input: PrepareSupplementaryAddressesInput,
) {
  await mkdir(LOCAL_RELEASE_ROOT, { recursive: true })
  const lockPath = resolve(
    input.curationPath ? input.releaseRoot : LOCAL_RELEASE_ROOT,
    'overture-place-address.lock',
  )
  const lock = await open(lockPath, 'wx')
  try {
    await lock.writeFile(
      JSON.stringify({ pid: process.pid, releaseId: input.releaseId }),
    )
    return await prepareSupplementaryAddressesLocked(input)
  } finally {
    await lock.close()
    await unlink(lockPath)
  }
}

async function prepareSupplementaryAddressesLocked(
  input: PrepareSupplementaryAddressesInput,
) {
  const db = input.metaDb
  const currentDb = input.context.currentDb as unknown as HarbourReadableDb
  const curationPath = input.curationPath ?? SUPPLEMENTARY_CURATION_PATH
  const fixtureText = await readFile(curationPath, 'utf8')
  const fixture = parseSupplementaryCuration(JSON.parse(fixtureText))
  const official = (await currentDb
    .select({
      areaId: currentSchema.address2d.areaId,
      countryId: currentSchema.address2d.countryId,
      districtId: currentSchema.address2d.districtId,
      divisionSnapshotId: currentSchema.address2d.divisionSnapshotId,
      geometry: currentSchema.address2d.geometry,
      hamletId: currentSchema.address2d.hamletId,
      id: currentSchema.address2d.id,
      macrohoodId: currentSchema.address2d.macrohoodId,
      microhoodId: currentSchema.address2d.microhoodId,
      neighbourhoodId: currentSchema.address2d.neighbourhoodId,
      snapshotId: currentSchema.address2d.snapshotId,
      townId: currentSchema.address2d.townId,
      villageId: currentSchema.address2d.villageId,
    })
    .from(currentSchema.address2d)
    .where(eq(currentSchema.address2d.snapshotId, input.snapshots.addressSnapshotId))
    .all()) as unknown as Pick<
    typeof currentSchema.address2d.$inferSelect,
    | 'areaId'
    | 'countryId'
    | 'districtId'
    | 'divisionSnapshotId'
    | 'geometry'
    | 'hamletId'
    | 'id'
    | 'macrohoodId'
    | 'microhoodId'
    | 'neighbourhoodId'
    | 'snapshotId'
    | 'townId'
    | 'villageId'
  >[]
  const definitions = (await currentDb
    .select({
      addressId: currentSchema.address2dI18n.addressId,
      blockExpression: currentSchema.address2dI18n.blockExpression,
      buildingName: currentSchema.address2dI18n.buildingName,
      buildingNumberExpression: currentSchema.address2dI18n.buildingNumberExpression,
      buildingNumberFrom: currentSchema.address2dI18n.buildingNumberFrom,
      buildingNumberTo: currentSchema.address2dI18n.buildingNumberTo,
      estateName: currentSchema.address2dI18n.estateName,
      formattedAddress: currentSchema.address2dI18n.formattedAddress,
      locale: currentSchema.address2dI18n.locale,
      phaseExpression: currentSchema.address2dI18n.phaseExpression,
      streetName: currentSchema.address2dI18n.streetName,
    })
    .from(currentSchema.address2dI18n)
    .where(
      eq(currentSchema.address2dI18n.snapshotId, input.snapshots.addressSnapshotId),
    )
    .all()) as PlaceAddressDefinition[]
  const geometry = new Map<string, { lng: number; lat: number }>()
  for (const row of official) {
    const value = parseWkbGeometry(row.geometry)
    if (value?.type === 'Point' && value.coordinates?.length === 2) {
      const [lng, lat] = value.coordinates
      if (lng !== undefined && lat !== undefined) geometry.set(row.id, { lng, lat })
    }
  }
  const officialById = new Map(official.map(row => [row.id, row]))
  const analyse = createSupplementaryAddressAnalyser(
    definitions,
    new Set(officialById.keys()),
    geometry,
    fixture,
  )
  const previousById = new Map<string, PlaceHistoryRow>()
  for (const target of input.context.historyTargets) {
    const rows = (await (target.db as HarbourReadableDb)
      .select({
        address2dId: historySchema.places.address2dId,
        addressSnapshotId: historySchema.places.addressSnapshotId,
        addresses: historySchema.places.addresses,
        createdAt: historySchema.places.createdAt,
        id: historySchema.places.id,
        lastSeenMonth: historySchema.places.lastSeenMonth,
        releaseId: historySchema.places.releaseId,
      })
      .from(historySchema.places)
      .where(
        and(
          isNotNull(historySchema.places.address2dId),
          lte(historySchema.places.lastSeenMonth, input.plan.sourceVersion.slice(0, 7)),
          ne(historySchema.places.releaseId, input.releaseId),
        ),
      )
      .all()) as PlaceHistoryRow[]
    for (const row of rows) {
      const previous = previousById.get(row.id)
      if (
        !previous ||
        `${row.lastSeenMonth}:${row.createdAt}` >
          `${previous.lastSeenMonth}:${previous.createdAt}`
      )
        previousById.set(row.id, row)
    }
  }
  const resolutionPath = resolve(input.releaseRoot, 'overture-place-address.jsonl')
  const resolutionTempPath = `${resolutionPath}.tmp`
  const resolutionOutput = await open(resolutionTempPath, 'w')
  const supplementaryResolutions: AddressResolution[] = []
  const resolutionCounts = new Map<AddressResolution['tier'], number>()
  const resolutionReasons = new Map<AddressResolution['tier'], Set<string>>()
  try {
    for await (const place of input.places) {
      const previous = previousById.get(place.id)
      const resolution = analyse(
        {
          placeId: place.id,
          sourceRelease: input.plan.sourceVersion,
          texts: extractPlaceAddressTexts(place.raw.addresses),
          lng: place.lng,
          lat: place.lat,
        },
        previous?.address2dId
          ? {
              addressId: previous.address2dId,
              addressSnapshotId: previous.addressSnapshotId,
              fingerprint: addressFingerprint(
                Array.isArray(previous.addresses)
                  ? previous.addresses.filter(
                      (value): value is string => typeof value === 'string',
                    )
                  : [],
              ),
            }
          : null,
      )
      await resolutionOutput.write(`${JSON.stringify(resolution)}\n`)
      resolutionCounts.set(
        resolution.tier,
        (resolutionCounts.get(resolution.tier) ?? 0) + 1,
      )
      const reasons = resolutionReasons.get(resolution.tier) ?? new Set<string>()
      reasons.add(resolution.reason)
      resolutionReasons.set(resolution.tier, reasons)
      if (resolution.tier === 'supplementary') supplementaryResolutions.push(resolution)
    }
  } finally {
    await resolutionOutput.close()
  }
  await rename(resolutionTempPath, resolutionPath)
  const reviewCount = resolutionCounts.get('review') ?? 0
  const actions: ReleaseProcessingAction[] = [
    ...input.actions,
    ...(['direct', 'supplementary', 'review', 'delayed'] as const).map(tier => ({
      action: `overture_place_address_${tier}`,
      mode: 'automatic' as const,
      affectedRecordCount: resolutionCounts.get(tier) ?? 0,
      summary: `Overture Place Address analysis: ${tier}.`,
      evidence: {
        policyVersion: fixture.activePolicy,
        policy: fixture.policies[fixture.activePolicy],
        reviewArtefact: 'overture-place-address-review.json',
        reasons: [...(resolutionReasons.get(tier) ?? [])],
      },
    })),
  ]
  await replaceReleaseProcessingActions(db, input.releaseId, actions)
  if (!input.importOptions.isLocal) {
    const stored = await db
      .select()
      .from(metaSchema.releaseProcessingActions)
      .where(eq(metaSchema.releaseProcessingActions.releaseId, input.releaseId))
      .all()
    for (const sql of chunkStatements([
      `DELETE FROM releaseProcessingActions WHERE releaseId = ${lit(input.releaseId)};`,
      ...stored.map(row => insertSql('releaseProcessingActions', row)),
    ])) {
      await executeSqlText(input.targets.meta, sql, input.importOptions)
    }
  }
  // Always replace the release-owned review artefact, including on a successful retry.
  const reviewPath = resolve(input.releaseRoot, 'overture-place-address-review.json')
  await writeSupplementaryReviewArtefact({
    addressSnapshotId: input.snapshots.addressSnapshotId,
    authority: fixture.authority,
    placeReleaseId: input.releaseId,
    policies: fixture.policies,
    resolutionPath,
    reviewCount,
    reviewPath,
    sourceRelease: input.plan.sourceVersion,
  })
  // Detect another ingester/reviewer changing the unversioned identity policy.
  if ((await readFile(curationPath, 'utf8')) !== fixtureText)
    throw new Error('Place Address curation changed during analysis; retry.')
  const acceptedText = `${JSON.stringify(fixture, null, 2)}\n`
  if (acceptedText !== fixtureText) {
    await writeFile(`${curationPath}.tmp`, acceptedText, { flag: 'wx' })
    await rename(`${curationPath}.tmp`, curationPath)
  }
  if (reviewCount)
    throw new Error(
      `${reviewCount} Place Address identities require explicit curation in ${curationPath}. Review ${reviewPath}; --yes cannot select identities.`,
    )

  const parentDataset = (await db
    .select()
    .from(metaSchema.metaDatasets)
    .where(eq(metaSchema.metaDatasets.id, input.datasetId))
    .get()) as typeof metaSchema.metaDatasets.$inferSelect | undefined
  const parentRelease = (await db
    .select()
    .from(metaSchema.metaReleases)
    .where(eq(metaSchema.metaReleases.id, input.releaseId))
    .get()) as typeof metaSchema.metaReleases.$inferSelect | undefined
  if (!parentDataset || !parentRelease)
    throw new Error('Missing Place source registration.')
  const datasetCode = parentDataset.code
  const namespace = '747dc748-4086-5dc5-a0de-7d1fefcd0c51'
  const datasetId = parentDataset.id
  const releaseCode = `dr-${input.plan.regionCode}-overture-place-address-${input.plan.sourceVersion}`
  const existingRelease = (await db
    .select()
    .from(metaSchema.metaReleases)
    .where(eq(metaSchema.metaReleases.code, releaseCode))
    .get()) as typeof metaSchema.metaReleases.$inferSelect | undefined
  const releaseId =
    existingRelease?.id ?? buildDeterministicUuidV5(namespace, releaseCode)
  const sourceReleaseId = parentRelease.sourceReleaseId
  if (!sourceReleaseId) throw new Error('Missing shared Overture source release.')
  if (
    existingRelease &&
    (existingRelease.datasetId !== datasetId ||
      existingRelease.sourceReleaseId !== sourceReleaseId)
  )
    throw new Error('Supplementary Address release has incompatible source provenance.')
  const now = new Date().toISOString()
  await db
    .insert(metaSchema.metaDatasetResourceTypes)
    .values({ datasetId, resourceType: 'address' })
    .onConflictDoNothing()
    .run()
  const release = {
    ...parentRelease,
    id: releaseId,
    datasetId,
    sourceReleaseId,
    code: releaseCode,
    resourceType: 'address' as const,
    status: 'processing' as const,
    processingRules: {
      policyVersion: fixture.activePolicy,
      policy: fixture.policies[fixture.activePolicy],
    },
    createdAt: now,
    updatedAt: now,
  }
  if (!existingRelease) {
    await db.insert(metaSchema.metaReleases).values(release).run()
  }
  const snapshot = await ensureDraftSnapshotForRelease(db, 'address', {
    cohortKey: input.plan.cohortKey,
    datasetCode,
    datasetId,
    sourceReleaseId: releaseId,
    regionCode: input.plan.regionCode,
    variant: SUPPLEMENTARY_ADDRESS_VARIANT,
  })
  const addresses = await buildSupplementaryAddressRows({
    resolutions: supplementaryResolutions,
    officialAddresses: officialById,
    snapshotId: snapshot.id,
    divisionSnapshotId: input.snapshots.divisionSnapshotId,
    sourceReleaseId: releaseId,
    placeSourceReleaseId: input.releaseId,
    sourceVersion: input.plan.sourceVersion,
    datasetId,
  })
  const policies = Object.fromEntries(
    [
      ...new Set(
        supplementaryResolutions.flatMap(row =>
          row.entry ? [row.entry.policyVersion] : [],
        ),
      ),
    ].map(version => [version, fixture.policies[version]]),
  )
  const materialisationHash = await createHash({
    addresses,
    policies,
    placeReleaseId: input.releaseId,
    addressSnapshotId: input.snapshots.addressSnapshotId,
  })
  if (snapshot.status === 'published') {
    const runs = await db
      .select()
      .from(metaSchema.metaSnapshotAssemblyRuns)
      .where(eq(metaSchema.metaSnapshotAssemblyRuns.snapshotId, snapshot.id))
      .all()
    if (
      !runs.some(
        run =>
          (run.selectionSummaryJson as { materialisationHash?: string } | null)
            ?.materialisationHash === materialisationHash,
      )
    ) {
      throw new Error(
        'Published supplementary snapshot differs from curation; create a release revision.',
      )
    }
    await assertSupplementaryAddressRows(currentDb, snapshot.id, addresses)
  } else {
    // Each supplementary snapshot is a complete map, including an empty accepted set.
    // Replay must not inherit withdrawn addresses from a previous cohort.
    await db
      .update(metaSchema.metaSnapshots)
      .set({ parentSnapshotId: null })
      .where(eq(metaSchema.metaSnapshots.id, snapshot.id))
      .run()
    await upsertSnapshotSource(db, snapshot.id, datasetId, releaseId, 'primary', {
      anchorReleaseId: input.releaseId,
      selectedByRule: 'overture-place-address-curation',
      selectionMode: 'exact_ref',
      sourceCohortKey: input.plan.cohortKey,
    })
    await recordSnapshotLookupDependency(db, {
      snapshotId: snapshot.id,
      anchorReleaseId: input.releaseId,
      lookupSnapshotId: input.snapshots.addressSnapshotId,
      selectedByRule: 'overture-place-address:selected-als',
      selectionMode: 'address_snapshot_reference',
    })
    await recordPlaceAddressAssembly(db, {
      snapshotId: snapshot.id,
      resourceType: 'address',
      anchorReleaseId: input.releaseId,
      anchorCohortKey: input.plan.cohortKey,
      selectionSummaryJson: {
        materialisationHash,
        policyVersion: fixture.activePolicy,
        policies,
        curationHash: await createHash(fixture),
        addressSnapshotId: input.snapshots.addressSnapshotId,
        reviewRequired: 0,
        rowCount: addresses.length,
      },
    })
    const environment = input.targets.environment
    const currentShard = await resolveShardForTypeRegionYear(db, 'current', environment)
    const historyShard = await resolveShardForTypeRegionYear(
      db,
      'history',
      environment,
      input.plan.regionCode,
      input.plan.sourceVersion.slice(0, 4),
    )
    if (currentShard)
      await upsertSnapshotShardAssignment(db, snapshot.id, currentShard.id)
    if (historyShard) await upsertReleaseShardAssignment(db, releaseId, historyShard.id)
    if (!input.importOptions.isLocal) {
      await executeSqlText(
        input.targets.meta,
        [
          insertSql('datasetResourceTypes', { datasetId, resourceType: 'address' }),
          insertSql('releases', release),
          await buildPlaceMetadataSql(db, snapshot.id, releaseId),
        ].join('\n'),
        input.importOptions,
      )
    }
    const currentSql = [
      `DELETE FROM address2dBuildingNumberLookup WHERE snapshotId = ${lit(snapshot.id)};`,
      `DELETE FROM address2dI18n WHERE snapshotId = ${lit(snapshot.id)};`,
      `DELETE FROM address2d WHERE snapshotId = ${lit(snapshot.id)};`,
    ]
    for (const target of input.targets.historyByBinding.values()) {
      await importSupplementarySql(
        target,
        "UPDATE address2d SET isCurrent = 0 WHERE id LIKE 'opa-%' AND isCurrent = 1; UPDATE address2dI18n SET isCurrent = 0 WHERE addressId LIKE 'opa-%' AND isCurrent = 1; UPDATE address2dBuildingNumberLookup SET isCurrent = 0 WHERE addressId LIKE 'opa-%' AND isCurrent = 1;",
        input.importOptions,
      )
    }
    const historySql: string[] = []
    const changes: string[] = [
      `DELETE FROM snapshotVersionChanges WHERE snapshotId = ${lit(snapshot.id)};`,
    ]
    for (const row of addresses) {
      const version = {
        versionHash: row.versionHash,
        snapshotId: snapshot.id,
        sourceReleaseId: releaseId,
        isCurrent: 1,
        createdAt: now,
        updatedAt: now,
      }
      currentSql.push(
        insertSql('address2d', { ...row.current, createdAt: now, updatedAt: now }),
      )
      historySql.push(insertSql('address2d', { ...row.canonical, ...version }))
      for (const lookup of buildAddressBuildingNumberLookupRows(row.i18n)) {
        currentSql.push(
          insertSql('address2dBuildingNumberLookup', {
            ...lookup,
            snapshotId: snapshot.id,
            createdAt: now,
            updatedAt: now,
          }),
        )
        historySql.push(
          insertSql('address2dBuildingNumberLookup', { ...lookup, ...version }),
        )
      }
      changes.push(
        insertSql('snapshotVersionChanges', {
          snapshotId: snapshot.id,
          recordType: 'address2d',
          recordId: row.current.id,
          locale: '',
          versionHash: row.versionHash,
          operation: 'upsert',
          sourceReleaseId: releaseId,
          createdAt: now,
          updatedAt: now,
        }),
      )
      for (const value of row.i18n) {
        currentSql.push(
          insertSql('address2dI18n', {
            ...value,
            snapshotId: snapshot.id,
            createdAt: now,
            updatedAt: now,
          }),
        )
        historySql.push(insertSql('address2dI18n', { ...value, ...version }))
        changes.push(
          insertSql('snapshotVersionChanges', {
            snapshotId: snapshot.id,
            recordType: 'address2dI18n',
            recordId: row.current.id,
            locale: value.locale,
            versionHash: row.versionHash,
            operation: 'upsert',
            sourceReleaseId: releaseId,
            createdAt: now,
            updatedAt: now,
          }),
        )
      }
    }
    for (const [target, statements] of [
      [input.targets.current, currentSql],
      [input.targets.history, [...historySql, ...changes]],
    ] as const) {
      for (const sql of chunkStatements(statements))
        await importSupplementarySql(target, sql, input.importOptions)
    }
    await importSupplementarySql(
      input.targets.current,
      readFileSync(
        resolve(
          import.meta.dir,
          '../../../../../libs/db/scripts/sql/rebuild-addresses-fts.sql',
        ),
        'utf8',
      ),
      input.importOptions,
    )
    await assertSupplementaryAddressRows(currentDb, snapshot.id, addresses)
    // Publication follows successful imports. A retry of a published snapshot must reproduce its hash.
    await publishSnapshot(db, snapshot.id)
    await db
      .update(metaSchema.metaReleases)
      .set({ status: 'published', updatedAt: now })
      .where(eq(metaSchema.metaReleases.id, releaseId))
      .run()
    // The shared source is finalised by Places publication after both outputs succeed.
  }
  if (!input.importOptions.isLocal) {
    // Retry a metadata-publication failure after the data import without rewriting Address rows.
    await executeSqlText(
      input.targets.meta,
      [
        await buildPlaceMetadataSql(db, snapshot.id, releaseId),
        `UPDATE releases SET status = 'published' WHERE id = ${lit(releaseId)};`,
      ].join('\n'),
      input.importOptions,
    )
  }
  await recordSnapshotLookupDependency(db, {
    snapshotId: input.snapshots.snapshotId,
    anchorReleaseId: input.releaseId,
    lookupSnapshotId: snapshot.id,
    selectedByRule:
      'api-composition:places/overture:place/default->address/overture-places',
    selectionMode: 'exact_ref',
  })
  return {
    resolutionPath,
    releaseId,
    releaseCode,
    snapshotId: snapshot.id,
    addresses,
  }
}

async function writeSupplementaryReviewArtefact(input: {
  addressSnapshotId: string
  authority: string
  placeReleaseId: string
  policies: unknown
  resolutionPath: string
  reviewCount: number
  reviewPath: string
  sourceRelease: string
}) {
  const tempPath = `${input.reviewPath}.tmp`
  const output = await open(tempPath, 'w')
  try {
    const header = JSON.stringify(
      {
        addressSnapshotId: input.addressSnapshotId,
        authority: input.authority,
        placeReleaseId: input.placeReleaseId,
        policies: input.policies,
        reviewRequired: input.reviewCount,
        sourceRelease: input.sourceRelease,
        version: 1,
        results: null,
      },
      null,
      2,
    )
    await output.write(
      `${header.replace('\n  "results": null\n}', '\n  "results": [')}`,
    )
    let first = true
    for await (const resolution of readStagedJsonLines<AddressResolution>(
      input.resolutionPath,
    )) {
      await output.write(`${first ? '\n' : ',\n'}    ${JSON.stringify(resolution)}`)
      first = false
    }
    await output.write('\n  ]\n}\n')
  } finally {
    await output.close()
  }
  await rename(tempPath, input.reviewPath)
}

async function importSupplementarySql(
  target: SqlImportTargetContext,
  sql: string,
  options: SqlImportExecutionOptions,
) {
  await executeSqlText(target, sql, options)
  if (!options.isLocal) await executeSqlText(target, sql, { ...options, isLocal: true })
}

async function assertSupplementaryAddressRows(
  db: HarbourReadableDb,
  snapshotId: string,
  expected: Awaited<ReturnType<typeof buildSupplementaryAddressRows>>,
) {
  const rows = await db
    .select()
    .from(currentSchema.address2d)
    .where(eq(currentSchema.address2d.snapshotId, snapshotId))
    .all()
  const localisations = await db
    .select()
    .from(currentSchema.address2dI18n)
    .where(eq(currentSchema.address2dI18n.snapshotId, snapshotId))
    .all()
  if (
    rows.length !== expected.length ||
    localisations.length !== expected.reduce((count, row) => count + row.i18n.length, 0)
  ) {
    throw new Error(
      'Supplementary snapshot is missing materialised Address rows or localisations.',
    )
  }
  const byId = new Map(rows.map(row => [row.id, row]))
  const byLocale = new Map(
    localisations.map(row => [`${row.addressId}:${row.locale}`, row]),
  )
  for (const row of expected) {
    for (const [actual, wanted] of [
      [byId.get(row.current.id), row.current],
      ...row.i18n.map(
        value => [byLocale.get(`${value.addressId}:${value.locale}`), value] as const,
      ),
    ] as const) {
      if (
        !actual ||
        (await createHash(
          Object.fromEntries(Object.keys(wanted).map(key => [key, actual[key]])),
        )) !== (await createHash(wanted))
      ) {
        throw new Error(
          `Supplementary Address ${row.current.id} cannot be reproduced from its materialised row.`,
        )
      }
    }
  }
}

async function loadCurrentPlaceHistory(
  targets: LocalAddressDbContext['historyTargets'],
): Promise<PlaceHistoryState[]> {
  const rows = await Promise.all(
    targets.map(async target => ({
      bindingName: target.bindingName,
      rows: (await (target.db as HarbourReadableDb)
        .select({
          address2dId: historySchema.places.address2dId,
          addressSnapshotId: historySchema.places.addressSnapshotId,
          addresses: historySchema.places.addresses,
          createdAt: historySchema.places.createdAt,
          firstSeenMonth: historySchema.places.firstSeenMonth,
          id: historySchema.places.id,
          lastSeenMonth: historySchema.places.lastSeenMonth,
          releaseId: historySchema.places.releaseId,
          versionHash: historySchema.places.versionHash,
        })
        .from(historySchema.places)
        .where(eq(historySchema.places.isCurrent, true))
        .all()) as unknown as PlaceHistoryRow[],
    })),
  )
  return rows.flatMap(target =>
    target.rows.map(row => ({ bindingName: target.bindingName, row })),
  )
}

export async function buildPlaceSql(
  input: BuildPlaceSqlInput,
  options: BuildPlaceSqlOptions = {},
) {
  const includeInitialStatements = options.includeInitialStatements ?? true
  const includeRemovedPlaces = options.includeRemovedPlaces ?? true
  const now = options.timestamp ?? new Date().toISOString()
  const currentSql: string[] = includeInitialStatements
    ? [
        `DELETE FROM placesCells WHERE snapshotId = ${lit(input.snapshots.snapshotId)};`,
        `DELETE FROM placesDivision WHERE placeSnapshotId = ${lit(input.snapshots.snapshotId)};`,
        `DELETE FROM placesI18n WHERE snapshotId = ${lit(input.snapshots.snapshotId)};`,
        `DELETE FROM places WHERE snapshotId = ${lit(input.snapshots.snapshotId)};`,
      ]
    : []
  const historySqlByBinding = new Map<string, string[]>()
  const sourceSqlByBinding = new Map<string, string[]>()
  const changes: string[] = []
  const previousById = new Map(input.historyRows.map(state => [state.row.id, state]))

  const historyStatements = (bindingName: string) => {
    const statements = historySqlByBinding.get(bindingName)
    if (statements) return statements
    const created: string[] = []
    historySqlByBinding.set(bindingName, created)
    return created
  }
  const sourceStatements = (bindingName: string) => {
    const statements = sourceSqlByBinding.get(bindingName)
    if (statements) return statements
    const created: string[] = []
    sourceSqlByBinding.set(bindingName, created)
    return created
  }

  if (includeInitialStatements) {
    for (const bindingName of input.sourceBindingNames) {
      sourceStatements(bindingName).push(
        `UPDATE overturePlaces SET isCurrent = 0, validToRelease = ${lit(input.message.sourceVersion)}, updatedAt = ${lit(now)} WHERE isCurrent = 1;`,
      )
    }
  }

  let processedPlaceRows = 0
  for (const row of input.places) {
    const place = row.place
    const previous = previousById.get(place.id)
    const firstSeenMonth =
      typeof previous?.row.firstSeenMonth === 'string'
        ? previous.row.firstSeenMonth
        : place.firstSeenMonth
    sourceStatements(input.activeSourceBindingName).push(
      insertSql('overturePlaces', {
        sourceRecordId: place.id,
        sources: place.sources,
        rawProperties: place.raw,
        version: numberOrNull(place.raw.version),
        versionHash: row.sourcePayloadHash,
        releaseId: input.message.releaseId,
        validFromRelease: input.message.sourceVersion,
        validToRelease: null,
        isCurrent: 1,
        names: place.raw.names,
        lng: place.lng,
        lat: place.lat,
        bbox: place.bbox,
        operatingStatus: place.operatingStatus,
        basicCategory: place.basicCategory,
        taxonomyPrimary: place.taxonomyPrimary,
        taxonomyHierarchy: place.taxonomyHierarchy,
        taxonomyAlternates: place.taxonomyAlternates,
        wikidataId: place.wikidataId,
        brandNames: recordValue(place.raw.brand, 'names'),
        websites: place.websites,
        socials: place.socials,
        emails: place.emails,
        phones: place.phones,
        addresses: place.addresses,
        confidence: place.confidence,
        createdAt: now,
        updatedAt: now,
      }),
    )
    currentSql.push(
      insertSql('places', {
        snapshotId: input.snapshots.snapshotId,
        id: place.id,
        releaseId: input.message.releaseId,
        addressSnapshotId: row.address2dId
          ? (row.addressSnapshotId ?? input.snapshots.addressSnapshotId)
          : null,
        address2dId: row.address2dId,
        address3dId: row.address3dId,
        lng: place.lng,
        lat: place.lat,
        bbox: place.bbox,
        operatingStatus: place.operatingStatus,
        basicCategory: place.basicCategory,
        taxonomyPrimary: place.taxonomyPrimary,
        taxonomyHierarchy: place.taxonomyHierarchy,
        taxonomyAlternates: place.taxonomyAlternates,
        wikidataId: place.wikidataId,
        websites: place.websites,
        socials: place.socials,
        emails: place.emails,
        phones: place.phones,
        addresses: place.addresses,
        confidence: place.confidence,
        sources: place.sources,
        firstSeenMonth,
        lastSeenMonth: place.lastSeenMonth,
        createdAt: now,
        updatedAt: now,
      }),
    )
    for (const h3Level of PLACE_H3_LEVELS) {
      currentSql.push(
        insertSql('placesCells', {
          snapshotId: input.snapshots.snapshotId,
          id: place.id,
          h3Level,
          h3Cell: latLngToCell(place.lat, place.lng, h3Level),
        }),
      )
    }
    for (const localised of place.i18n) {
      currentSql.push(
        insertSql('placesI18n', {
          snapshotId: input.snapshots.snapshotId,
          placeId: place.id,
          locale: localised.locale,
          name: localised.name,
          nameVariant: localised.nameVariant,
          nameAlts: localised.nameAlts,
          brandName: localised.brandName,
          brandNameVariant: localised.brandNameVariant,
          brandNameAlts: localised.brandNameAlts,
          freeformAddress: localised.freeformAddress,
          provenance: localised.provenance,
          createdAt: now,
          updatedAt: now,
        }),
      )
      changes.push(
        insertSql('snapshotVersionChanges', {
          snapshotId: input.snapshots.snapshotId,
          recordType: 'placeI18n',
          recordId: place.id,
          locale: localised.locale,
          versionHash: row.versionHash,
          operation: 'upsert',
          sourceReleaseId: input.message.releaseId,
          createdAt: now,
          updatedAt: now,
        }),
      )
    }
    for (const divisionId of row.divisionIds) {
      currentSql.push(
        insertSql('placesDivision', {
          placeSnapshotId: input.snapshots.snapshotId,
          placeId: place.id,
          divisionSnapshotId: input.snapshots.divisionSnapshotId,
          divisionId,
        }),
      )
    }

    if (previous?.row.versionHash !== row.versionHash) {
      if (previous) {
        historyStatements(previous.bindingName).push(
          `UPDATE places SET isCurrent = 0, updatedAt = ${lit(now)} WHERE id = ${lit(place.id)} AND isCurrent = 1;`,
        )
        historyStatements(previous.bindingName).push(
          `UPDATE placesI18n SET isCurrent = 0, updatedAt = ${lit(now)} WHERE placeId = ${lit(place.id)} AND isCurrent = 1;`,
        )
      }
      historyStatements(input.activeHistoryBindingName).push(
        insertSql('places', {
          id: place.id,
          releaseId: input.message.releaseId,
          addressSnapshotId: row.address2dId
            ? (row.addressSnapshotId ?? input.snapshots.addressSnapshotId)
            : null,
          address2dId: row.address2dId,
          address3dId: row.address3dId,
          lng: place.lng,
          lat: place.lat,
          bbox: place.bbox,
          operatingStatus: place.operatingStatus,
          basicCategory: place.basicCategory,
          taxonomyPrimary: place.taxonomyPrimary,
          taxonomyHierarchy: place.taxonomyHierarchy,
          taxonomyAlternates: place.taxonomyAlternates,
          wikidataId: place.wikidataId,
          websites: place.websites,
          socials: place.socials,
          emails: place.emails,
          phones: place.phones,
          addresses: place.addresses,
          confidence: place.confidence,
          sources: place.sources,
          firstSeenMonth,
          lastSeenMonth: place.lastSeenMonth,
          versionHash: row.versionHash,
          sourceReleaseId: input.message.releaseId,
          snapshotId: input.snapshots.snapshotId,
          isCurrent: 1,
          createdAt: now,
          updatedAt: now,
        }),
      )
      for (const localised of place.i18n) {
        const i18nVersionHash = await createHash({
          placeVersionHash: row.versionHash,
          locale: localised.locale,
          localised,
        })
        historyStatements(input.activeHistoryBindingName).push(
          insertSql('placesI18n', {
            placeId: place.id,
            locale: localised.locale,
            name: localised.name,
            nameVariant: localised.nameVariant,
            nameAlts: localised.nameAlts,
            brandName: localised.brandName,
            brandNameVariant: localised.brandNameVariant,
            brandNameAlts: localised.brandNameAlts,
            freeformAddress: localised.freeformAddress,
            provenance: localised.provenance,
            versionHash: i18nVersionHash,
            sourceReleaseId: input.message.releaseId,
            snapshotId: input.snapshots.snapshotId,
            isCurrent: 1,
            createdAt: now,
            updatedAt: now,
          }),
        )
      }
      changes.push(
        insertSql('snapshotVersionChanges', {
          snapshotId: input.snapshots.snapshotId,
          recordType: 'place',
          recordId: place.id,
          locale: '',
          versionHash: row.versionHash,
          operation: 'upsert',
          sourceReleaseId: input.message.releaseId,
          createdAt: now,
          updatedAt: now,
        }),
      )
    } else {
      changes.push(
        insertSql('snapshotVersionChanges', {
          snapshotId: input.snapshots.snapshotId,
          recordType: 'place',
          recordId: place.id,
          locale: '',
          versionHash: previous.row.versionHash,
          operation: 'upsert',
          sourceReleaseId: input.message.releaseId,
          createdAt: now,
          updatedAt: now,
        }),
      )
    }
    processedPlaceRows += 1
    options.onProgress?.(processedPlaceRows)
  }

  if (includeRemovedPlaces) {
    const seen = new Set(input.places.map(row => row.place.id))
    for (const previous of previousById.values()) {
      const previousId =
        typeof previous.row.id === 'string' ? previous.row.id : String(previous.row.id)
      if (seen.has(previousId)) continue
      historyStatements(previous.bindingName).push(
        `UPDATE places SET isCurrent = 0, updatedAt = ${lit(now)} WHERE id = ${lit(previousId)} AND isCurrent = 1;`,
      )
      historyStatements(previous.bindingName).push(
        `UPDATE placesI18n SET isCurrent = 0, updatedAt = ${lit(now)} WHERE placeId = ${lit(previousId)} AND isCurrent = 1;`,
      )
      changes.push(
        insertSql('snapshotVersionChanges', {
          snapshotId: input.snapshots.snapshotId,
          recordType: 'place',
          recordId: previous.row.id,
          locale: '',
          versionHash: null,
          operation: 'delete',
          sourceReleaseId: input.message.releaseId,
          createdAt: now,
          updatedAt: now,
        }),
      )
    }
  }

  return {
    currentSql,
    historySqlByBinding,
    sourceSqlByBinding,
    changes,
  }
}

async function* buildPlaceSqlBatches(
  input: BuildPlaceSqlInput,
  path: string,
  timestamp: string,
  onProgress?: (event: PlaceSqlProgressEvent) => void,
) {
  const historyById = new Map(
    input.historyRows.map(state => [String(state.row.id), state]),
  )
  const seen = new Set<string>()
  let yielded = false
  let processedRows = 0

  for await (const places of readStagedJsonBatches<EnrichedPlace>(
    path,
    PLACE_SQL_BATCH_SIZE,
  )) {
    const historyRows: PlaceHistoryState[] = []
    for (const place of places) {
      const placeId = place.place.id
      seen.add(placeId)
      const previous = historyById.get(placeId)
      if (previous) historyRows.push(previous)
    }

    yield await buildPlaceSql(
      { ...input, historyRows, places },
      {
        includeInitialStatements: !yielded,
        includeRemovedPlaces: false,
        onProgress: current =>
          onProgress?.({ current: processedRows + current, phase: 'generate' }),
        timestamp,
      },
    )
    yielded = true
    processedRows += places.length
  }

  const removedHistoryRows = input.historyRows.filter(
    state => !seen.has(String(state.row.id)),
  )
  if (!yielded || removedHistoryRows.length > 0) {
    yield await buildPlaceSql(
      { ...input, historyRows: removedHistoryRows, places: [] },
      {
        includeInitialStatements: !yielded,
        includeRemovedPlaces: true,
        timestamp,
      },
    )
  }
}

async function upsertPlaceMetadata(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  snapshots: {
    addressSnapshotId: string
    divisionSnapshotId: string
    snapshotId: string
    supplementaryAddressSnapshotId: string
  },
  datasetId: string,
  releaseId: string,
  plan: PlaceUploadPlan,
  target: UploadTarget,
) {
  await upsertSnapshotSource(
    metaDb,
    snapshots.snapshotId,
    datasetId,
    releaseId,
    'primary',
    {
      anchorReleaseId: releaseId,
      selectedByRule: 'snapshot-assembly-places-overture-v1',
      selectionMode: 'exact_ref',
      sourceCohortKey: plan.cohortKey,
    },
  )
  await recordPlaceAddressAssembly(metaDb, {
    snapshotId: snapshots.snapshotId,
    resourceType: 'place',
    anchorReleaseId: releaseId,
    anchorCohortKey: plan.cohortKey,
    selectionSummaryJson: {
      addressSnapshotId: snapshots.addressSnapshotId,
      divisionSnapshotId: snapshots.divisionSnapshotId,
      sourceReleaseId: releaseId,
      sourceVersion: plan.sourceVersion,
      supplementaryAddressSnapshotId: snapshots.supplementaryAddressSnapshotId,
      addressReviewRequired: 0,
    },
  })
  await recordSnapshotLookupDependency(metaDb, {
    anchorReleaseId: releaseId,
    lookupSnapshotId: snapshots.addressSnapshotId,
    selectedByRule: 'api-composition:places/overture:place/default->address/default',
    selectionMode: 'latest_at_or_before_or_earliest_after_cohort',
    snapshotId: snapshots.snapshotId,
  })
  await recordSnapshotLookupDependency(metaDb, {
    anchorReleaseId: releaseId,
    lookupSnapshotId: snapshots.divisionSnapshotId,
    selectedByRule:
      'api-composition:places/overture:address/default->division/overture',
    selectionMode: 'address_snapshot_reference',
    snapshotId: snapshots.snapshotId,
  })
  const environment = resolvePipelineEnvironment(target)
  const currentShard = await resolveShardForTypeRegionYear(
    metaDb,
    'current',
    environment,
  )
  const historyShard = await resolveShardForTypeRegionYear(
    metaDb,
    'history',
    environment,
    plan.regionCode,
    plan.sourceVersion.slice(0, 4),
  )
  const sourceShard = await resolveShardForTypeRegionYear(
    metaDb,
    'source',
    environment,
    plan.regionCode,
    plan.sourceVersion.slice(0, 4),
  )
  if (currentShard)
    await upsertSnapshotShardAssignment(metaDb, snapshots.snapshotId, currentShard.id)
  if (historyShard)
    await upsertReleaseShardAssignment(metaDb, releaseId, historyShard.id)
  if (sourceShard) await upsertReleaseShardAssignment(metaDb, releaseId, sourceShard.id)
}

async function placeTargets(
  dbContext: LocalAddressDbContext,
  metaDb: HarbourReadableDb,
  target: UploadTarget,
  regionCode: string,
  shardYear: string,
) {
  const environment = resolvePipelineEnvironment(target)
  const [currentShard, historyShard, sourceShard] = await Promise.all([
    resolveShardForTypeRegionYear(metaDb, 'current', environment),
    resolveShardForTypeRegionYear(
      metaDb,
      'history',
      environment,
      regionCode,
      shardYear,
    ),
    resolveShardForTypeRegionYear(metaDb, 'source', environment, regionCode, shardYear),
  ])
  return {
    current: {
      binding: dbContext.currentBinding,
      databaseId: currentShard?.databaseId ?? null,
      name: 'current',
    } satisfies SqlImportTargetContext,
    history: {
      binding: dbContext.historyBinding,
      databaseId: historyShard?.databaseId ?? null,
      name: 'history',
    } satisfies SqlImportTargetContext,
    historyByBinding: new Map(
      dbContext.historyTargets.map(target => [
        target.bindingName,
        {
          binding: target.binding,
          databaseId: target.databaseId,
          name: 'history' as const,
        } satisfies SqlImportTargetContext,
      ]),
    ),
    source: {
      binding: dbContext.sourceBinding,
      databaseId: sourceShard?.databaseId ?? null,
      name: 'source',
    } satisfies SqlImportTargetContext,
    sourceByBinding: new Map(
      dbContext.sourceTargets.map(target => [
        target.bindingName,
        {
          binding: target.binding,
          databaseId: target.databaseId,
          name: 'source' as const,
        } satisfies SqlImportTargetContext,
      ]),
    ),
    meta: {
      binding: dbContext.metaBinding,
      databaseId: dbContext.state.bindings.DB_META?.databaseId ?? null,
      name: 'meta',
    } satisfies SqlImportTargetContext,
    environment,
    metaDb,
    shardYear,
  }
}

async function buildPlaceMetadataSql(
  db: HarbourReadableDb,
  snapshotId: string,
  releaseId: string,
) {
  const snapshot = await db
    .select()
    .from(metaSchema.metaSnapshots)
    .where(eq(metaSchema.metaSnapshots.id, snapshotId))
    .limit(1)
    .get()
  if (!snapshot) throw new Error(`Place snapshot metadata not found: ${snapshotId}.`)
  const assemblies = await db
    .select({ assembly: metaSchema.metaSnapshotAssembly })
    .from(metaSchema.metaSnapshotAssembly)
    .innerJoin(
      metaSchema.metaSnapshotAssemblyRuns,
      eq(
        metaSchema.metaSnapshotAssemblyRuns.snapshotAssemblyId,
        metaSchema.metaSnapshotAssembly.id,
      ),
    )
    .where(eq(metaSchema.metaSnapshotAssemblyRuns.snapshotId, snapshotId))
    .all()
  const [
    lineage,
    sources,
    shardAssignments,
    assemblyRuns,
    releaseAssignments,
    releaseStats,
  ] = await Promise.all([
    db
      .select()
      .from(metaSchema.metaSnapshotLineages)
      .where(eq(metaSchema.metaSnapshotLineages.id, String(snapshot.snapshotLineageId)))
      .all(),
    db
      .select()
      .from(metaSchema.metaSnapshotSources)
      .where(eq(metaSchema.metaSnapshotSources.snapshotId, snapshotId))
      .all(),
    db
      .select()
      .from(metaSchema.metaSnapshotShardAssignments)
      .where(eq(metaSchema.metaSnapshotShardAssignments.snapshotId, snapshotId))
      .all(),
    db
      .select()
      .from(metaSchema.metaSnapshotAssemblyRuns)
      .where(eq(metaSchema.metaSnapshotAssemblyRuns.snapshotId, snapshotId))
      .all(),
    db
      .select()
      .from(metaSchema.metaReleaseShardAssignments)
      .where(eq(metaSchema.metaReleaseShardAssignments.releaseId, releaseId))
      .all(),
    db
      .select()
      .from(metaSchema.stats)
      .where(eq(metaSchema.stats.releaseId, releaseId))
      .all(),
  ])
  return [
    ...lineage.map(row => insertSql('snapshotLineages', row)),
    insertSql('snapshots', snapshot),
    ...sources.map(row => insertSql('snapshotSources', row)),
    ...shardAssignments.map(row => insertSql('snapshotShardAssignments', row)),
    ...assemblies.map(row =>
      insertSql('snapshotAssembly', row.assembly as Record<string, unknown>),
    ),
    ...assemblyRuns.map(row => insertSql('snapshotAssemblyRuns', row)),
    ...releaseAssignments.map(row => insertSql('releaseShardAssignments', row)),
    ...releaseStats.map(row => insertSql('stats', row)),
  ].join('\n')
}

export function buildPlaceReleaseStatsRows(
  places: EnrichedPlace[],
): ReleaseScopedStatsRow[] {
  const accumulator = createPlaceReleaseStatsAccumulator()
  for (const place of places) addPlaceReleaseStats(accumulator, place)
  return buildPlaceReleaseStatsRowsFromAccumulator(accumulator)
}

function createPlaceReleaseStatsAccumulator(): PlaceReleaseStatsAccumulator {
  return {
    addressLinkedRows: 0,
    divisionLinkedRows: 0,
    localeCounts: new Map(),
    localisedPlaceCount: 0,
    localisedRows: 0,
    localisation: {
      bilingualReferenceNameCount: 0,
      fields: new Map(),
      referenceNameCount: 0,
      totalPlaces: 0,
    },
    processedRows: 0,
  }
}

function addPlaceReleaseStats(
  accumulator: PlaceReleaseStatsAccumulator,
  enriched: EnrichedPlace,
) {
  accumulator.processedRows += 1
  if (enriched.address2dId || enriched.address3dId) accumulator.addressLinkedRows += 1
  accumulator.divisionLinkedRows += enriched.divisionIds.length
  if (enriched.place.i18n.length) accumulator.localisedPlaceCount += 1
  accumulator.localisedRows += enriched.place.i18n.length
  for (const localised of enriched.place.i18n) {
    accumulator.localeCounts.set(
      localised.locale,
      (accumulator.localeCounts.get(localised.locale) ?? 0) + 1,
    )
  }
  const single = buildPlaceLocalisationStatistics([enriched.place])
  accumulator.localisation.referenceNameCount += single.referenceNameCount
  accumulator.localisation.bilingualReferenceNameCount +=
    single.bilingualReferenceNameCount
  for (const [key, value] of single.fields) {
    const existing = accumulator.localisation.fields.get(key)
    if (existing) {
      existing.valueCount += value.valueCount
      existing.providedCount += value.providedCount
      existing.inferredCount += value.inferredCount
      existing.aiTranslatedCount += value.aiTranslatedCount
      existing.humanTranslatedCount += value.humanTranslatedCount
      existing.conflictCount += value.conflictCount
      continue
    }
    accumulator.localisation.fields.set(key, {
      ...value,
      missingCount: 0,
    })
  }
}

function buildPlaceReleaseStatsRowsFromAccumulator(
  accumulator: PlaceReleaseStatsAccumulator,
): ReleaseScopedStatsRow[] {
  const localisationStats: PlaceLocalisationStatistics = {
    ...accumulator.localisation,
    fields: new Map(
      [...accumulator.localisation.fields].map(([key, value]) => [
        key,
        {
          ...value,
          missingCount: accumulator.processedRows - value.valueCount,
        },
      ]),
    ),
    totalPlaces: accumulator.processedRows,
  }
  return buildPlaceReleaseStatsRowsFromValues({
    addressLinkedRows: accumulator.addressLinkedRows,
    divisionLinkedRows: accumulator.divisionLinkedRows,
    localeCounts: accumulator.localeCounts,
    localisedPlaceCount: accumulator.localisedPlaceCount,
    localisedRows: accumulator.localisedRows,
    localisationStats,
    processedRows: accumulator.processedRows,
  })
}

function buildPlaceReleaseStatsRowsFromValues(input: {
  addressLinkedRows: number
  divisionLinkedRows: number
  localeCounts: Map<string, number>
  localisedPlaceCount: number
  localisedRows: number
  localisationStats: PlaceLocalisationStatistics
  processedRows: number
}): ReleaseScopedStatsRow[] {
  const timestamp = new Date().toISOString()
  const row = (
    dimension: string,
    value: number,
    groupBy: string | null = null,
    groupValue: string | null = null,
    metric: 'count' | 'percentage' = 'count',
  ): ReleaseScopedStatsRow => ({
    createdAt: timestamp,
    dimension,
    groupBy,
    groupValue,
    metric,
    metricUnit: metric,
    type: 'release',
    updatedAt: timestamp,
    value,
  })

  const statsRows: ReleaseScopedStatsRow[] = [
    row('records', input.processedRows),
    row('localised_records', input.localisedPlaceCount),
    row('localised_rows', input.localisedRows),
    row('address_links', input.addressLinkedRows),
    row('division_links', input.divisionLinkedRows),
    ...[...input.localeCounts.entries()].map(([locale, count]) =>
      row('localised_records', count, 'locale', locale),
    ),
  ]
  for (const [fieldLocale, stats] of input.localisationStats.fields) {
    const [field, locale] = fieldLocale.split('\u0000')
    const grouping = { groupBy: 'field_locale', groupValue: `${field}:${locale}` }
    statsRows.push(
      row(
        'localisation_value_count',
        stats.valueCount,
        grouping.groupBy,
        grouping.groupValue,
      ),
      row(
        'localisation_coverage',
        percentage(stats.valueCount, input.processedRows),
        grouping.groupBy,
        grouping.groupValue,
        'percentage',
      ),
      row(
        'localisation_provided_coverage',
        percentage(stats.providedCount, input.processedRows),
        grouping.groupBy,
        grouping.groupValue,
        'percentage',
      ),
      row(
        'localisation_inferred_coverage',
        percentage(stats.inferredCount, input.processedRows),
        grouping.groupBy,
        grouping.groupValue,
        'percentage',
      ),
      row(
        'localisation_ai_translated_coverage',
        percentage(stats.aiTranslatedCount, input.processedRows),
        grouping.groupBy,
        grouping.groupValue,
        'percentage',
      ),
      row(
        'localisation_human_translated_coverage',
        percentage(stats.humanTranslatedCount, input.processedRows),
        grouping.groupBy,
        grouping.groupValue,
        'percentage',
      ),
      row(
        'localisation_conflict_count',
        stats.conflictCount,
        grouping.groupBy,
        grouping.groupValue,
      ),
      row(
        'localisation_missing_value_count',
        stats.missingCount,
        grouping.groupBy,
        grouping.groupValue,
      ),
    )
  }
  const referenceGrouping = { groupBy: 'field', groupValue: 'referenceName' }
  statsRows.push(
    row('reference_name_count', input.localisationStats.referenceNameCount),
    row(
      'reference_name_coverage',
      percentage(input.localisationStats.referenceNameCount, input.processedRows),
      referenceGrouping.groupBy,
      referenceGrouping.groupValue,
      'percentage',
    ),
    row(
      'bilingual_reference_name_count',
      input.localisationStats.bilingualReferenceNameCount,
    ),
    row(
      'bilingual_reference_name_coverage',
      percentage(
        input.localisationStats.bilingualReferenceNameCount,
        input.processedRows,
      ),
      referenceGrouping.groupBy,
      referenceGrouping.groupValue,
      'percentage',
    ),
  )
  return statsRows
}

function percentage(value: number, total: number) {
  return total === 0 ? 0 : Number(((value / total) * 100).toFixed(2))
}

async function importSqlChunks(
  targets: Awaited<ReturnType<typeof placeTargets>>,
  sql: Awaited<ReturnType<typeof buildPlaceSql>>,
  options: SqlImportExecutionOptions,
  onProgress?: (completed: number, total: number) => void,
) {
  const totalChunks = countSqlChunks(sql)
  let completedChunks = 0
  const executeChunk = async (target: SqlImportTargetContext, chunk: string) => {
    await executeSqlText(target, chunk, options)
    completedChunks += 1
    onProgress?.(completedChunks, totalChunks)
  }

  for (const [bindingName, statements] of sql.sourceSqlByBinding) {
    const target = targets.sourceByBinding.get(bindingName)
    if (!target) throw new Error(`Missing Places source target ${bindingName}.`)
    for (const chunk of chunkStatements(statements)) await executeChunk(target, chunk)
  }
  for (const [bindingName, statements] of sql.historySqlByBinding) {
    const target = targets.historyByBinding.get(bindingName)
    if (!target) throw new Error(`Missing Places history target ${bindingName}.`)
    for (const chunk of chunkStatements(statements)) await executeChunk(target, chunk)
  }
  for (const chunk of chunkStatements(sql.currentSql))
    await executeChunk(targets.current, chunk)
  for (const chunk of chunkStatements(sql.changes))
    await executeChunk(targets.history, chunk)
}

async function importPlaceSqlBatches(
  targets: Awaited<ReturnType<typeof placeTargets>>,
  input: BuildPlaceSqlInput,
  path: string,
  totalRows: number,
  timestamp: string,
  options: SqlImportExecutionOptions,
  onProgress?: (event: PlaceSqlProgressEvent) => void,
) {
  let completedBatches = 0
  for await (const sql of buildPlaceSqlBatches(input, path, timestamp, onProgress)) {
    const batchEnd = Math.min(totalRows, (completedBatches + 1) * PLACE_SQL_BATCH_SIZE)
    await importSqlChunks(targets, sql, options, (completed, total) =>
      onProgress?.({
        current: batchEnd,
        detail: `import ${completed}/${total} SQL chunks`,
        phase: 'import',
      }),
    )
    completedBatches += 1
    onProgress?.({
      current: Math.min(totalRows, completedBatches * PLACE_SQL_BATCH_SIZE),
      phase: 'import',
    })
  }
}

async function runPlaceProgressPhase<T>(
  progress: OperationProgress,
  action: string,
  subject: string,
  operation: (
    reportProgress: (current: number, subject?: string) => void,
  ) => Promise<T> | T,
  totalUnits?: number,
) {
  return runLocalProgressPhase(
    progress,
    {
      action,
      completedCount: totalUnits,
      subject,
      totalUnits,
    },
    operation,
  )
}

function normaliseError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}

function* chunkStatements(statements: readonly string[]) {
  let current = ''
  for (const statement of statements) {
    const candidate = current + statement
    if (current && Buffer.byteLength(candidate) > MAX_SQL_BYTES) {
      yield current
      current = statement
      continue
    }
    current = candidate
  }
  if (current) yield current
}

function countSqlChunks(sql: Awaited<ReturnType<typeof buildPlaceSql>>) {
  const countMapChunks = (groups: Map<string, string[]>) =>
    [...groups.values()].reduce(
      (total, statements) => total + countStatementChunks(statements),
      0,
    )
  return (
    countMapChunks(sql.sourceSqlByBinding) +
    countMapChunks(sql.historySqlByBinding) +
    countStatementChunks(sql.currentSql) +
    countStatementChunks(sql.changes)
  )
}

function countStatementChunks(statements: string[]) {
  let chunks = 0
  let currentBytes = 0
  for (const statement of statements) {
    const statementBytes = Buffer.byteLength(statement)
    if (currentBytes && currentBytes + statementBytes > MAX_SQL_BYTES) {
      chunks += 1
      currentBytes = statementBytes
    } else {
      currentBytes += statementBytes
    }
  }
  return currentBytes ? chunks + 1 : chunks
}

function insertSql(table: string, values: Record<string, unknown>) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined)
  return `INSERT INTO "${table}" (${entries.map(([key]) => `"${key}"`).join(', ')}) VALUES (${entries.map(([, value]) => sqlValue(value)).join(', ')}) ON CONFLICT DO UPDATE SET ${entries.map(([key]) => `"${key}" = excluded."${key}"`).join(', ')};`
}

function sqlValue(value: unknown) {
  if (value === null) return 'NULL'
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return lit(text ?? '')
}

function lit(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function recordValue(value: unknown, key: string) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : null
}

function numberOrNull(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function required(value: string | undefined, name: string) {
  if (!value?.trim()) throw new Error(`Missing ${name} for Places SQL processing.`)
  return value
}

function findTargetBindingName(
  targets: Array<{ bindingName: string; db: unknown }>,
  db: unknown,
) {
  const target = targets.find(candidate => candidate.db === db)
  if (!target) throw new Error('Could not resolve the active Places shard binding.')
  return target.bindingName
}

function resolveShardYear(cohortKey: string, sourceVersion: string) {
  const year = cohortKey.slice(0, 4)
  if (/^\d{4}$/.test(year)) return year
  const sourceYear = sourceVersion.slice(0, 4)
  if (/^\d{4}$/.test(sourceYear)) return sourceYear
  throw new Error(
    `Could not resolve Places shard year from ${cohortKey}/${sourceVersion}.`,
  )
}

function targetName(target: UploadTarget) {
  return target.remote && target.environment === 'production'
    ? 'production'
    : target.remote
      ? 'preview'
      : 'local'
}
